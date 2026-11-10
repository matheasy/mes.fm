/* MES Spreadsheet Viewer & Editor (mes.fm/excel): pure logic, no DOM. window.MESXL in the page, require()-able in node
   (tests: node tool_apps_src/excel-tests.js).
   - A1 references and ranges (colName, colIndex, parseA1, a1, parseRange, rangeA1)
   - CSV / TSV parsing and writing (parseDelimited, detectDelimiter, toDelimited)
   - typed input -> cell value (parseInput)
   - a small formula engine: tokenize, parse (Excel precedence), evaluate (SUM AVERAGE MIN MAX COUNT COUNTA ROUND IF ABS SQRT
     and a few more, & concatenation, comparisons, ranges, Sheet!A1 / 'My sheet'!A1:B2), unknownFunctions, adjust (insert /
     delete rows and columns rewrite references, a deleted reference becomes #REF!)
   - Calc: dependency index over a workbook of dense sheets ({name, data: rows of cells}) that recalculates only the cells that
     depend on an edit; a formula using a function this engine does not know keeps the value saved in the file and is reported
   - sorting / filtering a view of the rows without changing the data (viewRows, cmpValues, matchFilter)
   Cells are SheetJS-style objects: {t: "n"|"s"|"b"|"e"|"z", v, f (formula without "="), w (formatted text), z (number format)}. */
(function (root) {
	"use strict";

	/* ---------- A1 references ---------- */
	function colName(c) { var s = ""; c = Math.floor(c); while (c >= 0) { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1; } return s; }
	function colIndex(s) { s = String(s).toUpperCase().replace(/\$/g, ""); if (!/^[A-Z]{1,3}$/.test(s)) return -1; var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }
	var MAXR = 1048576, MAXC = 16384;
	function parseA1(s) {
		var m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(String(s).trim());
		if (!m) return null;
		var c = colIndex(m[2]), r = +m[4] - 1;
		if (c < 0 || c >= MAXC || r < 0 || r >= MAXR) return null;
		return { r: r, c: c, ac: !!m[1], ar: !!m[3] };
	}
	function a1(r, c, ar, ac) { return (ac ? "$" : "") + colName(c) + (ar ? "$" : "") + (r + 1); }
	function parseRange(s) {
		s = String(s).trim();
		var p = s.split(":");
		if (p.length === 1) { var x = parseA1(p[0]); return x ? { s: { r: x.r, c: x.c }, e: { r: x.r, c: x.c } } : null; }
		if (p.length !== 2) return null;
		var a = parseA1(p[0]), b = parseA1(p[1]);
		if (!a || !b) return null;
		return { s: { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c) }, e: { r: Math.max(a.r, b.r), c: Math.max(a.c, b.c) } };
	}
	function rangeA1(g) { var s = a1(g.s.r, g.s.c), e = a1(g.e.r, g.e.c); return s === e ? s : s + ":" + e; }
	function inRange(g, r, c) { return r >= g.s.r && r <= g.e.r && c >= g.s.c && c <= g.e.c; }

	/* ---------- CSV / TSV ---------- */
	function detectDelimiter(text) {
		var sample = String(text).slice(0, 20000), lines = sample.split(/\r\n|\n|\r/).filter(function (l) { return l.length; }).slice(0, 30);
		if (!lines.length) return ",";
		var best = ",", bestScore = -1;
		["\t", ",", ";", "|"].forEach(function (d) {
			var counts = lines.map(function (l) { var n = 0, q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') q = !q; else if (ch === d && !q) n++; } return n; });
			var first = counts[0]; if (!first) return;
			var same = counts.filter(function (n) { return n === first; }).length;
			var score = same * 1000 + first;
			if (score > bestScore) { bestScore = score; best = d; }
		});
		return best;
	}
	function parseDelimited(text, delim) {
		text = String(text == null ? "" : text);
		if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
		if (delim == null) delim = detectDelimiter(text);
		var rows = [], row = [], f = "", i = 0, n = text.length, q = false, any = false;
		while (i < n) {
			var ch = text[i];
			if (q) {
				if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
				f += ch; i++; continue;
			}
			if (ch === '"' && f === "") { q = true; any = true; i++; continue; }
			if (ch === delim) { row.push(f); f = ""; any = true; i++; continue; }
			if (ch === "\r" || ch === "\n") {
				row.push(f); rows.push(row); row = []; f = ""; any = false;
				i += (ch === "\r" && text[i + 1] === "\n") ? 2 : 1; continue;
			}
			f += ch; any = true; i++;
		}
		if (any || f !== "" || row.length) { row.push(f); rows.push(row); }
		return rows;
	}
	function quoteField(s, delim) {
		s = s == null ? "" : String(s);
		return (s.indexOf(delim) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
	}
	function toDelimited(rows, delim, eol) {
		delim = delim || ","; eol = eol || "\r\n";
		return rows.map(function (r) { return r.map(function (x) { return quoteField(x, delim); }).join(delim); }).join(eol);
	}

	/* ---------- typed input -> value ---------- */
	function parseNumberText(s) {
		var t = String(s).trim();
		if (!t) return null;
		var neg = false, pct = false;
		if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
		if (/%$/.test(t)) { pct = true; t = t.slice(0, -1).trim(); }
		t = t.replace(/^([-+]?)\s*[$€£¥]\s*/, "$1").replace(/\s*[$€£¥]$/, "");
		if (/^[-+]?(\d{1,3}(,\d{3})+)(\.\d*)?$/.test(t)) t = t.replace(/,/g, "");
		if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
		var v = parseFloat(t);
		if (!isFinite(v)) return null;
		if (neg) v = -v;
		if (pct) v = v / 100;
		return { v: v, pct: pct };
	}
	function parseInput(text) {
		var s = text == null ? "" : String(text);
		if (s === "") return { t: "z" };
		if (s[0] === "=" && s.length > 1) return { f: s.slice(1) };
		if (s[0] === "'") return { t: "s", v: s.slice(1) };
		var u = s.trim().toUpperCase();
		if (u === "TRUE" || u === "FALSE") return { t: "b", v: u === "TRUE" };
		var dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
		if (dm) {
			var y = +dm[1], mo = +dm[2], da = +dm[3], t = Date.UTC(y, mo - 1, da), dd = new Date(t);
			if (y >= 1900 && dd.getUTCMonth() === mo - 1 && dd.getUTCDate() === da) return { t: "n", v: (t - Date.UTC(1899, 11, 30)) / 864e5, z: "yyyy-mm-dd" };
		}
		var n = parseNumberText(s);
		if (n) return n.pct ? { t: "n", v: n.v, z: "0%" } : { t: "n", v: n.v };
		return { t: "s", v: s };
	}

	/* ---------- errors ---------- */
	function Err(code) { this.code = code; }
	Err.prototype.toString = function () { return this.code; };
	var E = {}; ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#CYCLE!", "#SPILL!", "#CALC!"].forEach(function (c) { E[c] = new Err(c); });
	var ERRCODE = { 0: "#NULL!", 7: "#DIV/0!", 15: "#VALUE!", 23: "#REF!", 29: "#NAME?", 36: "#NUM!", 42: "#N/A" };
	var ERRNUM = { "#NULL!": 0, "#DIV/0!": 7, "#VALUE!": 15, "#REF!": 23, "#NAME?": 29, "#NUM!": 36, "#N/A": 42, "#CYCLE!": 15, "#SPILL!": 15, "#CALC!": 15 };
	function isErr(x) { return x instanceof Err; }
	function err(code) { return E[code] || new Err(code); }
	function Unknown(name) { this.name = name; this.message = "Unknown function " + name; }

	/* ---------- tokenizer ---------- */
	var FUNC_RE = /^[A-Za-z_][A-Za-z0-9_.]*(?=\s*\()/;
	function tokenize(src) {
		var s = String(src), i = 0, out = [], n = s.length;
		function push(type, v, raw) { out.push({ type: type, v: v, raw: raw, pos: i }); }
		while (i < n) {
			var ch = s[i], rest = s.slice(i), m;
			if (/\s/.test(ch)) { var j = i; while (j < n && /\s/.test(s[j])) j++; out.push({ type: "ws", raw: s.slice(i, j), pos: i }); i = j; continue; }
			if (ch === '"') {
				var j2 = i + 1, str = "";
				for (;;) { if (j2 >= n) throw new SyntaxError("A text in quotes is not closed."); if (s[j2] === '"') { if (s[j2 + 1] === '"') { str += '"'; j2 += 2; continue; } break; } str += s[j2]; j2++; }
				push("str", str, s.slice(i, j2 + 1)); i = j2 + 1; continue;
			}
			// sheet-qualified reference: 'My sheet'!A1 or Sheet1!A1:B2
			if ((m = /^'((?:[^']|'')+)'!/.exec(rest)) || (m = /^([A-Za-z_À-￿][A-Za-z0-9_.À-￿]*)!/.exec(rest))) {
				var sheet = m[1].replace(/''/g, "'"), after = rest.slice(m[0].length);
				var rm = /^(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+|#)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(])/.exec(after);
				if (!rm) throw new SyntaxError("Unreadable reference after " + m[0]);
				push("ref", { sheet: sheet, text: rm[1] }, m[0] + rm[1]); i += m[0].length + rm[1].length; continue;
			}
			if ((m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!)/i.exec(rest))) { push("err", "#" + m[1].toUpperCase(), m[0]); i += m[0].length; continue; }
			if ((m = /^(\$?[A-Za-z]{1,3}\$?\d+:\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(!])/.exec(rest)) && !/^\d+(\.\d*)?$/.test(m[1])) {
				push("ref", { sheet: null, text: m[1] }, m[1]); i += m[1].length; continue;
			}
			if ((m = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_(!.\[])#?/.exec(rest)) && parseA1(m[0].replace(/#$/, "")) && !/^#[A-Za-z]/.test(rest.slice(m[0].length - (/#$/.test(m[0]) ? 1 : 0)))) { push("ref", { sheet: null, text: m[0] }, m[0]); i += m[0].length; continue; }
			// structured reference: Table1[Col], Table1[[#Headers],[Col]], [@Col]
			if ((m = /^([A-Za-z_\\][A-Za-z0-9_.\\]*)?\[((?:[^\[\]']|'.|\[(?:[^\]']|'.)*\])*)\]/.exec(rest)) && (m[1] || /^\[@|^\[\[|^\[#/.test(m[0]))) { push("sref", { table: m[1] || null, spec: m[2] }, m[0]); i += m[0].length; continue; }
			if ((m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(rest))) { push("num", parseFloat(m[0]), m[0]); i += m[0].length; continue; }
			if ((m = FUNC_RE.exec(rest))) { push("func", m[0].toUpperCase(), m[0]); i += m[0].length; continue; }
			if ((m = /^(TRUE|FALSE)(?![A-Za-z0-9_.(])/i.exec(rest))) { push("bool", m[1].toUpperCase() === "TRUE", m[0]); i += m[0].length; continue; }
			if ((m = /^[A-Za-z_\\][A-Za-z0-9_.\\]*/.exec(rest))) { push("name", m[0], m[0]); i += m[0].length; continue; }
			if ((m = /^(<>|<=|>=|[-+*\/^&=<>%(),;:{}\[\]])/.exec(rest))) { push(m[1] === "(" || m[1] === ")" || m[1] === "," || m[1] === ";" ? m[1] : "op", m[1], m[1]); i += m[1].length; continue; }
			throw new SyntaxError("Unexpected character “" + ch + "”");
		}
		return out;
	}

	/* ---------- parser (Excel precedence: negation > % > ^ > * / > + - > & > comparison) ---------- */
	function refNode(tok) {
		var t = tok.v.text, sheet = tok.v.sheet, m;
		if (/#$/.test(t)) { var a0 = parseA1(t.slice(0, -1)); if (!a0) throw new SyntaxError("Unreadable reference " + t); return { k: "ref", sheet: sheet, g: { s: { r: a0.r, c: a0.c }, e: { r: a0.r, c: a0.c } }, single: true, spill: true }; }
		var g = parseRange(t);
		if (g) return { k: "ref", sheet: sheet, g: g, single: t.indexOf(":") < 0 };
		if ((m = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(t))) { var c1 = colIndex(m[1]), c2 = colIndex(m[2]); return { k: "ref", sheet: sheet, g: { s: { r: 0, c: Math.min(c1, c2) }, e: { r: MAXR - 1, c: Math.max(c1, c2) } }, single: false, whole: "c" }; }
		if ((m = /^\$?(\d+):\$?(\d+)$/.exec(t))) { var r1 = +m[1] - 1, r2 = +m[2] - 1; return { k: "ref", sheet: sheet, g: { s: { r: Math.min(r1, r2), c: 0 }, e: { r: Math.max(r1, r2), c: MAXC - 1 } }, single: false, whole: "r" }; }
		throw new SyntaxError("Unreadable reference " + t);
	}
	function normFn(n) { n = String(n).toUpperCase(); while (/^_(XLFN|XLWS|XLUDF)\./.test(n)) n = n.replace(/^_(XLFN|XLWS|XLUDF)\./, ""); return n; }
	function parse(src) {
		var all = tokenize(src), toks = all.filter(function (t) { return t.type !== "ws"; }), p = 0;
		function peek() { return toks[p]; }
		function next() { return toks[p++]; }
		function isOp(v) { var t = toks[p]; return t && t.type === "op" && t.v === v; }
		function expect(type) { var t = next(); if (!t || t.type !== type) throw new SyntaxError("Expected " + (type === ")" ? "a closing bracket" : type)); return t; }
		function cmp() {
			var a = cat();
			while (peek() && peek().type === "op" && /^(=|<>|<|>|<=|>=)$/.test(peek().v)) { var o = next().v; a = { k: "bin", op: o, a: a, b: cat() }; }
			return a;
		}
		function cat() { var a = add(); while (isOp("&")) { next(); a = { k: "bin", op: "&", a: a, b: add() }; } return a; }
		function add() { var a = mul(); while (isOp("+") || isOp("-")) { var o = next().v; a = { k: "bin", op: o, a: a, b: mul() }; } return a; }
		function mul() { var a = pow(); while (isOp("*") || isOp("/")) { var o = next().v; a = { k: "bin", op: o, a: a, b: pow() }; } return a; }
		function pow() { var a = pct(); while (isOp("^")) { next(); a = { k: "bin", op: "^", a: a, b: pct() }; } return a; }
		function pct() { var a = unary(); while (isOp("%")) { next(); a = { k: "pct", a: a }; } return a; }
		function unary() {
			if (isOp("-")) { next(); return { k: "neg", a: unary() }; }
			if (isOp("+")) { next(); return unary(); }
			return prim();
		}
		function prim() {
			var t = next();
			if (!t) throw new SyntaxError("The formula ends too early.");
			if (t.type === "num") return { k: "num", v: t.v };
			if (t.type === "str") return { k: "str", v: t.v };
			if (t.type === "bool") return { k: "bool", v: t.v };
			if (t.type === "err") return { k: "err", v: t.v };
			if (t.type === "ref") return refNode(t);
			if (t.type === "sref") return { k: "sref", table: t.v.table, spec: t.v.spec };
			if (t.type === "name") return { k: "name", v: t.v };
			if (t.type === "(") { var e = cmp(); expect(")"); return e; }
			if (t.type === "func") {
				t = { v: normFn(t.v) };
				expect("(");
				var args = [];
				if (peek() && peek().type === ")") { next(); return { k: "call", name: t.v, args: args }; }
				for (;;) {
					if (peek() && (peek().type === "," || peek().type === ";")) args.push({ k: "missing" });
					else if (peek() && peek().type === ")") { args.push({ k: "missing" }); next(); break; }
					else args.push(cmp());
					var sep = next();
					if (!sep) throw new SyntaxError("Expected a closing bracket");
					if (sep.type === ")") break;
					if (sep.type !== "," && sep.type !== ";") throw new SyntaxError("Expected , or ) in " + t.v + "()");
				}
				return { k: "call", name: t.v, args: args };
			}
			if (t.type === "op" && t.v === "{") {
				var rowsA = [[]];
				for (;;) {
					var x = next(); if (!x) throw new SyntaxError("Expected } to close the array.");
					var neg = false;
					if (x.type === "op" && x.v === "-") { neg = true; x = next(); }
					else if (x.type === "op" && x.v === "+") x = next();
					if (!x) throw new SyntaxError("Expected } to close the array.");
					var v0;
					if (x.type === "num") v0 = neg ? -x.v : x.v; else if (x.type === "str") v0 = x.v; else if (x.type === "bool") v0 = x.v; else if (x.type === "err") v0 = err(x.v);
					else throw new SyntaxError("Arrays can only hold numbers, text, TRUE / FALSE and errors.");
					rowsA[rowsA.length - 1].push(v0);
					var sp = next(); if (!sp) throw new SyntaxError("Expected } to close the array.");
					if (sp.type === "op" && sp.v === "}") break;
					if (sp.type === ",") continue;
					if (sp.type === ";") { rowsA.push([]); continue; }
					throw new SyntaxError("Unexpected “" + (sp.raw || sp.v) + "” in an array.");
				}
				var w0 = rowsA[0].length; if (rowsA.some(function (r) { return r.length !== w0; })) throw new SyntaxError("Every row of an array needs the same number of values.");
				return { k: "arr", v: rowsA };
			}
			throw new SyntaxError("Unexpected “" + (t.raw || t.v) + "”");
		}
		if (!toks.length) throw new SyntaxError("The formula is empty.");
		var ast = cmp();
		if (p < toks.length) throw new SyntaxError("Unexpected “" + (toks[p].raw || toks[p].v) + "”");
		return ast;
	}
	function walk(ast, fn) { if (!ast) return; fn(ast); if (ast.a) walk(ast.a, fn); if (ast.b) walk(ast.b, fn); if (ast.args) ast.args.forEach(function (x) { walk(x, fn); }); }
	function refsOf(ast) { var out = []; walk(ast, function (n) { if (n.k === "ref") out.push({ sheet: n.sheet, g: n.g }); }); return out; }
	// function names this engine does not know, and names that are not LET variables / defined names (known(name) -> true)
	function unknownFunctions(ast, known) {
		var out = [], bound = {};
		walk(ast, function (n) { if (n.k === "call" && (n.name === "LET" || n.name === "LAMBDA")) n.args.forEach(function (x, i) { if (x.k === "name" && (n.name === "LAMBDA" ? i < n.args.length - 1 : i % 2 === 0 && i < n.args.length - 1)) bound[x.v.toUpperCase()] = 1; }); });
		walk(ast, function (n) {
			if (n.k === "call" && !FN[n.name] && !LAZY[n.name] && out.indexOf(n.name) < 0) out.push(n.name);
			if (n.k === "name" && !bound[n.v.toUpperCase()] && !(known && known(n.v)) && out.indexOf(n.v) < 0) out.push(n.v);
		});
		return out;
	}

	/* ---------- evaluation ---------- */
	// Values: number | string | boolean | null (blank) | Err | Range (a reference) | Arr (an array, from {1,2;3,4}, a range used in a
	// calculation, or a function such as SORT / FILTER / SEQUENCE). A formula whose result is an array "spills" into the cells below
	// and to the right (Calc does that); a formula from an older file that is not an array formula takes the value in its own row or
	// column instead (implicit intersection, like Excel).
	function Range(sheet, g, ctx) { this.sheet = sheet; this.g = g; this.ctx = ctx; }
	Range.prototype.isCell = function () { return this.g.s.r === this.g.e.r && this.g.s.c === this.g.e.c; };
	Range.prototype.each = function (fn) {
		var g = this.g, b = this.ctx.bounds ? this.ctx.bounds(this.sheet) : null;
		var r2 = g.e.r, c2 = g.e.c;
		if (b) { r2 = Math.min(r2, b.r); c2 = Math.min(c2, b.c); }
		for (var r = g.s.r; r <= r2; r++) for (var c = g.s.c; c <= c2; c++) { if (fn(this.ctx.get(this.sheet, r, c), r, c) === false) return; }
	};
	// the rows / columns actually read when the range is used as an array: a range reaching far past the data (A:A, A2:A1048576)
	// is cut at the last row / column with data, so two such ranges keep the same size
	Range.prototype.box = function () {
		var g = this.g, b = this.ctx.bounds ? this.ctx.bounds(this.sheet) : null, r2 = g.e.r, c2 = g.e.c;
		if (b) { if (r2 > b.r + 1000) r2 = Math.max(g.s.r, b.r); if (c2 > b.c + 200) c2 = Math.max(g.s.c, b.c); }
		return { r1: g.s.r, r2: r2, c1: g.s.c, c2: c2 };
	};
	Range.prototype.toArr = function () {
		var B = this.box(), rows = [];
		if ((B.r2 - B.r1 + 1) * (B.c2 - B.c1 + 1) > 5e6) throw new RangeError("That range is too big to use as an array.");
		for (var r = B.r1; r <= B.r2; r++) { var row = []; for (var c = B.c1; c <= B.c2; c++) row.push(this.ctx.get(this.sheet, r, c)); rows.push(row); }
		return new Arr(rows);
	};
	function Arr(rows) { this.rows = rows; this.h = rows.length; this.w = rows.length ? rows[0].length : 0; }
	Arr.prototype.each = function (fn) { for (var i = 0; i < this.h; i++) for (var j = 0; j < this.w; j++) if (fn(this.rows[i][j], i, j) === false) return; };
	Arr.prototype.at = function (i, j) { var ii = this.h === 1 ? 0 : i, jj = this.w === 1 ? 0 : j; return ii < this.h && jj < this.w ? this.rows[ii][jj] : E["#N/A"]; };
	function isMulti(x) { return (x instanceof Range && !x.isCell()) || (x instanceof Arr && (x.h > 1 || x.w > 1)); }
	function toArr(x) { if (x instanceof Arr) return x; if (x instanceof Range) return x.toArr(); return new Arr([[x]]); }
	function mapArr(a, fn) { return new Arr(a.rows.map(function (row, i) { return row.map(function (v, j) { return fn(v, i, j); }); })); }
	// element-wise over arrays of any size: a single row / column / value is repeated, cells outside the smaller array are #N/A
	function broadcast(list, fn) {
		var arrs = list.map(toArr), h = 1, w = 1;
		arrs.forEach(function (a) { if (a.h > h) h = a.h; if (a.w > w) w = a.w; });
		var rows = [];
		for (var i = 0; i < h; i++) { var row = []; for (var j = 0; j < w; j++) row.push(fn.apply(null, arrs.map(function (a) { return a.at(i, j); }))); rows.push(row); }
		return new Arr(rows);
	}
	// implicit intersection: a range in a place that wants one value takes the cell in the formula's own row (a column range) or column (a row range)
	function intersect(x, ctx) {
		var g = x.g;
		if (ctx && ctx.r != null) {
			if (g.s.c === g.e.c && ctx.r >= g.s.r && ctx.r <= g.e.r) return x.ctx.get(x.sheet, ctx.r, g.s.c);
			if (g.s.r === g.e.r && ctx.c >= g.s.c && ctx.c <= g.e.c) return x.ctx.get(x.sheet, g.s.r, ctx.c);
		}
		return E["#VALUE!"];
	}
	function scalar(x) {
		if (x instanceof Range) { if (x.isCell()) return x.ctx.get(x.sheet, x.g.s.r, x.g.s.c); return intersect(x, x.ctx.cur); }
		if (x instanceof Arr) return x.h && x.w ? x.rows[0][0] : E["#VALUE!"];
		return x;
	}
	function num(x) {
		if (x instanceof Range || x instanceof Arr) x = scalar(x);
		if (isErr(x)) return x;
		if (x == null) return 0;
		if (typeof x === "number") return x;
		if (typeof x === "boolean") return x ? 1 : 0;
		var t = String(x).trim(); if (t === "") return E["#VALUE!"];
		var n = parseNumberText(t); if (n) return n.v;
		var d = dateText(t); return d != null ? d : E["#VALUE!"];
	}
	// "2026-01-15", "1/15/2026", "15 Jan 2026", "12:30", "2026-01-15 08:00" -> serial number (null when it is not a date / time)
	var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
	function ymdSerial(y, m, d) { var t = Date.UTC(y, m - 1, d); var s = (t - Date.UTC(1899, 11, 30)) / 864e5; return s < 61 ? s - 1 : s; }
	function timeText(t) {
		var m = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?\s*([ap]\.?m\.?)?$/i.exec(t);
		if (!m) return null;
		var h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
		if (m[4]) { if (h > 12) return null; var pm = /^p/i.test(m[4]); if (h === 12) h = 0; if (pm) h += 12; }
		if (h > 23 || mi > 59 || se >= 60) return null;
		return (h * 3600 + mi * 60 + se) / 86400;
	}
	function dateText(t) {
		t = String(t).trim(); var m, y, mo, d, rest = "";
		if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](.+))?$/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4] || ""; }
		else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(.+))?$/.exec(t))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900; rest = m[4] || ""; if (mo > 12 && d <= 12) { var x0 = mo; mo = d; d = x0; } }
		else if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2,4})(?:\s+(.+))?$/.exec(t)) && MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0) { d = +m[1]; mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900; rest = m[4] || ""; }
		else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})(?:\s+(.+))?$/.exec(t)) && MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) >= 0) { mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; d = +m[2]; y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900; rest = m[4] || ""; }
		else { var tt = timeText(t); return tt; }
		var dt = new Date(Date.UTC(y, mo - 1, d));
		if (mo < 1 || mo > 12 || dt.getUTCDate() !== d || y < 1900 || y > 9999) return null;
		var s = ymdSerial(y, mo, d);
		if (rest) { var tm = timeText(rest); if (tm == null) return null; s += tm; }
		return s;
	}
	function fmtGeneral(v) {
		if (typeof v !== "number") return String(v);
		if (!isFinite(v)) return "#NUM!";
		if (v === 0) return "0";
		var a = Math.abs(v);
		if (a >= 1e11 || a < 1e-9) { var e = v.toExponential(5).replace(/\.?0+e/, "e").replace(/e\+?(-?)(\d)$/, "E$10$2").replace(/e\+?/, "E+").replace("E+-", "E-"); return e; }
		var s = String(+v.toPrecision(11));
		if (/e/.test(s)) s = v.toFixed(10).replace(/\.?0+$/, "");
		return s;
	}
	function txt(x) {
		if (x instanceof Range || x instanceof Arr) x = scalar(x);
		if (isErr(x)) return x;
		if (x == null) return "";
		if (typeof x === "boolean") return x ? "TRUE" : "FALSE";
		if (typeof x === "number") return fmtGeneral(x);
		return String(x);
	}
	function bool(x) {
		if (x instanceof Range || x instanceof Arr) x = scalar(x);
		if (isErr(x)) return x;
		if (x == null) return false;
		if (typeof x === "boolean") return x;
		if (typeof x === "number") return x !== 0;
		var u = String(x).toUpperCase(); if (u === "TRUE") return true; if (u === "FALSE") return false;
		return E["#VALUE!"];
	}
	function typeRank(x) { return typeof x === "number" ? 0 : typeof x === "string" ? 1 : typeof x === "boolean" ? 2 : 3; }
	function compare(a, b) {
		if (a == null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
		if (b == null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
		var ta = typeRank(a), tb = typeRank(b);
		if (ta !== tb) return ta < tb ? -1 : 1;
		if (ta === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
		return a < b ? -1 : a > b ? 1 : 0;
	}
	function roundHalfAway(x, d) {
		d = Math.trunc(d);
		if (!isFinite(x)) return x;
		var s = x < 0 ? -1 : 1, a = Math.abs(x);
		var r = Number(Math.round(Number(a + "e" + d)) + "e" + (-d));
		if (!isFinite(r)) { var f = Math.pow(10, d); r = Math.round(a * f) / f; }
		return s * r;
	}
	// Each argument is either a Range / Arr or a scalar. Excel rules: numbers inside ranges and arrays are counted, text and
	// TRUE/FALSE inside them are skipped; typed-in arguments are converted ("3" -> 3, TRUE -> 1), other text = #VALUE!.
	function numbersOf(args, opts) {
		var out = [], e = null;
		for (var i = 0; i < args.length && !e; i++) {
			var a = args[i];
			if (a instanceof Range || a instanceof Arr) a.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number") out.push(v); });
			else if (a === undefined) continue;
			else if (isErr(a)) e = a;
			else if (typeof a === "number") out.push(a);
			else if (typeof a === "boolean") out.push(a ? 1 : 0);
			else if (a == null) { if (!opts || !opts.skipBlank) out.push(0); }
			else { var n = parseNumberText(a); if (n) out.push(n.v); else if (!opts || !opts.lenient) e = E["#VALUE!"]; }
		}
		return e || out;
	}
	function binScalar(op, a, b) {
		if (isErr(a)) return a; if (isErr(b)) return b;
		if (op === "&") { var ta = txt(a), tb = txt(b); return isErr(ta) ? ta : isErr(tb) ? tb : ta + tb; }
		if (op === "=" || op === "<>" || op === "<" || op === ">" || op === "<=" || op === ">=") {
			var c = compare(a, b);
			return op === "=" ? c === 0 : op === "<>" ? c !== 0 : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
		}
		var p = num(a), q = num(b);
		if (isErr(p)) return p; if (isErr(q)) return q;
		var r;
		if (op === "+") r = p + q; else if (op === "-") r = p - q; else if (op === "*") r = p * q;
		else if (op === "/") { if (q === 0) return E["#DIV/0!"]; r = p / q; }
		else if (op === "^") { if (p === 0 && q === 0) return E["#NUM!"]; r = Math.pow(p, q); }
		return isFinite(r) ? r : E["#NUM!"];
	}
	var FN = {}, LAZY = {}, VOLATILE = { NOW: 1, TODAY: 1, RAND: 1, RANDBETWEEN: 1, RANDARRAY: 1, OFFSET: 1, INDIRECT: 1 };
	var FUNCTIONS = [];
	function refreshFunctions() { FUNCTIONS.length = 0; Object.keys(FN).concat(Object.keys(LAZY)).sort().forEach(function (k) { FUNCTIONS.push(k); }); return FUNCTIONS; }
	function Env(parent) { this.p = parent; this.v = {}; }
	Env.prototype.get = function (n) { var e = this; n = n.toUpperCase(); while (e) { if (n in e.v) return { v: e.v[n] }; e = e.p; } return null; };
	function evaluate(ast, ctx) {
		var cur = { r: ctx.r, c: ctx.c };
		var self = Object.create(ctx); self.cur = cur;
		function ev(n, env) {
			switch (n.k) {
				case "num": case "str": case "bool": return n.v;
				case "err": return err(n.v);
				case "arr": return new Arr(n.v);
				case "missing": return undefined;
				case "name": {
					var b = env && env.get(n.v); if (b) return b.v;
					if (ctx.name) { var nv = ctx.name(n.v, self); if (nv !== undefined) return nv; }
					throw new Unknown(n.v);
				}
				case "ref": {
					var sh = n.sheet == null ? ctx.sheet : n.sheet;
					if (ctx.hasSheet && !ctx.hasSheet(sh)) return E["#REF!"];
					if (n.spill) { var sg = ctx.spillRange ? ctx.spillRange(sh, n.g.s.r, n.g.s.c) : null; return sg ? new Range(sh, sg, self) : E["#REF!"]; }
					return new Range(sh, n.g, self);
				}
				case "sref": { var sr = ctx.sref ? ctx.sref(n.table, n.spec, self) : null; return sr ? new Range(sr.sheet, sr.g, self) : E["#REF!"]; }
				case "neg": case "pct": {
					var a0 = ev(n.a, env), f0 = function (x) { var y = num(x); return isErr(y) ? y : n.k === "neg" ? -y : y / 100; };
					return isMulti(a0) ? mapArr(toArr(a0), f0) : f0(scalar(a0));
				}
				case "bin": {
					var a = ev(n.a, env), b2 = ev(n.b, env);
					if (isMulti(a) || isMulti(b2)) return broadcast([a, b2], function (x, y) { return binScalar(n.op, x, y); });
					return binScalar(n.op, scalar(a), scalar(b2));
				}
				case "call": {
					if (LAZY[n.name]) return LAZY[n.name](n.args, function (x, e2) { return ev(x, e2 === undefined ? env : e2); }, self, env);
					var f = FN[n.name];
					if (!f) throw new Unknown(n.name);
					return f(n.args.map(function (x) { return x.k === "missing" ? undefined : ev(x, env); }), self);
				}
			}
			return E["#VALUE!"];
		}
		var out = ev(ast, null);
		if (out instanceof Range) out = out.isCell() ? out.ctx.get(out.sheet, out.g.s.r, out.g.s.c) : (ctx.dyn ? out.toArr() : intersect(out, cur));
		if (out instanceof Arr) {
			if (out.h === 1 && out.w === 1) out = out.rows[0][0];
			else if (!ctx.dyn) out = out.h && out.w ? out.rows[0][0] : E["#VALUE!"];
			else out = mapArr(out, function (v) { return v == null ? 0 : (typeof v === "number" && !isFinite(v)) ? E["#NUM!"] : v; });
		}
		if (out === undefined || out == null) out = 0;
		if (typeof out === "number" && !isFinite(out)) out = E["#NUM!"];
		return out;
	}
	// One-shot helper: evaluate a formula text with a get(sheet, r, c) function. opts: {r, c (the formula's cell), dyn (keep arrays)}
	function calc(formula, get, sheet, opts) {
		var ast = parse(String(formula).replace(/^=/, ""));
		var o = opts || {};
		return evaluate(ast, { get: get, sheet: sheet || "Sheet1", r: o.r, c: o.c, dyn: !!o.dyn, now: o.now, bounds: o.bounds, name: o.name, sref: o.sref });
	}

	/* ---------- insert / delete rows and columns: rewrite references ---------- */
	// op = {axis: "r"|"c", at (0-based first row/column affected), n (> 0 insert n before `at`, < 0 delete -n starting at `at`),
	//       sheet (name of the sheet being changed), here (name of the sheet the formula lives on)}
	function shiftIdx(i, op) {
		if (op.n > 0) return i >= op.at ? i + op.n : i;
		var d = -op.n;
		if (i < op.at) return i;
		if (i >= op.at + d) return i - d;
		return null;
	}
	function shiftRange(g, op, whole) {
		var key = op.axis === "r" ? "r" : "c";
		if ((whole === "c" && key === "r") || (whole === "r" && key === "c")) return g;
		var s = g.s[key], e = g.e[key], s2, e2;
		if (op.n > 0) { s2 = s >= op.at ? s + op.n : s; e2 = e >= op.at ? e + op.n : e; }
		else {
			var d = -op.n, lo = op.at, hi = op.at + d - 1;
			if (s >= lo && e <= hi) return null;
			s2 = s < lo ? s : (s > hi ? s - d : lo);
			e2 = e < lo ? e : (e > hi ? e - d : lo - 1);
			if (e2 < s2) return null;
		}
		var out = { s: { r: g.s.r, c: g.s.c }, e: { r: g.e.r, c: g.e.c } };
		out.s[key] = s2; out.e[key] = e2;
		return out;
	}
	function refText(raw, g, whole, single) {
		var m;
		var abs = function (part) { return { ac: /^\$/.test(part), ar: /\$\d/.test(part) }; };
		var parts = raw.split(":");
		if (whole === "c") { m = /^(\$?)[A-Za-z]+:(\$?)[A-Za-z]+$/.exec(raw); return m[1] + colName(g.s.c) + ":" + m[2] + colName(g.e.c); }
		if (whole === "r") { m = /^(\$?)\d+:(\$?)\d+$/.exec(raw); return m[1] + (g.s.r + 1) + ":" + m[2] + (g.e.r + 1); }
		var A = abs(parts[0]);
		if (single) return a1(g.s.r, g.s.c, A.ar, A.ac);
		var B = abs(parts[1]);
		return a1(g.s.r, g.s.c, A.ar, A.ac) + ":" + a1(g.e.r, g.e.c, B.ar, B.ac);
	}
	function adjust(formula, op) {
		var toks;
		try { toks = tokenize(formula); } catch (e) { return formula; }
		var out = "", changed = false;
		toks.forEach(function (t) {
			if (t.type !== "ref") { out += t.raw; return; }
			var sheet = t.v.sheet == null ? op.here : t.v.sheet;
			if (sheet !== op.sheet) { out += t.raw; return; }
			var node; try { node = refNode(t); } catch (e) { out += t.raw; return; }
			var g2 = shiftRange(node.g, op, node.whole);
			var prefix = t.raw.slice(0, t.raw.length - t.v.text.length);
			if (!g2) { out += prefix + "#REF!"; changed = true; return; }
			var txt2 = refText(t.v.text, g2, node.whole, node.single);
			if (txt2 !== t.v.text) changed = true;
			out += prefix + txt2;
		});
		return changed ? out : formula;
	}
	// Rewrite references after a sheet is renamed.
	function renameSheetRefs(formula, from, to) {
		var toks; try { toks = tokenize(formula); } catch (e) { return formula; }
		var q = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(to) && !parseA1(to) ? to : "'" + to.replace(/'/g, "''") + "'";
		return toks.map(function (t) { return t.type === "ref" && t.v.sheet === from ? q + "!" + t.v.text : t.raw; }).join("");
	}

	/* ---------- cell values ---------- */
	function cellValue(cell) {
		if (!cell) return null;
		switch (cell.t) {
			case "n": return typeof cell.v === "number" ? cell.v : null;
			case "s": case "str": return cell.v == null ? "" : String(cell.v);
			case "b": return !!cell.v;
			case "e": return err(ERRCODE[cell.v] || cell.w || "#VALUE!");
			case "d": return cell.v instanceof Date ? dateToSerial(cell.v) : null;
			default: return null;
		}
	}
	function dateToSerial(d) { return (d.getTime() - Date.UTC(1899, 11, 30)) / 864e5; }
	function resultCell(v, old) {
		var c = { f: old && old.f };
		if (old && old.z && typeof v === "number") c.z = old.z;
		if (old && old.s) c.s = old.s;
		if (old && old.xs != null) { c.xs = old.xs; if (old.xz) c.xz = old.xz; }
		if (old && old.ml) c.ml = old.ml;
		if (isErr(v)) { c.t = "e"; c.v = ERRNUM[v.code] != null ? ERRNUM[v.code] : 15; c.w = v.code; }
		else if (typeof v === "number") { c.t = "n"; c.v = v; }
		else if (typeof v === "boolean") { c.t = "b"; c.v = v; }
		else { c.t = "s"; c.v = v == null ? "" : String(v); }
		if (!c.f) delete c.f;
		return c;
	}

	/* ---------- dependency index + recalculation ---------- */
	// book = {sheets: [{name, data: [[cell, ...], ...]}], names (optional): {NAME: "Sheet1!$A$1:$A$9"}, tables (optional): [{name, sheet,
	// g (the whole table incl. header / total rows), header (bool), totals (bool), cols: [column names]}]}. Calc reads book.sheets each time.
	// Spills: a dynamic formula (typed here, or an array formula in the file) whose result is an array writes it into the cells below /
	// right; those cells get sp: 1 and belong to the formula (this.spilledBy). A value in the way gives #SPILL!.
	function Calc(book) { this.book = book; this.reindex(); }
	Calc.prototype.sheetIndex = function (name) {
		var ss = this.book.sheets;
		for (var i = 0; i < ss.length; i++) if (ss[i].name === name) return i;
		var low = String(name).toLowerCase();
		for (var j = 0; j < ss.length; j++) if (ss[j].name.toLowerCase() === low) return j;
		return -1;
	};
	Calc.prototype.reindex = function () {
		this.entries = {}; this.single = {}; this.ranges = {}; this.count = 0; this.vol = {};
		this.spills = {}; this.spilledBy = {}; this.blocked = {}; this.pending = []; this.nameAst = {};
		var ss = this.book.sheets;
		for (var si = 0; si < ss.length; si++) {
			var data = ss[si].data || [];
			for (var r = 0; r < data.length; r++) {
				var row = data[r]; if (!row) continue;
				for (var c = 0; c < row.length; c++) {
					var cell = row[c]; if (!cell || !cell.f) continue;
					var own = colName(c) + (r + 1), F = cell.F ? String(cell.F).replace(/\$/g, "") : null, dyn = !!cell.da || (F != null && F.split(":")[0] === own);
					this.add(si, r, c, cell.f, dyn);
					if (dyn && F && F.indexOf(":") > 0) {         // an array formula from the file: its other cells are its spill
						var g = parseRange(F); if (!g) continue;
						var k = this.key(si, r, c), h = g.e.r - g.s.r + 1, w = g.e.c - g.s.c + 1;
						this.spills[k] = { si: si, r: r, c: c, h: h, w: w };
						for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) if (i || j) { var gc = (data[r + i] || [])[c + j]; if (gc && !gc.f) { gc.sp = 1; this.spilledBy[this.key(si, r + i, c + j)] = k; } }
					}
				}
			}
		}
	};
	Calc.prototype.key = function (si, r, c) { return si + ":" + r + ":" + c; };
	Calc.prototype.tableList = function () { var t = this.book.tables; return typeof t === "function" ? t() : (t || []); };
	Calc.prototype.findTable = function (name, si, r, c) {
		var list = this.tableList(), self = this;
		for (var i = 0; i < list.length; i++) {
			var t = list[i];
			if (name ? String(t.name).toLowerCase() === String(name).toLowerCase() : (self.sheetIndex(t.sheet) === si && r >= t.g.s.r && r <= t.g.e.r && c >= t.g.s.c && c <= t.g.e.c)) return t;
		}
		return null;
	};
	Calc.prototype.nameRef = function (n) {
		var nm = this.book.names; if (typeof nm === "function") nm = nm();
		if (!nm) return null;
		var ref = nm[String(n).toUpperCase()];
		if (ref == null) return null;
		if (!this.nameAst[ref]) { try { this.nameAst[ref] = parse(String(ref).replace(/^=/, "")); } catch (e) { this.nameAst[ref] = { k: "err", v: "#NAME?" }; } }
		return this.nameAst[ref];
	};
	Calc.prototype.add = function (si, r, c, f, dyn) {
		var k = this.key(si, r, c), self = this, ent = { si: si, r: r, c: c, f: f, ast: null, refs: [], unknown: [], bad: null, dyn: !!dyn };
		if (this.entries[k]) this.remove(si, r, c, true);
		try { ent.ast = parse(f); ent.unknown = unknownFunctions(ent.ast, function (n) { return !!self.nameRef(n); }); } catch (e) { ent.bad = e.message || "Unreadable formula"; }
		var link = function (sheetName, g) {
			var tsi = sheetName == null ? si : self.sheetIndex(sheetName);
			if (tsi < 0) return;
			var ref = { si: tsi, g: g, ent: ent };
			ent.refs.push(ref);
			var sz = (g.e.r - g.s.r + 1) * (g.e.c - g.s.c + 1);
			if (sz <= 64) { for (var rr = g.s.r; rr <= g.e.r; rr++) for (var cc = g.s.c; cc <= g.e.c; cc++) { var kk = self.key(tsi, rr, cc); (self.single[kk] = self.single[kk] || []).push(ent); } ref.small = true; }
			else (self.ranges[tsi] = self.ranges[tsi] || []).push(ref);
		};
		if (ent.ast) walk(ent.ast, function (n) {
			if (n.k === "ref") {
				if (n.spill) link(n.sheet, { s: { r: n.g.s.r, c: n.g.s.c }, e: { r: Math.min(MAXR - 1, n.g.s.r + 5000), c: Math.min(MAXC - 1, n.g.s.c + 100) } });
				else link(n.sheet, n.g);
			}
			else if (n.k === "sref") { var t = self.findTable(n.table, si, r, c); if (t) link(t.sheet, t.g); }
			else if (n.k === "name") { var na = self.nameRef(n.v); if (na) refsOf(na).forEach(function (x) { link(x.sheet, x.g); }); }
			else if (n.k === "call" && VOLATILE[n.name]) self.vol[k] = ent;
		});
		this.entries[k] = ent; this.count++;
		return ent;
	};
	// keep: the formula is replaced right away (add), so its spill stays until the new result is known
	Calc.prototype.remove = function (si, r, c, keep) {
		var k = this.key(si, r, c), ent = this.entries[k], self = this;
		if (!ent) return;
		delete this.entries[k]; delete this.vol[k]; this.count--;
		ent.refs.forEach(function (ref) {
			if (ref.small) { for (var rr = ref.g.s.r; rr <= ref.g.e.r; rr++) for (var cc = ref.g.s.c; cc <= ref.g.e.c; cc++) { var kk = self.key(ref.si, rr, cc), a = self.single[kk]; if (a) { var i = a.indexOf(ent); if (i >= 0) a.splice(i, 1); if (!a.length) delete self.single[kk]; } } }
			else { var l = self.ranges[ref.si]; if (l) { var j = l.indexOf(ref); if (j >= 0) l.splice(j, 1); } }
		});
		if (!keep) { this.clearSpill(k, null); delete this.blocked[k]; }
	};
	// empty the spilled cells of anchor k that are outside rect `keep` ({h, w} from the anchor) -> pending changes
	Calc.prototype.clearSpill = function (k, keep) {
		var sp = this.spills[k]; if (!sp) return [];
		var out = [];
		for (var i = 0; i < sp.h; i++) for (var j = 0; j < sp.w; j++) {
			if (!i && !j) continue;
			if (keep && i < keep.h && j < keep.w) continue;
			var kk = this.key(sp.si, sp.r + i, sp.c + j);
			if (this.spilledBy[kk] !== k) continue;
			delete this.spilledBy[kk];
			var old = this.getCell(sp.si, sp.r + i, sp.c + j);
			if (old && old.sp) { var stub; if (old.xs != null || old.s) { stub = { t: "z" }; if (old.xs != null) { stub.xs = old.xs; if (old.xz) { stub.xz = old.xz; stub.z = old.xz; } } if (old.s) stub.s = old.s; } this.setCell(sp.si, sp.r + i, sp.c + j, stub); }
			out.push({ si: sp.si, r: sp.r + i, c: sp.c + j });
		}
		if (keep) this.spills[k] = { si: sp.si, r: sp.r, c: sp.c, h: Math.min(sp.h, keep.h), w: Math.min(sp.w, keep.w) }; else delete this.spills[k];
		this.pending = this.pending.concat(out);
		return out;
	};
	Calc.prototype.entry = function (si, r, c) { return this.entries[this.key(si, r, c)] || null; };
	Calc.prototype.dependents = function (si, r, c) {
		var out = (this.single[this.key(si, r, c)] || []).slice(), l = this.ranges[si] || [];
		for (var i = 0; i < l.length; i++) if (inRange(l[i].g, r, c) && out.indexOf(l[i].ent) < 0) out.push(l[i].ent);
		return out;
	};
	Calc.prototype.getCell = function (si, r, c) { var d = this.book.sheets[si] && this.book.sheets[si].data, row = d && d[r]; return row ? row[c] : undefined; };
	Calc.prototype.setCell = function (si, r, c, cell) {
		var d = this.book.sheets[si].data;
		while (d.length <= r) d.push(undefined);
		if (!d[r]) d[r] = [];
		d[r][c] = cell;
	};
	// the area a spilling formula at (r, c) covers now, for the A1# reference
	Calc.prototype.spillOf = function (si, r, c) { var sp = this.spills[this.key(si, r, c)]; return sp ? { s: { r: r, c: c }, e: { r: r + sp.h - 1, c: c + sp.w - 1 } } : null; };
	// changed = [{si, r, c}] cells whose value or formula just changed (formulas already registered with add()).
	// Recalculates everything that depends on them, in dependency order. Returns {updated: [{si, r, c}], stale: [{si, r, c, unknown}],
	// cycles: n, cycleCells: [{si, r, c}], spilled: [{si, r, c}] (cells written or emptied by spills)}.
	Calc.prototype.recalc = function (changed, opts) {
		opts = opts || {};
		var self = this, dirty = {}, order = [], queue = [], all = changed.concat(this.pending);
		this.pending = [];
		all.forEach(function (p) {
			var k0 = self.key(p.si, p.r, p.c);
			if (!opts.fromSpill && self.spilledBy[k0]) { var an = self.spilledBy[k0]; delete self.spilledBy[k0]; var ae = self.entries[an]; if (ae) queue.push(ae); }
			for (var bk in self.blocked) { var b = self.blocked[bk]; if (b.si === p.si && p.r >= b.r && p.r < b.r + b.h && p.c >= b.c && p.c < b.c + b.w && self.entries[bk]) queue.push(self.entries[bk]); }
			var e = self.entry(p.si, p.r, p.c); if (e) queue.push(e);
			queue = queue.concat(self.dependents(p.si, p.r, p.c));
		});
		if (!opts.fromSpill) for (var vk in this.vol) queue.push(this.vol[vk]);
		for (var qi = 0; qi < queue.length; qi++) {
			var e = queue[qi], k = self.key(e.si, e.r, e.c);
			if (dirty[k]) continue;
			dirty[k] = e; order.push(e);
			var ds = self.dependents(e.si, e.r, e.c);
			for (var i = 0; i < ds.length; i++) if (!dirty[self.key(ds[i].si, ds[i].r, ds[i].c)]) queue.push(ds[i]);
			var sp0 = self.spills[k];       // formulas reading this one's spilled cells
			if (sp0) for (var a = 0; a < sp0.h; a++) for (var b2 = 0; b2 < sp0.w; b2++) if (a || b2) { var d2 = self.dependents(e.si, e.r + a, e.c + b2); for (var i2 = 0; i2 < d2.length; i2++) if (!dirty[self.key(d2[i2].si, d2[i2].r, d2[i2].c)]) queue.push(d2[i2]); }
			if (queue.length > 2e6) break;
		}
		order = this.topo(order, dirty);
		var state = {}, updated = [], stale = [], cycles = 0, cycleCells = [], bmemo = {}, spilled = [], now = opts.now != null ? opts.now : Date.now();
		var sheetName = function (si) { return self.book.sheets[si].name; };
		var ctx = {
			sheet: null, now: now, dyn: false,
			hasSheet: function (n) { return self.sheetIndex(n) >= 0; },
			bounds: function (n) { if (bmemo[n]) return bmemo[n]; var si = self.sheetIndex(n), d = self.book.sheets[si].data || []; var mc = 0; for (var i = 0; i < d.length; i++) if (d[i] && d[i].length > mc) mc = d[i].length; return (bmemo[n] = { r: d.length - 1, c: mc - 1 }); },
			get: function (n, r, c) {
				var si = self.sheetIndex(n), k = self.key(si, r, c);
				if (dirty[k] && state[k] !== 2) { if (state[k] === 1) { cycles++; if (cycleCells.length < 50) cycleCells.push({ si: si, r: r, c: c }); return E["#CYCLE!"]; } compute(dirty[k]); }
				else { var an = self.spilledBy[k]; if (an && dirty[an] && state[an] !== 2) { if (state[an] === 1) { cycles++; return E["#CYCLE!"]; } compute(dirty[an]); } }
				return cellValue(self.getCell(si, r, c));
			},
			cellAt: function (n, r, c) { return self.getCell(self.sheetIndex(n), r, c); },
			spillRange: function (n, r, c) { var si = self.sheetIndex(n), k = self.key(si, r, c); if (dirty[k] && state[k] !== 2 && state[k] !== 1) compute(dirty[k]); return self.spillOf(si, r, c); },
			sref: function (table, spec, cur) { return srefRange(self, table, spec, cur); },
			name: function (n, cur) { var na = self.nameRef(n); if (!na) return undefined; return evaluateRaw(na, cur); }
		};
		function compute(e) {
			var k = self.key(e.si, e.r, e.c);
			if (state[k] === 2) return;
			state[k] = 1;
			var old = self.getCell(e.si, e.r, e.c);
			if (!e.ast || e.unknown.length) { state[k] = 2; stale.push({ si: e.si, r: e.r, c: e.c, unknown: e.ast ? e.unknown : [], bad: e.bad }); return; }
			var saved = [ctx.sheet, ctx.r, ctx.c, ctx.dyn, ctx.si]; ctx.sheet = sheetName(e.si); ctx.r = e.r; ctx.c = e.c; ctx.dyn = e.dyn; ctx.si = e.si;
			var v;
			try { v = evaluate(e.ast, ctx); } catch (x) {
				ctx.sheet = saved[0]; ctx.r = saved[1]; ctx.c = saved[2]; ctx.dyn = saved[3]; ctx.si = saved[4];
				if (x instanceof Unknown) { state[k] = 2; stale.push({ si: e.si, r: e.r, c: e.c, unknown: [x.name] }); return; }
				if (x instanceof RangeError && /stack/i.test(x.message)) throw x;
				v = E["#VALUE!"];
			}
			ctx.sheet = saved[0]; ctx.r = saved[1]; ctx.c = saved[2]; ctx.dyn = saved[3]; ctx.si = saved[4];
			if (v instanceof Arr) v = self.spill(e, v, spilled);
			else if (self.spills[k] || self.blocked[k]) { spilled.push.apply(spilled, self.clearSpill(k, null)); self.pending = []; delete self.blocked[k]; }
			var cell = resultCell(v, old); cell.f = e.f; if (e.dyn) cell.da = 1;
			if (self.spills[k]) { var sp = self.spills[k]; cell.F = colName(e.c) + (e.r + 1) + ":" + colName(e.c + sp.w - 1) + (e.r + sp.h); } else delete cell.F;
			self.setCell(e.si, e.r, e.c, cell);
			state[k] = 2;
			updated.push({ si: e.si, r: e.r, c: e.c });
		}
		function evaluateRaw(ast, cur) {   // a defined name: evaluated in the calling formula's context, references stay references
			var c2 = Object.create(ctx); c2.r = cur && cur.cur ? cur.cur.r : ctx.r; c2.c = cur && cur.cur ? cur.cur.c : ctx.c; c2.dyn = true;
			if (ast.k === "ref" && !ast.spill) { var sh = ast.sheet == null ? ctx.sheet : ast.sheet; return self.sheetIndex(sh) < 0 ? E["#REF!"] : new Range(sh, ast.g, cur || c2); }
			return evaluate(ast, c2);
		}
		for (var oi = 0; oi < order.length; oi++) compute(order[oi]);
		var res = { updated: updated, stale: stale, cycles: cycles, cycleCells: cycleCells, spilled: spilled };
		// cells a spill just wrote or emptied: what reads them (and was not already worked out after the spill) goes again
		if (spilled.length && (opts.depth || 0) < 8) {
			var more = this.recalc(spilled, { fromSpill: true, depth: (opts.depth || 0) + 1, now: now });
			res.updated = res.updated.concat(more.updated); res.stale = res.stale.concat(more.stale); res.cycles += more.cycles; res.spilled = res.spilled.concat(more.spilled);
		}
		return res;
	};
	// write an array result: returns the anchor's own value (or #SPILL!)
	Calc.prototype.spill = function (e, arr, changed) {
		var k = this.key(e.si, e.r, e.c), h = arr.h, w = arr.w, self = this;
		if (e.r + h > MAXR || e.c + w > MAXC || h * w > 2e6) { changed.push.apply(changed, this.clearSpill(k, null)); this.pending = []; return E["#SPILL!"]; }
		var blockedBy = null;
		for (var i = 0; i < h && !blockedBy; i++) for (var j = 0; j < w; j++) {
			if (!i && !j) continue;
			var kk = this.key(e.si, e.r + i, e.c + j), cell = this.getCell(e.si, e.r + i, e.c + j), own = this.spilledBy[kk];
			if (this.entries[kk] || (cell && cell.t !== "z" && !(cell.sp && (own == null || own === k)))) { blockedBy = { r: e.r + i, c: e.c + j }; break; }
			if (own && own !== k && self.entries[own]) { blockedBy = { r: e.r + i, c: e.c + j }; break; }
		}
		if (blockedBy) {
			changed.push.apply(changed, this.clearSpill(k, null)); this.pending = [];
			this.blocked[k] = { si: e.si, r: e.r, c: e.c, h: h, w: w, at: blockedBy };
			return E["#SPILL!"];
		}
		delete this.blocked[k];
		changed.push.apply(changed, this.clearSpill(k, { h: h, w: w })); this.pending = [];
		for (var a = 0; a < h; a++) for (var b = 0; b < w; b++) {
			if (!a && !b) continue;
			var key2 = this.key(e.si, e.r + a, e.c + b), old = this.getCell(e.si, e.r + a, e.c + b), v = arr.rows[a][b];
			var cell = resultCell(v == null ? 0 : v, old && (old.sp || old.t === "z") ? { z: old.z, s: old.s } : null); cell.sp = 1;
			if (old && old.xs != null) { cell.xs = old.xs; cell.xz = old.xz; }
			var same = old && old.sp && old.t === cell.t && old.v === cell.v && this.spilledBy[key2] === k;
			this.setCell(e.si, e.r + a, e.c + b, cell); this.spilledBy[key2] = k;
			if (!same) changed.push({ si: e.si, r: e.r + a, c: e.c + b });
		}
		this.spills[k] = { si: e.si, r: e.r, c: e.c, h: h, w: w };
		return arr.rows[0][0] == null ? 0 : arr.rows[0][0];
	};
	// order the dirty formulas so each comes after the dirty formulas it reads (iterative depth-first search, no deep recursion)
	Calc.prototype.topo = function (order, dirty) {
		if (order.length < 2) return order;
		var self = this, byCol = {}, anchors = [];
		order.forEach(function (e) { var kc = e.si + ":" + e.c; (byCol[kc] = byCol[kc] || []).push(e); if (self.spills[self.key(e.si, e.r, e.c)]) anchors.push(e); });
		for (var kc in byCol) byCol[kc].sort(function (a, b) { return a.r - b.r; });
		var colsOf = {}; for (var kc2 in byCol) { var p = kc2.split(":"); (colsOf[p[0]] = colsOf[p[0]] || []).push(+p[1]); }
		function precedents(e) {
			var out = [];
			e.refs.forEach(function (ref) {
				var g = ref.g;
				if (ref.small) { for (var r = g.s.r; r <= g.e.r; r++) for (var c = g.s.c; c <= g.e.c; c++) { var k = self.key(ref.si, r, c); if (dirty[k]) out.push(dirty[k]); else { var an = self.spilledBy[k]; if (an && dirty[an]) out.push(dirty[an]); } } }
				else (colsOf[ref.si] || []).forEach(function (c) {
					if (c < g.s.c || c > g.e.c) return;
					var list = byCol[ref.si + ":" + c], lo = 0, hi = list.length;
					while (lo < hi) { var m = (lo + hi) >> 1; if (list[m].r < g.s.r) lo = m + 1; else hi = m; }
					for (var i = lo; i < list.length && list[i].r <= g.e.r; i++) out.push(list[i]);
				});
				anchors.forEach(function (a) { var sp = self.spills[self.key(a.si, a.r, a.c)]; if (sp && a.si === ref.si && !(a.r + sp.h - 1 < g.s.r || a.r > g.e.r || a.c + sp.w - 1 < g.s.c || a.c > g.e.c)) out.push(a); });
			});
			return out;
		}
		var mark = {}, out = [];
		order.forEach(function (start) {
			var k0 = self.key(start.si, start.r, start.c);
			if (mark[k0]) return;
			var stack = [[start, null, 0]]; mark[k0] = 1;
			while (stack.length) {
				var top = stack[stack.length - 1];
				if (!top[1]) top[1] = precedents(top[0]);
				if (top[2] < top[1].length) {
					var nx = top[1][top[2]++], kn = self.key(nx.si, nx.r, nx.c);
					if (!mark[kn]) { mark[kn] = 1; stack.push([nx, null, 0]); }
				} else { stack.pop(); mark[self.key(top[0].si, top[0].r, top[0].c)] = 2; out.push(top[0]); }
			}
		});
		return out;
	};
	// Table1[Col] / [@Col] / Table1[[#Headers],[A]:[C]] / Table1[#All] -> {sheet, g}
	function srefRange(calc, table, spec, cur) {
		var si = cur && cur.si != null ? cur.si : calc.sheetIndex(cur && cur.sheet), t = calc.findTable(table, si, cur && cur.cur ? cur.cur.r : cur && cur.r, cur && cur.cur ? cur.cur.c : cur && cur.c);
		if (!t) return null;
		var g = t.g, top = g.s.r + (t.header ? 1 : 0), bot = g.e.r - (t.totals ? 1 : 0), items = [], s = String(spec).trim();
		if (s === "") items = [];
		else if (s[0] === "[" || s[0] === "@" && s[1] === "[") {
			var at = s[0] === "@"; if (at) { items.push("#This Row"); s = s.slice(1); }
			var re = /\[((?:[^\]']|'.)*)\]|(:)|,\s*/g, m, cols = [], colon = false;
			while ((m = re.exec(s))) { if (m[2]) colon = true; else if (m[1] != null) { var name = m[1].replace(/'(.)/g, "$1"); if (name[0] === "#") items.push(name); else { if (colon && cols.length) cols[cols.length - 1] = [cols[cols.length - 1][0], name]; else cols.push([name, name]); colon = false; } } }
			items.cols = cols;
		} else if (s[0] === "@") { items.push("#This Row"); items.cols = [[s.slice(1).replace(/'(.)/g, "$1"), s.slice(1).replace(/'(.)/g, "$1")]]; }
		else if (s[0] === "#") items.push(s);
		else items.cols = [[s.replace(/'(.)/g, "$1"), s.replace(/'(.)/g, "$1")]];
		var r1 = top, r2 = bot, kinds = items.filter(function (x) { return typeof x === "string"; }).map(function (x) { return x.toLowerCase(); });
		if (kinds.indexOf("#all") >= 0) { r1 = g.s.r; r2 = g.e.r; }
		else if (kinds.length) {
			var hs = kinds.indexOf("#headers") >= 0, ds = kinds.indexOf("#data") >= 0, ts = kinds.indexOf("#totals") >= 0, tr = kinds.indexOf("#this row") >= 0;
			if (tr) { var rr = cur && cur.cur ? cur.cur.r : null; if (rr == null || rr < top || rr > bot) return null; r1 = r2 = rr; }
			else { r1 = hs ? (t.header ? g.s.r : top) : ds ? top : (t.totals ? g.e.r : bot + 1); r2 = ts ? (t.totals ? g.e.r : null) : ds ? bot : hs ? (t.header ? g.s.r : null) : bot; if (r2 == null || r2 < r1) return null; }
		}
		var c1 = g.s.c, c2 = g.e.c;
		if (items.cols && items.cols.length) {
			var idx = function (n) { var low = n.toLowerCase(); for (var i = 0; i < t.cols.length; i++) if (String(t.cols[i]).toLowerCase() === low) return g.s.c + i; return -1; };
			var a = idx(items.cols[0][0]), b = idx(items.cols[items.cols.length - 1][1]);
			if (a < 0 || b < 0) return null;
			c1 = Math.min(a, b); c2 = Math.max(a, b);
		}
		if (r2 < r1) return null;
		return { sheet: t.sheet, g: { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } } };
	}

	/* ---------- sort / filter view (the data is never changed) ---------- */
	function cmpValues(a, b) {
		var ea = a == null || a === "", eb = b == null || b === "";
		if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;      // blanks always last
		if (isErr(a) || isErr(b)) return isErr(a) === isErr(b) ? 0 : isErr(a) ? 1 : -1;
		var ta = typeRank(a), tb = typeRank(b);
		if (ta !== tb) return ta - tb;
		if (ta === 1) return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
		return a < b ? -1 : a > b ? 1 : 0;
	}
	var FILTER_OPS = { contains: "contains", notcontains: "does not contain", eq: "equals", neq: "is not", begins: "begins with", ends: "ends with", gt: ">", ge: "≥", lt: "<", le: "≤", blank: "is empty", notblank: "is not empty" };
	function matchFilter(value, text, f) {
		var t = (text == null ? "" : String(text)), lo = t.toLowerCase(), q = String(f.v == null ? "" : f.v), ql = q.toLowerCase().trim();
		var empty = value == null || value === "";
		switch (f.op) {
			case "blank": return empty;
			case "notblank": return !empty;
			case "contains": return lo.indexOf(ql) >= 0;
			case "notcontains": return lo.indexOf(ql) < 0;
			case "begins": return lo.indexOf(ql) === 0;
			case "ends": return ql === "" || lo.slice(-ql.length) === ql;
			case "eq": case "neq": {
				var n = parseNumberText(q), same = (n && typeof value === "number") ? Math.abs(value - n.v) < 1e-9 : lo.trim() === ql;
				return f.op === "eq" ? same : !same;
			}
			case "gt": case "ge": case "lt": case "le": {
				var m = parseNumberText(q), x = typeof value === "number" ? value : (parseNumberText(t) || {}).v;
				if (!m || x == null) return false;
				return f.op === "gt" ? x > m.v : f.op === "ge" ? x >= m.v : f.op === "lt" ? x < m.v : x <= m.v;
			}
		}
		return true;
	}
	// opts: {nrows, header (true = row 0 / a number n = rows 0..n-1 stay first and are never filtered), hidden(r) (rows left out), sort: {c, dir: 1|-1} | null, filters: [{c, op, v}],
	//        value(r, c), text(r, c)}. Returns the row indexes to show, in order (null when there is nothing to do).
	function viewRows(opts) {
		var hasF = opts.filters && opts.filters.length, hasS = opts.sort && opts.sort.c != null, hid = opts.hidden;
		if (!hasF && !hasS && !hid) return null;
		var start = opts.header === true ? 1 : Math.max(0, opts.header | 0), rows = [];
		for (var r = start; r < opts.nrows; r++) {
			if (hid && hid(r)) continue;
			var ok = true;
			if (hasF) for (var i = 0; i < opts.filters.length; i++) { var f = opts.filters[i]; if (!matchFilter(opts.value(r, f.c), opts.text(r, f.c), f)) { ok = false; break; } }
			if (ok) rows.push(r);
		}
		if (hasS) {
			var c = opts.sort.c, d = opts.sort.dir < 0 ? -1 : 1, keys = {};
			rows.forEach(function (r) { keys[r] = opts.value(r, c); });
			rows.sort(function (a, b) {
				var x = keys[a], y = keys[b], ex = x == null || x === "", ey = y == null || y === "";
				if (ex || ey) return ex === ey ? a - b : ex ? 1 : -1;     // blanks last in both directions
				return (cmpValues(x, y) * d) || (a - b);
			});
		}
		for (var h = Math.min(start, opts.nrows) - 1; h >= 0; h--) rows.unshift(h);
		return rows;
	}

	/* ---------- misc ---------- */
	function fmtBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
	function kindOf(name, u8) {
		var ext = (/\.([a-z0-9]+)$/i.exec(name || "") || [])[1];
		ext = ext ? ext.toLowerCase() : "";
		if (u8 && u8.length >= 4) {
			if (u8[0] === 0x50 && u8[1] === 0x4b) return ext === "ods" ? "ods" : (ext === "numbers" ? "numbers" : "zip");
			if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return "xls";
			if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "pdf";
		}
		if (/^(csv|tsv|tab|txt|prn)$/.test(ext)) return "text";
		if (/^(xlsx|xlsm|xltx|xltm|xlsb|xls|ods|fods|xml|html|htm|dbf|sylk|slk|dif|numbers)$/.test(ext)) return ext;
		return ext ? "other" : "text";
	}
	function baseName(name) { return String(name || "spreadsheet").replace(/\.[^.\/\\]+$/, "") || "spreadsheet"; }
	function safeSheetName(s, taken) {
		s = String(s || "Sheet").replace(/[\\\/?*\[\]:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sheet";
		var base = s, n = 2, low = function (x) { return x.toLowerCase(); };
		while ((taken || []).map(low).indexOf(low(s)) >= 0) { var suf = " (" + n++ + ")"; s = base.slice(0, 31 - suf.length) + suf; }
		return s;
	}

	var api = {
		colName: colName, colIndex: colIndex, parseA1: parseA1, a1: a1, parseRange: parseRange, rangeA1: rangeA1, inRange: inRange, MAXR: MAXR, MAXC: MAXC,
		detectDelimiter: detectDelimiter, parseDelimited: parseDelimited, toDelimited: toDelimited,
		parseNumberText: parseNumberText, parseInput: parseInput,
		Err: Err, isErr: isErr, err: err, ERRCODE: ERRCODE, ERRNUM: ERRNUM, Unknown: Unknown,
		tokenize: tokenize, parse: parse, refsOf: refsOf, unknownFunctions: unknownFunctions, evaluate: evaluate, calc: calc, FUNCTIONS: FUNCTIONS, refreshFunctions: refreshFunctions,
		FN: FN, LAZY: LAZY, VOLATILE: VOLATILE, Range: Range, Arr: Arr, isMulti: isMulti, toArr: toArr, mapArr: mapArr, broadcast: broadcast, scalar: scalar,
		num: num, txt: txt, bool: bool, numbersOf: numbersOf, binScalar: binScalar, Env: Env, E: E, dateText: dateText, timeText: timeText, ymdSerial: ymdSerial, normFn: normFn, walk: walk,
		fmtGeneral: fmtGeneral, roundHalfAway: roundHalfAway, compare: compare,
		adjust: adjust, renameSheetRefs: renameSheetRefs, shiftIdx: shiftIdx,
		cellValue: cellValue, resultCell: resultCell, Calc: Calc,
		cmpValues: cmpValues, matchFilter: matchFilter, viewRows: viewRows, FILTER_OPS: FILTER_OPS,
		fmtBytes: fmtBytes, kindOf: kindOf, baseName: baseName, safeSheetName: safeSheetName
	};
	if (typeof module === "object" && module.exports) { module.exports = api; require("./formulas.js").install(api); require("./edit.js").install(api); }
	else root.MESXL = api;
})(typeof window !== "undefined" ? window : this);

/* MES Spreadsheet Viewer & Editor (mes.fm/excel): the worksheet function library (about 250 Excel functions) for the formula engine in
   lib.js. install(MESXL) registers them in MESXL.FN (arguments already worked out) and MESXL.LAZY (arguments worked out on demand:
   IF, IFS, IFERROR, SWITCH, CHOOSE, LET, AND / OR short cuts...). Results are checked against Excel in tool_apps_src/excel-tests.js.
   Conventions: an argument is a Range (a reference), an Arr (an array) or a scalar (number, text, boolean, null = blank, Err).
   Functions that take single values are "lifted": given a range or array they work on every cell and return an array (spill). */
(function (root) {
	"use strict";
	function install(X) {
		var FN = X.FN, LAZY = X.LAZY, E = X.E, isErr = X.isErr, Range = X.Range, Arr = X.Arr, num = X.num, txt = X.txt, bool = X.bool;
		var scalar = X.scalar, isMulti = X.isMulti, toArr = X.toArr, mapArr = X.mapArr, broadcast = X.broadcast, numbersOf = X.numbersOf;
		var compare = X.compare, parseNumberText = X.parseNumberText, roundHalfAway = X.roundHalfAway, fmtGeneral = X.fmtGeneral;
		var NA = E["#N/A"], VAL = E["#VALUE!"], NUM = E["#NUM!"], DIV = E["#DIV/0!"], REF = E["#REF!"];

		/* ---------- helpers ---------- */
		// lift(fn, n): fn(a, b, ...) gets single values; when any of the first n arguments (all when n is omitted) is a range / array the
		// result is an array of fn over every cell (sizes broadcast like Excel).
		function lift(fn, n) {
			return function (args, ctx) {
				var m = n == null ? args.length : Math.min(n, args.length), multi = false;
				for (var i = 0; i < m; i++) if (isMulti(args[i])) { multi = true; break; }
				if (!multi) return fn.apply(ctx, args.map(function (a, i2) { return i2 < m || !(a instanceof Range || a instanceof Arr) ? scalar(a) : a; }));
				var lifted = [], pos = [];
				for (var j = 0; j < m; j++) if (isMulti(args[j])) { lifted.push(args[j]); pos.push(j); }
				return broadcast(lifted, function () {
					var vals = arguments, a2 = args.map(function (a, i3) { var p = pos.indexOf(i3); return p >= 0 ? vals[p] : (i3 < m ? scalar(a) : a); });
					return fn.apply(ctx, a2);
				});
			};
		}
		function N1(x) { var v = num(x); return v; }
		function optNum(x, d) { return x === undefined || x === null && false ? d : (x === undefined ? d : num(x)); }
		function firstErr() { for (var i = 0; i < arguments.length; i++) if (isErr(arguments[i])) return arguments[i]; return null; }
		function isBlank(v) { return v == null; }
		function flat(args, keep) {   // every value of every argument (ranges / arrays read cell by cell), keep(v) filters
			var out = [];
			args.forEach(function (a) { if (a instanceof Range || a instanceof Arr) a.each(function (v) { if (!keep || keep(v)) out.push(v); }); else if (a !== undefined && (!keep || keep(a))) out.push(a); });
			return out;
		}
		function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
		function nums(args) { return numbersOf(args); }
		function statNums(args) { var n = numbersOf(args); return n; }
		function mean(a) { return sum(a) / a.length; }
		function variance(a, sample) { if (a.length < (sample ? 2 : 1)) return DIV; var m = mean(a), s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return s / (a.length - (sample ? 1 : 0)); }
		function sortNum(a) { return a.slice().sort(function (x, y) { return x - y; }); }
		function percentile(a, p, exc) {
			var s = sortNum(a), n = s.length;
			if (!n) return NUM;
			if (exc) { var h = p * (n + 1) - 1; if (h < 0 || h > n - 1) return NUM; var lo = Math.floor(h); return s[lo] + (h - lo) * ((s[lo + 1] != null ? s[lo + 1] : s[lo]) - s[lo]); }
			if (p < 0 || p > 1) return NUM;
			var x = p * (n - 1), l = Math.floor(x); return l + 1 < n ? s[l] + (x - l) * (s[l + 1] - s[l]) : s[l];
		}
		function int(x) { return x < 0 ? Math.ceil(x) : Math.floor(x); }
		function ret(v) { return typeof v === "number" && !isFinite(v) ? NUM : v; }
		function arrOf(x) { return x instanceof Range || x instanceof Arr ? toArr(x) : new Arr([[x]]); }
		function dimsOf(x) { if (x instanceof Range) { var b = x.box(); return { h: b.r2 - b.r1 + 1, w: b.c2 - b.c1 + 1 }; } if (x instanceof Arr) return { h: x.h, w: x.w }; return { h: 1, w: 1 }; }

		/* ---------- criteria (COUNTIF, SUMIF ...) ---------- */
		function wild(s) { return new RegExp("^" + s.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\\/])/g, function (m, esc, w, sp) { return esc ? "\\" + esc : w ? (w === "*" ? "[\\s\\S]*" : "[\\s\\S]") : "\\" + sp; }) + "$", "i"); }
		function criterion(c) {
			if (c instanceof Range || c instanceof Arr) c = scalar(c);
			if (isErr(c)) return function (v) { return isErr(v) && v.code === c.code; };
			if (typeof c === "number") return function (v) { if (typeof v === "number") return v === c; if (typeof v === "string") { var n = parseNumberText(v); return !!n && n.v === c; } return false; };
			if (typeof c === "boolean") return function (v) { return v === c; };
			if (c == null) return function (v) { return v === 0; };
			var s = String(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || "=", rest = m[2];
			if (rest === "") { if (op === "=") return function (v) { return v == null || v === ""; }; if (op === "<>") return function (v) { return !(v == null || v === ""); }; }
			var n = parseNumberText(rest), d = n ? null : X.dateText(rest);
			var target = n ? n.v : d;
			var up = rest.toUpperCase();
			if (target != null) {
				return function (v) {
					var x = typeof v === "number" ? v : null;
					if (x == null && typeof v === "string" && (op === "=" || op === "<>")) { var pv = parseNumberText(v); x = pv ? pv.v : null; }
					if (op === "<>") return x == null || x !== target;
					if (x == null) return false;
					return op === "=" ? x === target : op === "<" ? x < target : op === ">" ? x > target : op === "<=" ? x <= target : x >= target;
				};
			}
			if (up === "TRUE" || up === "FALSE") { var bv = up === "TRUE"; return function (v) { return op === "<>" ? v !== bv : op === "=" ? v === bv : false; }; }
			if (/^#/.test(up)) return function (v) { var same = isErr(v) && v.code === up; return op === "<>" ? !same : same; };
			if (op === "=" || op === "<>") {
				var re = /[*?~]/.test(rest) ? wild(rest) : null, low = rest.toLowerCase();
				return function (v) { var same = typeof v === "string" && (re ? re.test(v) : v.toLowerCase() === low); return op === "<>" ? !same : same; };
			}
			return function (v) { if (typeof v !== "string") return false; var k = compare(v, rest); return op === "<" ? k < 0 : op === ">" ? k > 0 : op === "<=" ? k <= 0 : k >= 0; };
		}
		// [range, criteria] pairs -> array of booleans over the shape of the first range (other ranges are read at the same offsets)
		function matches(pairs, ctx) {
			var first = pairs[0][0];
			if (!(first instanceof Range || first instanceof Arr)) first = new Arr([[first]]);
			var D = first instanceof Range ? first.box() : { r1: 0, r2: first.h - 1, c1: 0, c2: first.w - 1 }, h = D.r2 - D.r1 + 1, w = D.c2 - D.c1 + 1;
			var tests = pairs.map(function (p) { return criterion(p[1]); }), ok = [];
			var readers = pairs.map(function (p) {
				var rg = p[0];
				if (rg instanceof Range) { var r0 = rg.g.s.r, c0 = rg.g.s.c; return function (i, j) { return rg.ctx.get(rg.sheet, r0 + i, c0 + j); }; }
				if (rg instanceof Arr) return function (i, j) { return i < rg.h && j < rg.w ? rg.rows[i][j] : null; };
				return function () { return rg; };
			});
			for (var i = 0; i < h; i++) { var row = []; for (var j = 0; j < w; j++) { var all = true; for (var t = 0; t < tests.length && all; t++) if (!tests[t](readers[t](i, j))) all = false; row.push(all); } ok.push(row); }
			return { ok: ok, h: h, w: w };
		}
		function pairsOf(args, from) { var p = []; for (var i = from; i + 1 < args.length; i += 2) p.push([args[i], args[i + 1]]); return p; }
		function valuesAt(rg, ok) {   // the cells of rg (from its top-left) where ok is true
			var out = [];
			for (var i = 0; i < ok.h; i++) for (var j = 0; j < ok.w; j++) if (ok.ok[i][j]) {
				var v = rg instanceof Range ? rg.ctx.get(rg.sheet, rg.g.s.r + i, rg.g.s.c + j) : rg instanceof Arr ? (i < rg.h && j < rg.w ? rg.rows[i][j] : null) : rg;
				out.push(v);
			}
			return out;
		}
		function numsOnly(vals) { var out = []; for (var i = 0; i < vals.length; i++) { if (isErr(vals[i])) return vals[i]; if (typeof vals[i] === "number") out.push(vals[i]); } return out; }
		X.criterion = criterion;

		/* ---------- dates ---------- */
		var EPOCH = Date.UTC(1899, 11, 30);
		function toDate(s) { s = Math.floor(s); if (s < 61) s += 1; return new Date(EPOCH + s * 864e5); }       // 1900 leap-year bug: serial 60 = 29 Feb 1900
		function fromYMD(y, m, d) { var t = Date.UTC(y, m - 1, d), s = Math.round((t - EPOCH) / 864e5); return s < 61 ? s - 1 : s; }
		function serialArg(x) { var v = num(x); if (isErr(v)) return v; if (v < 0) return NUM; return v; }
		function ymd(s) { if (s === 60) return { y: 1900, m: 2, d: 29 }; var dt = toDate(s); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() }; }
		function wdOf(s) { return toDate(s).getUTCDay(); }
		function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
		function holidaySet(h) { var set = {}; if (h === undefined) return set; flat([h]).forEach(function (v) { if (typeof v === "number") set[Math.floor(v)] = 1; }); return set; }
		function weekendMask(w) {   // NETWORKDAYS.INTL / WORKDAY.INTL weekend: 1 = Sat+Sun ... or "0000011"
			if (w === undefined || w == null) w = 1;
			if (typeof w === "string") { if (!/^[01]{7}$/.test(w) || w === "1111111") return null; return [w[6], w[0], w[1], w[2], w[3], w[4], w[5]].map(function (c) { return c === "1"; }); }
			var m = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6], 11: [0], 12: [1], 13: [2], 14: [3], 15: [4], 16: [5], 17: [6] }[w];
			if (!m) return null;
			var out = [false, false, false, false, false, false, false]; m.forEach(function (d) { out[d] = true; }); return out;
		}
		function networkdays(a, b, hol, wk) {
			a = Math.floor(a); b = Math.floor(b);
			var sign = 1; if (b < a) { var t = a; a = b; b = t; sign = -1; }
			var n = 0; for (var s = a; s <= b; s++) if (!wk[wdOf(s)] && !hol[s]) n++;
			return sign * n;
		}
		function workday(a, days, hol, wk) {
			var s = Math.floor(a), step = days < 0 ? -1 : 1, left = Math.abs(Math.trunc(days)), guard = 0;
			while (left > 0 && guard++ < 1e6) { s += step; if (!wk[wdOf(s)] && !hol[s]) left--; }
			return s;
		}
		function addMonths(s, m) { var d = ymd(Math.floor(s)), y = d.y, mo = d.m + m; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return fromYMD(y, mo, Math.min(d.d, lastDay(y, mo))); }
		function days360(a, b, eu) {
			var A = ymd(a), B = ymd(b), d1 = A.d, d2 = B.d;
			if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
			else { var lastFebA = A.m === 2 && A.d === lastDay(A.y, 2); if (lastFebA) d1 = 30; if (d1 === 31) d1 = 30; if (d2 === 31 && d1 === 30) d2 = 30; if (lastFebA && B.m === 2 && B.d === lastDay(B.y, 2)) d2 = 30; }
			return (B.y - A.y) * 360 + (B.m - A.m) * 30 + d2 - d1;
		}
		function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
		X.ymd = ymd; X.fromYMD = fromYMD;

		/* ---------- number formatting for TEXT() (SheetJS's SSF when the page has loaded it) ---------- */
		function textFormat(v, fmt) {
			if (X.ssf && typeof v === "number") { try { return X.ssf.format(fmt, v); } catch (e) { /* fall back */ } }
			if (typeof v !== "number") return txt(v);
			var f = String(fmt);
			if (/^general$/i.test(f)) return fmtGeneral(v);
			if (/[ymdhs]/i.test(f.replace(/"[^"]*"/g, "")) && !/[0#]/.test(f.replace(/"[^"]*"/g, ""))) return dateFormat(v, f);
			var secs = f.split(";"), sec = v < 0 && secs[1] != null ? secs[1] : v === 0 && secs[2] != null ? secs[2] : secs[0], neg = v < 0 && secs[1] == null;
			var a = Math.abs(v), pct = /%/.test(sec.replace(/"[^"]*"/g, ""));
			if (pct) a *= 100;
			var core = /[0#?,.]+/.exec(sec.replace(/"[^"]*"/g, "")); if (!core) return sec.replace(/"/g, "");
			var p = core[0], dp = p.indexOf("."), decs = dp >= 0 ? p.slice(dp + 1).replace(/[^0#]/g, "").length : 0, comma = p.indexOf(",") >= 0 && /,[0#]/.test(p);
			var minDec = dp >= 0 ? (p.slice(dp + 1).match(/0/g) || []).length : 0;
			var s = roundHalfAway(a, decs).toFixed(decs);
			if (decs > minDec) { s = s.replace(/0+$/, function (z) { return z.slice(0, Math.max(0, z.length - (decs - minDec))); }); s = s.replace(/\.$/, minDec ? "." : ""); }
			var ip = s.split(".")[0], dpart = s.split(".")[1];
			var minInt = ((dp >= 0 ? p.slice(0, dp) : p).match(/0/g) || []).length;
			while (ip.length < minInt) ip = "0" + ip;
			if (ip === "0" && minInt === 0) ip = "";
			if (comma) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			var body = ip + (dpart != null && dpart !== "" ? "." + dpart : "");
			var out = sec.replace(/"([^"]*)"/g, "\u0001$1\u0002"), idx = out.search(/[0#?,.]+/);
			out = out.slice(0, idx) + body + out.slice(idx).replace(/^[0#?,.]+/, "");
			out = out.replace(/\u0001([^\u0002]*)\u0002/g, "$1").replace(/\\(.)/g, "$1").replace(/_./g, " ").replace(/\[[^\]]*\]/g, "");
			return (neg ? "-" : "") + out;
		}
		var DAYN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		function dateFormat(v, f) {
			var d = ymd(Math.floor(v)), secs = Math.round((v - Math.floor(v)) * 86400), H = Math.floor(secs / 3600), Mi = Math.floor(secs % 3600 / 60), Se = secs % 60, ampm = /AM\/PM|A\/P/i.test(f);
			var hh = ampm ? (H % 12 || 12) : H, pad = function (n) { return (n < 10 ? "0" : "") + n; };
			var toks = f.match(/"[^"]*"|\\.|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|am\/pm|A\/P|a\/p|[^"\\ymdhsAa]+|./gi) || [], out = "", lastH = false;
			toks.forEach(function (t, i) {
				var low = t.toLowerCase();
				if (t[0] === '"') out += t.slice(1, -1); else if (t[0] === "\\") out += t[1];
				else if (low === "yyyy") out += d.y; else if (low === "yy") out += pad(d.y % 100);
				else if (low === "mmmmm") out += MONN[d.m - 1][0]; else if (low === "mmmm") out += MONN[d.m - 1]; else if (low === "mmm") out += MONN[d.m - 1].slice(0, 3);
				else if (low === "mm" || low === "m") { var next = toks.slice(i + 1).join("").toLowerCase(); var isMin = lastH || /^[^a-z]*s/.test(next); out += isMin ? (low === "mm" ? pad(Mi) : Mi) : (low === "mm" ? pad(d.m) : d.m); }
				else if (low === "dddd") out += DAYN[wdOf(Math.floor(v))]; else if (low === "ddd") out += DAYN[wdOf(Math.floor(v))].slice(0, 3);
				else if (low === "dd") out += pad(d.d); else if (low === "d") out += d.d;
				else if (low === "hh") out += pad(hh); else if (low === "h") out += hh;
				else if (low === "ss") out += pad(Se); else if (low === "s") out += Se;
				else if (low === "am/pm") out += H < 12 ? "AM" : "PM"; else if (low === "a/p") out += H < 12 ? "A" : "P";
				else out += t;
				if (/^[a-z]/i.test(t)) lastH = low === "hh" || low === "h";
			});
			return out;
		}
		X.textFormat = textFormat;

		/* ---------- math and statistics ---------- */
		var M = {
			SUM: function (a) { var n = nums(a); return isErr(n) ? n : sum(n); },
			SUMSQ: function (a) { var n = nums(a); if (isErr(n)) return n; var s = 0; n.forEach(function (x) { s += x * x; }); return s; },
			AVERAGE: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? mean(n) : DIV; },
			AVERAGEA: function (a) { var v = flat(a, function (x) { return x != null; }), n = []; for (var i = 0; i < v.length; i++) { if (isErr(v[i])) return v[i]; n.push(typeof v[i] === "number" ? v[i] : v[i] === true ? 1 : 0); } return n.length ? mean(n) : DIV; },
			MIN: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? Math.min.apply(null, n) : 0; },
			MAX: function (a) { var n = nums(a); if (isErr(n)) return n; return n.length ? Math.max.apply(null, n) : 0; },
			MINA: function (a) { var v = flat(a, function (x) { return x != null; }).map(function (x) { return typeof x === "number" ? x : x === true ? 1 : 0; }); return v.length ? Math.min.apply(null, v) : 0; },
			MAXA: function (a) { var v = flat(a, function (x) { return x != null; }).map(function (x) { return typeof x === "number" ? x : x === true ? 1 : 0; }); return v.length ? Math.max.apply(null, v) : 0; },
			PRODUCT: function (a) { var n = nums(a); if (isErr(n)) return n; if (!n.length) return 0; var s = 1; n.forEach(function (x) { s *= x; }); return ret(s); },
			COUNT: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (typeof v === "number") k++; }); else if (typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && parseNumberText(x))) k++; }); return k; },
			COUNTA: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (v != null) k++; }); else if (x !== undefined) k++; }); return k; },
			COUNTBLANK: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range) { var g = x.g, B = x.box(); var total = (B.r2 - B.r1 + 1) * (B.c2 - B.c1 + 1); var filled = 0; x.each(function (v) { if (v != null && v !== "") filled++; }); k += total - filled; } else if (x instanceof Arr) x.each(function (v) { if (v == null || v === "") k++; }); }); return k; },
			MEDIAN: function (a) { var n = nums(a); if (isErr(n)) return n; if (!n.length) return NUM; var s = sortNum(n), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; },
			MODE: function (a) { var n = nums(a); if (isErr(n)) return n; var cnt = {}, best = null, bc = 1; n.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; if (cnt[x] > bc) { bc = cnt[x]; best = x; } }); return best == null ? NA : best; },
			"STDEV.S": function (a) { var n = nums(a); if (isErr(n)) return n; var v = variance(n, true); return isErr(v) ? v : Math.sqrt(v); },
			"STDEV.P": function (a) { var n = nums(a); if (isErr(n)) return n; var v = variance(n, false); return isErr(v) ? v : Math.sqrt(v); },
			"VAR.S": function (a) { var n = nums(a); return isErr(n) ? n : variance(n, true); },
			"VAR.P": function (a) { var n = nums(a); return isErr(n) ? n : variance(n, false); },
			LARGE: function (a) { var n = nums([a[0]]), k = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(k)) return k; k = Math.ceil(k); if (k < 1 || k > n.length) return NUM; return sortNum(n)[n.length - k]; },
			SMALL: function (a) { var n = nums([a[0]]), k = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(k)) return k; k = Math.ceil(k); if (k < 1 || k > n.length) return NUM; return sortNum(n)[k - 1]; },
			"RANK.EQ": lift(function (x, ref, ord) { x = num(x); if (isErr(x)) return x; var n = nums([ref]); if (isErr(n)) return n; if (n.indexOf(x) < 0) return NA; var o = ord === undefined ? 0 : num(ord); var k = 1; n.forEach(function (y) { if (o ? y < x : y > x) k++; }); return k; }, 1),
			"RANK.AVG": lift(function (x, ref, ord) { x = num(x); if (isErr(x)) return x; var n = nums([ref]); if (isErr(n)) return n; var o = ord === undefined ? 0 : num(ord), k = 1, same = 0; n.forEach(function (y) { if (o ? y < x : y > x) k++; if (y === x) same++; }); return same ? k + (same - 1) / 2 : NA; }, 1),
			"PERCENTILE.INC": function (a) { var n = nums([a[0]]), p = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(p)) return p; return percentile(n, p, false); },
			"PERCENTILE.EXC": function (a) { var n = nums([a[0]]), p = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(p)) return p; return percentile(n, p, true); },
			"QUARTILE.INC": function (a) { var n = nums([a[0]]), q = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(q)) return q; q = Math.floor(q); if (q < 0 || q > 4) return NUM; return percentile(n, q / 4, false); },
			"QUARTILE.EXC": function (a) { var n = nums([a[0]]), q = num(scalar(a[1])); if (isErr(n)) return n; if (isErr(q)) return q; q = Math.floor(q); if (q < 1 || q > 3) return NUM; return percentile(n, q / 4, true); },
			CORREL: function (a) { var x = arrOf(a[0]), y = arrOf(a[1]), xs = [], ys = []; x.each(function (v, i, j) { var w = y.at(i, j); if (typeof v === "number" && typeof w === "number") { xs.push(v); ys.push(w); } }); if (xs.length < 2) return DIV; var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0, syy = 0; xs.forEach(function (v, i) { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) * (v - mx); syy += (ys[i] - my) * (ys[i] - my); }); return sxx && syy ? sxy / Math.sqrt(sxx * syy) : DIV; },
			SUMPRODUCT: function (a) {
				if (!a.length) return VAL;
				var arrs = a.map(arrOf), h = arrs[0].h, w = arrs[0].w;
				if (arrs.some(function (x) { return x.h !== h || x.w !== w; })) return VAL;
				var s = 0;
				for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) {
					var p = 1;
					for (var k = 0; k < arrs.length; k++) { var v = arrs[k].rows[i][j]; if (isErr(v)) return v; p *= typeof v === "number" ? v : 0; }
					s += p;
				}
				return s;
			},
			SUBTOTAL: function (a, ctx) {
				var f = num(scalar(a[0])); if (isErr(f)) return f;
				var fn = { 1: "AVERAGE", 2: "COUNT", 3: "COUNTA", 4: "MAX", 5: "MIN", 6: "PRODUCT", 7: "STDEV.S", 8: "STDEV.P", 9: "SUM", 10: "VAR.S", 11: "VAR.P" }[f % 100];
				if (!fn) return VAL;
				var rest = a.slice(1).map(function (x) {
					if (!(x instanceof Range) || !ctx.cellAt) return x;
					var B = x.box(), rows = [];
					for (var r = B.r1; r <= B.r2; r++) { var row = []; for (var c = B.c1; c <= B.c2; c++) { var cl = ctx.cellAt(x.sheet, r, c); row.push(cl && cl.f && /SUBTOTAL\s*\(|AGGREGATE\s*\(/i.test(cl.f) ? null : x.ctx.get(x.sheet, r, c)); } rows.push(row); }
					return new Arr(rows);
				});
				return FN[fn](rest, ctx);
			},
			ROUND: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); return firstErr(x, d) || roundHalfAway(x, d); }),
			ROUNDUP: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.ceil(y); return (x < 0 ? -1 : 1) * y / f; }),
			ROUNDDOWN: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.floor(y); return (x < 0 ? -1 : 1) * y / f; }),
			TRUNC: lift(function (x, d) { x = num(x); d = d === undefined ? 0 : num(d); if (firstErr(x, d)) return firstErr(x, d); var f = Math.pow(10, Math.trunc(d)); return int(roundHalfAway(x * f, 9)) / f; }),
			MROUND: lift(function (x, m) { x = num(x); m = num(m); if (firstErr(x, m)) return firstErr(x, m); if (m === 0) return 0; if (x * m < 0) return NUM; return roundHalfAway(x / m, 0) * m; }),
			CEILING: lift(function (x, s) { x = num(x); s = s === undefined ? 1 : num(s); if (firstErr(x, s)) return firstErr(x, s); if (s === 0) return 0; if (x > 0 && s < 0) return NUM; return Math.ceil(roundHalfAway(x / s, 9)) * s; }),
			"CEILING.MATH": lift(function (x, s, mode) { x = num(x); s = s === undefined ? 1 : Math.abs(num(s)); mode = mode === undefined ? 0 : num(mode); if (firstErr(x, s, mode)) return firstErr(x, s, mode); if (s === 0) return 0; var q = roundHalfAway(x / s, 9); return (x < 0 && mode ? Math.floor(q) : Math.ceil(q)) * s; }),
			FLOOR: lift(function (x, s) { x = num(x); s = s === undefined ? 1 : num(s); if (firstErr(x, s)) return firstErr(x, s); if (s === 0) return DIV; if (x > 0 && s < 0) return NUM; return Math.floor(roundHalfAway(x / s, 9)) * s; }),
			"FLOOR.MATH": lift(function (x, s, mode) { x = num(x); s = s === undefined ? 1 : Math.abs(num(s)); mode = mode === undefined ? 0 : num(mode); if (firstErr(x, s, mode)) return firstErr(x, s, mode); if (s === 0) return 0; var q = roundHalfAway(x / s, 9); return (x < 0 && mode ? Math.ceil(q) : Math.floor(q)) * s; }),
			INT: lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(x); }),
			MOD: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (y === 0) return DIV; var r = x - y * Math.floor(x / y); return Math.abs(r) < 1e-12 ? 0 : roundHalfAway(r, 12); }),
			QUOTIENT: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (y === 0) return DIV; return int(x / y); }),
			POWER: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (x === 0 && y === 0) return NUM; var r = Math.pow(x, y); return isFinite(r) ? r : (x === 0 ? DIV : NUM); }),
			ABS: lift(function (x) { x = num(x); return isErr(x) ? x : Math.abs(x); }),
			SIGN: lift(function (x) { x = num(x); return isErr(x) ? x : x > 0 ? 1 : x < 0 ? -1 : 0; }),
			SQRT: lift(function (x) { x = num(x); if (isErr(x)) return x; return x < 0 ? NUM : Math.sqrt(x); }),
			SQRTPI: lift(function (x) { x = num(x); if (isErr(x)) return x; return x < 0 ? NUM : Math.sqrt(x * Math.PI); }),
			EXP: lift(function (x) { x = num(x); return isErr(x) ? x : ret(Math.exp(x)); }),
			LN: lift(function (x) { x = num(x); if (isErr(x)) return x; return x <= 0 ? NUM : Math.log(x); }),
			LOG: lift(function (x, b) { x = num(x); b = b === undefined ? 10 : num(b); if (firstErr(x, b)) return firstErr(x, b); if (x <= 0 || b <= 0) return NUM; if (b === 1) return DIV; return Math.log(x) / Math.log(b); }),
			LOG10: lift(function (x) { x = num(x); if (isErr(x)) return x; return x <= 0 ? NUM : Math.log10(x); }),
			PI: function () { return Math.PI; },
			SIN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.sin(x); }), COS: lift(function (x) { x = num(x); return isErr(x) ? x : Math.cos(x); }),
			TAN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.tan(x); }),
			ASIN: lift(function (x) { x = num(x); if (isErr(x)) return x; return Math.abs(x) > 1 ? NUM : Math.asin(x); }), ACOS: lift(function (x) { x = num(x); if (isErr(x)) return x; return Math.abs(x) > 1 ? NUM : Math.acos(x); }),
			ATAN: lift(function (x) { x = num(x); return isErr(x) ? x : Math.atan(x); }),
			ATAN2: lift(function (x, y) { x = num(x); y = num(y); if (firstErr(x, y)) return firstErr(x, y); if (x === 0 && y === 0) return DIV; return Math.atan2(y, x); }),
			SINH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.sinh(x); }), COSH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.cosh(x); }), TANH: lift(function (x) { x = num(x); return isErr(x) ? x : Math.tanh(x); }),
			DEGREES: lift(function (x) { x = num(x); return isErr(x) ? x : x * 180 / Math.PI; }), RADIANS: lift(function (x) { x = num(x); return isErr(x) ? x : x * Math.PI / 180; }),
			FACT: lift(function (x) { x = num(x); if (isErr(x)) return x; x = Math.floor(x); if (x < 0) return NUM; var r = 1; for (var i = 2; i <= x; i++) r *= i; return ret(r); }),
			FACTDOUBLE: lift(function (x) { x = num(x); if (isErr(x)) return x; x = Math.floor(x); if (x < -1) return NUM; var r = 1; for (var i = x; i > 1; i -= 2) r *= i; return ret(r); }),
			COMBIN: lift(function (n, k) { n = num(n); k = num(k); if (firstErr(n, k)) return firstErr(n, k); n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0 || k > n) return NUM; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }),
			PERMUT: lift(function (n, k) { n = num(n); k = num(k); if (firstErr(n, k)) return firstErr(n, k); n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0 || k > n) return NUM; var r = 1; for (var i = 0; i < k; i++) r *= n - i; return r; }),
			GCD: function (a) { var n = nums(a); if (isErr(n)) return n; if (n.some(function (x) { return x < 0; })) return NUM; var g = function (x, y) { x = Math.floor(x); y = Math.floor(y); while (y) { var t = y; y = x % y; x = t; } return x; }; return n.reduce(g, 0); },
			LCM: function (a) { var n = nums(a); if (isErr(n)) return n; if (n.some(function (x) { return x < 0; })) return NUM; var g = function (x, y) { while (y) { var t = y; y = x % y; x = t; } return x; }; return n.reduce(function (acc, x) { x = Math.floor(x); return acc === 0 || x === 0 ? 0 : acc * x / g(acc, x); }, 1); },
			EVEN: lift(function (x) { x = num(x); if (isErr(x)) return x; var s = x < 0 ? -1 : 1, a = Math.ceil(Math.abs(x)); return s * (a % 2 ? a + 1 : a); }),
			ODD: lift(function (x) { x = num(x); if (isErr(x)) return x; var s = x < 0 ? -1 : 1, a = Math.ceil(Math.abs(x)); return s * (a % 2 ? a : a + 1); }),
			RAND: function () { return Math.random(); },
			RANDBETWEEN: function (a) { var lo = num(scalar(a[0])), hi = num(scalar(a[1])); if (firstErr(lo, hi)) return firstErr(lo, hi); lo = Math.ceil(lo); hi = Math.floor(hi); if (hi < lo) return NUM; return lo + Math.floor(Math.random() * (hi - lo + 1)); }
		};
		M.MEDIAN = M.MEDIAN; M["MODE.SNGL"] = M.MODE; M.STDEV = M["STDEV.S"]; M.STDEVP = M["STDEV.P"]; M.VAR = M["VAR.S"]; M.VARP = M["VAR.P"]; M.RANK = M["RANK.EQ"];
		M.PERCENTILE = M["PERCENTILE.INC"]; M.QUARTILE = M["QUARTILE.INC"]; M.PEARSON = M.CORREL; M["CEILING.PRECISE"] = M["CEILING.MATH"]; M["FLOOR.PRECISE"] = M["FLOOR.MATH"]; M["ISO.CEILING"] = M["CEILING.MATH"];

		/* ---------- conditional sums and counts ---------- */
		M.COUNTIF = function (a) { var m = matches([[a[0], a[1]]]), k = 0; m.ok.forEach(function (r) { r.forEach(function (x) { if (x) k++; }); }); return k; };
		M.COUNTIFS = function (a) { if (a.length < 2 || a.length % 2) return VAL; var m = matches(pairsOf(a, 0)), k = 0; m.ok.forEach(function (r) { r.forEach(function (x) { if (x) k++; }); }); return k; };
		M.SUMIF = function (a) { var m = matches([[a[0], a[1]]]), v = numsOnly(valuesAt(a.length > 2 && a[2] !== undefined ? a[2] : a[0], m)); return isErr(v) ? v : sum(v); };
		M.SUMIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : sum(v); };
		M.AVERAGEIF = function (a) { var m = matches([[a[0], a[1]]]), v = numsOnly(valuesAt(a.length > 2 && a[2] !== undefined ? a[2] : a[0], m)); return isErr(v) ? v : v.length ? mean(v) : DIV; };
		M.AVERAGEIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? mean(v) : DIV; };
		M.MAXIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? Math.max.apply(null, v) : 0; };
		M.MINIFS = function (a) { if (a.length < 3 || a.length % 2 === 0) return VAL; var m = matches(pairsOf(a, 1)), v = numsOnly(valuesAt(a[0], m)); return isErr(v) ? v : v.length ? Math.min.apply(null, v) : 0; };

		/* ---------- logic and information ---------- */
		function logic(a, op) {
			var any = false, res = op === "and", cnt = 0, e = null;
			a.forEach(function (x) {
				if (e) return;
				if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number" || typeof v === "boolean") { any = true; if (op === "and" && !v) res = false; if (op === "or" && v) res = true; if (v) cnt++; } });
				else if (x !== undefined) { var b = bool(x); if (isErr(b)) e = b; else { any = true; if (op === "and" && !b) res = false; if (op === "or" && b) res = true; if (b) cnt++; } }
			});
			if (e) return e; if (!any) return VAL;
			return op === "xor" ? cnt % 2 === 1 : res;
		}
		M.AND = function (a) { return logic(a, "and"); }; M.OR = function (a) { return logic(a, "or"); }; M.XOR = function (a) { return logic(a, "xor"); };
		M.NOT = lift(function (x) { var b = bool(x); return isErr(b) ? b : !b; });
		M.TRUE = function () { return true; }; M.FALSE = function () { return false; };
		M.NA = function () { return NA; };
		M.ISBLANK = lift(function (x) { return x == null; });
		M.ISNUMBER = lift(function (x) { return typeof x === "number"; });
		M.ISTEXT = lift(function (x) { return typeof x === "string"; });
		M.ISNONTEXT = lift(function (x) { return typeof x !== "string"; });
		M.ISLOGICAL = lift(function (x) { return typeof x === "boolean"; });
		M.ISERROR = lift(function (x) { return isErr(x); });
		M.ISERR = lift(function (x) { return isErr(x) && x.code !== "#N/A"; });
		M.ISNA = lift(function (x) { return isErr(x) && x.code === "#N/A"; });
		M.ISEVEN = lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(Math.abs(x)) % 2 === 0; });
		M.ISODD = lift(function (x) { x = num(x); return isErr(x) ? x : Math.floor(Math.abs(x)) % 2 === 1; });
		M.ISREF = function (a) { return a[0] instanceof Range; };
		M.ISFORMULA = function (a, ctx) { var r = a[0]; if (!(r instanceof Range)) return VAL; var cl = ctx.cellAt ? ctx.cellAt(r.sheet, r.g.s.r, r.g.s.c) : null; return !!(cl && cl.f); };
		M.N = function (a) { var x = scalar(a[0]); return typeof x === "number" ? x : x === true ? 1 : isErr(x) ? x : 0; };
		M.T = function (a) { var x = scalar(a[0]); return typeof x === "string" ? x : isErr(x) ? x : ""; };
		M.TYPE = function (a) { var x = a[0]; if (x instanceof Arr || isMulti(x)) return 64; x = scalar(x); return typeof x === "number" || x == null ? 1 : typeof x === "string" ? 2 : typeof x === "boolean" ? 4 : isErr(x) ? 16 : 1; };
		M["ERROR.TYPE"] = function (a) { var x = scalar(a[0]); if (!isErr(x)) return NA; return { "#NULL!": 1, "#DIV/0!": 2, "#VALUE!": 3, "#REF!": 4, "#NAME?": 5, "#NUM!": 6, "#N/A": 7, "#SPILL!": 9, "#CALC!": 14 }[x.code] || NA; };

		/* ---------- text ---------- */
		function T1(fn) { return lift(function () { for (var i = 0; i < arguments.length; i++) if (isErr(arguments[i])) return arguments[i]; return fn.apply(null, arguments); }); }
		M.LEN = T1(function (s) { return txt(s).length; });
		M.UPPER = T1(function (s) { return txt(s).toUpperCase(); });
		M.LOWER = T1(function (s) { return txt(s).toLowerCase(); });
		M.PROPER = T1(function (s) { return txt(s).toLowerCase().replace(/(^|[^A-Za-zÀ-ÿ'])([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); }).replace(/([A-Za-zÀ-ÿ])'([a-z])/g, function (m, a, b) { return a + "'" + b.toUpperCase(); }); });
		M.TRIM = T1(function (s) { return txt(s).replace(/ +/g, " ").trim(); });
		M.CLEAN = T1(function (s) { return txt(s).replace(/[\x00-\x1f]/g, ""); });
		M.LEFT = T1(function (s, n) { n = n === undefined ? 1 : num(n); if (isErr(n)) return n; if (n < 0) return VAL; return txt(s).slice(0, Math.floor(n)); });
		M.RIGHT = T1(function (s, n) { n = n === undefined ? 1 : num(n); if (isErr(n)) return n; if (n < 0) return VAL; var t = txt(s); n = Math.floor(n); return n ? t.slice(-n) : ""; });
		M.MID = T1(function (s, st, n) { st = num(st); n = num(n); if (firstErr(st, n)) return firstErr(st, n); if (st < 1 || n < 0) return VAL; return txt(s).substr(Math.floor(st) - 1, Math.floor(n)); });
		M.REPT = T1(function (s, n) { n = num(n); if (isErr(n)) return n; if (n < 0) return VAL; var t = txt(s); if (t.length * n > 32767) return VAL; return new Array(Math.floor(n) + 1).join(t); });
		M.EXACT = T1(function (a, b) { return txt(a) === txt(b); });
		M.FIND = T1(function (f, s, st) { st = st === undefined ? 1 : num(st); if (isErr(st)) return st; var t = txt(s); if (st < 1 || st > t.length + 1) return VAL; var i = t.indexOf(txt(f), Math.floor(st) - 1); return i < 0 ? VAL : i + 1; });
		M.SEARCH = T1(function (f, s, st) {
			st = st === undefined ? 1 : num(st); if (isErr(st)) return st;
			var t = txt(s), q = txt(f); if (st < 1 || st > t.length + 1) return VAL;
			if (/[*?]/.test(q)) { var re = new RegExp(wild(q).source.slice(1, -1), "i"), sub = t.slice(Math.floor(st) - 1), m = re.exec(sub); return m ? m.index + Math.floor(st) : VAL; }
			var i = t.toLowerCase().indexOf(q.toLowerCase(), Math.floor(st) - 1); return i < 0 ? VAL : i + 1;
		});
		M.SUBSTITUTE = T1(function (s, o, n, inst) {
			var t = txt(s), a = txt(o), b = txt(n); if (a === "") return t;
			if (inst === undefined) return t.split(a).join(b);
			inst = num(inst); if (isErr(inst)) return inst; if (inst < 1) return VAL;
			var i = -1; for (var k = 0; k < Math.floor(inst); k++) { i = t.indexOf(a, i + 1); if (i < 0) return t; }
			return t.slice(0, i) + b + t.slice(i + a.length);
		});
		M.REPLACE = T1(function (s, st, n, nw) { st = num(st); n = num(n); if (firstErr(st, n)) return firstErr(st, n); if (st < 1 || n < 0) return VAL; var t = txt(s); return t.slice(0, Math.floor(st) - 1) + txt(nw) + t.slice(Math.floor(st) - 1 + Math.floor(n)); });
		M.CHAR = T1(function (n) { n = num(n); if (isErr(n)) return n; n = Math.floor(n); if (n < 1 || n > 255) return VAL; return n < 128 ? String.fromCharCode(n) : new TextDecoder("windows-1252").decode(new Uint8Array([n])); });
		M.UNICHAR = T1(function (n) { n = num(n); if (isErr(n)) return n; n = Math.floor(n); if (n < 1 || n > 0x10FFFF) return VAL; return String.fromCodePoint(n); });
		M.CODE = T1(function (s) { var t = txt(s); return t ? t.charCodeAt(0) : VAL; });
		M.UNICODE = T1(function (s) { var t = txt(s); return t ? t.codePointAt(0) : VAL; });
		M.VALUE = T1(function (s) { if (typeof s === "number") return s; if (typeof s === "boolean") return VAL; var t = txt(s).trim(); if (t === "") return 0; var n = parseNumberText(t); if (n) return n.v; var d = X.dateText(t); return d != null ? d : VAL; });
		M.NUMBERVALUE = T1(function (s, dec, grp) { var t = txt(s).replace(/\s/g, ""), d = dec === undefined ? "." : txt(dec), g = grp === undefined ? "," : txt(grp); if (g) t = t.split(g).join(""); if (d !== ".") t = t.split(d).join("."); var pct = 0; while (/%$/.test(t)) { pct++; t = t.slice(0, -1); } if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return VAL; return +t / Math.pow(100, pct); });
		M.TEXT = T1(function (v, f) { var x = v; if (typeof x === "string") { var n = parseNumberText(x); if (n) x = n.v; else { var d = X.dateText(x); if (d != null) x = d; } } if (typeof x === "boolean") return txt(x); return textFormat(x, txt(f)); });
		M.FIXED = T1(function (v, d, nc) { v = num(v); d = d === undefined ? 2 : num(d); if (firstErr(v, d)) return firstErr(v, d); var r = roundHalfAway(v, d), s = Math.abs(r).toFixed(Math.max(0, d)); if (!(nc !== undefined && bool(nc) === true)) s = s.replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }); return (r < 0 ? "-" : "") + s; });
		M.DOLLAR = T1(function (v, d) { v = num(v); d = d === undefined ? 2 : num(d); if (firstErr(v, d)) return firstErr(v, d); var r = roundHalfAway(v, d), s = Math.abs(r).toFixed(Math.max(0, d)).replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }); return r < 0 ? "($" + s + ")" : "$" + s; });
		M.CONCATENATE = function (a) { var s = ""; for (var i = 0; i < a.length; i++) { if (isMulti(a[i])) return lift(function () { return Array.prototype.map.call(arguments, txt).join(""); })(a); var t = txt(a[i]); if (isErr(t)) return t; s += t; } return s; };
		M.CONCAT = function (a) { var s = "", e = null; a.forEach(function (x) { if (e) return; if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } s += txt(v); }); else if (x !== undefined) { var t = txt(x); if (isErr(t)) e = t; else s += t; } }); return e || (s.length > 32767 ? VAL : s); };
		M.TEXTJOIN = function (a) {
			var d = arrOf(a[0]), ign = bool(scalar(a[1])); if (isErr(ign)) return ign;
			var parts = [], e = null;
			a.slice(2).forEach(function (x) { if (e) return; if (x instanceof Range || x instanceof Arr) x.each(function (v) { if (isErr(v)) { e = v; return false; } var t = txt(v); if (!(ign && t === "")) parts.push(t); }); else if (x !== undefined) { if (isErr(x)) { e = x; return; } var t = txt(x); if (!(ign && t === "")) parts.push(t); } });
			if (e) return e;
			var ds = []; d.each(function (v) { ds.push(txt(v)); }); if (!ds.length) ds = [""];
			var out = ""; parts.forEach(function (p, i) { out += (i ? ds[(i - 1) % ds.length] : "") + p; });
			return out.length > 32767 ? VAL : out;
		};
		function beforeAfter(after) {
			return lift(function (s, dl, inst, mm, me, nf) {
				var t = txt(s), d = txt(dl), n = inst === undefined ? 1 : num(inst), ci = mm !== undefined && num(mm) === 1, end = me !== undefined && num(me) === 1;
				if (isErr(n)) return n; if (n === 0) return VAL;
				var hay = ci ? t.toLowerCase() : t, nd = ci ? d.toLowerCase() : d, pos = -1;
				if (n > 0) { var from = 0; for (var k = 0; k < n; k++) { pos = hay.indexOf(nd, from); if (pos < 0) break; from = pos + Math.max(1, nd.length); } if (pos < 0 && end && k === n - 1) pos = t.length; }
				else { var from2 = hay.length; for (var k2 = 0; k2 < -n; k2++) { pos = hay.lastIndexOf(nd, from2); if (pos < 0) break; from2 = pos - 1; } if (pos < 0 && end && k2 === -n - 1) pos = 0; }
				if (pos < 0) return nf === undefined ? NA : nf;
				return after ? t.slice(pos + d.length) : t.slice(0, pos);
			}, 1);
		}
		M.TEXTBEFORE = beforeAfter(false); M.TEXTAFTER = beforeAfter(true);
		M.TEXTSPLIT = function (a) {
			var t = txt(scalar(a[0])); if (isErr(t)) return t;
			var cd = a[1] === undefined ? [] : flat([a[1]]).map(txt), rd = a[2] === undefined ? [] : flat([a[2]]).map(txt), ign = a[3] !== undefined && bool(scalar(a[3])) === true, pad = a[5] === undefined ? NA : scalar(a[5]);
			var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
			var split = function (s, ds) { if (!ds.length) return [s]; var parts = s.split(new RegExp(ds.filter(Boolean).map(esc).join("|"))); return ign ? parts.filter(function (p) { return p !== ""; }) : parts; };
			var rows = split(t, rd).map(function (r) { return split(r, cd); }), w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
			return new Arr(rows.map(function (r) { while (r.length < w) r.push(pad); return r; }));
		};

		/* ---------- dates and times ---------- */
		M.DATE = lift(function (y, m, d) {
			y = num(y); m = num(m); d = num(d); if (firstErr(y, m, d)) return firstErr(y, m, d);
			y = Math.floor(y); m = Math.floor(m); d = Math.floor(d);
			if (y < 1900) y += 1900; if (y < 1900 || y > 9999) return NUM;
			var t = Date.UTC(y, m - 1, 1) + (d - 1) * 864e5, dt = new Date(t), s = fromYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
			return s < 0 ? NUM : s;
		});
		M.TIME = lift(function (h, mi, s) { h = num(h); mi = num(mi); s = num(s); if (firstErr(h, mi, s)) return firstErr(h, mi, s); var t = (Math.floor(h) * 3600 + Math.floor(mi) * 60 + Math.floor(s)) / 86400; return t < 0 ? NUM : t - Math.floor(t); });
		M.TODAY = function (a, ctx) { var d = new Date(ctx && ctx.now != null ? ctx.now : Date.now()); return fromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
		M.NOW = function (a, ctx) { var d = new Date(ctx && ctx.now != null ? ctx.now : Date.now()); return fromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
		M.YEAR = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).y; });
		M.MONTH = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).m; });
		M.DAY = lift(function (s) { s = serialArg(s); return isErr(s) ? s : ymd(Math.floor(s)).d; });
		M.HOUR = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.floor(Math.round((s - Math.floor(s)) * 86400) / 3600) % 24; });
		M.MINUTE = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.floor(Math.round((s - Math.floor(s)) * 86400) % 3600 / 60); });
		M.SECOND = lift(function (s) { s = serialArg(s); return isErr(s) ? s : Math.round((s - Math.floor(s)) * 86400) % 60; });
		M.WEEKDAY = lift(function (s, t) {
			s = serialArg(s); t = t === undefined ? 1 : num(t); if (firstErr(s, t)) return firstErr(s, t);
			var w = wdOf(Math.floor(s));
			if (t === 1 || t === 17) return w + 1; if (t === 2 || t === 11) return (w + 6) % 7 + 1; if (t === 3) return (w + 6) % 7;
			if (t >= 12 && t <= 16) return (w - (t - 10) + 7) % 7 + 1;
			return NUM;
		});
		M.WEEKNUM = lift(function (s, t) {
			s = serialArg(s); t = t === undefined ? 1 : num(t); if (firstErr(s, t)) return firstErr(s, t);
			if (t === 21) return M.ISOWEEKNUM([s]);
			var start = { 1: 0, 17: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6 }[t]; if (start == null) return NUM;
			var d = ymd(Math.floor(s)), jan1 = fromYMD(d.y, 1, 1), off = (wdOf(jan1) - start + 7) % 7;
			return Math.floor((Math.floor(s) - jan1 + off) / 7) + 1;
		});
		M.ISOWEEKNUM = lift(function (s) { s = serialArg(s); if (isErr(s)) return s; var dt = toDate(Math.floor(s)), day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); var fy = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); return 1 + Math.round(((dt - fy) / 864e5 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7); });
		M.EOMONTH = lift(function (s, m) { s = serialArg(s); m = num(m); if (firstErr(s, m)) return firstErr(s, m); var d = ymd(Math.floor(s)), mo = d.m + Math.trunc(m), y = d.y + Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return fromYMD(y, mo, lastDay(y, mo)); });
		M.EDATE = lift(function (s, m) { s = serialArg(s); m = num(m); if (firstErr(s, m)) return firstErr(s, m); return addMonths(s, Math.trunc(m)); });
		M.DAYS = lift(function (b, a) { b = num(b); a = num(a); if (firstErr(a, b)) return firstErr(a, b); return Math.floor(b) - Math.floor(a); });
		M.DAYS360 = lift(function (a, b, m) { a = num(a); b = num(b); if (firstErr(a, b)) return firstErr(a, b); return days360(Math.floor(a), Math.floor(b), m !== undefined && bool(m) === true); });
		M.DATEVALUE = T1(function (s) { var d = X.dateText(txt(s)); return d == null ? VAL : Math.floor(d); });
		M.TIMEVALUE = T1(function (s) { var t = txt(s).trim(), d = X.timeText(t); if (d == null) { var dd = X.dateText(t); if (dd == null) return VAL; d = dd - Math.floor(dd); } return d; });
		M.NETWORKDAYS = function (a) { var s = num(scalar(a[0])), e = num(scalar(a[1])); if (firstErr(s, e)) return firstErr(s, e); return networkdays(s, e, holidaySet(a[2]), weekendMask(1)); };
		M["NETWORKDAYS.INTL"] = function (a) { var s = num(scalar(a[0])), e = num(scalar(a[1])); if (firstErr(s, e)) return firstErr(s, e); var w = weekendMask(a[2] === undefined ? 1 : scalar(a[2])); if (!w) return NUM; return networkdays(s, e, holidaySet(a[3]), w); };
		M.WORKDAY = function (a) { var s = num(scalar(a[0])), d = num(scalar(a[1])); if (firstErr(s, d)) return firstErr(s, d); return workday(s, d, holidaySet(a[2]), weekendMask(1)); };
		M["WORKDAY.INTL"] = function (a) { var s = num(scalar(a[0])), d = num(scalar(a[1])); if (firstErr(s, d)) return firstErr(s, d); var w = weekendMask(a[2] === undefined ? 1 : scalar(a[2])); if (!w) return NUM; return workday(s, d, holidaySet(a[3]), w); };
		M.DATEDIF = lift(function (a, b, u) {
			a = num(a); b = num(b); if (firstErr(a, b)) return firstErr(a, b); a = Math.floor(a); b = Math.floor(b); if (b < a) return NUM;
			var A = ymd(a), B = ymd(b), unit = txt(u).toUpperCase();
			var months = (B.y - A.y) * 12 + B.m - A.m - (B.d < A.d ? 1 : 0);
			if (unit === "D") return b - a; if (unit === "M") return months; if (unit === "Y") return Math.floor(months / 12);
			if (unit === "YM") return months % 12;
			if (unit === "MD") { var pm = B.m - 1, py = B.y; if (pm < 1) { pm = 12; py--; } return B.d >= A.d ? B.d - A.d : (lastDay(py, pm) - A.d + B.d < 0 ? 0 : Math.max(0, lastDay(py, pm) - A.d) + B.d); }
			if (unit === "YD") { var y2 = B.m > A.m || (B.m === A.m && B.d >= A.d) ? B.y : B.y - 1; return b - fromYMD(y2, A.m, Math.min(A.d, lastDay(y2, A.m))); }
			return NUM;
		});
		M.YEARFRAC = lift(function (a, b, basis) {
			a = num(a); b = num(b); basis = basis === undefined ? 0 : Math.floor(num(basis)); if (firstErr(a, b, basis)) return firstErr(a, b, basis);
			a = Math.floor(a); b = Math.floor(b); if (a > b) { var t = a; a = b; b = t; }
			if (basis === 0) return days360(a, b, false) / 360;
			if (basis === 2) return (b - a) / 360; if (basis === 3) return (b - a) / 365; if (basis === 4) return days360(a, b, true) / 360;
			if (basis === 1) {
				var A = ymd(a), B = ymd(b);
				if (A.y === B.y) return (b - a) / (isLeap(A.y) ? 366 : 365);
				var oneYear = B.y === A.y + 1 && (B.m < A.m || (B.m === A.m && B.d <= A.d));
				if (oneYear) { var leap = (isLeap(A.y) && (A.m < 3)) || (isLeap(B.y) && (B.m > 2 || (B.m === 2 && B.d === 29))); return (b - a) / (leap ? 366 : 365); }
				var total = 0; for (var y = A.y; y <= B.y; y++) total += isLeap(y) ? 366 : 365;
				return (b - a) / (total / (B.y - A.y + 1));
			}
			return NUM;
		});

		/* ---------- financial ---------- */
		function pmt(r, n, pv, fv, t) { if (r === 0) return -(pv + fv) / n; var q = Math.pow(1 + r, n); return -(r * (fv + pv * q)) / ((1 + r * t) * (q - 1)); }
		function fvf(r, n, p, pv, t) { if (r === 0) return -(pv + p * n); var q = Math.pow(1 + r, n); return -(pv * q + p * (1 + r * t) * (q - 1) / r); }
		function pvf(r, n, p, fv, t) { if (r === 0) return -(fv + p * n); var q = Math.pow(1 + r, n); return -(fv + p * (1 + r * t) * (q - 1) / r) / q; }
		function ipmt(r, per, n, pv, fv, t) { var p = pmt(r, n, pv, fv, t), i; if (per === 1) i = t === 1 ? 0 : -pv; else i = t === 1 ? fvf(r, per - 2, p, pv, 1) - p : fvf(r, per - 1, p, pv, 0); return i * r; }
		function fin(fn, req) { return lift(function () { var a = []; for (var i = 0; i < arguments.length; i++) { if (arguments[i] === undefined) { a.push(undefined); continue; } var v = num(arguments[i]); if (isErr(v)) return v; a.push(v); } if (a.length < req) return VAL; var r = fn.apply(null, a); return typeof r === "number" && !isFinite(r) ? NUM : r; }); }
		M.PMT = fin(function (r, n, pv, fv, t) { return n === 0 ? NUM : pmt(r, n, pv, fv || 0, t ? 1 : 0); }, 3);
		M.FV = fin(function (r, n, p, pv, t) { return fvf(r, n, p, pv || 0, t ? 1 : 0); }, 3);
		M.PV = fin(function (r, n, p, fv, t) { return pvf(r, n, p, fv || 0, t ? 1 : 0); }, 3);
		M.NPER = fin(function (r, p, pv, fv, t) { fv = fv || 0; t = t ? 1 : 0; if (r === 0) return p === 0 ? NUM : -(pv + fv) / p; var a = p * (1 + r * t) - fv * r, b = pv * r + p * (1 + r * t); if (a / b <= 0) return NUM; return Math.log(a / b) / Math.log(1 + r); }, 3);
		M.IPMT = fin(function (r, per, n, pv, fv, t) { t = t ? 1 : 0; if (per < 1 || per > n) return NUM; return ipmt(r, per, n, pv, fv || 0, t); }, 4);
		M.PPMT = fin(function (r, per, n, pv, fv, t) { t = t ? 1 : 0; fv = fv || 0; if (per < 1 || per > n) return NUM; return pmt(r, n, pv, fv, t) - ipmt(r, per, n, pv, fv, t); }, 4);
		M.RATE = fin(function (n, p, pv, fv, t, g) {
			fv = fv || 0; t = t ? 1 : 0; var r = g === undefined ? 0.1 : g;
			for (var i = 0; i < 100; i++) {
				var f = r === 0 ? pv + p * n + fv : pv * Math.pow(1 + r, n) + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r + fv;
				var h = 1e-7 * Math.max(1, Math.abs(r)), r2 = r + h, f2 = r2 === 0 ? pv + p * n + fv : pv * Math.pow(1 + r2, n) + p * (1 + r2 * t) * (Math.pow(1 + r2, n) - 1) / r2 + fv;
				var d = (f2 - f) / h; if (!d || !isFinite(d)) return NUM;
				var nr = r - f / d; if (!isFinite(nr)) return NUM;
				if (Math.abs(nr - r) < 1e-10) return nr;
				r = nr; if (r <= -1) r = -0.999999;
			}
			return NUM;
		}, 3);
		M.NPV = function (a) { var r = num(scalar(a[0])); if (isErr(r)) return r; var n = nums(a.slice(1)); if (isErr(n)) return n; var s = 0; n.forEach(function (v, i) { s += v / Math.pow(1 + r, i + 1); }); return s; };
		function irr(vals, guess) {
			var npv = function (r) { var s = 0; for (var i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + r, i); return s; };
			var dnpv = function (r) { var s = 0; for (var i = 1; i < vals.length; i++) s -= i * vals[i] / Math.pow(1 + r, i + 1); return s; };
			var r = guess;
			for (var k = 0; k < 100; k++) { var f = npv(r), d = dnpv(r); if (!d) break; var nr = r - f / d; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-12) return nr; r = nr <= -1 ? (r - 1) / 2 : nr; }
			var lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi); if (flo * fhi > 0) return NUM;
			for (var j = 0; j < 300; j++) { var mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-10) return mid; if (fm * flo < 0) { hi = mid; } else { lo = mid; flo = fm; } }
			return (lo + hi) / 2;
		}
		M.IRR = function (a) { var n = nums([a[0]]); if (isErr(n)) return n; var g = a[1] === undefined ? 0.1 : num(scalar(a[1])); if (!n.some(function (v) { return v > 0; }) || !n.some(function (v) { return v < 0; })) return NUM; return irr(n, g); };
		function xnpv(r, v, d) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i] / Math.pow(1 + r, (d[i] - d[0]) / 365); return s; }
		M.XNPV = function (a) { var r = num(scalar(a[0])), v = nums([a[1]]), d = nums([a[2]]); if (firstErr(r, v, d)) return firstErr(r, v, d); if (v.length !== d.length) return NUM; return xnpv(r, v, d.map(Math.floor)); };
		M.XIRR = function (a) {
			var v = nums([a[0]]), d = nums([a[1]]); if (firstErr(v, d)) return firstErr(v, d); if (v.length !== d.length) return NUM; d = d.map(Math.floor);
			var r = a[2] === undefined ? 0.1 : num(scalar(a[2]));
			for (var k = 0; k < 100; k++) { var f = xnpv(r, v, d), h = 1e-7, df = (xnpv(r + h, v, d) - f) / h; if (!df) break; var nr = r - f / df; if (Math.abs(nr - r) < 1e-12) return nr; r = nr <= -1 ? -0.99 : nr; }
			return NUM;
		};
		M.SLN = fin(function (c, s, l) { return l === 0 ? DIV : (c - s) / l; }, 3);
		M.SYD = fin(function (c, s, l, p) { return l === 0 ? DIV : (c - s) * (l - p + 1) * 2 / (l * (l + 1)); }, 4);
		M.DDB = fin(function (c, s, l, p, f) { f = f === undefined ? 2 : f; var v = c, d = 0; for (var i = 1; i <= p; i++) { d = Math.min(v * f / l, Math.max(0, v - s)); v -= d; } return d; }, 4);
		M.EFFECT = fin(function (r, n) { n = Math.floor(n); if (r <= 0 || n < 1) return NUM; return Math.pow(1 + r / n, n) - 1; }, 2);
		M.NOMINAL = fin(function (r, n) { n = Math.floor(n); if (r <= 0 || n < 1) return NUM; return n * (Math.pow(1 + r, 1 / n) - 1); }, 2);
		M.RRI = fin(function (n, pv, fv) { if (n <= 0) return NUM; return Math.pow(fv / pv, 1 / n) - 1; }, 3);
		M.CUMIPMT = fin(function (r, n, pv, s, e, t) { var x = 0; for (var p = Math.ceil(s); p <= Math.floor(e); p++) x += ipmt(r, p, n, pv, 0, t ? 1 : 0); return x; }, 6);
		M.CUMPRINC = fin(function (r, n, pv, s, e, t) { var x = 0, P = pmt(r, n, pv, 0, t ? 1 : 0); for (var p = Math.ceil(s); p <= Math.floor(e); p++) x += P - ipmt(r, p, n, pv, 0, t ? 1 : 0); return x; }, 6);

		/* ---------- lookup and reference ---------- */
		function lookCmp(a, b) { return compare(a, b); }
		function eqLook(needle, wildOk) {
			if (typeof needle === "string" && wildOk && /[*?~]/.test(needle)) { var re = wild(needle); return function (v) { return typeof v === "string" && re.test(v); }; }
			return function (v) { if (v == null) v = typeof needle === "string" ? null : v; return v != null && typeRank0(v) === typeRank0(needle) && lookCmp(v, needle) === 0; };
		}
		function typeRank0(x) { return typeof x === "number" ? 0 : typeof x === "string" ? 1 : typeof x === "boolean" ? 2 : 3; }
		function vector(x) { var a = arrOf(x); if (a.h === 1) return a.rows[0].slice(); if (a.w === 1) return a.rows.map(function (r) { return r[0]; }); return null; }
		// sorted (approximate) search like Excel: the last position whose value is <= needle (asc) / >= needle (desc), same type only
		function approx(vals, needle, desc) {
			var lo = 0, hi = vals.length - 1, best = -1, t = typeRank0(needle);
			while (lo <= hi) {
				var mid = (lo + hi) >> 1, v = vals[mid], m2 = mid;
				while (m2 >= lo && (v == null || typeRank0(v) !== t)) { m2--; v = vals[m2]; }
				if (m2 < lo) { lo = mid + 1; continue; }
				var c = lookCmp(v, needle);
				if (desc ? c >= 0 : c <= 0) { best = m2; lo = mid + 1; } else hi = m2 - 1;
			}
			return best;
		}
		function findIn(vals, needle, mode, search) {   // XLOOKUP / XMATCH: mode 0 exact, -1 exact or next smaller, 1 exact or next larger, 2 wildcard
			var n = vals.length, order = [];
			if (search === 2 || search === -2) {
				var asc = search === 2, lo = 0, hi = n - 1, hit = -1;
				while (lo <= hi) { var mid = (lo + hi) >> 1, c = lookCmp(vals[mid], needle); if (c === 0) { hit = mid; if (asc) hi = mid - 1; else lo = mid + 1; } else if (asc ? c < 0 : c > 0) lo = mid + 1; else hi = mid - 1; }
				if (hit >= 0 || mode === 0 || mode === 2) return hit;
				// next smaller / larger in a sorted list
				var cand = -1; for (var q = 0; q < n; q++) { var v = vals[q]; if (v == null || typeRank0(v) !== typeRank0(needle)) continue; var cc = lookCmp(v, needle); if ((mode === -1 && cc < 0 && (cand < 0 || lookCmp(v, vals[cand]) > 0)) || (mode === 1 && cc > 0 && (cand < 0 || lookCmp(v, vals[cand]) < 0))) cand = q; } return cand;
			}
			for (var i = 0; i < n; i++) order.push(search === -1 ? n - 1 - i : i);
			var eq = eqLook(needle, mode === 2), best = -1;
			for (var k = 0; k < n; k++) { var j = order[k], x = vals[j]; if (eq(x)) return j; if (mode === -1 || mode === 1) { if (x == null || typeRank0(x) !== typeRank0(needle)) continue; var c2 = lookCmp(x, needle); if ((mode === -1 && c2 < 0 && (best < 0 || lookCmp(x, vals[best]) > 0)) || (mode === 1 && c2 > 0 && (best < 0 || lookCmp(x, vals[best]) < 0))) best = j; } }
			return best;
		}
		function sliceOf(x, i, byRow) {   // row i (byRow) or column i of x, as a Range when x is one
			if (x instanceof Range) { var g = x.g, B = x.box(); return byRow ? new Range(x.sheet, { s: { r: g.s.r + i, c: g.s.c }, e: { r: g.s.r + i, c: B.c2 } }, x.ctx) : new Range(x.sheet, { s: { r: g.s.r, c: g.s.c + i }, e: { r: B.r2, c: g.s.c + i } }, x.ctx); }
			var a = arrOf(x); return byRow ? new Arr([a.rows[i]]) : new Arr(a.rows.map(function (r) { return [r[i]]; }));
		}
		function cellOf(x, i, j) { if (x instanceof Range) return new Range(x.sheet, { s: { r: x.g.s.r + i, c: x.g.s.c + j }, e: { r: x.g.s.r + i, c: x.g.s.c + j } }, x.ctx); var a = arrOf(x); return i < a.h && j < a.w ? a.rows[i][j] : REF; }
		function lookupRV(horiz) {
			return lift(function (needle, table, idx, rl) {
				if (isErr(needle)) return needle;
				idx = num(idx); if (isErr(idx)) return idx;
				var exact = rl !== undefined && rl !== null && !(bool(rl) === true), t = arrOf(table);
				if (idx < 1) return VAL;
				var keys = horiz ? t.rows[0] : t.rows.map(function (r) { return r[0]; }), lim = horiz ? t.h : t.w;
				if (Math.floor(idx) > lim) return REF;
				var pos = exact ? findIn(keys, needle, 2, 1) : approx(keys, needle, false);
				if (pos < 0) return NA;
				var v = horiz ? t.rows[Math.floor(idx) - 1][pos] : t.rows[pos][Math.floor(idx) - 1];
				return v == null ? 0 : v;
			}, 1);
		}
		M.VLOOKUP = lookupRV(false); M.HLOOKUP = lookupRV(true);
		M.LOOKUP = function (a) {
			var needle = scalar(a[0]); if (isErr(needle)) return needle;
			var lv = vector(a[0 + 1]), rv = a[2] !== undefined ? vector(a[2]) : null;
			if (!lv) { var t = arrOf(a[1]); var horiz = t.w > t.h; lv = horiz ? t.rows[0] : t.rows.map(function (r) { return r[0]; }); rv = horiz ? t.rows[t.h - 1] : t.rows.map(function (r) { return r[t.w - 1]; }); }
			var pos = approx(lv, needle, false); if (pos < 0) return NA;
			var out = (rv || lv)[pos]; return out == null ? 0 : out;
		};
		M.MATCH = lift(function (needle, arr, type) {
			if (isErr(needle)) return needle;
			var t = type === undefined ? 1 : num(type), v = vector(arr); if (!v) return NA; if (isErr(t)) return t;
			var pos = t === 0 ? findIn(v, needle, 2, 1) : approx(v, needle, t < 0);
			return pos < 0 ? NA : pos + 1;
		}, 1);
		M.XMATCH = lift(function (needle, arr, mode, search) {
			if (isErr(needle)) return needle;
			var v = vector(arr); if (!v) return VAL;
			var m = mode === undefined ? 0 : num(mode), s = search === undefined ? 1 : num(search);
			var pos = findIn(v, needle, m, s); return pos < 0 ? NA : pos + 1;
		}, 1);
		M.XLOOKUP = function (a) {
			var la = a[1], ra = a[2], nf = a[3], mode = a[4] === undefined ? 0 : num(scalar(a[4])), search = a[5] === undefined ? 1 : num(scalar(a[5]));
			var D = dimsOf(la), byRow = D.h === 1 && D.w > 1, keys = vector(la); if (!keys) return VAL;
			var one = function (needle) {
				if (isErr(needle)) return needle;
				var pos = findIn(keys, needle, mode, search);
				if (pos < 0) return nf === undefined ? NA : scalar(nf);
				var R = dimsOf(ra);
				if (byRow ? R.w !== keys.length : R.h !== keys.length) return VAL;
				return byRow ? sliceOf(ra, pos, false) : sliceOf(ra, pos, true);
			};
			if (isMulti(a[0])) return mapArr(toArr(a[0]), function (v) { var r = one(v); return r instanceof Range || r instanceof Arr ? scalar(r) : r; });
			var r = one(scalar(a[0]));
			if (r instanceof Range && r.isCell()) return r;
			return r;
		};
		M.INDEX = function (a) {
			var x = a[0], D = dimsOf(x), r = a[1] === undefined ? 0 : num(scalar(a[1])), c = a[2] === undefined ? (D.h === 1 && a[1] !== undefined ? null : 0) : num(scalar(a[2]));
			if (firstErr(r, c)) return firstErr(r, c);
			if (c === null) { c = r; r = 1; }
			if (D.w === 1 && a[2] === undefined) c = 1;
			r = Math.floor(r); c = Math.floor(c);
			if (r < 0 || c < 0) return VAL;
			if (x instanceof Range) { if (r > x.g.e.r - x.g.s.r + 1 || c > x.g.e.c - x.g.s.c + 1) return REF; }
			else if (r > D.h || c > D.w) return REF;
			if (r === 0 && c === 0) return x;
			if (r === 0) return sliceOf(x, c - 1, false);
			if (c === 0) return sliceOf(x, r - 1, true);
			return cellOf(x, r - 1, c - 1);
		};
		M.ROW = function (a, ctx) { var x = a[0]; if (x === undefined) return ctx.cur ? ctx.cur.r + 1 : VAL; if (!(x instanceof Range)) return VAL; if (x.g.s.r === x.g.e.r || !ctx.dyn) return x.g.s.r + 1; var rows = []; for (var r = x.g.s.r; r <= x.g.e.r; r++) rows.push([r + 1]); return new Arr(rows); };
		M.COLUMN = function (a, ctx) { var x = a[0]; if (x === undefined) return ctx.cur ? ctx.cur.c + 1 : VAL; if (!(x instanceof Range)) return VAL; if (x.g.s.c === x.g.e.c || !ctx.dyn) return x.g.s.c + 1; var row = []; for (var c = x.g.s.c; c <= x.g.e.c; c++) row.push(c + 1); return new Arr([row]); };
		M.ROWS = function (a) { var x = a[0]; if (x instanceof Range) return x.g.e.r - x.g.s.r + 1; if (x instanceof Arr) return x.h; return isErr(x) ? x : 1; };
		M.COLUMNS = function (a) { var x = a[0]; if (x instanceof Range) return x.g.e.c - x.g.s.c + 1; if (x instanceof Arr) return x.w; return isErr(x) ? x : 1; };
		M.OFFSET = function (a) {
			var x = a[0]; if (!(x instanceof Range)) return VAL;
			var dr = num(scalar(a[1])), dc = num(scalar(a[2])), h = a[3] === undefined ? x.g.e.r - x.g.s.r + 1 : num(scalar(a[3])), w = a[4] === undefined ? x.g.e.c - x.g.s.c + 1 : num(scalar(a[4]));
			if (firstErr(dr, dc, h, w)) return firstErr(dr, dc, h, w);
			h = Math.floor(h); w = Math.floor(w); if (h === 0 || w === 0) return REF;
			var r1 = x.g.s.r + Math.floor(dr), c1 = x.g.s.c + Math.floor(dc), r2 = r1 + h - (h > 0 ? 1 : -1), c2 = c1 + w - (w > 0 ? 1 : -1);
			var g = { s: { r: Math.min(r1, r2), c: Math.min(c1, c2) }, e: { r: Math.max(r1, r2), c: Math.max(c1, c2) } };
			if (g.s.r < 0 || g.s.c < 0 || g.e.r >= X.MAXR || g.e.c >= X.MAXC) return REF;
			return new Range(x.sheet, g, x.ctx);
		};
		M.INDIRECT = function (a, ctx) {
			var t = txt(scalar(a[0])); if (isErr(t)) return t;
			var a1 = a[1] === undefined || bool(scalar(a[1])) === true;
			t = t.trim();
			var sheet = ctx.sheet, m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
			if (m) { sheet = m[1] != null ? m[1].replace(/''/g, "'") : m[2]; t = m[3]; }
			if (ctx.hasSheet && !ctx.hasSheet(sheet)) return REF;
			var g = null;
			if (a1) g = X.parseRange(t.replace(/\$/g, ""));
			else { var rc = /^R(\d+)C(\d+)(?::R(\d+)C(\d+))?$/i.exec(t); if (rc) g = { s: { r: +rc[1] - 1, c: +rc[2] - 1 }, e: { r: +(rc[3] || rc[1]) - 1, c: +(rc[4] || rc[2]) - 1 } }; }
			if (!g && a1 && ctx.name) { var nv = ctx.name(t, ctx); if (nv instanceof Range) return nv; }
			if (!g && a1 && ctx.sref) { var mm = /^([A-Za-z_][\w.]*)\[(.*)\]$/.exec(t); if (mm) { var sr = ctx.sref(mm[1], mm[2], ctx); if (sr) return new Range(sr.sheet, sr.g, ctx); } }
			return g ? new Range(sheet, g, ctx) : REF;
		};
		M.ADDRESS = lift(function (r, c, abs, a1, sh) {
			r = num(r); c = num(c); abs = abs === undefined ? 1 : num(abs); if (firstErr(r, c, abs)) return firstErr(r, c, abs);
			r = Math.floor(r); c = Math.floor(c); if (r < 1 || c < 1) return VAL;
			var style = a1 === undefined || bool(a1) === true, out;
			if (style) out = (abs === 1 || abs === 3 ? "$" : "") + X.colName(c - 1) + (abs === 1 || abs === 2 ? "$" : "") + r;
			else out = "R" + (abs === 1 || abs === 2 ? r : "[" + r + "]") + "C" + (abs === 1 || abs === 3 ? c : "[" + c + "]");
			if (sh !== undefined && sh !== null) { var s = txt(sh); out = (/^[A-Za-z_][\w.]*$/.test(s) ? s : "'" + s.replace(/'/g, "''") + "'") + "!" + out; }
			return out;
		});
		M.TRANSPOSE = function (a) { var x = arrOf(a[0]), rows = []; for (var j = 0; j < x.w; j++) { var row = []; for (var i = 0; i < x.h; i++) row.push(x.rows[i][j]); rows.push(row); } return new Arr(rows); };
		M.SINGLE = function (a, ctx) { var x = a[0]; return x instanceof Range && !x.isCell() ? scalar(x) : x instanceof Arr ? scalar(x) : x; };
		M.ANCHORARRAY = function (a, ctx) { var x = a[0]; if (!(x instanceof Range)) return REF; var g = ctx.spillRange ? ctx.spillRange(x.sheet, x.g.s.r, x.g.s.c) : null; return g ? new Range(x.sheet, g, x.ctx) : REF; };

		/* ---------- dynamic arrays ---------- */
		function rowsOf(a, byCol) { return byCol ? a.rows[0].map(function (_, j) { return a.rows.map(function (r) { return r[j]; }); }) : a.rows.map(function (r) { return r.slice(); }); }
		function fromRows(list, byCol) { if (!byCol) return new Arr(list); var rows = []; for (var i = 0; i < (list[0] || []).length; i++) rows.push(list.map(function (c) { return c[i]; })); return new Arr(rows); }
		function keyOf(r) { return r.map(function (v) { return v == null ? "\u0000" : isErr(v) ? "#" + v.code : typeof v === "string" ? "s" + v.toLowerCase() : typeof v + String(v); }).join("\u0001"); }
		M.UNIQUE = function (a) {
			var x = arrOf(a[0]), byCol = a[1] !== undefined && bool(scalar(a[1])) === true, once = a[2] !== undefined && bool(scalar(a[2])) === true;
			var list = rowsOf(x, byCol), cnt = {}, first = [];
			list.forEach(function (r) { var k = keyOf(r); if (!(k in cnt)) { cnt[k] = 0; first.push(r); } cnt[k]++; });
			var out = first.filter(function (r) { return !once || cnt[keyOf(r)] === 1; });
			return out.length ? fromRows(out, byCol) : E["#CALC!"];
		};
		function sortCmp(a, b) { var ea = a == null, eb = b == null; if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; if (isErr(a) || isErr(b)) return isErr(a) === isErr(b) ? 0 : isErr(a) ? 1 : -1; return compare(a, b); }
		M.SORT = function (a) {
			var x = arrOf(a[0]), idx = a[1] === undefined ? [1] : flat([a[1]]).map(function (v) { return num(v); }), ord = a[2] === undefined ? [1] : flat([a[2]]).map(function (v) { return num(v); }), byCol = a[3] !== undefined && bool(scalar(a[3])) === true;
			var list = rowsOf(x, byCol), w = list[0] ? list[0].length : 0;
			for (var i = 0; i < idx.length; i++) if (isErr(idx[i]) || idx[i] < 1 || idx[i] > w) return VAL;
			var keyed = list.map(function (r, i) { return { r: r, i: i }; });
			keyed.sort(function (p, q) { for (var k = 0; k < idx.length; k++) { var o = ord[k] != null ? ord[k] : ord[0], c = sortCmp(p.r[idx[k] - 1], q.r[idx[k] - 1]); if (c) return o < 0 ? -c : c; } return p.i - q.i; });
			return fromRows(keyed.map(function (k) { return k.r; }), byCol);
		};
		M.SORTBY = function (a) {
			var x = arrOf(a[0]), list = x.rows.map(function (r, i) { return { r: r, i: i }; }), keys = [];
			for (var i = 1; i < a.length; i += 2) { var by = arrOf(a[i]), o = a[i + 1] === undefined ? 1 : num(scalar(a[i + 1])); if (by.h !== x.h && by.w === x.h && by.h === 1) by = new Arr(by.rows[0].map(function (v) { return [v]; })); if (by.h !== x.h) return VAL; keys.push({ v: by.rows.map(function (r) { return r[0]; }), o: o }); }
			list.sort(function (p, q) { for (var k = 0; k < keys.length; k++) { var c = sortCmp(keys[k].v[p.i], keys[k].v[q.i]); if (c) return keys[k].o < 0 ? -c : c; } return p.i - q.i; });
			return new Arr(list.map(function (p) { return p.r; }));
		};
		M.FILTER = function (a) {
			var x = arrOf(a[0]), inc = arrOf(a[1]), out;
			if (inc.w === 1 && inc.h === x.h) { out = []; for (var i = 0; i < x.h; i++) { var v = inc.rows[i][0]; if (isErr(v)) return v; if (bool(v) === true) out.push(x.rows[i]); } if (!out.length) return a[2] === undefined ? E["#CALC!"] : a[2]; return new Arr(out); }
			if (inc.h === 1 && inc.w === x.w) { var keep = []; for (var j = 0; j < x.w; j++) { var v2 = inc.rows[0][j]; if (isErr(v2)) return v2; if (bool(v2) === true) keep.push(j); } if (!keep.length) return a[2] === undefined ? E["#CALC!"] : a[2]; return new Arr(x.rows.map(function (r) { return keep.map(function (j2) { return r[j2]; }); })); }
			return VAL;
		};
		M.SEQUENCE = function (a) {
			var r = num(scalar(a[0])), c = a[1] === undefined ? 1 : num(scalar(a[1])), s = a[2] === undefined ? 1 : num(scalar(a[2])), st = a[3] === undefined ? 1 : num(scalar(a[3]));
			if (firstErr(r, c, s, st)) return firstErr(r, c, s, st);
			r = Math.floor(r); c = Math.floor(c); if (r < 1 || c < 1) return E["#CALC!"]; if (r * c > 1e6) return NUM;
			var rows = []; for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(s + (i * c + j) * st); rows.push(row); }
			return new Arr(rows);
		};
		M.RANDARRAY = function (a) {
			var r = a[0] === undefined ? 1 : num(scalar(a[0])), c = a[1] === undefined ? 1 : num(scalar(a[1])), lo = a[2] === undefined ? 0 : num(scalar(a[2])), hi = a[3] === undefined ? 1 : num(scalar(a[3])), whole = a[4] !== undefined && bool(scalar(a[4])) === true;
			if (firstErr(r, c, lo, hi)) return firstErr(r, c, lo, hi); if (hi < lo) return VAL; if (r * c > 1e6) return NUM;
			var rows = []; for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(whole ? Math.ceil(lo) + Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + Math.random() * (hi - lo)); rows.push(row); }
			return new Arr(rows);
		};
		function stack(a, horiz) {
			var parts = a.filter(function (x) { return x !== undefined; }).map(arrOf), rows = [];
			if (horiz) { var h = Math.max.apply(null, parts.map(function (p) { return p.h; })); for (var i = 0; i < h; i++) { var row = []; parts.forEach(function (p) { for (var j = 0; j < p.w; j++) row.push(i < p.h ? p.rows[i][j] : NA); }); rows.push(row); } }
			else { var w = Math.max.apply(null, parts.map(function (p) { return p.w; })); parts.forEach(function (p) { p.rows.forEach(function (r) { var row = r.slice(); while (row.length < w) row.push(NA); rows.push(row); }); }); }
			return new Arr(rows);
		}
		M.HSTACK = function (a) { return stack(a, true); }; M.VSTACK = function (a) { return stack(a, false); };
		function takeDrop(drop) {
			return function (a) {
				var x = arrOf(a[0]), r = a[1] === undefined ? null : num(scalar(a[1])), c = a[2] === undefined ? null : num(scalar(a[2])); if (firstErr(r, c)) return firstErr(r, c);
				var rs = 0, re = x.h, cs = 0, ce = x.w;
				if (r != null) { r = Math.trunc(r); if (drop) { if (r >= 0) rs = Math.min(x.h, r); else re = Math.max(0, x.h + r); } else { if (r >= 0) re = Math.min(x.h, r); else rs = Math.max(0, x.h + r); } }
				if (c != null) { c = Math.trunc(c); if (drop) { if (c >= 0) cs = Math.min(x.w, c); else ce = Math.max(0, x.w + c); } else { if (c >= 0) ce = Math.min(x.w, c); else cs = Math.max(0, x.w + c); } }
				if (re <= rs || ce <= cs) return E["#CALC!"];
				return new Arr(x.rows.slice(rs, re).map(function (row) { return row.slice(cs, ce); }));
			};
		}
		M.TAKE = takeDrop(false); M.DROP = takeDrop(true);
		function choose(cols) {
			return function (a) {
				var x = arrOf(a[0]), n = cols ? x.w : x.h, idx = flat(a.slice(1)).map(function (v) { return num(v); }), out = [];
				for (var i = 0; i < idx.length; i++) { if (isErr(idx[i])) return idx[i]; var k = Math.trunc(idx[i]); if (k < 0) k = n + k + 1; if (k < 1 || k > n) return VAL; out.push(k - 1); }
				return cols ? new Arr(x.rows.map(function (r) { return out.map(function (k) { return r[k]; }); })) : new Arr(out.map(function (k) { return x.rows[k].slice(); }));
			};
		}
		M.CHOOSECOLS = choose(true); M.CHOOSEROWS = choose(false);
		M.TOCOL = function (a) { var x = arrOf(a[0]), out = []; x.each(function (v) { out.push([v]); }); return new Arr(out); };
		M.TOROW = function (a) { var x = arrOf(a[0]), out = []; x.each(function (v) { out.push(v); }); return new Arr([out]); };

		Object.keys(M).forEach(function (k) { FN[k] = M[k]; });

		/* ---------- functions whose arguments are worked out only when needed ---------- */
		var LZ = {
			IF: function (args, ev, ctx, env) {
				if (!args.length) return VAL;
				var c0 = ev(args[0]);
				if (isMulti(c0)) {
					var thenV = args.length > 1 && args[1].k !== "missing" ? ev(args[1]) : (args.length > 1 ? 0 : true), elseV = args.length > 2 ? (args[2].k === "missing" ? 0 : ev(args[2])) : false;
					return broadcast([c0, thenV, elseV], function (c, t, e) { var b = bool(c); return isErr(b) ? b : b ? t : e; });
				}
				var c = bool(scalar(c0));
				if (isErr(c)) return c;
				if (c) return args.length > 1 && args[1].k !== "missing" ? ev(args[1]) : (args.length > 1 ? 0 : true);
				return args.length > 2 ? (args[2].k === "missing" ? 0 : ev(args[2])) : false;
			},
			IFS: function (args, ev) {
				for (var i = 0; i + 1 < args.length; i += 2) { var c = bool(scalar(ev(args[i]))); if (isErr(c)) return c; if (c) return ev(args[i + 1]); }
				return NA;
			},
			IFERROR: function (args, ev) { var v0 = ev(args[0]); if (isMulti(v0)) { var alt = args.length > 1 ? ev(args[1]) : 0; return broadcast([v0, alt], function (v, a) { return isErr(v) ? a : v; }); } var v = scalar(v0); return isErr(v) ? (args.length > 1 ? ev(args[1]) : 0) : v0; },
			IFNA: function (args, ev) { var v0 = ev(args[0]); if (isMulti(v0)) { var alt = ev(args[1]); return broadcast([v0, alt], function (v, a) { return isErr(v) && v.code === "#N/A" ? a : v; }); } var v = scalar(v0); return isErr(v) && v.code === "#N/A" ? ev(args[1]) : v0; },
			SWITCH: function (args, ev) {
				var x = scalar(ev(args[0])); if (isErr(x)) return x;
				var i = 1; for (; i + 1 < args.length; i += 2) { var v = scalar(ev(args[i])); if (!isErr(v) && compare(x, v) === 0 && typeRank0(x == null ? 0 : x) === typeRank0(v == null ? 0 : v)) return ev(args[i + 1]); }
				return i < args.length ? ev(args[i]) : NA;
			},
			CHOOSE: function (args, ev) {
				var i0 = ev(args[0]);
				if (isMulti(i0)) { var opts = args.slice(1).map(function (a) { return ev(a); }); return mapArr(toArr(i0), function (v) { var k = num(v); if (isErr(k)) return k; k = Math.floor(k); return k < 1 || k > opts.length ? VAL : scalar(opts[k - 1]); }); }
				var i = num(scalar(i0)); if (isErr(i)) return i; i = Math.floor(i);
				if (i < 1 || i >= args.length) return VAL;
				return ev(args[i]);
			},
			LET: function (args, ev, ctx, env) {
				if (args.length < 3 || args.length % 2 === 0) return VAL;
				var e = new X.Env(env);
				for (var i = 0; i + 1 < args.length; i += 2) { if (args[i].k !== "name") return VAL; e.v[args[i].v.toUpperCase()] = ev(args[i + 1], e); }
				return ev(args[args.length - 1], e);
			}
		};
		Object.keys(LZ).forEach(function (k) { LAZY[k] = LZ[k]; });
		X.refreshFunctions();
		X.lift = lift;
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXL) install(root.MESXL);
})(typeof window !== "undefined" ? window : this);

/* MES Spreadsheet Viewer & Editor (mes.fm/excel): pure editing helpers, installed into MESXL (node tests: tool_apps_src/excel-tests.js).
   - shiftFormula: copy / paste / fill a formula by (dr, dc): relative references move, $ parts stay, references pushed off the
     sheet become #REF! (like Excel)
   - moveRefs: after cutting and pasting a block, references to cells inside it follow it
   - formula entry: refSpans (references with their position, for the coloured outlines), canPoint (is the caret where a click inserts
     a reference?), cycleAbs / f4At (F4: A1 -> $A$1 -> A$1 -> $A1), refText (a range as text, with the sheet when needed)
   - fillSeries: what the fill handle writes (1, 2, 3 / dates / "Item 1", "Item 2" / Mon, Tue / Jan, Feb / copies)
   - clipboard: htmlTable (an Excel / Google Sheets compatible HTML table) and parseHtmlTable (cells from a pasted HTML table)
   - futureFns / toFile / fromFile: _xlfn. prefixes for the newer functions when a formula is written to .xlsx */
(function (root) {
	"use strict";
	function install(X) {
		var MAXR = X.MAXR, MAXC = X.MAXC, colName = X.colName, colIndex = X.colIndex;

		/* ---------- reference text <-> parts ---------- */
		// one side of a reference: {c, r, ac, ar} (c or r null for whole rows / columns)
		function partsOf(t) {
			var m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(t);
			if (!m || (!m[2] && !m[4])) return null;
			return { c: m[2] ? colIndex(m[2]) : null, ac: !!m[1] && !!m[2], r: m[4] ? +m[4] - 1 : null, ar: m[2] ? !!m[3] && !!m[4] : !!m[1] && !!m[4] };
		}
		function partText(p) { return (p.c != null ? (p.ac ? "$" : "") + colName(p.c) : "") + (p.r != null ? (p.ar ? "$" : "") + (p.r + 1) : ""); }
		function sheetPrefix(name) { if (name == null) return ""; return (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !X.parseA1(name) && !/^(TRUE|FALSE|R\d*C\d*)$/i.test(name) ? name : "'" + String(name).replace(/'/g, "''") + "'") + "!"; }
		// a range as typed in a formula: refText({s, e}, sheet?) -> "A5" / "A5:C9" / "Sheet2!B3"
		function refText(g, sheet) {
			var body;
			if (g.s.r === 0 && g.e.r === MAXR - 1) body = colName(g.s.c) + ":" + colName(g.e.c);
			else if (g.s.c === 0 && g.e.c === MAXC - 1) body = (g.s.r + 1) + ":" + (g.e.r + 1);
			else { var a = colName(g.s.c) + (g.s.r + 1), b = colName(g.e.c) + (g.e.r + 1); body = a === b ? a : a + ":" + b; }
			return sheetPrefix(sheet) + body;
		}

		/* ---------- copy / fill: shift relative references ---------- */
		function shiftPart(p, dr, dc) {
			var q = { c: p.c, r: p.r, ac: p.ac, ar: p.ar };
			if (q.c != null && !q.ac) q.c += dc;
			if (q.r != null && !q.ar) q.r += dr;
			if ((q.c != null && (q.c < 0 || q.c >= MAXC)) || (q.r != null && (q.r < 0 || q.r >= MAXR))) return null;
			return q;
		}
		function shiftFormula(f, dr, dc) {
			if (!dr && !dc) return f;
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			return toks.map(function (t) {
				if (t.type !== "ref") return t.raw;
				var text = t.v.text, prefix = t.raw.slice(0, t.raw.length - text.length), hash = /#$/.test(text) ? "#" : "";
				if (hash) text = text.slice(0, -1);
				var sides = text.split(":"), out = [];
				for (var i = 0; i < sides.length; i++) { var p = partsOf(sides[i]); if (!p) return t.raw; var q = shiftPart(p, dr, dc); if (!q) return prefix + "#REF!"; out.push(partText(q)); }
				return prefix + out.join(":") + hash;
			}).join("");
		}
		// cut + paste: every reference to a range entirely inside `from` (sheet name + {s, e}) moves by (dr, dc) to `toSheet`
		// (absolute or not). here = the sheet of the formula being rewritten.
		function moveRefs(f, from, dr, dc, here, toSheet) {
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			var changed = false;
			var out = toks.map(function (t) {
				if (t.type !== "ref") return t.raw;
				var sheet = t.v.sheet == null ? here : t.v.sheet;
				if (String(sheet).toLowerCase() !== String(from.sheet).toLowerCase()) return t.raw;
				var text = t.v.text, hash = /#$/.test(text) ? "#" : ""; if (hash) text = text.slice(0, -1);
				var sides = text.split(":").map(partsOf); if (sides.some(function (p) { return !p || p.r == null || p.c == null; })) return t.raw;
				var r1 = Math.min.apply(null, sides.map(function (p) { return p.r; })), r2 = Math.max.apply(null, sides.map(function (p) { return p.r; }));
				var c1 = Math.min.apply(null, sides.map(function (p) { return p.c; })), c2 = Math.max.apply(null, sides.map(function (p) { return p.c; }));
				if (r1 < from.g.s.r || r2 > from.g.e.r || c1 < from.g.s.c || c2 > from.g.e.c) return t.raw;
				var moved = sides.map(function (p) { return partText({ c: p.c + dc, r: p.r + dr, ac: p.ac, ar: p.ar }); });
				changed = true;
				var ts = toSheet == null ? sheet : toSheet, pre = t.v.sheet != null || ts !== here ? sheetPrefix(ts) : "";
				return pre + moved.join(":") + hash;
			});
			return changed ? out.join("") : f;
		}

		/* ---------- formula entry ---------- */
		var PALETTE = ["#1f6feb", "#d1242f", "#7b3fe4", "#1a7f37", "#bf5af2", "#c4570f", "#0a8fa0", "#b0186d"];
		// the references in a formula ("=..." with the "=") with their character positions and a colour each (same text = same colour)
		function refSpans(text) {
			var s = String(text || ""); if (s[0] !== "=") return [];
			var toks; try { toks = X.tokenize(s.slice(1)); } catch (e) { toks = tolerant(s.slice(1)); }
			var out = [], colors = {}, n = 0;
			toks.forEach(function (t) {
				if (t.type !== "ref") return;
				var text2 = t.v.text.replace(/#$/, ""), g = X.parseRange(text2.replace(/\$/g, ""));
				if (!g) { var m = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(text2), m2 = /^\$?(\d+):\$?(\d+)$/.exec(text2); if (m) g = { s: { r: 0, c: Math.min(colIndex(m[1]), colIndex(m[2])) }, e: { r: MAXR - 1, c: Math.max(colIndex(m[1]), colIndex(m[2])) } }; else if (m2) g = { s: { r: +m2[1] - 1, c: 0 }, e: { r: +m2[2] - 1, c: MAXC - 1 } }; }
				if (!g) return;
				var key = (t.v.sheet || "").toLowerCase() + "!" + X.rangeA1(g);
				if (!(key in colors)) colors[key] = PALETTE[n++ % PALETTE.length];
				out.push({ start: t.pos + 1, end: t.pos + 1 + t.raw.length, text: t.raw, sheet: t.v.sheet, g: g, color: colors[key] });
			});
			return out;
		}
		// tokenize as far as the formula can be read (while typing, "=SUM(A1:B2" is not finished)
		function tolerant(s) {
			for (var cut = s.length; cut > 0; cut--) { try { return X.tokenize(s.slice(0, cut)); } catch (e) { /* shorter */ } }
			return [];
		}
		// is the caret at a place where clicking a cell should insert its reference? (after =, an operator, "(", "," ...)
		function canPoint(text, caret) {
			var s = String(text || ""); if (s[0] !== "=") return false;
			if (caret == null) caret = s.length;
			var before = s.slice(0, caret).replace(/\s+$/, ""), after = s.slice(caret);
			if (/^[A-Za-z0-9_$("']/.test(after)) return false;
			var q = (before.match(/"/g) || []).length; if (q % 2) return false;
			var last = before[before.length - 1];
			return before.length === 1 || /[=+\-*\/^&(,;<>:%{]/.test(last);
		}
		// F4: A1 -> $A$1 -> A$1 -> $A1 -> A1 (a range changes both ends together)
		function cycleAbs(ref) {
			var m = /^((?:'(?:[^']|'')+'|[^'!]+)!)?(.+)$/.exec(ref), pre = m[1] || "", body = m[2], hash = /#$/.test(body) ? "#" : "";
			if (hash) body = body.slice(0, -1);
			var sides = body.split(":").map(partsOf); if (sides.some(function (p) { return !p; })) return ref;
			var p0 = sides[0], state = p0.c != null && p0.r != null ? (p0.ac && p0.ar ? 1 : p0.ar ? 2 : p0.ac ? 3 : 0) : ((p0.c != null ? p0.ac : p0.ar) ? 1 : 0);
			var next = p0.c != null && p0.r != null ? (state + 1) % 4 : (state + 1) % 2;
			sides.forEach(function (p) {
				if (p.c != null && p.r != null) { p.ac = next === 1 || next === 3; p.ar = next === 1 || next === 2; }
				else if (p.c != null) p.ac = next === 1; else p.ar = next === 1;
			});
			return pre + sides.map(partText).join(":") + hash;
		}
		// F4 in a formula being typed: the reference at / just before the caret -> {text, caret} (null when there is none)
		function f4At(text, caret, selEnd) {
			var spans = refSpans(text), hit = null;
			for (var i = 0; i < spans.length; i++) { var sp = spans[i]; if (caret >= sp.start && caret <= sp.end) { hit = sp; break; } if (selEnd != null && sp.start >= caret && sp.end <= selEnd) { hit = sp; break; } }
			if (!hit) return null;
			var nt = cycleAbs(hit.text);
			return { text: text.slice(0, hit.start) + nt + text.slice(hit.end), caret: hit.start + nt.length, start: hit.start, end: hit.start + nt.length };
		}

		/* ---------- fill handle ---------- */
		var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		function listMatch(s) {
			var t = String(s), low = t.toLowerCase(), lists = [DAYS, MONTHS];
			for (var l = 0; l < lists.length; l++) for (var i = 0; i < lists[l].length; i++) {
				var full = lists[l][i], short = full.slice(0, 3);
				if (low === full.toLowerCase()) return { list: lists[l], i: i, form: "full", cap: caseOf(t) };
				if (low === short.toLowerCase()) return { list: lists[l], i: i, form: "short", cap: caseOf(t) };
			}
			var q = /^(Q|Qtr|Quarter )([1-4])$/i.exec(t);
			if (q) return { quarter: q[1], i: +q[2] - 1 };
			return null;
		}
		function caseOf(t) { return t === t.toUpperCase() ? "up" : t === t.toLowerCase() ? "low" : "title"; }
		function applyCase(s, c) { return c === "up" ? s.toUpperCase() : c === "low" ? s.toLowerCase() : s; }
		// src: [{v (number | string | boolean | null), date: bool}] in fill order; n: how many to make.
		// opts.copy: copy instead of making a series (Ctrl while dragging, like Excel). Returns [{v, date}]
		function fillSeries(src, n, opts) {
			opts = opts || {};
			var out = [];
			if (!src.length) return out;
			if (opts.copy) { for (var k = 0; k < n; k++) out.push(src[k % src.length]); return out; }
			var allNum = src.every(function (x) { return typeof x.v === "number"; });
			if (allNum) {
				var isDate = src[0].date, step;
				if (src.length === 1) step = isDate ? 1 : 0;
				else if (isDate && src.length >= 2 && monthStep(src)) return monthSeries(src, n);
				else {   // least-squares line like Excel's linear trend (exact for an even step)
					var m = src.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
					src.forEach(function (p, i) { sx += i; sy += p.v; sxx += i * i; sxy += i * p.v; });
					step = (m * sxy - sx * sy) / (m * sxx - sx * sx);
					var b = (sy - step * sx) / m;
					for (var j = 0; j < n; j++) out.push({ v: clean(b + step * (m + j)), date: isDate });
					return out;
				}
				for (var j2 = 0; j2 < n; j2++) out.push({ v: clean(src[src.length - 1].v + step * (j2 + 1)), date: isDate });
				return out;
			}
			// text with a number at the end ("Item 1", "Week 2"), or day / month names; otherwise the cells repeat
			var lm = src.map(function (x) { return typeof x.v === "string" ? listMatch(x.v) : null; });
			if (lm.every(Boolean)) {
				var last = lm[lm.length - 1], st = src.length > 1 ? ((lm[lm.length - 1].i - lm[lm.length - 2].i) || 1) : 1;
				for (var a = 0; a < n; a++) {
					if (last.quarter) { var qi = ((last.i + st * (a + 1)) % 4 + 4) % 4; out.push({ v: last.quarter + (qi + 1) }); continue; }
					var len = last.list.length, idx = ((last.i + st * (a + 1)) % len + len) % len, word = last.list[idx];
					out.push({ v: applyCase(last.form === "short" ? word.slice(0, 3) : word, last.cap) });
				}
				return out;
			}
			var tn = src.map(function (x) { return typeof x.v === "string" ? /^(.*?)(\d+)(\D*)$/.exec(x.v) : null; });
			if (tn.every(Boolean) && tn.every(function (m) { return m[1] === tn[0][1] && m[3] === tn[0][3]; })) {
				var lastN = +tn[tn.length - 1][2], width = tn[tn.length - 1][2].length, st2 = src.length > 1 ? (lastN - +tn[tn.length - 2][2]) || 1 : 1;
				for (var b2 = 0; b2 < n; b2++) { var v = Math.abs(lastN + st2 * (b2 + 1)), s = String(v); if (/^0/.test(tn[0][2]) && s.length < width) s = new Array(width - s.length + 1).join("0") + s; out.push({ v: tn[0][1] + s + tn[0][3] }); }
				return out;
			}
			for (var c = 0; c < n; c++) out.push(src[c % src.length]);
			return out;
		}
		function clean(v) { return +v.toPrecision(15); }
		function monthStep(src) {   // dates on the same day of the month, a whole number of months apart
			if (!X.ymd) return false;
			var d = src.map(function (x) { return X.ymd(Math.floor(x.v)); });
			if (d.some(function (x) { return x.d !== d[0].d; }) || d[0].d === 1 && false) return false;
			var steps = []; for (var i = 1; i < d.length; i++) steps.push((d[i].y - d[i - 1].y) * 12 + d[i].m - d[i - 1].m);
			return steps.length && steps.every(function (s) { return s === steps[0] && s !== 0; }) && d.some(function (x, i) { return i && Math.floor(src[i].v) - Math.floor(src[i - 1].v) !== 7 && Math.floor(src[i].v) - Math.floor(src[i - 1].v) !== 1; });
		}
		function monthSeries(src, n) {
			var d = src.map(function (x) { return X.ymd(Math.floor(x.v)); }), step = (d[1].y - d[0].y) * 12 + d[1].m - d[0].m, last = d[d.length - 1], out = [];
			for (var i = 1; i <= n; i++) { var m = last.m + step * i, y = last.y + Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; var ld = new Date(Date.UTC(y, m, 0)).getUTCDate(); out.push({ v: X.fromYMD(y, m, Math.min(d[0].d, ld)), date: true }); }
			return out;
		}

		/* ---------- clipboard HTML ---------- */
		function escH(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
		// rows: [[{text, css, num, f}]] -> an HTML table Excel and Google Sheets read (styles inline)
		function htmlTable(rows) {
			var h = ['<meta charset="utf-8"><table style="border-collapse:collapse">'];
			rows.forEach(function (r) {
				h.push("<tr>");
				r.forEach(function (c) { var st = (c && c.css ? c.css.replace(/box-shadow:[^;]*;/g, "") : "") + (c && c.num ? "text-align:right;" : ""); h.push("<td" + (st ? ' style="' + escH(st) + '"' : "") + (c && c.span ? ' colspan="' + c.span[1] + '" rowspan="' + c.span[0] + '"' : "") + ">" + escH(c ? c.text : "").replace(/\n/g, "<br>") + "</td>"); });
				h.push("</tr>");
			});
			h.push("</table>");
			return h.join("");
		}
		var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
		function unent(s) { return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) { if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)); return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m; }); }
		// a pasted HTML table (from Excel, Google Sheets, a web page) -> [[{text, style: {b, i, u, color, fill, ha}}]] | null
		function parseHtmlTable(html) {
			var s = String(html || ""), t0 = s.search(/<table\b/i); if (t0 < 0) return null;
			var t1 = s.search(/<\/table>/i); var body = s.slice(t0, t1 < 0 ? s.length : t1);
			var classes = {}; (s.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).forEach(function (st) { var re = /\.([\w-]+)\s*\{([^}]*)\}/g, m; while ((m = re.exec(st))) classes[m[1]] = m[2]; });
			var rows = [], occupied = {}, ri = 0, trRe = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|$)/gi, tm;
			while ((tm = trRe.exec(body))) {
				var cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi, cm, ci = 0, row = rows[ri] || (rows[ri] = []);
				while ((cm = cellRe.exec(tm[1]))) {
					while (occupied[ri + ":" + ci]) ci++;
					var attrs = cm[2], inner = cm[3].replace(/<\/t[dh]>[\s\S]*$/i, "");
					var cls = /class\s*=\s*"?([\w-]+)/i.exec(attrs), css = ((/style\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || "") + ";" + (cls && classes[cls[1]] || "");
					var text = unent(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n+$/, "").replace(/ /g, " ");
					if (/<b\b|<strong\b/i.test(inner)) css += ";font-weight:bold";
					var cs = +((/colspan\s*=\s*"?(\d+)/i.exec(attrs) || [])[1] || 1), rs = +((/rowspan\s*=\s*"?(\d+)/i.exec(attrs) || [])[1] || 1);
					row[ci] = { text: text, style: styleOf(css, cm[1] === "h") };
					if (cs > 1 || rs > 1) { row[ci].span = [rs, cs]; for (var a = 0; a < rs; a++) for (var b = 0; b < cs; b++) if (a || b) occupied[(ri + a) + ":" + (ci + b)] = 1; }
					ci += cs;
				}
				ri++;
			}
			var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
			return rows.length ? rows.map(function (r) { var o = []; for (var i = 0; i < w; i++) o.push(r[i] || { text: "" }); return o; }) : null;
		}
		function hexOf(c) {
			c = String(c || "").trim().toLowerCase(); var m;
			if ((m = /^#([0-9a-f]{6})$/.exec(c))) return m[1].toUpperCase();
			if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c))) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
			if ((m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c))) { if (m[4] != null && +m[4] === 0) return null; return [m[1], m[2], m[3]].map(function (v) { v = (+v).toString(16); return v.length < 2 ? "0" + v : v; }).join("").toUpperCase(); }
			var named = { black: "000000", white: "FFFFFF", red: "FF0000", blue: "0000FF", green: "008000", yellow: "FFFF00" };
			return named[c] || null;
		}
		function styleOf(css, th) {
			var st = {}, get = function (k) { var re = new RegExp("(?:^|;)\\s*" + k + "\\s*:\\s*([^;]+)", "i"), m = re.exec(css); return m ? m[1].trim() : null; };
			var fw = get("font-weight"); if ((fw && (/bold/i.test(fw) || +fw >= 600)) || (th && !fw)) st.b = true;
			if (/italic/i.test(get("font-style") || "")) st.i = true;
			if (/underline/i.test(get("text-decoration") || "")) st.u = true;
			var col = hexOf(get("color")); if (col && col !== "000000") st.color = col;
			var bg = hexOf(get("background-color") || get("background")); if (bg && bg !== "FFFFFF") st.fill = bg;
			var ta = get("text-align"); if (ta && /^(center|right|left)$/i.test(ta)) st.ha = ta.toLowerCase();
			return Object.keys(st).length ? st : null;
		}

		/* ---------- formulas written to .xlsx: newer functions need the _xlfn. prefix or Excel shows #NAME? ---------- */
		var FUTURE = ("XLOOKUP XMATCH CONCAT TEXTJOIN IFS SWITCH MAXIFS MINIFS IFNA UNIQUE SEQUENCE RANDARRAY LET SORTBY XOR DAYS ISOWEEKNUM " +
			"STDEV.S STDEV.P VAR.S VAR.P MODE.SNGL PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC RANK.EQ RANK.AVG CEILING.MATH FLOOR.MATH " +
			"CEILING.PRECISE FLOOR.PRECISE ISO.CEILING NETWORKDAYS.INTL WORKDAY.INTL NUMBERVALUE UNICHAR UNICODE TEXTBEFORE TEXTAFTER TEXTSPLIT " +
			"HSTACK VSTACK TAKE DROP CHOOSECOLS CHOOSEROWS TOCOL TOROW ISFORMULA RRI SHEET SHEETS ANCHORARRAY SINGLE").split(" ");
		var XLWS = { SORT: 1, FILTER: 1 };
		function toFile(f) {
			var toks; try { toks = X.tokenize(f); } catch (e) { return f; }
			return toks.map(function (t) {
				if (t.type === "func") { if (/^_XL/i.test(t.v)) return t.raw; var n = X.normFn(t.v); if (XLWS[n]) return "_xlfn._xlws." + t.raw; if (FUTURE.indexOf(n) >= 0) return "_xlfn." + t.raw; return t.raw; }
				if (t.type === "ref" && /#$/.test(t.v.text)) return "_xlfn.ANCHORARRAY(" + t.raw.slice(0, -1) + ")";
				return t.raw;
			}).join("");
		}
		function fromFile(f) { return String(f).replace(/_xlfn\.ANCHORARRAY\(((?:'(?:[^']|'')+'!|[A-Za-z_][\w.]*!)?\$?[A-Za-z]{1,3}\$?\d+)\)/gi, "$1#").replace(/_xlfn\.(_xlws\.)?/gi, ""); }

		X.shiftFormula = shiftFormula; X.moveRefs = moveRefs; X.refSpans = refSpans; X.canPoint = canPoint; X.cycleAbs = cycleAbs; X.f4At = f4At;
		X.refText = refText; X.sheetPrefix = sheetPrefix; X.fillSeries = fillSeries; X.htmlTable = htmlTable; X.parseHtmlTable = parseHtmlTable;
		X.REF_COLORS = PALETTE; X.toFile = toFile; X.fromFile = fromFile; X.hexOf = hexOf;
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXL) install(root.MESXL);
})(typeof window !== "undefined" ? window : this);

/* MES Spreadsheet Viewer (mes.fm/excel): the parts of an .xlsx that SheetJS Community Edition does not read or write.
   Pure logic, no DOM: window.MESXLO in the page, require()-able in node (tests: node tool_apps_src/excel-tests.js).
   - zip: read the central directory, inflate entries through an injected async inflate(u8) (DecompressionStream in the
     browser, zlib in node), write a zip (stored, or deflated through an injected deflate)
   - a small XML parser (xml, kid, kids, att, txt) good enough for the package parts (never used on sheetData, which is
     scanned with regular expressions so a 50 MB sheet stays fast)
   - readPackage: theme colours, styles (fonts, fills, borders, alignment, number formats, dxfs, custom table styles),
     per sheet: state (hidden / veryHidden), frozen pane, columns (width, hidden, style), hidden rows, row styles, the
     style index of every cell, conditional formatting, tables (xl/tables/*), drawings with chart / picture anchors,
     charts (xl/charts/*: bar, column, line, area, pie, doughnut, scatter, radar; stacked / percent; secondary axis)
   - looks: cell xf -> look {fill, color, b, i, u, s, sz, ha, va, wrap, bd}, built-in TableStyleLight1-21 / Medium1-28 /
     Dark1-11 (approximated from Excel's presets) and custom table styles -> per-cell look, look -> CSS
   - conditional formatting: cellIs, text rules, blanks / errors, top / bottom N, above / below average, duplicates,
     expressions (through an injected evaluator), colour scales, data bars
   - chartSvg: an SVG drawing of a parsed chart with live values
   - graft: patch the .xlsx SheetJS writes so it keeps the original styles, theme, freeze panes, conditional formatting,
     tables, charts and pictures. */
(function (root) {
	"use strict";
	var EMU = 9525;

	/* ---------- bytes / text ---------- */
	function utf8(u8) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(u8);
		return Buffer.from(u8).toString("utf8");
	}
	function enc(s) {
		if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
		return new Uint8Array(Buffer.from(s, "utf8"));
	}
	var CRC = null;
	function crc32(u8) {
		if (!CRC) { CRC = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
		var crc = -1; for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
		return (crc ^ -1) >>> 0;
	}

	/* ---------- zip ---------- */
	function unzip(u8) {
		var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
		for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
		if (eocd < 0) throw new Error("not a zip file");
		var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = {}, order = [];
		if (p === 0xFFFFFFFF) {   // zip64
			var loc = dv.getUint32(eocd - 20, true) === 0x07064b50 ? Number(dv.getBigUint64(eocd - 12, true)) : -1;
			if (loc >= 0) { n = Number(dv.getBigUint64(loc + 32, true)); p = Number(dv.getBigUint64(loc + 48, true)); }
		}
		for (var k = 0; k < n; k++) {
			if (dv.getUint32(p, true) !== 0x02014b50) break;
			var method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true);
			var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
			var name = utf8(u8.subarray(p + 46, p + 46 + nl));
			if (cs === 0xFFFFFFFF || us === 0xFFFFFFFF || lo === 0xFFFFFFFF) {
				var x = p + 46 + nl, xe = x + xl;
				while (x + 4 <= xe) { var id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true), q = x + 4;
					if (id === 1) { if (us === 0xFFFFFFFF) { us = Number(dv.getBigUint64(q, true)); q += 8; } if (cs === 0xFFFFFFFF) { cs = Number(dv.getBigUint64(q, true)); q += 8; } if (lo === 0xFFFFFFFF) lo = Number(dv.getBigUint64(q, true)); }
					x += 4 + sz; }
			}
			var lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), d0 = lo + 30 + lnl + lxl;
			out[name] = { name: name, method: method, crc: crc, csize: cs, usize: us, raw: u8.subarray(d0, d0 + cs) };
			order.push(name);
			p += 46 + nl + xl + cl;
		}
		return { files: out, order: order };
	}
	function entryBytes(z, name, inflate) {
		var e = z.files[name];
		if (!e) return Promise.resolve(null);
		if (e.method === 0) return Promise.resolve(e.raw);
		if (e.method !== 8) return Promise.reject(new Error("unsupported zip compression"));
		return Promise.resolve(inflate(e.raw));
	}
	function entryText(z, name, inflate) { return entryBytes(z, name, inflate).then(function (b) { return b ? utf8(b) : null; }); }
	// files: [{name, data: Uint8Array}] (compressed here if deflate is given) or [{name, raw, method, crc, usize}] (copied as is)
	function zipWrite(files, deflate) {
		return Promise.all(files.map(function (f) {
			if (f.raw) return { name: f.name, raw: f.raw, method: f.method, crc: f.crc, usize: f.usize };
			var data = f.data, crc = crc32(data);
			if (!deflate || data.length < 64) return { name: f.name, raw: data, method: 0, crc: crc, usize: data.length };
			return Promise.resolve(deflate(data)).then(function (d) { return d.length < data.length ? { name: f.name, raw: d, method: 8, crc: crc, usize: data.length } : { name: f.name, raw: data, method: 0, crc: crc, usize: data.length }; });
		})).then(function (list) {
			var parts = [], cen = [], off = 0;
			list.forEach(function (f) {
				var nm = enc(f.name), h = new Uint8Array(30 + nm.length), dv = new DataView(h.buffer);
				dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, f.method, true);
				dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, f.crc, true); dv.setUint32(18, f.raw.length, true); dv.setUint32(22, f.usize, true);
				dv.setUint16(26, nm.length, true); h.set(nm, 30);
				var c = new Uint8Array(46 + nm.length), cv = new DataView(c.buffer);
				cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, f.method, true);
				cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, f.crc, true); cv.setUint32(20, f.raw.length, true); cv.setUint32(24, f.usize, true);
				cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true); c.set(nm, 46);
				parts.push(h, f.raw); cen.push(c); off += h.length + f.raw.length;
			});
			var cs = 0; cen.forEach(function (c) { cs += c.length; });
			var e = new Uint8Array(22), ev = new DataView(e.buffer);
			ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, list.length, true); ev.setUint16(10, list.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
			var all = parts.concat(cen, [e]), total = 0; all.forEach(function (a) { total += a.length; });
			var out = new Uint8Array(total), o = 0; all.forEach(function (a) { out.set(a, o); o += a.length; });
			return out;
		});
	}

	/* ---------- XML ---------- */
	var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
	function unesc(s) { return s.indexOf("&") < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) { return e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]; }); }
	function escX(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function local(q) { var i = q.indexOf(":"); return i < 0 ? q : q.slice(i + 1); }
	// -> {n: local name, q: qualified name, a: {qualified attr: value}, c: [children], t: text}
	function xml(s) {
		var rootN = { n: "#root", q: "#root", a: {}, c: [], t: "" }, st = [rootN], re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s>\/]+)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g, m;
		var ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
		while ((m = re.exec(s))) {
			var top = st[st.length - 1];
			if (m[6] != null) { top.t += unesc(m[6]); continue; }
			if (m[1] != null) { top.t += m[1]; continue; }
			if (m[2]) { if (st.length > 1) st.pop(); continue; }
			if (m[3]) {
				var a = {}, am; ar.lastIndex = 0;
				if (m[4]) while ((am = ar.exec(m[4]))) a[am[1]] = unesc(am[2] != null ? am[2] : am[3]);
				var nd = { n: local(m[3]), q: m[3], a: a, c: [], t: "" };
				top.c.push(nd);
				if (!m[5]) st.push(nd);
			}
		}
		return rootN.c[0] || rootN;
	}
	function kid(n, name) { if (!n) return null; for (var i = 0; i < n.c.length; i++) if (n.c[i].n === name) return n.c[i]; return null; }
	function kids(n, name) { return n ? n.c.filter(function (x) { return x.n === name; }) : []; }
	function path(n) { for (var i = 1; i < arguments.length && n; i++) n = kid(n, arguments[i]); return n; }
	function att(n, name) { if (!n) return undefined; if (n.a[name] != null) return n.a[name]; for (var k in n.a) if (local(k) === name) return n.a[k]; return undefined; }
	function val(n) { return n ? att(n, "val") : undefined; }
	function all(n, name, out) { out = out || []; if (!n) return out; n.c.forEach(function (x) { if (x.n === name) out.push(x); all(x, name, out); }); return out; }
	function txt(n) { if (!n) return ""; return all(n, "t").map(function (t) { return t.t; }).join(""); }
	function on(v, def) { if (v == null) return def; return v === "1" || v === "true" || v === true; }

	/* ---------- paths / rels ---------- */
	function dirOf(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); }
	function resolve(base, target) {
		if (/^[a-z]+:/i.test(target)) return target;
		var parts = (target[0] === "/" ? target.slice(1) : dirOf(base) + target).split("/"), out = [];
		parts.forEach(function (p) { if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p); });
		return out.join("/");
	}
	function relsPath(part) { return dirOf(part) + "_rels/" + part.slice(dirOf(part).length) + ".rels"; }
	function parseRels(s, part) {
		var out = {}; if (!s) return out;
		kids(xml(s), "Relationship").forEach(function (r) { out[r.a.Id] = { id: r.a.Id, type: (r.a.Type || "").replace(/^.*\//, ""), target: r.a.TargetMode === "External" ? r.a.Target : resolve(part, r.a.Target), ext: r.a.TargetMode === "External" }; });
		return out;
	}

	/* ---------- colours ---------- */
	var DEFAULT_THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];
	var INDEXED = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
		"800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080", "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
		"000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
		"3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"];
	function parseTheme(s) {
		var t = DEFAULT_THEME.slice(), fonts = { major: "Calibri Light", minor: "Calibri" };
		if (!s) return { colors: t, fonts: fonts };
		var x = xml(s), cs = all(x, "clrScheme")[0];
		if (cs) {
			var get = function (name) { var n = kid(cs, name); if (!n || !n.c[0]) return null; var c = n.c[0]; return (c.a.lastClr || c.a.val || "").slice(-6).toUpperCase() || null; };
			var order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
			order.forEach(function (k, i) { var v = get(k); if (v && /^[0-9A-F]{6}$/.test(v)) t[i] = v; });
		}
		var mj = all(x, "majorFont")[0], mn = all(x, "minorFont")[0];
		if (mj && kid(mj, "latin")) fonts.major = kid(mj, "latin").a.typeface || fonts.major;
		if (mn && kid(mn, "latin")) fonts.minor = kid(mn, "latin").a.typeface || fonts.minor;
		return { colors: t, fonts: fonts };
	}
	function hexRgb(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
	function rgbHex(r, g, b) { return [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); }
	function toHls(h) {
		var c = hexRgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0;
		if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hu /= 6; }
		return [hu, l, s];
	}
	function fromHls(hu, l, s) {
		if (!s) return rgbHex(l * 255, l * 255, l * 255);
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
		var f = function (t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
		return rgbHex(f(hu + 1 / 3) * 255, f(hu) * 255, f(hu - 1 / 3) * 255);
	}
	// Excel tint: < 0 darkens (lum * (1 + tint)), > 0 lightens (lum + (1 - lum) * tint)
	function tint(h, t) { if (!t) return h; var x = toHls(h), l = t < 0 ? x[1] * (1 + t) : x[1] + (1 - x[1]) * t; return fromHls(x[0], Math.max(0, Math.min(1, l)), x[2]); }
	function lumMod(h, mod, off) { var x = toHls(h); return fromHls(x[0], Math.max(0, Math.min(1, x[1] * mod + off)), x[2]); }
	function luminance(h) { var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
	// <color rgb|theme|indexed|auto tint/> -> "RRGGBB" | null
	function color(n, theme, indexed) {
		if (!n) return null;
		var a = n.a || n, h = null;
		if (a.rgb) h = String(a.rgb).slice(-6).toUpperCase();
		else if (a.theme != null) h = (theme || DEFAULT_THEME)[+a.theme] || null;
		else if (a.indexed != null) { var i = +a.indexed; h = i === 64 ? "000000" : i === 65 ? "FFFFFF" : ((indexed || INDEXED)[i] || null); }
		else if (on(a.auto)) return null;
		if (!h || !/^[0-9A-F]{6}$/.test(h)) return null;
		return a.tint ? tint(h, +a.tint) : h;
	}
	var SCHEME = { lt1: 0, bg1: 0, dk1: 1, tx1: 1, lt2: 2, bg2: 2, dk2: 3, tx2: 3, accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9, hlink: 10, folHlink: 11 };
	// DrawingML colour: <a:solidFill><a:srgbClr val/> | <a:schemeClr val><a:lumMod val/><a:lumOff val/></a:schemeClr> ...
	function dmlColor(fill, theme) {
		if (!fill) return null;
		var c = fill.c.filter(function (x) { return /Clr$/.test(x.n); })[0];
		if (!c) return null;
		var h = null;
		if (c.n === "srgbClr") h = String(c.a.val || "").toUpperCase();
		else if (c.n === "schemeClr") { var i = SCHEME[c.a.val]; h = i != null ? (theme || DEFAULT_THEME)[i] : null; }
		else if (c.n === "sysClr") h = String(c.a.lastClr || (c.a.val === "window" ? "FFFFFF" : "000000")).toUpperCase();
		else if (c.n === "prstClr") h = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080" }[c.a.val] || null;
		if (!h || !/^[0-9A-F]{6}$/.test(h)) return null;
		var mod = kid(c, "lumMod"), off = kid(c, "lumOff"), sh = kid(c, "shade"), tn = kid(c, "tint");
		if (mod || off) h = lumMod(h, mod ? +mod.a.val / 1e5 : 1, off ? +off.a.val / 1e5 : 0);
		if (sh) { var s = +sh.a.val / 1e5, rgb = hexRgb(h); h = rgbHex(rgb[0] * s, rgb[1] * s, rgb[2] * s); }
		if (tn) { var tt = +tn.a.val / 1e5, rg = hexRgb(h); h = rgbHex(255 - (255 - rg[0]) * tt, 255 - (255 - rg[1]) * tt, 255 - (255 - rg[2]) * tt); }
		return h;
	}

	/* ---------- styles ---------- */
	var BUILTIN_FMT = { 0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??", 14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
		18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@" };
	var BW = { hair: 1, thin: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, slantDashDot: 2, thick: 3, double: 3 };
	function parseFont(n, theme, indexed) {
		if (!n) return null;
		var f = {}, b = kid(n, "b"), i = kid(n, "i"), u = kid(n, "u"), s = kid(n, "strike"), sz = kid(n, "sz"), nm = kid(n, "name"), c = kid(n, "color");
		if (b) f.b = on(val(b), true); if (i) f.i = on(val(i), true); if (s) f.s = on(val(s), true);
		if (u) f.u = val(u) !== "none";
		if (sz) f.sz = +val(sz); if (nm) f.name = val(nm);
		if (c) { var h = color(c, theme, indexed); if (h) f.color = h; }
		var va = kid(n, "vertAlign"); if (va) f.va = val(va);
		return f;
	}
	function parseFill(n, theme, indexed, dxf) {
		if (!n) return null;
		var p = kid(n, "patternFill");
		if (p) {
			var pt = p.a.patternType || (dxf ? "solid" : "none");
			if (pt === "none") return null;
			var fg = color(kid(p, "fgColor"), theme, indexed), bg = color(kid(p, "bgColor"), theme, indexed);
			if (dxf && pt === "solid") return bg || fg ? { c: bg || fg } : null;
			if (pt === "solid") return fg ? { c: fg } : (bg ? { c: bg } : null);
			if (pt === "gray125" || pt === "gray0625") return dxf ? null : { c: fg || "D9D9D9", pat: pt };
			return { c: fg || bg || "D9D9D9", pat: pt };
		}
		var g = kid(n, "gradientFill");
		if (g) { var stops = kids(g, "stop").map(function (s) { return color(kid(s, "color"), theme, indexed); }).filter(Boolean); return stops.length ? { c: stops[0], grad: stops, deg: +(g.a.degree || 0) } : null; }
		return null;
	}
	function parseBorder(n, theme, indexed) {
		if (!n) return null;
		var out = {}, any = false;
		[["left", "l"], ["right", "r"], ["top", "t"], ["bottom", "b"], ["start", "l"], ["end", "r"], ["horizontal", "h"], ["vertical", "v"]].forEach(function (p) {
			var e = kid(n, p[0]); if (!e || !e.a.style || e.a.style === "none") return;
			out[p[1]] = { w: BW[e.a.style] || 1, st: e.a.style, c: color(kid(e, "color"), theme, indexed) || "000000" }; any = true;
		});
		return any ? out : null;
	}
	function parseStyles(s, theme) {
		var st = { xfs: [], dxfs: [], fmts: {}, tableStyles: {}, defaultTableStyle: "TableStyleMedium2", indexed: INDEXED, raw: s || "" };
		if (!s) return st;
		var x = xml(s);
		var ic = path(x, "colors", "indexedColors");
		if (ic) { var list = kids(ic, "rgbColor").map(function (c) { return String(c.a.rgb || "").slice(-6).toUpperCase(); }); if (list.length) st.indexed = list.concat(INDEXED.slice(list.length)); }
		kids(kid(x, "numFmts"), "numFmt").forEach(function (f) { st.fmts[+f.a.numFmtId] = f.a.formatCode; });
		var fonts = kids(kid(x, "fonts"), "font").map(function (f) { return parseFont(f, theme, st.indexed); });
		var fills = kids(kid(x, "fills"), "fill").map(function (f) { return parseFill(f, theme, st.indexed); });
		var borders = kids(kid(x, "borders"), "border").map(function (b) { return parseBorder(b, theme, st.indexed); });
		st.font0 = fonts[0] || {};
		kids(kid(x, "cellXfs"), "xf").forEach(function (xf) {
			var a = xf.a, al = kid(xf, "alignment"), o = { fmt: +(a.numFmtId || 0), font: +(a.fontId || 0), fill: +(a.fillId || 0), border: +(a.borderId || 0) };
			var look = {};
			var f = fonts[o.font];
			if (f && o.font !== 0) { ["b", "i", "u", "s", "va"].forEach(function (k) { if (f[k]) look[k] = f[k]; }); if (f.color) look.color = f.color; if (f.sz) look.sz = f.sz; if (f.name) look.font = f.name; }
			var fl = fills[o.fill]; if (fl) look.fill = fl;
			var bd = borders[o.border]; if (bd) look.bd = bd;
			if (al) {
				if (al.a.horizontal && al.a.horizontal !== "general") look.ha = al.a.horizontal;
				if (al.a.vertical) look.vaAlign = al.a.vertical;
				if (on(al.a.wrapText)) look.wrap = true;
				if (al.a.indent) look.indent = +al.a.indent;
				if (al.a.textRotation && +al.a.textRotation) look.rot = +al.a.textRotation;
			}
			o.look = look; o.code = st.fmts[o.fmt] || BUILTIN_FMT[o.fmt] || "General";
			st.xfs.push(o);
		});
		kids(kid(x, "dxfs"), "dxf").forEach(function (d) {
			var look = {}, f = parseFont(kid(d, "font"), theme, st.indexed), fl = parseFill(kid(d, "fill"), theme, st.indexed, true), bd = parseBorder(kid(d, "border"), theme, st.indexed);
			if (f) { ["b", "i", "u", "s"].forEach(function (k) { if (f[k] != null) look[k] = f[k]; }); if (f.color) look.color = f.color; }
			if (fl) look.fill = fl; if (bd) look.bd = bd;
			var nf = kid(d, "numFmt"); if (nf) look.code = nf.a.formatCode;
			st.dxfs.push(look);
		});
		var ts = kid(x, "tableStyles");
		if (ts) {
			if (ts.a.defaultTableStyle) st.defaultTableStyle = ts.a.defaultTableStyle;
			kids(ts, "tableStyle").forEach(function (t) {
				var els = {};
				kids(t, "tableStyleElement").forEach(function (e) { var d = st.dxfs[+e.a.dxfId]; if (d) els[e.a.type] = Object.assign({ size: +(e.a.size || 1) }, d); });
				st.tableStyles[t.a.name] = els;
			});
		}
		return st;
	}

	/* ---------- built-in table styles (approximations of Excel's presets) ---------- */
	function TS(theme) {
		var T = theme || DEFAULT_THEME;
		return {
			key: function (k) { return k === "dk1" ? T[1] : k === "lt1" ? T[0] : T[4 + (+k.slice(6) - 1)]; },
			t: function (k, v) { return tint(this.key(k), v); }
		};
	}
	function line(c, w) { return { w: w || 1, st: w === 3 ? "double" : "thin", c: c }; }
	function builtinTableStyle(name, theme) {
		var m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(name || "");
		if (!m) return null;
		var kind = m[1], n = +m[2], H = TS(theme), white = H.key("lt1"), black = H.key("dk1");
		var gi = function (size) { return (n - 1) % size; }, grp = function (size) { return Math.floor((n - 1) / size); };
		var acc = function (i) { return i === 0 ? "dk1" : "accent" + i; };
		var E = {};
		if (kind === "Light" && n <= 21) {
			var k = acc(gi(7)), K = H.key(k), g = grp(7), stripe = k === "dk1" ? tint(K, 0.85) : H.t(k, 0.8), tx = k === "dk1" ? black : H.t(k, -0.25);
			if (g === 0) {
				E.wholeTable = { color: tx, bd: { t: line(K), b: line(K) } };
				E.headerRow = { b: true, bd: { b: line(K) } }; E.totalRow = { b: true, bd: { t: line(K) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: stripe } }; E.firstColumnStripe = { fill: { c: stripe } };
			} else if (g === 1) {
				E.wholeTable = { bd: { t: line(K), b: line(K), l: line(K), r: line(K) } };
				E.headerRow = { b: true, color: white, fill: { c: K } }; E.totalRow = { b: true, bd: { t: line(K, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true };
				E.firstRowStripe = { bd: { t: line(K), b: line(K) } }; E.firstColumnStripe = { bd: { l: line(K), r: line(K) } };
			} else {
				E.wholeTable = { bd: { t: line(K), b: line(K), l: line(K), r: line(K), h: line(K), v: line(K) } };
				E.headerRow = { b: true, bd: { b: line(K, 2) } }; E.totalRow = { b: true, bd: { t: line(K, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: stripe } }; E.firstColumnStripe = { fill: { c: stripe } };
			}
		} else if (kind === "Medium" && n <= 28) {
			var k2 = acc(gi(7)), K2 = H.key(k2), g2 = grp(7), neutral = k2 === "dk1";
			var t8 = neutral ? tint(black, 0.85) : H.t(k2, 0.8), t6 = neutral ? tint(black, 0.65) : H.t(k2, 0.6), t4 = neutral ? tint(black, 0.5) : H.t(k2, 0.4);
			if (g2 === 0) {
				E.wholeTable = { color: black, bd: { t: line(t4), b: line(t4), l: line(t4), r: line(t4), h: line(t4) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 } }; E.totalRow = { b: true, bd: { t: line(K2, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: t8 } }; E.firstColumnStripe = { fill: { c: t8 } };
			} else if (g2 === 1) {
				E.wholeTable = { color: black, fill: { c: t8 }, bd: { h: line(white), v: line(white) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 }, bd: { b: line(white, 3) } }; E.totalRow = { b: true, color: white, fill: { c: K2 }, bd: { t: line(white, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: K2 } }; E.lastColumn = { b: true, color: white, fill: { c: K2 } };
				E.firstRowStripe = { fill: { c: t6 } }; E.firstColumnStripe = { fill: { c: t6 } };
			} else if (g2 === 2) {
				var gray = tint(black, 0.85);
				E.wholeTable = { color: black, bd: { t: line(black, 2), b: line(black, 2), h: line(tint(black, 0.5)) } };
				E.headerRow = { b: true, color: white, fill: { c: K2 }, bd: { b: line(black, 2) } }; E.totalRow = { b: true, bd: { t: line(black, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: K2 } }; E.lastColumn = { b: true, color: white, fill: { c: K2 } };
				E.firstRowStripe = { fill: { c: gray } }; E.firstColumnStripe = { fill: { c: gray } };
			} else {
				E.wholeTable = { color: black, fill: { c: t8 }, bd: { t: line(t4), b: line(t4), l: line(t4), r: line(t4), h: line(t4), v: line(t4) } };
				E.headerRow = { b: true }; E.totalRow = { b: true, bd: { t: line(K2, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: t6 } }; E.firstColumnStripe = { fill: { c: t6 } };
			}
		} else if (kind === "Dark" && n <= 11) {
			if (n <= 7) {
				var k3 = acc(n - 1), K3 = n === 1 ? tint(black, 0.45) : H.key(k3), dk = n === 1 ? tint(black, 0.25) : tint(K3, -0.25), dd = n === 1 ? tint(black, 0.15) : tint(K3, -0.5);
				E.wholeTable = { color: white, fill: { c: K3 } };
				E.headerRow = { b: true, color: white, fill: { c: black }, bd: { b: line(white, 2) } }; E.totalRow = { b: true, color: white, fill: { c: dd }, bd: { t: line(white, 3) } };
				E.firstColumn = { b: true, color: white, fill: { c: dk } }; E.lastColumn = { b: true, color: white, fill: { c: dk } };
				E.firstRowStripe = { fill: { c: dk } }; E.firstColumnStripe = { fill: { c: dk } };
			} else {
				var a1 = n === 8 ? null : "accent" + ((n - 9) * 2 + 1), a2 = n === 8 ? null : "accent" + ((n - 9) * 2 + 2);
				var rowsC = a1 ? H.t(a1, 0.8) : tint(black, 0.85), band = a1 ? H.t(a1, 0.6) : tint(black, 0.75), head = a2 ? H.key(a2) : black;
				E.wholeTable = { color: black, fill: { c: rowsC } };
				E.headerRow = { b: true, color: white, fill: { c: head } }; E.totalRow = { b: true, bd: { t: line(black, 3) } };
				E.firstColumn = { b: true }; E.lastColumn = { b: true }; E.firstRowStripe = { fill: { c: band } }; E.firstColumnStripe = { fill: { c: band } };
			}
		} else return null;
		return E;
	}
	// the look of cell (r, c) inside table t ({ref g, header, totals, style info}); els = element map
	function tableLook(t, r, c, els) {
		if (!els) return null;
		var g = t.g, inT = r >= g.s.r && r <= g.e.r && c >= g.s.c && c <= g.e.c;
		if (!inT) return null;
		var hdr = t.header && r === g.s.r, tot = t.totals && r === g.e.r, look = {}, bd = {};
		var put = function (e, edges) {
			if (!e) return;
			["fill", "color", "b", "i", "u"].forEach(function (k) { if (e[k] != null) look[k] = e[k]; });
			if (e.bd) edges.forEach(function (p) { var src = e.bd[p[0]]; if (src) bd[p[1]] = src; });
		};
		var first = g.s.r + (t.header ? 1 : 0), last = g.e.r - (t.totals ? 1 : 0);
		var outer = function (rTop, rBot) { var ed = []; if (r === rTop) ed.push(["t", "t"]); else ed.push(["h", "t"]); if (r === rBot) ed.push(["b", "b"]); else ed.push(["h", "b"]); if (c === g.s.c) ed.push(["l", "l"]); else ed.push(["v", "l"]); if (c === g.e.c) ed.push(["r", "r"]); else ed.push(["v", "r"]); return ed; };
		put(els.wholeTable, outer(g.s.r, g.e.r));
		var bodyRow = !hdr && !tot, edgesBox = [["t", "t"], ["b", "b"], ["l", "l"], ["r", "r"]];
		if (bodyRow && t.colStripes) { var ci = c - g.s.c, sz1 = (els.firstColumnStripe && els.firstColumnStripe.size) || 1, sz2 = (els.secondColumnStripe && els.secondColumnStripe.size) || 1; if (ci % (sz1 + sz2) < sz1) put(els.firstColumnStripe, edgesBox); else put(els.secondColumnStripe, edgesBox); }
		if (bodyRow && t.rowStripes) { var ri = r - first, s1 = (els.firstRowStripe && els.firstRowStripe.size) || 1, s2 = (els.secondRowStripe && els.secondRowStripe.size) || 1; if (ri % (s1 + s2) < s1) put(els.firstRowStripe, edgesBox); else put(els.secondRowStripe, edgesBox); }
		if (t.firstCol && c === g.s.c) put(els.firstColumn, edgesBox);
		if (t.lastCol && c === g.e.c) put(els.lastColumn, edgesBox);
		if (hdr) put(els.headerRow, edgesBox);
		if (tot) put(els.totalRow, edgesBox);
		if (hdr && t.firstCol && c === g.s.c) put(els.firstHeaderCell, edgesBox);
		if (hdr && t.lastCol && c === g.e.c) put(els.lastHeaderCell, edgesBox);
		if (tot && t.firstCol && c === g.s.c) put(els.firstTotalCell, edgesBox);
		if (tot && t.lastCol && c === g.e.c) put(els.lastTotalCell, edgesBox);
		void last;
		if (Object.keys(bd).length) look.bd = bd;
		return look;
	}
	function tableElements(t, styles, theme) {
		var name = t.style || "";
		if (!name) return null;
		return (styles && styles.tableStyles[name]) || builtinTableStyle(name, theme) || null;
	}
	function parseTable(s) {
		var x = xml(s), g = parseRange(x.a.ref), si = kid(x, "tableStyleInfo");
		if (!g) return null;
		return {
			name: x.a.displayName || x.a.name, g: g, ref: x.a.ref,
			header: x.a.headerRowCount !== "0", totals: on(x.a.totalsRowCount) || +(x.a.totalsRowCount || 0) > 0 || on(x.a.totalsRowShown, false) && +(x.a.totalsRowCount || 0) > 0,
			style: si ? si.a.name : "", rowStripes: si ? on(si.a.showRowStripes, false) : false, colStripes: si ? on(si.a.showColumnStripes, false) : false,
			firstCol: si ? on(si.a.showFirstColumn, false) : false, lastCol: si ? on(si.a.showLastColumn, false) : false,
			columns: kids(kid(x, "tableColumns"), "tableColumn").map(function (c) { return c.a.name; })
		};
	}

	/* ---------- A1 (a copy of the bits needed here, so this file stands alone) ---------- */
	function colIndex(s) { s = s.replace(/\$/g, "").toUpperCase(); var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
	function colName(c) { var s = ""; c = Math.floor(c); while (c >= 0) { s = String.fromCharCode(65 + c % 26) + s; c = Math.floor(c / 26) - 1; } return s; }
	function cellRef(s) { var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s); return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null; }
	function parseRange(s) {
		if (!s) return null; var p = String(s).split(":"), a = cellRef(p[0]), b = p[1] ? cellRef(p[1]) : a;
		if (!a || !b) { var cm = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})$/i.exec(s); if (cm) return { s: { r: 0, c: colIndex(cm[1]) }, e: { r: 1048575, c: colIndex(cm[2]) } }; var rm = /^\$?(\d+):\$?(\d+)$/.exec(s); if (rm) return { s: { r: +rm[1] - 1, c: 0 }, e: { r: +rm[2] - 1, c: 16383 } }; return null; }
		return { s: { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c) }, e: { r: Math.max(a.r, b.r), c: Math.max(a.c, b.c) } };
	}
	function sqref(s) { return String(s || "").trim().split(/\s+/).map(parseRange).filter(Boolean); }
	// chart / CF references: "'My sheet'!$B$2:$B$9", "(Sheet1!$A$1,Sheet1!$A$3)", "Sheet1!B1"
	function parseRefs(f) {
		if (!f) return [];
		f = String(f).trim().replace(/^\(|\)$/g, "");
		var out = [], re = /(?:'((?:[^']|'')+)'|([^!,'()]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g, m;
		while ((m = re.exec(f))) { var g = parseRange(m[3]); if (g) out.push({ sheet: m[1] != null ? m[1].replace(/''/g, "'") : m[2].trim(), g: g }); }
		return out;
	}
	// shift the relative parts of the A1 references in a formula by (dr, dc) (conditional formatting formulas are written for the top-left cell)
	function shiftFormula(f, dr, dc) {
		if (!dr && !dc) return f;
		return String(f).replace(/("[^"]*")|(\b[A-Za-z_][\w.]*\()|(\$?)\b([A-Z]{1,3})(\$?)(\d+)\b/g, function (m, str, fn, ac, col, ar, row) {
			if (str || fn) return m;
			var c = colIndex(col), r = +row - 1;
			if (!ac) c += dc; if (!ar) r += dr;
			if (c < 0 || r < 0) return "#REF!";
			return ac + colName(c) + ar + (r + 1);
		});
	}

	/* ---------- sheet XML (sheetData scanned with regular expressions) ---------- */
	function parseSheet(s, styles) {
		var out = { pane: null, view: {}, cols: [], rowsHidden: [], rowXf: {}, cells: [], cf: [], cfRaw: [], tableRids: [], drawingRid: null, tabColor: null, defaultRowHeight: 15, merges: [] };
		var i0 = s.indexOf("<sheetData"), i1 = s.indexOf("</sheetData>");
		var selfClose = i0 >= 0 && i1 < 0;
		var head, tail, body = "";
		if (i0 < 0) { head = s; tail = ""; }
		else if (selfClose) { var e0 = s.indexOf(">", i0); head = s.slice(0, i0); tail = s.slice(e0 + 1); }
		else { head = s.slice(0, i0); body = s.slice(i0, i1); tail = s.slice(i1 + 12); }
		var hx = xml(head.replace(/<worksheet\b[^>]*>/, "<worksheet>") + "</worksheet>");
		var tc = path(hx, "sheetPr", "tabColor"); if (tc) out.tabColor = color(tc, styles && styles.theme, styles && styles.indexed);
		var sv = path(hx, "sheetViews", "sheetView");
		if (sv) {
			out.view = { showGridLines: sv.a.showGridLines !== "0" && sv.a.showGridLines !== "false", rtl: on(sv.a.rightToLeft), zoom: +(sv.a.zoomScale || 100), tabSelected: on(sv.a.tabSelected) };
			var pn = kid(sv, "pane");
			if (pn && (pn.a.state === "frozen" || pn.a.state === "frozenSplit")) out.pane = { r: Math.round(+(pn.a.ySplit || 0)), c: Math.round(+(pn.a.xSplit || 0)), top: pn.a.topLeftCell || "" };
		}
		var fp = kid(hx, "sheetFormatPr"); if (fp && fp.a.defaultRowHeight) out.defaultRowHeight = +fp.a.defaultRowHeight;
		kids(kid(hx, "cols"), "col").forEach(function (c) {
			out.cols.push({ min: +c.a.min - 1, max: +c.a.max - 1, width: c.a.width != null ? +c.a.width : null, hidden: on(c.a.hidden), style: c.a.style != null ? +c.a.style : null });
		});
		// rows and cells: hidden rows, row styles, cell style indexes ([r, c, xf] triples in a flat array)
		var rr = /<row\b([^>]*)>|<c\b([^>]*?)(\/?)>/g, m, row = -1, cells = [];
		while ((m = rr.exec(body))) {
			if (m[1] != null) {
				var ra = m[1], rn = /\br="(\d+)"/.exec(ra); row = rn ? +rn[1] - 1 : row + 1;
				if (/\bhidden="(1|true)"/.test(ra)) out.rowsHidden.push(row);
				var rs = /\bs="(\d+)"/.exec(ra); if (rs && /\bcustomFormat="(1|true)"/.test(ra)) out.rowXf[row] = +rs[1];
				continue;
			}
			var ca = m[2], cs = /\bs="(\d+)"/.exec(ca);
			if (!cs || cs[1] === "0") continue;
			var cr = /\br="([A-Z]+)(\d+)"/.exec(ca);
			var c = cr ? colIndex(cr[1]) : -1, r = cr ? +cr[2] - 1 : row;
			if (c >= 0) cells.push(r, c, +cs[1]);
		}
		out.cells = cells;
		var tx = xml("<worksheet>" + tail.replace(/<\/worksheet>\s*$/, "") + "</worksheet>");
		kids(kid(tx, "mergeCells"), "mergeCell").forEach(function (mc) { var g = parseRange(mc.a.ref); if (g) out.merges.push(g); });
		var cfRe = /<(?:\w+:)?conditionalFormatting\b[\s\S]*?<\/(?:\w+:)?conditionalFormatting>/g, cm;
		var tailNoExt = tail.replace(/<extLst>[\s\S]*<\/extLst>/, "");
		while ((cm = cfRe.exec(tailNoExt))) out.cfRaw.push(cm[0]);
		kids(tx, "conditionalFormatting").forEach(function (cf) {
			var ranges = sqref(cf.a.sqref);
			kids(cf, "cfRule").forEach(function (rule) { var p = parseRule(rule, styles); if (p) { p.ranges = ranges; out.cf.push(p); } });
		});
		var dr = kid(tx, "drawing"); if (dr) out.drawingRid = att(dr, "id");
		kids(kid(tx, "tableParts"), "tablePart").forEach(function (t) { out.tableRids.push(att(t, "id")); });
		return out;
	}
	function parseRule(n, styles) {
		var a = n.a, r = { type: a.type, priority: +(a.priority || 0), stop: on(a.stopIfTrue), op: a.operator, text: a.text, dxf: a.dxfId != null && styles ? styles.dxfs[+a.dxfId] || null : null,
			formulas: kids(n, "formula").map(function (f) { return f.t; }), rank: +(a.rank || 10), percent: on(a.percent), bottom: on(a.bottom), above: a.aboveAverage !== "0", equal: on(a.equalAverage), stdDev: +(a.stdDev || 0) };
		var th = styles && styles.theme;
		var cs = kid(n, "colorScale");
		if (cs) { r.cfvo = kids(cs, "cfvo").map(function (v) { return { type: v.a.type, val: v.a.val }; }); r.colors = kids(cs, "color").map(function (c) { return color(c, th, styles && styles.indexed) || "FFFFFF"; }); }
		var db = kid(n, "dataBar");
		if (db) { r.cfvo = kids(db, "cfvo").map(function (v) { return { type: v.a.type, val: v.a.val }; }); r.color = color(kid(db, "color"), th, styles && styles.indexed) || "638EC6"; r.showValue = db.a.showValue !== "0"; }
		if (kid(n, "iconSet")) r.type = "iconSet";
		return r;
	}

	/* ---------- drawings + charts ---------- */
	function anchorOf(a) {
		var pos = function (n) { return n ? { c: +txt0(kid(n, "col")), co: +txt0(kid(n, "colOff")) / EMU, r: +txt0(kid(n, "row")), ro: +txt0(kid(n, "rowOff")) / EMU } : null; };
		var out = { kind: a.n, from: pos(kid(a, "from")), to: pos(kid(a, "to")) };
		var ext = kid(a, "ext"); if (ext) out.ext = { w: +ext.a.cx / EMU, h: +ext.a.cy / EMU };
		var p = kid(a, "pos"); if (p) out.pos = { x: +p.a.x / EMU, y: +p.a.y / EMU };
		if (!out.ext) { var x = all(a, "xfrm")[0], e2 = x && kid(x, "ext"); if (e2 && e2.a.cx) out.ext = { w: +e2.a.cx / EMU, h: +e2.a.cy / EMU }; }
		return out;
	}
	function txt0(n) { return n ? n.t.trim() || "0" : "0"; }
	function parseDrawing(s, rels) {
		var x = xml(s), out = [], list = [];
		// Excel wraps newer objects in <mc:AlternateContent>: use the first anchor of the Choice, else of the Fallback
		x.c.forEach(function (a) { if (a.n === "AlternateContent") { var ch0 = kid(a, "Choice"), fb = kid(a, "Fallback"); var an = (ch0 && ch0.c.filter(function (y) { return /Anchor$/.test(y.n); })[0]) || (fb && fb.c.filter(function (y) { return /Anchor$/.test(y.n); })[0]); if (an) list.push(an); } else list.push(a); });
		list.forEach(function (a) {
			if (!/Anchor$/.test(a.n)) return;
			var an = anchorOf(a), ch = all(a, "chart")[0], pic = kid(a, "pic") || all(a, "pic")[0];
			var name = (all(a, "cNvPr")[0] || { a: {} }).a.name || "";
			var hidden = on((all(a, "cNvPr")[0] || { a: {} }).a.hidden);
			if (ch && att(ch, "id") && rels[att(ch, "id")]) out.push({ type: "chart", anchor: an, target: rels[att(ch, "id")].target, name: name, hidden: hidden });
			else if (pic) { var bl = all(pic, "blip")[0], id = bl && (att(bl, "embed")); if (id && rels[id]) out.push({ type: "pic", anchor: an, target: rels[id].target, name: name, hidden: hidden }); }
		});
		return out;
	}
	function richText(n) { if (!n) return ""; return all(n, "p").map(function (p) { return all(p, "t").map(function (t) { return t.t; }).join(""); }).join("\n"); }
	function dataRef(n) {
		if (!n) return null;
		var ref = kid(n, "numRef") || kid(n, "strRef") || kid(n, "multiLvlStrRef"), lit = kid(n, "numLit") || kid(n, "strLit");
		var src = ref || lit; if (!src && kid(n, "v")) return { f: null, cache: [kid(n, "v").t], fmt: null };
		if (!src) return null;
		var cache = kid(src, "numCache") || kid(src, "strCache") || kid(src, "multiLvlStrCache") || src, pts = [], cnt = +(val(kid(cache, "ptCount")) || 0);
		all(cache, "pt").forEach(function (p) { var i = +p.a.idx, v = kid(p, "v"); if (v) pts[i] = v.t; });
		if (cnt > pts.length) pts.length = cnt;
		var fc = kid(cache, "formatCode");
		return { f: ref && kid(ref, "f") ? kid(ref, "f").t : null, cache: pts, fmt: fc ? fc.t : null, num: src.n === "numRef" || src.n === "numLit" };
	}
	var CHART_TYPES = { barChart: "bar", bar3DChart: "bar", lineChart: "line", line3DChart: "line", areaChart: "area", area3DChart: "area", pieChart: "pie", pie3DChart: "pie", ofPieChart: "pie", doughnutChart: "doughnut", scatterChart: "scatter", bubbleChart: "scatter", radarChart: "radar", stockChart: "line" };
	function serColor(ser, theme) {
		var sp = kid(ser, "spPr"); if (!sp) return {};
		var o = {}, sf = kid(sp, "solidFill"), ln = kid(sp, "ln");
		if (sf) o.fill = dmlColor(sf, theme);
		if (kid(sp, "noFill")) o.noFill = true;
		if (ln) { var lf = kid(ln, "solidFill"); if (lf) o.line = dmlColor(lf, theme); if (kid(ln, "noFill")) o.noLine = true; if (ln.a.w) o.lw = +ln.a.w / 12700; }
		var gf = kid(sp, "gradFill"); if (gf && !o.fill) { var gs = all(gf, "gs")[0]; if (gs) o.fill = dmlColor(gs, theme); }
		return o;
	}
	function parseChart(s, theme) {
		var x = xml(s), ch = kid(x, "chart");
		if (!ch) return null;
		var out = { title: null, autoDel: on(val(kid(ch, "autoTitleDeleted"))), legend: null, plots: [], axes: {}, visOnly: val(kid(ch, "plotVisOnly")) !== "0" };
		var t = kid(ch, "title");
		if (t) { out.title = richText(path(t, "tx", "rich")) || null; var tr = path(t, "tx", "strRef"); if (tr) out.titleRef = dataRef(path(t, "tx")); if (!out.title && !tr) out.title = ""; }
		var lg = kid(ch, "legend"); if (lg) out.legend = val(kid(lg, "legendPos")) || "r";
		var cs = kid(x, "spPr"); if (cs) { var csf = kid(cs, "solidFill"); if (csf) out.bg = dmlColor(csf, theme); if (kid(cs, "noFill")) out.noBg = true; }
		var pa = kid(ch, "plotArea"); if (!pa) return out;
		pa.c.forEach(function (p) {
			var type = CHART_TYPES[p.n];
			if (type) {
				var dl = kid(p, "dLbls");
				var plot = { type: type, dir: val(kid(p, "barDir")) || "col", grouping: val(kid(p, "grouping")) || (type === "bar" ? "clustered" : "standard"), vary: on(val(kid(p, "varyColors"))),
					hole: +(val(kid(p, "holeSize")) || (type === "doughnut" ? 50 : 0)), axes: kids(p, "axId").map(function (a) { return a.a.val; }), gap: +(val(kid(p, "gapWidth")) || 150), overlap: +(val(kid(p, "overlap")) || 0),
					style: val(kid(p, "scatterStyle")) || val(kid(p, "radarStyle")) || "", labels: dl ? { val: on(val(kid(dl, "showVal"))), pct: on(val(kid(dl, "showPercent"))), cat: on(val(kid(dl, "showCatName"))) } : null,
					firstAngle: +(val(kid(p, "firstSliceAng")) || 0), series: [] };
				if (type === "bar" && plot.grouping !== "clustered" && !kid(p, "overlap")) plot.overlap = 100;
				kids(p, "ser").forEach(function (sr) {
					var sdl = kid(sr, "dLbls"), mk = kid(sr, "marker");
					var se = { idx: +(val(kid(sr, "idx")) || 0), order: +(val(kid(sr, "order")) || 0), name: dataRef(kid(sr, "tx")), cat: dataRef(kid(sr, "cat")), val: dataRef(kid(sr, "val")), x: dataRef(kid(sr, "xVal")), y: dataRef(kid(sr, "yVal")),
						smooth: on(val(kid(sr, "smooth"))), marker: mk ? (val(kid(mk, "symbol")) || "auto") : null, look: serColor(sr, theme),
						pts: kids(sr, "dPt").map(function (d) { return { idx: +val(kid(d, "idx")), look: serColor(d, theme) }; }),
						labels: sdl ? { val: on(val(kid(sdl, "showVal"))), pct: on(val(kid(sdl, "showPercent"))), cat: on(val(kid(sdl, "showCatName"))) } : null };
					if (mk && kid(mk, "spPr")) { var mlook = serColor(mk, theme); se.markerFill = mlook.fill; }
					if (se.y && !se.val) se.val = se.y;
					plot.series.push(se);
				});
				plot.series.sort(function (a, b) { return a.order - b.order; });
				out.plots.push(plot);
				return;
			}
			if (/Ax$/.test(p.n)) {
				var id = val(kid(p, "axId")), sc = kid(p, "scaling"), nf = kid(p, "numFmt"), at = kid(p, "title");
				out.axes[id] = { id: id, kind: p.n.replace(/Ax$/, ""), pos: val(kid(p, "axPos")) || "b", deleted: on(val(kid(p, "delete"))), cross: val(kid(p, "crossAx")),
					min: sc && kid(sc, "min") ? +val(kid(sc, "min")) : null, max: sc && kid(sc, "max") ? +val(kid(sc, "max")) : null, rev: sc && val(kid(sc, "orientation")) === "maxMin",
					log: sc && kid(sc, "logBase") ? +val(kid(sc, "logBase")) : null, grid: !!kid(p, "majorGridlines"), fmt: nf ? nf.a.formatCode : null, linked: nf ? on(nf.a.sourceLinked) : true,
					title: at ? richText(path(at, "tx", "rich")) || "" : null, crosses: val(kid(p, "crosses")) || null, lbl: val(kid(p, "tickLblPos")) || "nextTo" };
			}
		});
		return out;
	}

	/* ---------- the whole package ---------- */
	// -> Promise<{u8, theme, fonts, styles, sheets: [{name, state, part, rels, ...parseSheet, tables, objects}], ct (content types)}>
	function readPackage(u8, inflate, opt) {
		opt = opt || {};
		var z = unzip(u8), T = function (n) { return entryText(z, n, inflate); };
		var model = { u8: u8, zip: z, sheets: [], media: {} };
		return T("_rels/.rels").then(function (r0) {
			var rr = parseRels(r0, ""), wbPart = "xl/workbook.xml";
			for (var k in rr) if (rr[k].type === "officeDocument") wbPart = rr[k].target;
			model.wbPart = wbPart;
			return Promise.all([T(wbPart), T(relsPath(wbPart)), T("[Content_Types].xml")]);
		}).then(function (r) {
			var wx = xml(r[0] || "<workbook/>"), wrel = parseRels(r[1], model.wbPart);
			model.ct = r[2] || "";
			model.wbRels = wrel;
			var themeT = null, stylesT = null;
			for (var k in wrel) { if (wrel[k].type === "theme") themeT = wrel[k].target; if (wrel[k].type === "styles") stylesT = wrel[k].target; }
			model.themePart = themeT; model.stylesPart = stylesT;
			kids(kid(wx, "sheets"), "sheet").forEach(function (s) { var rel = wrel[att(s, "id")]; model.sheets.push({ name: s.a.name, state: s.a.state || "visible", part: rel ? rel.target : null }); });
			return Promise.all([themeT ? T(themeT) : null, stylesT ? T(stylesT) : null]);
		}).then(function (r) {
			var th = parseTheme(r[0]);
			model.theme = th.colors; model.fonts = th.fonts; model.themeRaw = r[0];
			model.styles = parseStyles(r[1], model.theme); model.styles.theme = model.theme;
			return Promise.all(model.sheets.map(function (sh) {
				if (!sh.part) return null;
				return Promise.all([T(sh.part), T(relsPath(sh.part))]).then(function (x) {
					if (x[0] == null) return;
					var big = x[0].length > (opt.maxSheetChars || 80e6);
					Object.assign(sh, parseSheet(big ? x[0].replace(/<sheetData[\s\S]*<\/sheetData>/, "<sheetData/>") : x[0], model.styles));
					sh.rels = parseRels(x[1], sh.part); sh.relsRaw = x[1];
					sh.tables = []; sh.objects = [];
					var jobs = sh.tableRids.map(function (id) { var rel = sh.rels[id]; if (!rel) return null; return T(rel.target).then(function (s) { if (!s) return; var t = parseTable(s); if (t) { t.part = rel.target; t.els = tableElements(t, model.styles, model.theme); sh.tables.push(t); } }); });
					var drel = sh.drawingRid && sh.rels[sh.drawingRid];
					if (drel) { sh.drawingPart = drel.target; jobs.push(Promise.all([T(drel.target), T(relsPath(drel.target))]).then(function (d) {
						if (!d[0]) return;
						var objs = parseDrawing(d[0], parseRels(d[1], drel.target));
						return Promise.all(objs.map(function (o) {
							if (o.type === "chart") return T(o.target).then(function (cs) { try { o.chart = cs ? parseChart(cs, model.theme) : null; } catch (e) { o.chart = null; } if (o.chart) sh.objects.push(o); });
							if (o.type === "pic") return entryBytes(z, o.target, inflate).then(function (b) { if (b) { o.bytes = b; o.mime = /\.png$/i.test(o.target) ? "image/png" : /\.gif$/i.test(o.target) ? "image/gif" : /\.svg$/i.test(o.target) ? "image/svg+xml" : /\.(jpe?g)$/i.test(o.target) ? "image/jpeg" : /\.emf$/i.test(o.target) ? "" : "image/" + (o.target.split(".").pop() || "png"); if (o.mime) sh.objects.push(o); } });
						}));
					})); }
					return Promise.all(jobs);
				});
			}));
		}).then(function () { return model; });
	}

	/* ---------- looks -> CSS ---------- */
	function mergeLook(base, top) { if (!top) return base; if (!base) return top; var o = Object.assign({}, base); for (var k in top) { if (k === "bd") o.bd = Object.assign({}, base.bd || {}, top.bd); else if (top[k] != null) o[k] = top[k]; } return o; }
	function lightFor(h) { var x = toHls(h); return fromHls(x[0], Math.max(0.72, 1 - x[1]), x[2]); }
	// look -> {css, fill: bool}. dark: page in dark mode (dark text with no fill under it is lightened so it stays readable)
	function lookCss(L, dark) {
		if (!L) return { css: "", fill: false, ha: null };
		var css = "", fill = L.fill && L.fill.c, fg = L.color;
		if (fill) {
			if (L.fill.grad && L.fill.grad.length > 1) css += "background:linear-gradient(" + (90 + (L.fill.deg || 0)) + "deg,#" + L.fill.grad.join(",#") + ");";
			else css += "background:#" + fill + ";";
			if (!fg) fg = luminance(fill) < 0.22 ? "FFFFFF" : "111111";
		} else if (fg && dark && luminance(fg) < 0.12) fg = lightFor(fg);
		if (fg) css += "color:#" + fg + ";";
		if (L.b) css += "font-weight:700;";
		if (L.i) css += "font-style:italic;";
		if (L.u || L.s) css += "text-decoration:" + (L.u ? "underline " : "") + (L.s ? "line-through" : "") + ";";
		if (L.sz && L.sz !== 11) css += "font-size:" + Math.max(7, Math.min(20, L.sz * 96 / 72 * 0.92)).toFixed(1) + "px;";
		if (L.font && !/^(Calibri|Aptos( Narrow)?|Arial)$/i.test(L.font)) css += "font-family:'" + L.font.replace(/'/g, "") + "',Calibri,Carlito,sans-serif;";
		if (L.ha) { var ha = { center: "center", centerContinuous: "center", right: "right", left: "left", justify: "justify", distributed: "center", fill: "left" }[L.ha]; if (ha) css += "text-align:" + ha + ";"; }
		if (L.indent) css += "padding-left:" + (4 + L.indent * 9) + "px;";
		if (L.bd) {
			var sh = [], b = L.bd, col = function (e) { var c = e.c || "000000"; if (dark && !fill && luminance(c) < 0.05) c = "9AA59E"; return "#" + c; };
			if (b.l) sh.push("inset " + b.l.w + "px 0 0 0 " + col(b.l));
			if (b.r) sh.push("inset -" + b.r.w + "px 0 0 0 " + col(b.r));
			if (b.t) sh.push("inset 0 " + b.t.w + "px 0 0 " + col(b.t));
			if (b.b) sh.push("inset 0 -" + b.b.w + "px 0 0 " + col(b.b));
			if (sh.length) css += "box-shadow:" + sh.join(",") + ";";
		}
		return { css: css, fill: !!fill, ha: L.ha || null, wrap: !!L.wrap, va: L.vaAlign || null, shadow: !!(L.bd && (L.bd.l || L.bd.r || L.bd.t || L.bd.b)) };
	}

	/* ---------- conditional formatting ---------- */
	function isNum(v) { return typeof v === "number" && isFinite(v); }
	function percentileOf(sorted, p) { if (!sorted.length) return 0; var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
	// stats over a rule's ranges; value(r, c) -> cell value
	function ruleStats(rule, value) {
		var nums = [], counts = new Map(), cap = 400000, n = 0;
		rule.ranges.forEach(function (g) {
			for (var r = g.s.r; r <= Math.min(g.e.r, g.s.r + 100000); r++) for (var c = g.s.c; c <= Math.min(g.e.c, g.s.c + 200); c++) {
				if (++n > cap) return;
				var v = value(r, c);
				if (isNum(v)) nums.push(v);
				if (v != null && v !== "") { var k = typeof v === "string" ? "s" + v.toLowerCase() : "n" + v; counts.set(k, (counts.get(k) || 0) + 1); }
			}
		});
		var sorted = nums.slice().sort(function (a, b) { return a - b; }), sum = 0; nums.forEach(function (v) { sum += v; });
		var mean = nums.length ? sum / nums.length : 0, sd = 0;
		if (nums.length > 1) { var q = 0; nums.forEach(function (v) { q += (v - mean) * (v - mean); }); sd = Math.sqrt(q / (nums.length - 1)); }
		return { sorted: sorted, mean: mean, sd: sd, counts: counts, min: sorted[0], max: sorted[sorted.length - 1] };
	}
	function cfvoValue(v, st, evalF) {
		if (!v) return null;
		switch (v.type) {
			case "min": return st.min; case "max": return st.max;
			case "num": return +v.val;
			case "percent": return st.min + (st.max - st.min) * (+v.val / 100);
			case "percentile": return percentileOf(st.sorted, +v.val / 100);
			case "formula": { var x = evalF ? evalF(v.val, 0, 0) : +v.val; return isNum(x) ? x : +v.val; }
			case "autoMin": return Math.min(0, st.min); case "autoMax": return Math.max(0, st.max);
		}
		return null;
	}
	function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
	function inRanges(rule, r, c) { for (var i = 0; i < rule.ranges.length; i++) { var g = rule.ranges[i]; if (r >= g.s.r && r <= g.e.r && c >= g.s.c && c <= g.e.c) return g; } return null; }
	// -> {look, bar: {pct, color}} | null.  ctx: {value(r,c), text(r,c), stats(rule), evalF(formula, dr, dc) -> value}
	function cfFor(rules, r, c, ctx) {
		var look = null, bar = null, done = {};
		for (var i = 0; i < rules.length; i++) {
			var R = rules[i], g = inRanges(R, r, c);
			if (!g) continue;
			var v = ctx.value(r, c), hit = false;
			switch (R.type) {
				case "cellIs": {
					var a = ctx.evalF(R.formulas[0], r - g.s.r, c - g.s.c, g), b = R.formulas[1] != null ? ctx.evalF(R.formulas[1], r - g.s.r, c - g.s.c, g) : null;
					if (v == null || v === "") v = isNum(a) ? 0 : "";
					var cmp = function (x, y) { if (typeof x === "string" || typeof y === "string") { x = String(x).toLowerCase(); y = String(y == null ? "" : y).toLowerCase(); } return x < y ? -1 : x > y ? 1 : 0; };
					var k = cmp(v, a);
					hit = { equal: k === 0, notEqual: k !== 0, greaterThan: k > 0, greaterThanOrEqual: k >= 0, lessThan: k < 0, lessThanOrEqual: k <= 0,
						between: b != null && cmp(v, Math.min(a, b)) >= 0 && cmp(v, Math.max(a, b)) <= 0, notBetween: b != null && (cmp(v, Math.min(a, b)) < 0 || cmp(v, Math.max(a, b)) > 0) }[R.op] || false;
					break;
				}
				case "containsText": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) >= 0; break;
				case "notContainsText": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) < 0; break;
				case "beginsWith": hit = ctx.text(r, c).toLowerCase().indexOf(String(R.text || "").toLowerCase()) === 0; break;
				case "endsWith": { var tx = ctx.text(r, c).toLowerCase(), q = String(R.text || "").toLowerCase(); hit = tx.length >= q.length && tx.slice(tx.length - q.length) === q; break; }
				case "containsBlanks": hit = v == null || String(v).trim() === ""; break;
				case "notContainsBlanks": hit = !(v == null || String(v).trim() === ""); break;
				case "containsErrors": hit = /^#/.test(ctx.text(r, c)) && ctx.isErr(r, c); break;
				case "notContainsErrors": hit = !ctx.isErr(r, c); break;
				case "top10": {
					if (!isNum(v)) break;
					var s = ctx.stats(R), n = R.percent ? Math.max(1, Math.floor(s.sorted.length * R.rank / 100)) : R.rank;
					if (!s.sorted.length) break;
					hit = R.bottom ? v <= s.sorted[Math.min(n, s.sorted.length) - 1] : v >= s.sorted[Math.max(0, s.sorted.length - n)];
					break;
				}
				case "aboveAverage": {
					if (!isNum(v)) break;
					var s2 = ctx.stats(R), lim = s2.mean + (R.stdDev ? (R.above ? 1 : -1) * R.stdDev * s2.sd : 0);
					hit = R.above ? (R.equal ? v >= lim : v > lim) : (R.equal ? v <= lim : v < lim);
					break;
				}
				case "duplicateValues": case "uniqueValues": {
					if (v == null || v === "") break;
					var cnt = ctx.stats(R).counts.get(typeof v === "string" ? "s" + v.toLowerCase() : "n" + v) || 0;
					hit = R.type === "duplicateValues" ? cnt > 1 : cnt === 1;
					break;
				}
				case "expression": { var x = ctx.evalF(R.formulas[0], r - g.s.r, c - g.s.c, g); hit = x === true || (isNum(x) && x !== 0); break; }
				case "colorScale": {
					if (!isNum(v) || done.scale) break;
					var s3 = ctx.stats(R), pts = R.cfvo.map(function (o) { return cfvoValue(o, s3, ctx.evalF); }), cols = R.colors, out;
					if (pts.length === 2) { var t = pts[1] === pts[0] ? 0.5 : (v - pts[0]) / (pts[1] - pts[0]); out = mix(cols[0], cols[1], Math.max(0, Math.min(1, t))); }
					else { if (v <= pts[1]) { var t1 = pts[1] === pts[0] ? 1 : (v - pts[0]) / (pts[1] - pts[0]); out = mix(cols[0], cols[1], Math.max(0, Math.min(1, t1))); } else { var t2 = pts[2] === pts[1] ? 0 : (v - pts[1]) / (pts[2] - pts[1]); out = mix(cols[1], cols[2], Math.max(0, Math.min(1, t2))); } }
					done.scale = true; if (!look || !look.fill) look = mergeLook({ fill: { c: out } }, look);
					continue;
				}
				case "dataBar": {
					if (!isNum(v) || bar) break;
					var s4 = ctx.stats(R), lo = cfvoValue(R.cfvo[0], s4, ctx.evalF), hi = cfvoValue(R.cfvo[1], s4, ctx.evalF);
					if (lo == null) lo = s4.min; if (hi == null) hi = s4.max;
					var p = hi === lo ? 1 : (v - lo) / (hi - lo);
					bar = { pct: Math.max(0.03, Math.min(1, p)) * 100, color: R.color, hideValue: R.showValue === false };
					continue;
				}
			}
			if (hit && R.dxf) { look = mergeLook(R.dxf, look); }
			if (hit && R.stop) break;
		}
		return look || bar ? { look: look, bar: bar } : null;
	}

	/* ---------- chart SVG ---------- */
	var PALETTE_K = [4, 5, 6, 7, 8, 9];
	function seriesColor(i, theme) {
		var T = theme || DEFAULT_THEME, base = T[PALETTE_K[i % 6]], round = Math.floor(i / 6);
		return round === 0 ? base : round === 1 ? lumMod(base, 0.6, 0) : round === 2 ? lumMod(base, 0.8, 0.2) : lumMod(base, 0.5, 0);
	}
	function nice(lo, hi, n) {
		if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
		if (lo === hi) { if (lo === 0) hi = 1; else if (lo > 0) lo = 0; else hi = 0; }
		var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = n / span * step;
		if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
		var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
		var ticks = []; for (var v = a; v <= b + step / 2; v += step) ticks.push(+v.toPrecision(12));
		return { lo: a, hi: b, step: step, ticks: ticks };
	}
	function fmtShort(v) {
		if (!isNum(v)) return "";
		var a = Math.abs(v);
		if (a >= 1e9) return +(v / 1e9).toPrecision(3) + "B"; if (a >= 1e6) return +(v / 1e6).toPrecision(3) + "M"; if (a >= 1e4) return +(v / 1e3).toPrecision(3) + "K";
		return String(+v.toPrecision(6));
	}
	function svgEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function clipText(s, maxCh) { s = String(s == null ? "" : s); return s.length > maxCh ? s.slice(0, Math.max(1, maxCh - 1)) + "…" : s; }
	// data: {title, plots: [{type, ..., series: [{name, color, values: [num|null], cats: [str], xs: [num]}]}]} built by the page from parseChart + live cells
	// opts: {w, h, dark, fmt(v, code) -> text, theme}
	function chartSvg(ch, data, opts) {
		var W = Math.max(60, opts.w), H = Math.max(40, opts.h), dark = !!opts.dark, fmt = opts.fmt || function (v) { return fmtShort(v); };
		var bg = ch.noBg ? "none" : (ch.bg ? "#" + ch.bg : (dark ? "#20262299" : "#ffffff"));
		if (ch.bg && dark) bg = "#" + ch.bg;
		var ink = ch.bg ? (luminance(ch.bg) < 0.3 ? "#e8ece9" : "#404040") : (dark ? "#d5ddd7" : "#404040"), mute = ch.bg ? ink : (dark ? "#9aa59e" : "#595959"), gridC = dark && !ch.bg ? "#3a443d" : "#d9d9d9";
		var o = [], fs = Math.max(9, Math.min(13, Math.round(Math.min(W, H) / 26)));
		o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="Calibri,Carlito,Segoe UI,sans-serif" font-size="' + fs + '">');
		o.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" fill="' + bg + '" stroke="' + (dark ? "#3a443d" : "#d9d9d9") + '" rx="2"/>');
		var top = 8, left = 10, right = W - 10, bottom = H - 8;
		var title = data.title;
		if (title) { var tfs = Math.round(fs * 1.35); o.push('<text x="' + W / 2 + '" y="' + (top + tfs) + '" text-anchor="middle" font-size="' + tfs + '" fill="' + ink + '">' + svgEsc(clipText(title, Math.floor(W / (tfs * 0.52)))) + "</text>"); top += tfs + 8; }
		var plots = data.plots.filter(function (p) { return p.series.length; });
		if (!plots.length) { o.push('<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="' + mute + '">(no data)</text></svg>'); return o.join(""); }
		var isPie = plots[0].type === "pie" || plots[0].type === "doughnut";
		// legend
		var items = [];
		if (ch.legend) {
			if (isPie) { var p0 = plots[0], s0 = p0.series[0]; (s0.cats || []).forEach(function (c, i) { if (s0.values[i] != null) items.push({ name: c, color: s0.ptColors[i] }); }); }
			else plots.forEach(function (p) { p.series.forEach(function (s) { items.push({ name: s.name, color: s.color, line: p.type === "line" || p.type === "scatter" || p.type === "radar" }); }); });
		}
		var lp = ch.legend;
		if (items.length) {
			var maxW = Math.min(W * 0.32, 12 + fs * 0.55 * Math.max.apply(null, items.map(function (it) { return String(it.name).length; })) + 14);
			if (lp === "r" || lp === "l" || lp === "tr") {
				var lx = lp === "l" ? left : right - maxW, ly0 = (top + bottom) / 2 - items.length * (fs + 5) / 2;
				items.slice(0, Math.floor((bottom - top) / (fs + 5))).forEach(function (it, i) { var y = Math.max(top, ly0) + i * (fs + 5); o.push(legendItem(lx, y, it, fs, ink, Math.floor((maxW - 18) / (fs * 0.55)))); });
				if (lp === "l") left += maxW + 6; else right -= maxW + 6;
			} else {
				var rowY = lp === "t" ? top + 2 : bottom - fs - 2, x = left, perRow = [];
				var widths = items.map(function (it) { return 18 + Math.min(String(it.name).length, 28) * fs * 0.55 + 10; }), total = widths.reduce(function (a, b) { return a + b; }, 0);
				x = Math.max(left, (W - total) / 2);
				items.forEach(function (it, i) { if (x + widths[i] > right && perRow.length) return; o.push(legendItem(x, rowY, it, fs, ink, 28)); x += widths[i]; perRow.push(i); });
				if (lp === "t") top += fs + 10; else bottom -= fs + 10;
			}
		}
		if (isPie) { o.push(pieSvg(plots[0], left, top, right, bottom, ink, fs, fmt, bg)); o.push("</svg>"); return o.join(""); }
		if (plots[0].type === "radar") { o.push(radarSvg(plots[0], left, top, right, bottom, ink, mute, gridC, fs, fmt)); o.push("</svg>"); return o.join(""); }
		// value scales: primary + optional secondary
		var axisOf = function (p, kind) { var ax = p.axes.map(function (id) { return ch.axes[id]; }).filter(Boolean); return ax.filter(function (a) { return kind === "val" ? a.kind === "val" : a.kind !== "val"; })[0] || (kind === "val" ? ax[ax.length - 1] : ax[0]) || {}; };
		var scatter = plots[0].type === "scatter", horiz = plots[0].type === "bar" && plots[0].dir === "bar";
		var prim = axisOf(plots[0], "val"), groups = [{ ax: prim, plots: [] }, { ax: null, plots: [] }];
		plots.forEach(function (p) { var va = axisOf(p, "val"); if (va && prim && va.id !== prim.id && p !== plots[0]) { groups[1].ax = va; groups[1].plots.push(p); } else groups[0].plots.push(p); });
		var extent = function (g) {
			var lo = Infinity, hi = -Infinity;
			g.plots.forEach(function (p) {
				var n = Math.max.apply(null, p.series.map(function (s) { return s.values.length; }));
				if ((p.grouping === "stacked" || p.grouping === "percentStacked") && p.type !== "scatter") {
					for (var i = 0; i < n; i++) { var pos = 0, neg = 0; p.series.forEach(function (s) { var v = s.values[i]; if (isNum(v)) { if (v >= 0) pos += v; else neg += v; } }); if (p.grouping === "percentStacked") { lo = Math.min(lo, neg < 0 ? -100 : 0); hi = Math.max(hi, pos > 0 ? 100 : 0); } else { lo = Math.min(lo, neg); hi = Math.max(hi, pos); } }
				} else p.series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
			});
			if (lo === Infinity) { lo = 0; hi = 1; }
			var bars = g.plots.some(function (p) { return p.type === "bar" || p.type === "area"; });
			if (bars || lo > 0 && lo < hi * 0.6) lo = Math.min(lo, 0);
			if (g.ax && g.ax.min != null) lo = g.ax.min; if (g.ax && g.ax.max != null) hi = g.ax.max;
			var nc = nice(lo, hi, Math.max(3, Math.min(8, Math.floor((horiz ? right - left : bottom - top) / 42))));
			if (g.ax && g.ax.min != null) nc.lo = g.ax.min; if (g.ax && g.ax.max != null) nc.hi = g.ax.max;
			nc.ticks = nc.ticks.filter(function (t) { return t >= nc.lo - 1e-9 && t <= nc.hi + 1e-9; });
			return nc;
		};
		var sc0 = extent(groups[0]), sc1 = groups[1].plots.length ? extent(groups[1]) : null;
		var pct0 = groups[0].plots.some(function (p) { return p.grouping === "percentStacked"; });
		var axFmt = function (ax, pct) { return function (v) { if (pct) return Math.round(v) + "%"; return ax && ax.fmt && ax.fmt !== "General" && !ax.linked ? fmt(v, ax.fmt) : (ax && ax.fmt && ax.fmt !== "General" ? fmt(v, ax.fmt) : fmtShort(v)); }; };
		var f0 = axFmt(prim, pct0), f1 = sc1 ? axFmt(groups[1].ax, false) : null;
		// categories
		var cats = [], nCat = 0;
		plots.forEach(function (p) { p.series.forEach(function (s) { nCat = Math.max(nCat, s.values.length); if (!cats.length && s.cats && s.cats.length) cats = s.cats; }); });
		var xsc = null;
		if (scatter) { var xl = Infinity, xh = -Infinity; plots[0].series.forEach(function (s) { (s.xs || []).forEach(function (v) { if (isNum(v)) { xl = Math.min(xl, v); xh = Math.max(xh, v); } }); }); if (xl === Infinity) { xl = 1; xh = nCat; } var xa = axisOf(plots[0], "cat"); if (xa.min != null) xl = xa.min; if (xa.max != null) xh = xa.max; xsc = nice(xl, xh, Math.max(3, Math.floor((right - left) / 70))); }
		var valAxW = Math.max.apply(null, sc0.ticks.map(function (t) { return String(f0(t)).length; })) * fs * 0.55 + 8;
		var catLabelW = horiz ? Math.min(W * 0.3, Math.max.apply(null, [3].concat(cats.map(function (c) { return String(c == null ? "" : c).length; }))) * fs * 0.55 + 8) : 0;
		var vTitle = prim && prim.title, cTitle = (axisOf(plots[0], "cat") || {}).title;
		if (vTitle && !horiz) left += fs + 6; if (cTitle && !horiz) bottom -= fs + 6;
		if (vTitle && horiz) bottom -= fs + 6; if (cTitle && horiz) left += fs + 6;
		var pl = left + (horiz ? catLabelW : (prim && prim.deleted ? 4 : valAxW)), pr = right - (sc1 ? Math.max.apply(null, sc1.ticks.map(function (t) { return String(f1(t)).length; })) * fs * 0.55 + 8 : 6), pt = top + 4, pb = bottom - (horiz ? fs + 6 : (fs + 8));
		var rotate = false;
		if (!horiz && !scatter && nCat) { var slot = (pr - pl) / nCat, longest = Math.max.apply(null, [1].concat(cats.map(function (c) { return String(c == null ? "" : c).length; }))); if (longest * fs * 0.55 > slot * 1.05) { rotate = true; pb -= Math.min(H * 0.25, longest * fs * 0.4); } }
		if (pr - pl < 20 || pb - pt < 20) { o.push("</svg>"); return o.join(""); }
		var vy = function (sc, v) { var t = (v - sc.lo) / (sc.hi - sc.lo || 1); return horiz ? pl + t * (pr - pl) : pb - t * (pb - pt); };
		// grid + value axis labels
		sc0.ticks.forEach(function (t) {
			var p = vy(sc0, t);
			if (!prim || prim.grid !== false) { if (horiz) o.push('<line x1="' + p + '" y1="' + pt + '" x2="' + p + '" y2="' + pb + '" stroke="' + gridC + '"/>'); else if (!prim || prim.grid) o.push('<line x1="' + pl + '" y1="' + p + '" x2="' + pr + '" y2="' + p + '" stroke="' + gridC + '"/>'); }
			if (prim && prim.deleted) return;
			if (horiz) o.push('<text x="' + p + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(f0(t)) + "</text>");
			else o.push('<text x="' + (pl - 5) + '" y="' + (p + fs * 0.35) + '" text-anchor="end" fill="' + mute + '">' + svgEsc(f0(t)) + "</text>");
		});
		if (sc1) sc1.ticks.forEach(function (t) { var p = vy(sc1, t); o.push('<text x="' + (pr + 5) + '" y="' + (p + fs * 0.35) + '" fill="' + mute + '">' + svgEsc(f1(t)) + "</text>"); });
		var zeroY = vy(sc0, Math.max(sc0.lo, Math.min(sc0.hi, 0)));
		if (horiz) o.push('<line x1="' + zeroY + '" y1="' + pt + '" x2="' + zeroY + '" y2="' + pb + '" stroke="' + mute + '" stroke-width="0.8"/>');
		else o.push('<line x1="' + pl + '" y1="' + zeroY + '" x2="' + pr + '" y2="' + zeroY + '" stroke="' + mute + '" stroke-width="0.8"/>');
		if (vTitle) { if (horiz) o.push('<text x="' + (pl + pr) / 2 + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + ink + '">' + svgEsc(vTitle) + "</text>"); else o.push('<text transform="translate(' + (left - 4) + "," + (pt + pb) / 2 + ') rotate(-90)" text-anchor="middle" fill="' + ink + '">' + svgEsc(vTitle) + "</text>"); }
		if (cTitle) { if (horiz) o.push('<text transform="translate(' + (left - 4) + "," + (pt + pb) / 2 + ') rotate(-90)" text-anchor="middle" fill="' + ink + '">' + svgEsc(cTitle) + "</text>"); else o.push('<text x="' + (pl + pr) / 2 + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + ink + '">' + svgEsc(cTitle) + "</text>"); }
		// category axis
		var slotW = nCat ? (horiz ? pb - pt : pr - pl) / nCat : 1;
		var catRev = !!(axisOf(plots[0], "cat") || {}).rev;
		// horizontal bars: the first category sits at the bottom, like Excel (unless the axis is reversed)
		var catPos = function (i, area) { if (horiz) return catRev ? pt + (i + 0.5) * slotW : pb - (i + 0.5) * slotW; return area ? pl + (nCat > 1 ? i * (pr - pl) / (nCat - 1) : (pr - pl) / 2) : pl + (i + 0.5) * slotW; };
		var lineMode = plots.every(function (p) { return p.type === "line" || p.type === "area"; }) && plots.some(function (p) { return p.type === "area"; });
		if (scatter) {
			xsc.ticks.forEach(function (t) { var x = pl + (t - xsc.lo) / (xsc.hi - xsc.lo || 1) * (pr - pl); o.push('<text x="' + x + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(fmtShort(t)) + "</text>"); if ((axisOf(plots[0], "cat") || {}).grid) o.push('<line x1="' + x + '" y1="' + pt + '" x2="' + x + '" y2="' + pb + '" stroke="' + gridC + '"/>'); });
		} else if (!(axisOf(plots[0], "cat") || {}).deleted) {
			var every = Math.max(1, Math.ceil(nCat / Math.max(1, Math.floor((horiz ? pb - pt : pr - pl) / (rotate ? fs * 1.3 : fs * 2.2)))));
			for (var ci = 0; ci < nCat; ci += every) {
				var lab = cats[ci] != null ? cats[ci] : String(ci + 1), cp = catPos(ci, lineMode);
				if (horiz) o.push('<text x="' + (pl - 5) + '" y="' + (cp + fs * 0.35) + '" text-anchor="end" fill="' + mute + '">' + svgEsc(clipText(lab, Math.floor(catLabelW / (fs * 0.55)))) + "</text>");
				else if (rotate) o.push('<text transform="translate(' + (cp + fs * 0.3) + "," + (pb + 6) + ') rotate(-45)" text-anchor="end" fill="' + mute + '">' + svgEsc(clipText(lab, 18)) + "</text>");
				else o.push('<text x="' + cp + '" y="' + (pb + fs + 3) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(clipText(lab, Math.max(3, Math.floor(slotW * every / (fs * 0.55))))) + "</text>");
			}
		}
		// series
		groups.forEach(function (g, gi) {
			var sc = gi ? sc1 : sc0; if (!sc) return;
			var barPlots = g.plots.filter(function (p) { return p.type === "bar"; });
			barPlots.forEach(function (p) {
				var stacked = p.grouping === "stacked" || p.grouping === "percentStacked", ns = p.series.length, inner = slotW / (1 + p.gap / 100);
				var bw = stacked ? inner : inner / Math.max(1, ns - (ns - 1) * Math.max(0, p.overlap) / 100), posS = [], negS = [];
				p.series.forEach(function (s, si) {
					for (var i = 0; i < s.values.length; i++) {
						var v = s.values[i]; if (!isNum(v)) continue;
						var tot = 0; if (p.grouping === "percentStacked") p.series.forEach(function (x) { if (isNum(x.values[i])) tot += Math.abs(x.values[i]); });
						var vv = p.grouping === "percentStacked" ? (tot ? v / tot * 100 : 0) : v, b0 = 0;
						if (stacked) { if (vv >= 0) { b0 = posS[i] || 0; posS[i] = b0 + vv; } else { b0 = negS[i] || 0; negS[i] = b0 + vv; } }
						var c0 = (horiz ? pt : pl) + i * slotW + (slotW - inner) / 2 + (stacked ? 0 : si * bw * (1 - Math.max(0, p.overlap) / 100));
						var a = vy(sc, Math.max(sc.lo, Math.min(sc.hi, b0))), b = vy(sc, Math.max(sc.lo, Math.min(sc.hi, b0 + vv)));
						var col = s.ptColors && s.ptColors[i] || s.color;
						if (horiz) o.push('<rect x="' + Math.min(a, b) + '" y="' + (horiz && !catRev ? (pb - (c0 - pt) - bw) : c0) + '" width="' + Math.max(0.5, Math.abs(b - a)) + '" height="' + Math.max(0.5, bw - 0.6) + '" fill="#' + col + '"><title>' + svgEsc(s.name + ": " + (cats[i] != null ? cats[i] + ", " : "") + fmt(v, s.fmt)) + "</title></rect>");
						else o.push('<rect x="' + c0 + '" y="' + Math.min(a, b) + '" width="' + Math.max(0.5, bw - 0.6) + '" height="' + Math.max(0.5, Math.abs(b - a)) + '" fill="#' + col + '"><title>' + svgEsc(s.name + ": " + (cats[i] != null ? cats[i] + ", " : "") + fmt(v, s.fmt)) + "</title></rect>");
						if ((s.labels || p.labels) && (s.labels || p.labels).val) { var lx = horiz ? Math.max(a, b) + 3 : c0 + bw / 2, ly = horiz ? ((catRev ? c0 + bw / 2 : pb - (c0 - pt) - bw / 2) + fs * 0.35) : Math.min(a, b) - 3; o.push('<text x="' + lx + '" y="' + ly + '"' + (horiz ? "" : ' text-anchor="middle"') + ' fill="' + ink + '" font-size="' + (fs - 1) + '">' + svgEsc(fmt(v, s.fmt)) + "</text>"); }
					}
				});
			});
			g.plots.filter(function (p) { return p.type === "area"; }).forEach(function (p) {
				var stacked = p.grouping !== "standard", acc = [];
				p.series.forEach(function (s) {
					var top2 = [], bot = [];
					for (var i = 0; i < nCat; i++) {
						var v = isNum(s.values[i]) ? s.values[i] : 0, tot = 0;
						if (p.grouping === "percentStacked") p.series.forEach(function (x) { if (isNum(x.values[i])) tot += Math.abs(x.values[i]); });
						var vv = p.grouping === "percentStacked" ? (tot ? v / tot * 100 : 0) : v, b0 = stacked ? (acc[i] || 0) : 0;
						if (stacked) acc[i] = b0 + vv;
						var x = catPos(i, true);
						top2.push(x + "," + vy(sc, b0 + vv)); bot.unshift(x + "," + vy(sc, b0));
					}
					o.push('<polygon points="' + top2.concat(bot).join(" ") + '" fill="#' + s.color + '" fill-opacity="' + (stacked ? 0.9 : 0.6) + '" stroke="#' + s.color + '"><title>' + svgEsc(s.name) + "</title></polygon>");
				});
			});
			g.plots.filter(function (p) { return p.type === "line" || p.type === "scatter"; }).forEach(function (p) {
				var stacked = p.grouping === "stacked" || p.grouping === "percentStacked", acc = [];
				p.series.forEach(function (s) {
					var pts = [], noLine = s.noLine || p.style === "marker" || p.style === "lineMarker" && s.noLine;
					for (var i = 0; i < s.values.length; i++) {
						var v = s.values[i]; if (!isNum(v)) { pts.push(null); continue; }
						var vv = v; if (stacked) { vv = (acc[i] || 0) + v; acc[i] = vv; }
						var x = scatter ? pl + ((isNum(s.xs && s.xs[i]) ? s.xs[i] : i + 1) - xsc.lo) / (xsc.hi - xsc.lo || 1) * (pr - pl) : catPos(i, lineMode);
						pts.push([x, vy(sc, vv), v, i]);
					}
					if (!noLine) {
						var segs = [], cur = [];
						pts.forEach(function (q) { if (q) cur.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); else { if (cur.length) segs.push(cur); cur = []; } });
						if (cur.length) segs.push(cur);
						segs.forEach(function (sg) { o.push('<polyline points="' + sg.join(" ") + '" fill="none" stroke="#' + s.color + '" stroke-width="' + (s.lw || 2.2) + '" stroke-linejoin="round" stroke-linecap="round"/>'); });
					}
					var mk = s.marker && s.marker !== "none" || (scatter && s.marker !== "none") || noLine;
					if (mk && pts.length < 400) pts.forEach(function (q) { if (q) o.push('<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + Math.max(2.5, fs * 0.28) + '" fill="#' + (s.markerFill || s.color) + '"><title>' + svgEsc(s.name + ": " + (scatter ? fmtShort(s.xs && s.xs[q[3]]) + ", " : cats[q[3]] != null ? cats[q[3]] + ", " : "") + fmt(q[2], s.fmt)) + "</title></circle>"); });
					else if (pts.length < 400) pts.forEach(function (q) { if (q) o.push('<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="5" fill="transparent"><title>' + svgEsc(s.name + ": " + (cats[q[3]] != null ? cats[q[3]] + ", " : "") + fmt(q[2], s.fmt)) + "</title></circle>"); });
					if ((s.labels || p.labels) && (s.labels || p.labels).val) pts.forEach(function (q) { if (q) o.push('<text x="' + q[0] + '" y="' + (q[1] - 6) + '" text-anchor="middle" fill="' + ink + '" font-size="' + (fs - 1) + '">' + svgEsc(fmt(q[2], s.fmt)) + "</text>"); });
				});
			});
		});
		o.push("</svg>");
		return o.join("");
	}
	function legendItem(x, y, it, fs, ink, maxCh) {
		var sw = it.line ? '<line x1="' + x + '" y1="' + (y + fs * 0.45) + '" x2="' + (x + 12) + '" y2="' + (y + fs * 0.45) + '" stroke="#' + it.color + '" stroke-width="2.5"/>' : '<rect x="' + x + '" y="' + (y + 1) + '" width="10" height="' + (fs - 2) + '" fill="#' + it.color + '"/>';
		return sw + '<text x="' + (x + 16) + '" y="' + (y + fs * 0.85) + '" fill="' + ink + '">' + svgEsc(clipText(it.name, maxCh)) + "</text>";
	}
	function pieSvg(p, l, t, r, b, ink, fs, fmt, bg) {
		var s = p.series[0], vals = s.values.map(function (v) { return isNum(v) && v > 0 ? v : 0; }), tot = vals.reduce(function (a, v) { return a + v; }, 0);
		var cx = (l + r) / 2, cy = (t + b) / 2, R = Math.max(5, Math.min(r - l, b - t) / 2 - 6), hole = p.type === "doughnut" ? R * Math.max(10, p.hole || 50) / 100 : 0, o = [];
		if (!tot) return '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" fill="' + ink + '">(no data)</text>';
		var a = (p.firstAngle || 0) / 180 * Math.PI - Math.PI / 2, lab = s.labels || p.labels;
		vals.forEach(function (v, i) {
			if (!v) return;
			var a2 = a + v / tot * Math.PI * 2, large = a2 - a > Math.PI ? 1 : 0, col = s.ptColors[i];
			var P = function (ang, rad) { return (cx + Math.cos(ang) * rad).toFixed(2) + "," + (cy + Math.sin(ang) * rad).toFixed(2); };
			var d = v === tot ? "M" + P(a, R) + " A" + R + "," + R + " 0 1 1 " + P(a + Math.PI * 1.999, R) + "Z" : "M" + (hole ? P(a, hole) : cx + "," + cy) + " L" + P(a, R) + " A" + R + "," + R + " 0 " + large + " 1 " + P(a2, R) + (hole ? " L" + P(a2, hole) + " A" + hole + "," + hole + " 0 " + large + " 0 " + P(a, hole) : "") + "Z";
			o.push('<path d="' + d + '" fill="#' + col + '" stroke="' + (bg === "none" ? "#fff" : bg) + '" stroke-width="1"><title>' + svgEsc((s.cats[i] != null ? s.cats[i] + ": " : "") + fmt(s.values[i], s.fmt) + " (" + Math.round(v / tot * 1000) / 10 + "%)") + "</title></path>");
			if (lab && (lab.val || lab.pct || lab.cat) && v / tot > 0.03) {
				var m = (a + a2) / 2, rr = hole ? (R + hole) / 2 : R * 0.65, txt = [lab.cat ? s.cats[i] : null, lab.val ? fmt(s.values[i], s.fmt) : null, lab.pct ? Math.round(v / tot * 100) + "%" : null].filter(function (x) { return x != null; }).join("; ");
				o.push('<text x="' + (cx + Math.cos(m) * rr).toFixed(1) + '" y="' + (cy + Math.sin(m) * rr + fs * 0.35).toFixed(1) + '" text-anchor="middle" fill="' + (luminance(col) < 0.3 ? "#fff" : "#111") + '" font-size="' + (fs - 1) + '">' + svgEsc(txt) + "</text>");
			}
			a = a2;
		});
		return o.join("");
	}
	function radarSvg(p, l, t, r, b, ink, mute, gridC, fs, fmt) {
		var cx = (l + r) / 2, cy = (t + b) / 2 + 4, R = Math.max(5, Math.min(r - l, b - t) / 2 - fs * 1.6), o = [], n = 0, hi = 0;
		p.series.forEach(function (s) { n = Math.max(n, s.values.length); s.values.forEach(function (v) { if (isNum(v)) hi = Math.max(hi, v); }); });
		if (n < 3) return "";
		var sc = nice(0, hi || 1, 4), P = function (i, v) { var ang = -Math.PI / 2 + i / n * Math.PI * 2, rad = (v - sc.lo) / (sc.hi - sc.lo) * R; return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]; };
		sc.ticks.forEach(function (tk) { var pts = []; for (var i = 0; i < n; i++) pts.push(P(i, tk).map(function (x) { return x.toFixed(1); }).join(",")); o.push('<polygon points="' + pts.join(" ") + '" fill="none" stroke="' + gridC + '"/>'); });
		var cats = p.series[0].cats || [];
		for (var i = 0; i < n; i++) { var e = P(i, sc.hi), q = P(i, sc.hi * 1.12); o.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + gridC + '"/><text x="' + q[0] + '" y="' + (q[1] + fs * 0.35) + '" text-anchor="middle" fill="' + mute + '">' + svgEsc(clipText(cats[i] != null ? cats[i] : i + 1, 14)) + "</text>"); }
		p.series.forEach(function (s) { var pts = []; for (var i = 0; i < n; i++) pts.push(P(i, isNum(s.values[i]) ? s.values[i] : 0).map(function (x) { return x.toFixed(1); }).join(",")); o.push('<polygon points="' + pts.join(" ") + '" fill="' + (p.style === "filled" ? "#" + s.color : "none") + '" fill-opacity="0.35" stroke="#' + s.color + '" stroke-width="2"><title>' + svgEsc(s.name) + "</title></polygon>"); });
		return o.join("");
	}

	/* ---------- saving: graft the original parts onto SheetJS's output ---------- */
	function paneXml(fr) {
		if (!fr || (!fr.r && !fr.c)) return "";
		var tl = colName(fr.c) + (fr.r + 1), ap = fr.r && fr.c ? "bottomRight" : fr.r ? "bottomLeft" : "topRight";
		return '<pane' + (fr.c ? ' xSplit="' + fr.c + '"' : "") + (fr.r ? ' ySplit="' + fr.r + '"' : "") + ' topLeftCell="' + tl + '" activePane="' + ap + '" state="frozen"/><selection pane="' + ap + '" activeCell="' + tl + '" sqref="' + tl + '"/>';
	}
	function sheetViewsXml(fr, view, selected) {
		var a = ' workbookViewId="0"' + (selected ? ' tabSelected="1"' : "") + (view && view.showGridLines === false ? ' showGridLines="0"' : "") + (view && view.rtl ? ' rightToLeft="1"' : "") + (view && view.zoom && view.zoom !== 100 ? ' zoomScale="' + view.zoom + '"' : "");
		var p = paneXml(fr);
		return "<sheetViews><sheetView" + a + (p ? ">" + p + "</sheetView>" : "/>") + "</sheetViews>";
	}
	// add empty formatted cells ([r, c, s] triples, SheetJS does not write cells without a value) and rows that must exist
	// (rowAttrs: {r: ' hidden="1"'}) into a sheet's <sheetData>, keeping rows and cells in order
	function addStubCells(s, stubs, rowAttrs) {
		rowAttrs = rowAttrs || {};
		if (!stubs.length && !Object.keys(rowAttrs).length) return s;
		var by = {}; stubs.forEach(function (t) { (by[t[0]] || (by[t[0]] = [])).push(t); });
		Object.keys(rowAttrs).forEach(function (r) { if (!by[r]) by[r] = []; });
		var i0 = s.indexOf("<sheetData"), e0 = s.indexOf(">", i0);
		if (i0 < 0) return s;
		var self = s[e0 - 1] === "/", i1 = self ? e0 + 1 : s.indexOf("</sheetData>");
		var body = self ? "" : s.slice(e0 + 1, i1), out = [], rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, m, last = 0;
		var keys = Object.keys(by).map(Number).sort(function (a, b) { return a - b; }), ki = 0;
		var cellXml = function (t) { return '<c r="' + colName(t[1]) + (t[0] + 1) + '" s="' + t[2] + '"/>'; };
		var newRow = function (r) { var list = by[r].slice().sort(function (a, b) { return a[1] - b[1]; }); return '<row r="' + (r + 1) + '"' + (rowAttrs[r] || "") + (list.length ? ">" + list.map(cellXml).join("") + "</row>" : "/>"); };
		while ((m = rowRe.exec(body))) {
			out.push(body.slice(last, m.index)); last = rowRe.lastIndex;
			var rn = /\br="(\d+)"/.exec(m[1]), r = rn ? +rn[1] - 1 : -1;
			while (ki < keys.length && keys[ki] < r) out.push(newRow(keys[ki++]));
			if (ki < keys.length && keys[ki] === r) {
				ki++;
				var attrs = m[1].replace(/\/$/, ""); if (rowAttrs[r] && !/\bhidden=/.test(attrs)) attrs += rowAttrs[r];
				var list = by[r].slice().sort(function (a, b) { return a[1] - b[1]; }), inner = m[3] || "", cells = [], cre = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, cm, have = {};
				while ((cm = cre.exec(inner))) { var cr = /\br="([A-Z]+)\d+"/.exec(cm[0]), cc = cr ? colIndex(cr[1]) : cells.length; have[cc] = 1; cells.push([cc, cm[0]]); }
				list.forEach(function (t) { if (!have[t[1]]) cells.push([t[1], cellXml(t)]); });
				cells.sort(function (a, b) { return a[0] - b[0]; });
				out.push("<row" + attrs + ">" + cells.map(function (x) { return x[1]; }).join("") + "</row>");
			} else out.push(m[0]);
		}
		out.push(body.slice(last));
		while (ki < keys.length) out.push(newRow(keys[ki++]));
		return s.slice(0, i0) + "<sheetData>" + out.join("") + "</sheetData>" + s.slice(self ? e0 + 1 : i1 + 12);
	}
	function insertBefore(s, tags, frag) {
		var best = -1;
		tags.forEach(function (t) { var i = s.indexOf("<" + t); if (i >= 0 && (best < 0 || i < best)) best = i; });
		if (best < 0) best = s.lastIndexOf("</worksheet>");
		return s.slice(0, best) + frag + s.slice(best);
	}
	var AFTER_CF = ["dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing", "legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];
	var AFTER_DRAWING = ["legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];
	// styles.xml with extra cellXfs appended (clones of existing xfs with another number format)
	function stylesWithXfs(raw, extra) {
		if (!extra.length) return raw;
		var fmts = [], xfs = [];
		extra.forEach(function (e) { if (e.newFmt) fmts.push('<numFmt numFmtId="' + e.fmtId + '" formatCode="' + escX(e.code) + '"/>'); xfs.push(e.xml); });
		var s = raw;
		if (fmts.length) {
			if (/<numFmts\b[^>]*\/>/.test(s)) s = s.replace(/<numFmts\b[^>]*\/>/, "<numFmts>" + fmts.join("") + "</numFmts>");
			else if (/<numFmts\b/.test(s)) s = s.replace(/<\/numFmts>/, fmts.join("") + "</numFmts>");
			else s = s.replace(/(<styleSheet\b[^>]*>)/, "$1<numFmts>" + fmts.join("") + "</numFmts>");
			s = s.replace(/<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/, function (m, inner) { var n = (inner.match(/<numFmt\b/g) || []).length; return "<numFmts count=\"" + n + "\">" + inner + "</numFmts>"; });
		}
		s = s.replace(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/, function (m, inner) { var n = (inner.match(/<xf\b/g) || []).length + xfs.length; return '<cellXfs count="' + n + '">' + inner + xfs.join("") + "</cellXfs>"; });
		return s;
	}
	// append fonts / fills / borders / dxfs (XML strings) to styles.xml: more = {fonts: [], fills: [], borders: [], dxfs: []}
	function stylesAdd(raw, more) {
		if (!more) return raw;
		var s = raw;
		[["fonts", "font"], ["fills", "fill"], ["borders", "border"], ["dxfs", "dxf"]].forEach(function (p) {
			var list = more[p[0]]; if (!list || !list.length) return;
			var re = new RegExp("<" + p[0] + "\\b[^>]*?(?:/>|>([\\s\\S]*?)</" + p[0] + ">)");
			if (re.test(s)) s = s.replace(re, function (m, inner) { inner = (inner || "") + list.join(""); return "<" + p[0] + ' count="' + (inner.match(new RegExp("<" + p[1] + "\\b", "g")) || []).length + '">' + inner + "</" + p[0] + ">"; });
			else {
				var after = { fonts: /<\/numFmts>|(<styleSheet\b[^>]*>)/, fills: /<\/fonts>/, borders: /<\/fills>/, dxfs: /<\/cellStyles>|<\/cellXfs>/ }[p[0]];
				s = s.replace(after, function (m) { return m + "<" + p[0] + ' count="' + list.length + '">' + list.join("") + "</" + p[0] + ">"; });
			}
		});
		return s;
	}
	function countOf(raw, tag) { var m = new RegExp("<" + tag + "s\\b[^>]*?(?:/>|>([\\s\\S]*?)</" + tag + "s>)").exec(raw || ""); return m && m[1] ? (m[1].match(new RegExp("<" + tag + "\\b", "g")) || []).length : 0; }
	function rawList(raw, tag) { var m = new RegExp("<" + tag + "s\\b[^>]*>([\\s\\S]*?)</" + tag + "s>").exec(raw || ""); if (!m) return []; return m[1].match(new RegExp("<" + tag + "\\b[^>]*/>|<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">", "g")) || []; }
	function rawXfs(raw) { var m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(raw || ""); if (!m) return []; return m[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || []; }
	function maxFmtId(raw) { var mx = 163, re = /numFmtId="(\d+)"/g, m; while ((m = re.exec(raw || ""))) mx = Math.max(mx, +m[1]); return mx; }
	function ctAdd(ct, part, type) {
		if (ct.indexOf('PartName="/' + part + '"') >= 0) return ct;
		return ct.replace("</Types>", '<Override PartName="/' + part + '" ContentType="' + type + '"/></Types>');
	}
	function ctDefault(ct, ext, type) {
		if (new RegExp('Extension="' + ext + '"', "i").test(ct)) return ct;
		return ct.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="' + ext + '" ContentType="' + type + '"/>');
	}
	function ctTypeOf(origCt, part) {
		var m = new RegExp('<Override[^>]*PartName="/' + part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*ContentType="([^"]+)"', "i").exec(origCt) || new RegExp('<Override[^>]*ContentType="([^"]+)"[^>]*PartName="/' + part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "i").exec(origCt);
		return m ? m[1] : null;
	}
	function relRel(from, to) {
		var a = dirOf(from).split("/").filter(Boolean), b = to.split("/");
		var i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
		var up = []; for (var k = i; k < a.length; k++) up.push("..");
		return up.concat(b.slice(i)).join("/");
	}
	/* outU8: what SheetJS wrote (any compression). model: readPackage of the original (or null). info: {sheets: [{model (original sheet
	   model or null), freeze {r, c} | null, cells: Map "r:c" -> s index for the output}], extraXfs, structOk (rows / columns / sheets
	   unchanged since opening, so tables, charts and conditional formatting still point at the right cells), tableHeaders: {part: [names]}} */
	function graft(outU8, model, info, inflate, deflate) {
		var z = unzip(outU8), files = {}, order = z.order.slice();
		var T = function (n) { return entryText(z, n, inflate); };
		var O = model ? function (n) { return entryBytes(model.zip, n, inflate); } : null;
		var write = {};   // name -> Uint8Array (new or changed)
		var copy = {};    // name -> original zip entry (copied as is)
		var ct, wbRelsP, report = { charts: 0, tables: 0, cf: 0, pics: 0, styles: !!(model && model.styles.raw) };
		return Promise.all([T("[Content_Types].xml"), T("_rels/.rels")]).then(function (r) {
			ct = r[0];
			var rr = parseRels(r[1], ""), wbPart = "xl/workbook.xml"; for (var k in rr) if (rr[k].type === "officeDocument") wbPart = rr[k].target;
			wbRelsP = relsPath(wbPart);
			return Promise.all([T(wbPart), T(wbRelsP)]).then(function (x) { return { wbPart: wbPart, wbx: xml(x[0]), rels: parseRels(x[1], wbPart), relsRaw: x[1] }; });
		}).then(function (W) {
			var sheetParts = kids(kid(W.wbx, "sheets"), "sheet").map(function (s) { var rel = W.rels[att(s, "id")]; return rel ? rel.target : null; });
			var stylesPart = null, themePart = null; for (var k in W.rels) { if (W.rels[k].type === "styles") stylesPart = W.rels[k].target; if (W.rels[k].type === "theme") themePart = W.rels[k].target; }
			var jobs = [];
			// styles + theme
			if (model && model.styles.raw && stylesPart) write[stylesPart] = enc(stylesAdd(stylesWithXfs(model.styles.raw, info.extraXfs || []), info.moreStyles));
			if (model && model.themeRaw && themePart) write[themePart] = enc(model.themeRaw);
			sheetParts.forEach(function (part, i) {
				var si = info.sheets[i]; if (!part || !si) return;
				jobs.push(Promise.all([T(part), T(relsPath(part))]).then(function (x) {
					var s = x[0], relsRaw = x[1], newRels = [];
					// cell styles
					if (si.cells) s = s.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, function (m, col, row, rest, sl) {
						var want = si.cells.get((+row - 1) + ":" + colIndex(col));
						rest = rest.replace(/\s+s="\d+"/, "");
						return '<c r="' + col + row + '"' + (want ? ' s="' + want + '"' : "") + rest + sl + ">";
					});
					if ((si.stubs && si.stubs.length) || si.rowAttrs) s = addStubCells(s, si.stubs || [], si.rowAttrs);
					// freeze panes + view
					var sv = sheetViewsXml(si.freeze, si.model && si.model.view, i === (info.active || 0));
					if (/<sheetViews>[\s\S]*?<\/sheetViews>|<sheetViews\/>/.test(s)) s = s.replace(/<sheetViews>[\s\S]*?<\/sheetViews>|<sheetViews\/>/, sv);
					else s = s.replace(/(<sheetFormatPr|<cols|<sheetData)/, sv + "$1");
					var sm = si.model;
					if (sm && model && info.structOk) {
						if (sm.cfRaw && sm.cfRaw.length) { s = insertBefore(s, AFTER_CF, sm.cfRaw.join("")); report.cf += sm.cfRaw.length; }
						var relN = 0, rid = function () { var id; do { id = "rIdMes" + (++relN); } while (relsRaw && relsRaw.indexOf('Id="' + id + '"') >= 0); return id; };
						if (sm.drawingPart) {
							var id = rid(); newRels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="' + relRel(part, sm.drawingPart) + '"/>');
							s = insertBefore(s, AFTER_DRAWING, '<drawing r:id="' + id + '"/>');
							copyTree(sm.drawingPart);
							report.charts += sm.objects.filter(function (o) { return o.type === "chart"; }).length; report.pics += sm.objects.filter(function (o) { return o.type === "pic"; }).length;
						}
						if (sm.tables && sm.tables.length) {
							var tp = sm.tables.map(function (t) {
								var id2 = rid(); newRels.push('<Relationship Id="' + id2 + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="' + relRel(part, t.part) + '"/>');
								var names = info.tableHeaders && info.tableHeaders[t.part];
								jobs.push(O(t.part).then(function (b) {
									var tx = utf8(b), k2 = 0;
									if (names) tx = tx.replace(/(<(?:\w+:)?tableColumn\b[^>]*?\bname=")([^"]*)(")/g, function (m, a, nm, c) { var n = names[k2++]; return a + (n != null && n !== "" ? escX(n) : nm) + c; });
									write[t.part] = enc(tx); ct = ctAdd(ct, t.part, "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml");
								}));
								return '<tablePart r:id="' + id2 + '"/>';
							});
							s = insertBefore(s, ["extLst"], '<tableParts count="' + tp.length + '">' + tp.join("") + "</tableParts>");
							report.tables += tp.length;
						}
						if (newRels.length && !/xmlns:r=/.test(s.slice(0, 600))) s = s.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
					}
					// parts made in the editor: new tables, a new drawing with its charts, new conditional formatting (si.add / si.cfXml)
					if (si.cfXml) s = insertBefore(s, AFTER_CF, si.cfXml);
					(si.add || []).forEach(function (a, k) {
						var id = "rIdMesN" + (k + 1);
						while (relsRaw && relsRaw.indexOf('Id="' + id + '"') >= 0) id += "x";
						newRels.push('<Relationship Id="' + id + '" Type="' + a.relType + '" Target="' + relRel(part, a.part) + '"/>');
						write[a.part] = enc(a.xml); ct = ctAdd(ct, a.part, a.ctType);
						(a.sub || []).forEach(function (sb) { write[sb.part] = enc(sb.xml); ct = ctAdd(ct, sb.part, sb.ctType); });
						if (a.rels) write[relsPath(a.part)] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + a.rels.map(function (r) { return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + relRel(a.part, r.target) + '"/>'; }).join("") + "</Relationships>");
						if (a.tag === "tablePart") {
							if (/<tableParts\b[^>]*>/.test(s)) s = s.replace(/<tableParts\b[^>]*>([\s\S]*?)<\/tableParts>/, function (m, inner) { inner += '<tablePart r:id="' + id + '"/>'; return '<tableParts count="' + (inner.match(/<tablePart\b/g) || []).length + '">' + inner + "</tableParts>"; });
							else s = insertBefore(s, ["extLst"], '<tableParts count="1"><tablePart r:id="' + id + '"/></tableParts>');
						} else if (a.tag === "drawing" && !/<drawing\b/.test(s)) s = insertBefore(s, AFTER_DRAWING, '<drawing r:id="' + id + '"/>');
					});
					if (newRels.length && !/xmlns:r=/.test(s.slice(0, 600))) s = s.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
					write[part] = enc(s);
					if (newRels.length) {
						var rr2 = relsRaw || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
						write[relsPath(part)] = enc(rr2.replace("</Relationships>", newRels.join("") + "</Relationships>"));
					}
				}));
			});
			// copy a part and everything its .rels points at (drawings -> charts -> chart styles / colours / images)
			var seen = {};
			function copyTree(p) {
				if (seen[p] || !model) return; seen[p] = 1;
				var e = model.zip.files[p]; if (!e) return;
				copy[p] = e;
				var t = ctTypeOf(model.ct, p);
				if (t) ct = ctAdd(ct, p, t);
				else { var ext = (p.split(".").pop() || "").toLowerCase(), dm = new RegExp('<Default[^>]*Extension="' + ext + '"[^>]*ContentType="([^"]+)"', "i").exec(model.ct); if (dm) ct = ctDefault(ct, ext, dm[1]); }
				var rp = relsPath(p);
				if (model.zip.files[rp]) { copy[rp] = model.zip.files[rp]; jobs.push(O(rp).then(function (b) { var rels = parseRels(utf8(b), p); for (var k in rels) if (!rels[k].ext) copyTree(rels[k].target); })); }
			}
			var settle = function () { var n = jobs.length; return Promise.all(jobs).then(function () { return jobs.length > n ? settle() : null; }); };
			return settle();
		}).then(function () {
			write["[Content_Types].xml"] = enc(ct);
			Object.keys(copy).concat(Object.keys(write)).forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
			return Promise.all(order.map(function (n) {
				if (write[n]) return { name: n, data: write[n] };
				if (copy[n]) return { name: n, raw: copy[n].raw, method: copy[n].method, crc: copy[n].crc, usize: copy[n].usize };
				var e = z.files[n];
				if (e.method === 0) return { name: n, data: e.raw };
				return { name: n, raw: e.raw, method: e.method, crc: e.crc, usize: e.usize };
			}));
		}).then(function (list) { return zipWrite(list, deflate); }).then(function (u8) { return { bytes: u8, report: report }; });
	}

	var api = {
		EMU: EMU, unzip: unzip, entryBytes: entryBytes, entryText: entryText, zipWrite: zipWrite, crc32: crc32, utf8: utf8, enc: enc,
		xml: xml, kid: kid, kids: kids, att: att, txt: txt, resolve: resolve, relsPath: relsPath, parseRels: parseRels,
		DEFAULT_THEME: DEFAULT_THEME, parseTheme: parseTheme, color: color, dmlColor: dmlColor, tint: tint, lumMod: lumMod, luminance: luminance,
		BUILTIN_FMT: BUILTIN_FMT, parseStyles: parseStyles, builtinTableStyle: builtinTableStyle, tableLook: tableLook, tableElements: tableElements, parseTable: parseTable,
		parseRange: parseRange, sqref: sqref, parseRefs: parseRefs, shiftFormula: shiftFormula, colName: colName, colIndex: colIndex,
		parseSheet: parseSheet, parseDrawing: parseDrawing, parseChart: parseChart, readPackage: readPackage,
		mergeLook: mergeLook, lookCss: lookCss, ruleStats: ruleStats, cfFor: cfFor, seriesColor: seriesColor, nice: nice, chartSvg: chartSvg,
		addStubCells: addStubCells, paneXml: paneXml, sheetViewsXml: sheetViewsXml, stylesWithXfs: stylesWithXfs, stylesAdd: stylesAdd, countOf: countOf, rawList: rawList, rawXfs: rawXfs, escX: escX, maxFmtId: maxFmtId, graft: graft
	};
	if (typeof module === "object" && module.exports) { module.exports = api; require("./parts.js").install(api); }
	else root.MESXLO = api;
})(typeof window !== "undefined" ? window : this);

/* MES Spreadsheet Viewer & Editor (mes.fm/excel): XML for what is made in the editor and saved into the .xlsx (installed into MESXLO,
   node tests in tool_apps_src/excel-tests.js):
   - tableXml: an Excel table part (header, banded rows, total row functions, style)
   - chartXml + drawingXml: a chart part (column, bar, line, area, pie, doughnut, scatter) and the drawing that places it on the sheet.
     The page draws a new chart by reading its own chartXml back with MESXLO.parseChart, so what you see is what is saved.
   - fontXml / fillXml / borderXml / alignXml: cell formats from a "look" ({b, i, u, s, color, sz, font, fill: {c}, bd: {l, r, t, b},
     ha, vaAlign, wrap}), used to append new cellXfs to styles.xml
   - cfXml + dxfXml: conditional formatting rules made here */
(function (root) {
	"use strict";
	function install(O) {
		var esc = O.escX, colName = O.colName;
		var NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart", NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main", NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
		var HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
		function a1(r, c, abs) { return abs ? "$" + colName(c) + "$" + (r + 1) : colName(c) + (r + 1); }
		function sheetRef(sheet, g) { var q = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet) ? sheet : "'" + String(sheet).replace(/'/g, "''") + "'"; var a = a1(g.s.r, g.s.c, true), b = a1(g.e.r, g.e.c, true); return q + "!" + (a === b ? a : a + ":" + b); }

		/* ---------- tables ---------- */
		// t = {id, name, g, header, totals, style, rowStripes, colStripes, firstCol, lastCol, cols: [names], totalFns: [null | "sum" | "average" | "count" | "countNums" | "max" | "min" | "stdDev" | "var"], totalLabel: [text]}
		function tableXml(t) {
			var ref = a1(t.g.s.r, t.g.s.c) + ":" + a1(t.g.e.r, t.g.e.c), af = t.header ? a1(t.g.s.r, t.g.s.c) + ":" + a1(t.totals ? t.g.e.r - 1 : t.g.e.r, t.g.e.c) : null;
			var cols = t.cols.map(function (n, i) {
				var fn = t.totals && t.totalFns && t.totalFns[i], lab = t.totals && t.totalLabel && t.totalLabel[i];
				return '<tableColumn id="' + (i + 1) + '" name="' + esc(n) + '"' + (lab ? ' totalsRowLabel="' + esc(lab) + '"' : "") + (fn ? ' totalsRowFunction="' + fn + '"' : "") + "/>";
			});
			return HDR + '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + t.id + '" name="' + esc(t.name) + '" displayName="' + esc(t.name) + '" ref="' + ref + '"' +
				(t.header ? "" : ' headerRowCount="0"') + (t.totals ? ' totalsRowCount="1"' : ' totalsRowShown="0"') + ">" +
				(af ? '<autoFilter ref="' + af + '"/>' : "") +
				'<tableColumns count="' + cols.length + '">' + cols.join("") + "</tableColumns>" +
				'<tableStyleInfo name="' + esc(t.style || "TableStyleMedium2") + '" showFirstColumn="' + (t.firstCol ? 1 : 0) + '" showLastColumn="' + (t.lastCol ? 1 : 0) + '" showRowStripes="' + (t.rowStripes === false ? 0 : 1) + '" showColumnStripes="' + (t.colStripes ? 1 : 0) + '"/></table>';
		}
		// unique, non-empty column names (Excel needs them to match the header cells)
		function tableColNames(texts) {
			var seen = {}, out = [];
			texts.forEach(function (t, i) {
				var n = String(t == null ? "" : t).replace(/[\r\n]+/g, " ").trim() || "Column" + (i + 1), base = n, k = 2;
				while (seen[n.toLowerCase()]) n = base + k++;
				seen[n.toLowerCase()] = 1; out.push(n);
			});
			return out;
		}

		/* ---------- charts ---------- */
		// m = {type: column|bar|line|area|pie|doughnut|scatter, stacked: bool, title, legend: "r"|"b"|null, sheet, series: [{name: {s, g} | text,
		//      cat: {g} (categories / x values), val: {g}}], labels: bool}
		function dataRef(tag, sheet, ref, num) {
			if (!ref) return "";
			if (typeof ref === "string") return "<c:" + tag + "><c:v>" + esc(ref) + "</c:v></c:" + tag + ">";
			var f = sheetRef(ref.sheet || sheet, ref.g);
			return "<c:" + tag + "><c:" + (num ? "numRef" : "strRef") + "><c:f>" + esc(f) + "</c:f></c:" + (num ? "numRef" : "strRef") + "></c:" + tag + ">";
		}
		function chartXml(m) {
			var t = m.type, kind = t === "column" || t === "bar" ? "barChart" : t === "line" ? "lineChart" : t === "area" ? "areaChart" : t === "pie" ? "pieChart" : t === "doughnut" ? "doughnutChart" : "scatterChart";
			var round = t === "pie" || t === "doughnut", sc = t === "scatter", ax1 = 50010, ax2 = 50020;
			var ser = m.series.map(function (s, i) {
				var x = "<c:ser><c:idx val=\"" + i + "\"/><c:order val=\"" + i + "\"/>" + (s.name ? (typeof s.name === "string" ? "<c:tx><c:v>" + esc(s.name) + "</c:v></c:tx>" : dataRef("tx", m.sheet, s.name, false)) : "");
				if (t === "line" || sc) x += sc && !m.lines ? '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>' : '<c:marker><c:symbol val="none"/></c:marker>';
				if (t === "column" || t === "bar") x += '<c:invertIfNegative val="0"/>';
				if (m.labels) x += '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="' + (round ? 0 : 1) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (round ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>';
				if (sc) x += dataRef("xVal", m.sheet, s.cat, true) + dataRef("yVal", m.sheet, s.val, true) + '<c:smooth val="0"/>';
				else x += dataRef("cat", m.sheet, s.cat, false) + dataRef("val", m.sheet, s.val, true) + (t === "line" ? '<c:smooth val="0"/>' : "");
				return x + "</c:ser>";
			}).join("");
			var grouping = m.stacked ? (m.stacked === "percent" ? "percentStacked" : "stacked") : (t === "line" || t === "area" ? "standard" : "clustered");
			var plot = "<c:" + kind + ">";
			if (kind === "barChart") plot += '<c:barDir val="' + (t === "bar" ? "bar" : "col") + '"/><c:grouping val="' + grouping + '"/>';
			else if (kind === "lineChart" || kind === "areaChart") plot += '<c:grouping val="' + grouping + '"/>';
			else if (sc) plot += '<c:scatterStyle val="lineMarker"/>';
			plot += '<c:varyColors val="' + (round ? 1 : 0) + '"/>' + ser;
			if (kind === "barChart") plot += '<c:gapWidth val="150"/>' + (m.stacked ? '<c:overlap val="100"/>' : "");
			if (kind === "lineChart") plot += '<c:marker val="1"/>';
			if (t === "pie") plot += '<c:firstSliceAng val="0"/>';
			if (t === "doughnut") plot += '<c:firstSliceAng val="0"/><c:holeSize val="50"/>';
			if (!round) plot += '<c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/>';
			plot += "</c:" + kind + ">";
			var axes = "";
			if (!round) {
				var catPos = t === "bar" ? "l" : "b", valPos = t === "bar" ? "b" : "l";
				var common = function (id, cross, pos, grid, isCat) { return '<c:axId val="' + id + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + pos + '"/>' + (grid ? "<c:majorGridlines/>" : "") + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/>' + (isCat ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' : '<c:crossBetween val="' + (t === "area" ? "midCat" : "between") + '"/>'); };
				if (sc) axes = "<c:valAx>" + common(ax1, ax2, "b", false, false) + "</c:valAx><c:valAx>" + common(ax2, ax1, "l", true, false) + "</c:valAx>";
				else axes = "<c:catAx>" + common(ax1, ax2, catPos, false, true) + "</c:catAx><c:valAx>" + common(ax2, ax1, valPos, true, false) + "</c:valAx>";
			}
			var title = m.title ? '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:t>' + esc(m.title) + "</a:t></a:r></a:p></c:rich></c:tx><c:overlay val=\"0\"/></c:title>" : "";
			var legend = m.legend ? '<c:legend><c:legendPos val="' + m.legend + '"/><c:overlay val="0"/></c:legend>' : "";
			return HDR + '<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/><c:chart>' + title +
				'<c:autoTitleDeleted val="' + (m.title ? 0 : 1) + '"/><c:plotArea><c:layout/>' + plot + axes + "</c:plotArea>" + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
		}
		// charts = [{from: {c, co, r, ro}, to: {...} (Excel cells + offsets in pixels), name, rid}]
		function drawingXml(charts) {
			var pos = function (tag, p) { return "<xdr:" + tag + "><xdr:col>" + p.c + "</xdr:col><xdr:colOff>" + Math.round((p.co || 0) * 9525) + "</xdr:colOff><xdr:row>" + p.r + "</xdr:row><xdr:rowOff>" + Math.round((p.ro || 0) * 9525) + "</xdr:rowOff></xdr:" + tag + ">"; };
			return HDR + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '">' + charts.map(function (ch, i) {
				return '<xdr:twoCellAnchor editAs="oneCell">' + pos("from", ch.from) + pos("to", ch.to) + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="' + esc(ch.name || "Chart " + (i + 1)) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="' + ch.rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
			}).join("") + "</xdr:wsDr>";
		}

		/* ---------- cell formats ---------- */
		function argb(h) { return "FF" + String(h || "000000").replace(/^#/, "").slice(-6).toUpperCase(); }
		// base = the font XML of the cell's current format (or null); look = what to change
		function fontXml(base, look) {
			var b = base || "<font><sz val=\"11\"/><color theme=\"1\"/><name val=\"Calibri\"/><family val=\"2\"/><scheme val=\"minor\"/></font>";
			var get = function (tag) { var m = new RegExp("<" + tag + "\\b[^>]*/>|<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">").exec(b); return m ? m[0] : null; };
			var flag = function (tag, on, cur) { if (on === undefined) return cur ? "<" + tag + "/>" : ""; return on ? "<" + tag + "/>" : ""; };
			var has = function (tag) { var x = get(tag); return !!x && !/val="(0|false)"/.test(x); };
			var size = look.sz != null ? '<sz val="' + look.sz + '"/>' : (get("sz") || "");
			var col = look.color !== undefined ? (look.color ? '<color rgb="' + argb(look.color) + '"/>' : '<color theme="1"/>') : (get("color") || "");
			var name = look.font ? '<name val="' + esc(look.font) + '"/>' : (get("name") || "");
			var fam = look.font ? "" : (get("family") || ""), scheme = look.font ? "" : (get("scheme") || "");
			return "<font>" + flag("b", look.b, has("b")) + flag("i", look.i, has("i")) + flag("strike", look.s, has("strike")) + (look.u !== undefined ? (look.u ? "<u/>" : "") : (get("u") || "")) + size + col + name + fam + get_("charset", get) + scheme + "</font>";
		}
		function get_(t, get) { return get(t) || ""; }
		function fillXml(look) { if (!look.fill || !look.fill.c) return '<fill><patternFill patternType="none"/></fill>'; return '<fill><patternFill patternType="solid"><fgColor rgb="' + argb(look.fill.c) + '"/><bgColor indexed="64"/></patternFill></fill>'; }
		var BS = { 1: "thin", 2: "medium", 3: "thick" };
		function borderXml(bd) {
			bd = bd || {};
			var side = function (tag, e) { if (!e) return "<" + tag + "/>"; var st = e.st || BS[e.w] || "thin"; if (st === "double" && e.w === 3) st = "double"; return "<" + tag + ' style="' + st + '"><color rgb="' + argb(e.c || "000000") + '"/></' + tag + ">"; };
			return "<border>" + side("left", bd.l) + side("right", bd.r) + side("top", bd.t) + side("bottom", bd.b) + "<diagonal/></border>";
		}
		function alignXml(look) {
			var a = "";
			if (look.ha) a += ' horizontal="' + look.ha + '"';
			if (look.vaAlign) a += ' vertical="' + look.vaAlign + '"';
			if (look.wrap) a += ' wrapText="1"';
			if (look.indent) a += ' indent="' + look.indent + '"';
			if (look.rot) a += ' textRotation="' + look.rot + '"';
			return a ? "<alignment" + a + "/>" : "";
		}
		// a differential format (conditional formatting): font colour / bold / italic and a fill
		function dxfXml(look) {
			var f = "";
			if (look.b || look.i || look.u || look.color) f = "<font>" + (look.b ? "<b/>" : "") + (look.i ? "<i/>" : "") + (look.u ? "<u/>" : "") + (look.color ? '<color rgb="' + argb(look.color) + '"/>' : "") + "</font>";
			var fl = look.fill && look.fill.c ? '<fill><patternFill><bgColor rgb="' + argb(look.fill.c) + '"/></patternFill></fill>' : "";
			return "<dxf>" + f + fl + "</dxf>";
		}
		// rules = [{type, op, formulas, text, look, colors, color, cfvo, ranges}]; dxf0 = the dxfs already in styles.xml
		// -> {xml (for the sheet), dxfs: [xml], next}
		function cfXml(rules, dxf0, prio0) {
			var dxfs = [], out = [], prio = prio0 || 1;
			rules.forEach(function (R) {
				var sq = R.ranges.map(function (g) { var a = a1(g.s.r, g.s.c), b = a1(g.e.r, g.e.c); return a === b ? a : a + ":" + b; }).join(" ");
				var body = "", attrs = ' type="' + R.type + '" priority="' + (prio++) + '"';
				if (R.type === "colorScale") body = "<colorScale>" + (R.colors.length === 3 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>') + R.colors.map(function (c) { return '<color rgb="' + argb(c) + '"/>'; }).join("") + "</colorScale>";
				else if (R.type === "dataBar") body = '<dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="' + argb(R.color) + '"/></dataBar>';
				else {
					if (R.dxf) { attrs += ' dxfId="' + (dxf0 + dxfs.length) + '"'; dxfs.push(dxfXml(R.dxf)); }
					if (R.type === "cellIs") { attrs += ' operator="' + R.op + '"'; body = R.formulas.map(function (f) { return "<formula>" + esc(f) + "</formula>"; }).join(""); }
					else if (R.type === "containsText") { attrs += ' operator="containsText" text="' + esc(R.text) + '"'; var tl = a1(R.ranges[0].s.r, R.ranges[0].s.c); body = '<formula>NOT(ISERROR(SEARCH("' + esc(String(R.text).replace(/"/g, '""')) + '",' + tl + ")))</formula>"; }
					else if (R.type === "duplicateValues" || R.type === "uniqueValues") body = "";
					else if (R.type === "top10") { attrs += ' rank="' + (R.rank || 10) + '"' + (R.bottom ? ' bottom="1"' : "") + (R.percent ? ' percent="1"' : ""); }
					else if (R.type === "aboveAverage") { if (!R.above) attrs += ' aboveAverage="0"'; }
					else if (R.type === "expression") body = "<formula>" + esc(R.formulas[0]) + "</formula>";
				}
				out.push('<conditionalFormatting sqref="' + sq + '"><cfRule' + attrs + (body ? ">" + body + "</cfRule>" : "/>") + "</conditionalFormatting>");
			});
			return { xml: out.join(""), dxfs: dxfs, next: prio };
		}

		O.tableXml = tableXml; O.tableColNames = tableColNames; O.chartXml = chartXml; O.drawingXml = drawingXml; O.sheetRef = sheetRef;
		O.fontXml = fontXml; O.fillXml = fillXml; O.borderXml = borderXml; O.alignXml = alignXml; O.dxfXml = dxfXml; O.cfXml = cfXml;
		O.CT = { table: "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml", drawing: "application/vnd.openxmlformats-officedocument.drawing+xml", chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml" };
		O.REL = { table: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/table", drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" };
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXLO) install(root.MESXLO);
})(typeof window !== "undefined" ? window : this);

/* MES Spreadsheet Viewer & Editor (mes.fm/excel): open .xlsx / .xlsm / .xls / .ods / .csv / .tsv in the browser, view them in a
 * virtualised grid (only the cells on screen exist in the page, so 100k-row files scroll smoothly), edit values and simple formulas
 * (our own evaluator in lib.js = MESXL; formulas with other functions keep the value saved in the file), find, sort / filter as a
 * view, add / delete rows, columns and sheets, undo / redo, save as .xlsx / .ods / .csv / .tsv, print, recent files + autosave in
 * IndexedDB. Files are read and written by SheetJS Community Edition (Apache-2.0), self-hosted in /main_js/sheetjs/ and loaded on
 * first open. Nothing is uploaded. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("xl");
	if (!root || !window.MESXL) return;
	var X = window.MESXL, KEY = "mes-excel:v1";
	var SHEETJS = "/main_js/sheetjs/0.20.3/xlsx.full.min.js";
	var RH = 24, CHH = 24, MAXH = 12e6;
	var S = { freeze: true, remember: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

	var app = $("xl-app"), grid = $("xl-grid"), scroll = $("xl-scroll"), sizer = $("xl-sizer"), cellsEl = $("xl-cells"), ed = $("xl-ed"), fxin = $("xl-fxin"), nameBox = $("xl-name"), emptyEl = $("xl-empty");
	var lib = null;
	function loadLib() {
		if (window.XLSX) return Promise.resolve(window.XLSX);
		if (!lib) lib = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.src = SHEETJS; s.async = true;
			s.onload = function () { if (window.XLSX) { X.ssf = window.XLSX.SSF; res(window.XLSX); } else rej(new Error("The spreadsheet library did not start.")); };
			s.onerror = function () { lib = null; rej(new Error("Could not load the spreadsheet library. Check your connection and try again.")); };
			document.head.appendChild(s);
		});
		return lib;
	}
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function note(html, err) { var n = $("xl-note"); n.hidden = !html; n.innerHTML = html || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
	var nf = function (n) { return Number(n).toLocaleString(); };

	/* ---------- state ---------- */
	var wb = null, file = null, si = 0, calc = null, nRows = 0, nCols = 0;
	var views = {};        // per sheet name: {sort, filters, rows (actual row indexes, header excluded), inv}
	var stale = {};        // "si:r:c" -> unknown function names (formulas that could not be worked out again after an edit)
	var sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }, editing = null;
	var undo = [], redo = [];
	var colX = [0], NR = 0, NC = 0, base = 1, HW = 44, FR = RH, FC = 0, FW = 0;
	var hits = [], hitSet = null, hitIx = -1;
	var O = window.MESXLO, dver = 0;   // dver: bumped on every edit (conditional formatting statistics and charts are recomputed)
	if (S.showHidden == null) S.showHidden = false;
	if (S.objs == null) S.objs = true;

	function ws() { return wb.Sheets[wb.SheetNames[si]]; }
	function data() { var w = ws(); if (!w["!data"]) w["!data"] = []; return w["!data"]; }
	function view() { var v = views[wb.SheetNames[si]]; return v && v.rows ? v : null; }
	function isSF(v) { v = v || view(); return !!(v && v.rows && (v.sort || (v.filters && v.filters.length))); }   // a sort / filter view (not just hidden rows left out)
	function getCell(r, c) { var row = data()[r]; return row ? row[c] : undefined; }
	function sx(w) { w = w || ws(); return w && w["!mesx"] || null; }        // what ooxml.js read for this sheet (styles, tables, charts...)
	function pkgOf() { return wb && wb["!mespkg"] || null; }
	// frozen rows / columns: chosen here, else the file's pane, else the "header row" setting
	// (an .xlsx we could read follows its own panes; other files get the "header row" setting)
	function frzOf(w) { w = w || ws(); if (w["!mesfrz"]) return w["!mesfrz"]; var x = sx(w); if (x) return x.pane ? { r: x.pane.r, c: x.pane.c } : { r: 0, c: 0 }; return { r: S.freeze ? 1 : 0, c: 0 }; }
	function setFrozen() { var f = frzOf(); base = Math.max(0, Math.min(f.r | 0, 30)); FC = Math.max(0, Math.min(f.c | 0, 30)); }
	function rowHid(r) { var m = ws()["!rows"]; return !!(m && m[r] && m[r].hidden); }
	function colHid(c) { var cs = ws()["!cols"], o = cs && cs[c]; return !!(o && o.hidden); }
	function hiddenCounts(w) { w = w || ws(); var m = w["!rows"] || [], nr = 0, nc = 0; for (var i = 0; i < m.length; i++) if (m[i] && m[i].hidden) nr++; (w["!cols"] || []).forEach(function (o) { if (o && o.hidden) nc++; }); return { r: nr, c: nc }; }
	function isDark() { return document.body.classList.contains("dark-mode"); }

	/* ---------- display text ---------- */
	function fmtNum(v, z) {
		if (z && z !== "General" && window.XLSX) { try { return window.XLSX.SSF.format(z, v); } catch (e) { /* fall through */ } }
		return X.fmtGeneral(v);
	}
	function disp(cell) {
		if (!cell) return "";
		if (cell.w != null) return cell.w;
		var t;
		switch (cell.t) {
			case "n": t = typeof cell.v === "number" ? fmtNum(cell.v, cell.z) : ""; break;
			case "b": t = cell.v ? "TRUE" : "FALSE"; break;
			case "e": t = X.ERRCODE[cell.v] || "#VALUE!"; break;
			case "s": case "str": t = cell.v == null ? "" : String(cell.v); break;
			case "d": t = cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v); break;
			default: t = "";
		}
		cell.w = t;
		return t;
	}
	function editText(cell) {
		if (!cell) return "";
		if (cell.f) return "=" + cell.f;
		if (cell.sp && wb) { var C = ensureCalc(), k = C.spilledBy[si + ":" + actualRow(sel.ar) + ":" + sel.ac], p = k && k.split(":"), an = p && C.getCell(+p[0], +p[1], +p[2]); if (an && an.f) return "=" + an.f; }
		if (cell.t === "n" && typeof cell.v === "number") {
			if (cell.z && /%/.test(cell.z) && !/"[^"]*%/.test(cell.z)) return X.fmtGeneral(+(cell.v * 100).toPrecision(15)) + "%";
			if (cell.z && /[dy]/i.test(cell.z.replace(/"[^"]*"/g, "")) && !/\[/.test(cell.z) && window.XLSX) { try { return window.XLSX.SSF.format("yyyy-mm-dd", cell.v) + (cell.v % 1 ? " " + window.XLSX.SSF.format("hh:mm:ss", cell.v) : ""); } catch (e) { /* ignore */ } }
			return String(cell.v);
		}
		if (cell.t === "s" && /^(=|'|[-+$(]?\d|TRUE$|FALSE$)/i.test(String(cell.v)) && X.parseInput(String(cell.v)).t !== "s") return "'" + cell.v;
		return disp(cell);
	}
	function fillOf(cell) {
		var s = cell && cell.s;
		if (!s || s.patternType !== "solid" || !s.fgColor || !s.fgColor.rgb) return "";
		var rgb = String(s.fgColor.rgb).slice(-6);
		return /^[0-9a-f]{6}$/i.test(rgb) && rgb.toUpperCase() !== "FFFFFF" ? "#" + rgb : "";
	}
	/* ---------- cell styles: the file's own formatting, Excel tables, conditional formatting ---------- */
	var cssCache = {};
	function xfLook(i) { var p = pkgOf(); var xf = p && i ? p.styles.xfs[i] : null; return xf && Object.keys(xf.look).length ? xf.look : null; }
	function cfCtx() {
		var d = data(), name = wb.SheetNames[si];
		var get = function (sheet, r, c) { var w = sheet && sheet !== name ? wb.Sheets[sheet] : ws(); if (!w) return null; var row = (w["!data"] || [])[r]; var v = X.cellValue(row ? row[c] : undefined); return v == null ? 0 : v; };
		return {
			value: function (r, c) { var row = d[r], v = X.cellValue(row ? row[c] : undefined); return X.isErr(v) ? null : v; },
			text: function (r, c) { var row = d[r]; return disp(row ? row[c] : undefined); },
			isErr: function (r, c) { var row = d[r], cl = row && row[c]; return !!(cl && cl.t === "e"); },
			stats: function (rule) { if (rule.__v !== dver) { rule.__v = dver; rule.__st = O.ruleStats(rule, this.value); } return rule.__st; },
			evalF: function (f, dr, dc) {
				if (f == null) return null;
				var src = O.shiftFormula(f, dr, dc), k = src;
				var c = this.__c || (this.__c = {}); if (k in c) return c[k];
				var out; try { out = X.calc(src, get, name); if (X.isErr(out)) out = null; } catch (e) { out = /^-?\d+(\.\d+)?$/.test(f) ? +f : String(f).replace(/^"|"$/g, ""); }
				return (c[k] = out);
			}
		};
	}
	var cfc = null, cfcV = -1, cfcS = -1;
	// -> {css: {css, fill, ha, wrap, va}, bar, fmtColor} | null for cell (ar, c)
	function styleAt(ar, c, cell) {
		var x = sx(), w = ws(), L = null, key = null, nt = w["!mestables"], mcf = w["!mescf"], cfs = null, ml = cell && cell.ml;
		if (x) {
			var xs = cell && cell.xs != null ? cell.xs : (x.rowXf[ar] != null ? x.rowXf[ar] : x.colXf[c]);
			L = xs ? xfLook(xs) : null; key = xs ? "x" + xs : "";
			for (var i = 0; i < x.tables.length; i++) { var t = x.tables[i]; if (t.els && ar >= t.g.s.r && ar <= t.g.e.r && c >= t.g.s.c && c <= t.g.e.c) { L = O.mergeLook(O.tableLook(t, ar, c, t.els), L); key = null; break; } }
			if (x.cf.length) cfs = x.cf;
		} else { var f = fillOf(cell); if (f) L = { fill: { c: f.slice(1) } }; key = f ? "f" + f : ""; }
		if (nt && nt.length) for (var j = 0; j < nt.length; j++) { var t2 = nt[j]; if (ar >= t2.g.s.r && ar <= t2.g.e.r && c >= t2.g.s.c && c <= t2.g.e.c) { L = O.mergeLook(O.tableLook(t2, ar, c, tableEls(t2)), L); key = null; break; } }
		if (ml) { L = withMl(L, ml); key = null; }
		if (mcf && mcf.length) cfs = cfs ? cfs.concat(mcf) : mcf;
		if (cfs && ar != null) {
			if (!cfc || cfcV !== dver || cfcS !== si) { cfc = cfCtx(); cfcV = dver; cfcS = si; }
			var res = O.cfFor(cfs, ar, c, cfc);
			if (res) { if (res.look) { L = O.mergeLook(L, res.look); key = null; } if (res.bar) { key = null; return { css: O.lookCss(L, isDark()), bar: res.bar }; } }
		}
		if (!L) return null;
		if (key) { var k2 = key + (isDark() ? "d" : ""); return cssCache[k2] || (cssCache[k2] = { css: O.lookCss(L, isDark()) }); }
		return { css: O.lookCss(L, isDark()) };
	}
	var FMTCOL = { red: "#d40000", blue: "#1f4fd8", green: "#0a8a2a", magenta: "#c0189c", cyan: "#0a8fa0", yellow: "#b38f00", white: "#ffffff", black: "#111111" };
	function fmtColor(cell) {
		if (!cell || cell.t !== "n" || !cell.z || cell.z.indexOf("[") < 0) return "";
		var secs = cell.z.replace(/"[^"]*"/g, "").split(";"), v = cell.v, s = secs.length > 1 && v < 0 ? secs[1] : secs.length > 2 && v === 0 ? secs[2] : secs[0];
		var m = /\[(Red|Blue|Green|Magenta|Cyan|Yellow|White|Black)\]/i.exec(s || "");
		return m ? FMTCOL[m[1].toLowerCase()] : "";
	}

	/* ---------- merged cells ---------- */
	function mergeInfo() {
		var w = ws(), list = w["!merges"];
		if (!list || !list.length) return null;
		if (w["!mesmerge"] && w["!mesmerge"].list === list && w["!mesmerge"].n === list.length) return w["!mesmerge"];
		var at = new Map(), cells = 0;
		list.forEach(function (g, i) { var n = (g.e.r - g.s.r + 1) * (g.e.c - g.s.c + 1); if (cells + n > 1e6) return; cells += n; for (var r = g.s.r; r <= g.e.r; r++) for (var c = g.s.c; c <= g.e.c; c++) at.set(r * 16384 + c, i); });
		return (w["!mesmerge"] = { list: list, n: list.length, at: at });
	}

	/* ---------- dimensions ---------- */
	function dims() {
		var d = data(), mc = 0;
		for (var r = 0; r < d.length; r++) if (d[r] && d[r].length > mc) { var row = d[r]; for (var c = row.length - 1; c >= mc; c--) if (row[c]) { mc = c + 1; break; } }
		var mr = d.length; while (mr > 0 && !(d[mr - 1] && d[mr - 1].some(Boolean))) mr--;
		nRows = mr; nCols = mc;
	}
	function setRef() {
		var w = ws(); w["!ref"] = nRows && nCols ? X.rangeA1({ s: { r: 0, c: 0 }, e: { r: nRows - 1, c: nCols - 1 } }) : "A1";
	}
	function colW(c) {
		var cs = ws()["!cols"], o = cs && cs[c];
		if (!o) return 88;
		if (o.hidden && !S.showHidden) return 0;
		if (o.width) return Math.max(8, Math.round(o.width * 7.2));
		if (o.wpx) return Math.max(8, Math.round(o.wpx));
		if (o.wch) return Math.max(8, Math.round(o.wch * 7 + 5));
		return 88;
	}
	// the column / row sizes Excel uses (for placing charts and pictures sized in EMUs)
	function xlColPx(c) { var cs = ws()["!cols"], o = cs && cs[c]; if (o && o.hidden) return 0; if (o && o.width) return Math.max(1, Math.round(o.width * 7)); if (o && o.wpx) return o.wpx * 64 / 88; return 64; }
	function xlRowPx(r) { var m = ws()["!rows"], o = m && m[r], x = sx(); if (o && o.hidden) return 0; if (o && o.hpx) return o.hpx; if (o && o.hpt) return o.hpt * 4 / 3; return (x ? x.defaultRowHeight : 15) * 4 / 3; }
	function layout() {
		if (!wb) return;
		setFrozen();
		var v = view();
		FR = base * RH;
		NR = v ? v.rows.length : Math.max(nRows + 60, 120) - base;
		NC = Math.max(nCols + 6, 26, FC + 6);
		colX = [0]; for (var c = 0; c < NC; c++) colX.push(colX[c] + colW(c));
		FW = colX[FC];
		var gw = grid.clientWidth || 900;
		if (FW > gw * 0.65) { FC = 0; FW = 0; }       // a frozen block wider than the screen (phones): scroll it instead
		var maxRow = v ? nRows : NR + base;
		HW = Math.max(40, 12 + 8 * String(maxRow).length);
		var sty = function (el, css) { for (var k in css) el.style[k] = typeof css[k] === "number" ? css[k] + "px" : css[k]; };
		sty($("xl-corner"), { width: HW, height: CHH });
		sty($("xl-colh"), { left: HW, height: CHH });
		sty($("xl-colhf"), { width: FW, height: CHH, display: FW ? "" : "none" });
		sty($("xl-frzh"), { top: CHH, width: HW, height: FR, display: base ? "" : "none" });
		sty($("xl-frzc"), { top: CHH, left: HW, width: FW, height: FR, display: base && FW ? "" : "none" });
		sty($("xl-frz"), { top: CHH, left: HW + FW, height: FR, display: base ? "" : "none" });
		sty($("xl-fcols"), { top: CHH + FR, left: HW, width: FW, display: FW ? "" : "none" });
		sty($("xl-rowh"), { top: CHH + FR, width: HW });
		sty(scroll, { top: CHH + FR, left: HW + FW });
		sty(sizer, { width: colX[NC] - FW + 40, height: Math.min(NR * RH, MAXH) + RH });
		toolState();
	}
	function actualRow(dr) { if (dr < 0) return dr + base; var v = view(); return v ? v.rows[dr] : dr + base; }
	function displayRow(ar) {
		if (ar < base) return ar - base;
		var v = view();
		if (v) { if (!v.inv) { v.inv = new Map(); v.rows.forEach(function (r, i) { v.inv.set(r, i); }); } return v.inv.has(ar) ? v.inv.get(ar) : null; }
		return ar - base;
	}
	// display row of an actual row, or of the next one showing (hidden rows): for merged cells and pictures
	function drNear(ar, last) { for (var r = ar; r <= Math.max(ar, last == null ? ar + 2000 : last); r++) { var d = displayRow(r); if (d != null) return d; } return null; }
	function colAt(x) { var lo = 0, hi = NC - 1; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (colX[m] <= x) lo = m; else hi = m - 1; } return lo; }
	function scrollInfo() {
		var vh = scroll.clientHeight, st = scroll.scrollTop, T = NR * RH, H = Math.min(T, MAXH);
		var P = (T > H && H > vh) ? st / (H + RH - vh) * (T + RH - vh) : st;
		return { vh: vh, vw: scroll.clientWidth, st: st, sl: scroll.scrollLeft, P: P, T: T, H: H };
	}

	/* ---------- render ---------- */
	var rq = 0;
	function render() { if (!rq) rq = requestAnimationFrame(function () { rq = 0; draw(); }); }
	function selRect() { return { r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr), c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc) }; }
	function cellHtml(cell, ar, c, left, top, width, height, extra) {
		var t = disp(cell), cls = "xl-c" + (extra || ""), st = "left:" + left + "px;top:" + top + "px;width:" + width + "px;height:" + height + "px;";
		if (cell) {
			if (cell.t === "n") cls += " n"; else if (cell.t === "b") cls += " b"; else if (cell.t === "e") cls += " e";
			if (cell.f && stale[si + ":" + ar + ":" + c]) cls += " stale";
		}
		var sa = styleAt(ar, c, cell);
		if (sa) {
			var L = sa.css;
			st += L.css;
			if (L.fill) cls += " f-fill";
			if (L.ha) cls += " ha";
			if (L.wrap) cls += " wrap";
			if (L.va && (height > RH || L.wrap)) cls += " va-" + L.va;
			if (sa.bar) { st += "background-image:linear-gradient(90deg,#" + sa.bar.color + "aa 0,#" + sa.bar.color + "33 " + sa.bar.pct.toFixed(1) + "%,transparent " + sa.bar.pct.toFixed(1) + "%);"; if (sa.bar.hideValue) t = ""; }
		}
		var fc = fmtColor(cell); if (fc) st += "color:" + fc + ";";
		var box = height > RH || (sa && sa.css.wrap);
		if (height > RH && !(sa && sa.css.wrap)) cls += " tall";
		if (hitSet && hitSet.has(ar + ":" + c)) cls += " hit";
		var tb = "";
		if (ar != null && ws()["!mestables"]) { var tt = tableAt(ar, c); if (tt && tt.header && tt.filterBtn !== false && ar === tt.g.s.r) { var vv = views[wb.SheetNames[si]], on = vv && vv.filters && vv.filters.some(function (f) { return f.c === c && f.t === tt.name; }); tb = '<button type="button" class="xl-tfb' + (on ? " is-on" : "") + '" data-tf="' + ar + ":" + c + '" aria-label="Sort and filter ' + esc(t) + '" tabindex="-1">' + (on ? "&#9660;&#8226;" : "&#9662;") + "</button>"; cls += " has-tfb"; } }
		return '<div class="' + cls + '" style="' + st + '">' + (box ? '<span class="xl-ct">' + esc(t) + "</span>" : esc(t)) + tb + "</div>";
	}
	// one quadrant of the grid. rows: [{dr, ar, y}], cols: [{c, x, w}], dom: {r0, r1 (display rows), c0, c1 (columns)} it may draw in,
	// yOf(dr) / xOf(c) give positions inside the quadrant's container
	function block(rows, cols, dom, yOf, xOf) {
		var h = [], d = data(), M = isSF() ? null : mergeInfo(), seen = {};
		if (!rows.length || !cols.length) return "";
		for (var i = 0; i < rows.length; i++) {
			var rw = rows[i], ar = rw.ar, row = ar == null ? null : d[ar], late = "";
			for (var k = 0; k < cols.length; k++) {
				var cc = cols[k], c = cc.c, cell = row ? row[c] : undefined, w = cc.w;
				if (M && ar != null) {
					var mi = M.at.get(ar * 16384 + c);
					if (mi != null) {
						if (seen[mi]) continue; seen[mi] = 1;
						var g = M.list[mi], ca = Math.max(g.s.c, dom.c0), cb = Math.min(g.e.c, dom.c1);
						var ra = drNear(Math.max(g.s.r, actualRow(dom.r0)), g.e.r), rb = null;
						for (var rr = g.e.r; rr >= g.s.r; rr--) { var dd = displayRow(rr); if (dd != null) { rb = dd; break; } }
						if (ra == null || rb == null) continue;
						ra = Math.max(ra, dom.r0); rb = Math.min(rb, dom.r1);
						var tl = row && ar === g.s.r && c === g.s.c ? cell : (d[g.s.r] || [])[g.s.c];
						var mw = colX[cb + 1] - colX[ca], d0 = displayRow(g.s.r);
						// a merge cut by the frozen line: only the part holding its top-left cell shows the text
						if (g.s.c < dom.c0 || d0 == null || d0 < dom.r0) tl = tl ? Object.assign({}, tl, { t: "z", w: "", v: null, f: null }) : { t: "z", xs: ((d[g.s.r] || [])[g.s.c] || {}).xs };
						if (mw > 0 && rb >= ra) h.push(cellHtml(tl, g.s.r, g.s.c, xOf(ca), yOf(ra), mw, (rb - ra + 1) * RH, " mg"));
						continue;
					}
				}
				// text runs on over empty cells to its right, like Excel
				if (cell && (cell.t === "s" || cell.t === "str")) {
					var tx = disp(cell), sa0 = styleAt(ar, c, cell), L0 = sa0 && sa0.css;
					if (tx.length * 7 > w && !(L0 && (L0.fill || L0.wrap || (L0.ha && L0.ha !== "left")))) {
						var c2 = c + 1, ww = w, kk = k + 1;
						while (kk < cols.length && cols[kk].c === c2 && ww < tx.length * 7.5 + 8 && ww < 2400 && !(row[c2] && disp(row[c2]) !== "") && !(M && M.at.has(ar * 16384 + c2))) { ww += cols[kk].w; c2++; kk++; }
						if (ww > w) { late += cellHtml(cell, ar, c, cc.x, rw.y, ww, RH, " ofl"); continue; }
					}
				}
				h.push(cellHtml(cell, ar, c, cc.x, rw.y, w, RH, ""));
			}
			h.push(late);
		}
		// selection inside this quadrant
		var R = selRect(), a = Math.max(R.r1, dom.r0, rows[0].dr - 1), b = Math.min(R.r2, dom.r1, rows[rows.length - 1].dr + 1);
		var c0 = Math.max(R.c1, dom.c0), c1 = Math.min(R.c2, dom.c1);
		var multi = R.r1 !== R.r2 || R.c1 !== R.c2;
		if (multi && b >= a && c1 >= c0) h.push('<div class="xl-selbox" style="left:' + xOf(c0) + "px;top:" + yOf(a) + "px;width:" + (colX[c1 + 1] - colX[c0]) + "px;height:" + ((b - a + 1) * RH) + 'px"></div>');
		if (sel.ar >= dom.r0 && sel.ar <= dom.r1 && sel.ac >= dom.c0 && sel.ac <= dom.c1 && sel.ar >= rows[0].dr - 1 && sel.ar <= rows[rows.length - 1].dr + 1) {
			var aw = colX[sel.ac + 1] - colX[sel.ac], ah = RH, ax = xOf(sel.ac), ay = yOf(sel.ar);
			var am = M && M.at.get(actualRow(sel.ar) * 16384 + sel.ac);
			if (am != null) { var gg = M.list[am]; ax = xOf(Math.max(gg.s.c, dom.c0)); aw = colX[Math.min(gg.e.c, dom.c1) + 1] - colX[Math.max(gg.s.c, dom.c0)]; var t0 = displayRow(gg.s.r), t1 = displayRow(gg.e.r); if (t0 != null && t1 != null) { ay = yOf(Math.max(t0, dom.r0)); ah = (Math.min(t1, dom.r1) - Math.max(t0, dom.r0) + 1) * RH; } }
			if (!(editing && editing.si !== si)) h.push('<div class="xl-act' + (editing && isFormulaText(edText()) ? " is-ed" : "") + '" style="left:' + ax + "px;top:" + ay + "px;width:" + aw + "px;height:" + ah + 'px"></div>');
		}
		h.push(spillBox(dom, yOf, xOf, rows), clipBox(dom, yOf, xOf, rows), refBoxes(dom, yOf, xOf, rows), fillPrevBox(dom, yOf, xOf, rows), fillHandle(dom, xOf, yOf, rows));
		return h.join("");
	}
	function draw() {
		if (!wb) return;
		var I = scrollInfo(), R = selRect();
		var r0 = Math.max(0, Math.floor(I.P / RH)), r1 = Math.min(NR - 1, Math.floor((I.P + I.vh) / RH));
		var c0 = Math.max(FC, colAt(I.sl + FW)), c1 = Math.min(NC - 1, colAt(I.sl + FW + I.vw));
		var srows = [], frows = [], scols = [], fcols = [], rh = [], hh = [], hf = [];
		for (var dr = r0; dr <= r1; dr++) srows.push({ dr: dr, ar: actualRow(dr), y: I.st + dr * RH - I.P });
		for (var fr = 0; fr < base; fr++) frows.push({ dr: fr - base, ar: fr, y: fr * RH });
		for (var c = c0; c <= c1; c++) { var w = colX[c + 1] - colX[c]; if (w) scols.push({ c: c, x: colX[c] - FW, w: w }); }
		for (var c3 = 0; c3 < FC; c3++) { var w3 = colX[c3 + 1] - colX[c3]; if (w3) fcols.push({ c: c3, x: colX[c3], w: w3 }); }
		var ySc = function (d) { return I.st + d * RH - I.P; }, yFz = function (d) { return (d + base) * RH; }, xSc = function (cc) { return colX[cc] - FW; }, xFz = function (cc) { return colX[cc]; };
		var domS = { r0: 0, r1: NR - 1, c0: FC, c1: NC - 1 }, domF = { r0: -base, r1: -1, c0: FC, c1: NC - 1 };
		cellsEl.innerHTML = block(srows, scols, domS, ySc, xSc);
		var v = views[wb.SheetNames[si]], hidShown = S.showHidden;
		var colHead = function (c2, out) {
			var w2 = colX[c2 + 1] - colX[c2]; if (!w2) return;
			var srt = v && v.sort && v.sort.c === c2 ? '<span class="xl-sorti">' + (v.sort.dir > 0 ? "▲" : "▼") + "</span>" : "";
			var flt = v && v.filters && v.filters.some(function (f) { return f.c === c2; }) ? '<span class="xl-sorti">▾</span>' : "";
			out.push('<div class="xl-ch' + (c2 >= R.c1 && c2 <= R.c2 ? " is-on" : "") + (hidShown && colHid(c2) ? " is-hid" : "") + '" data-c="' + c2 + '" style="left:' + colX[c2] + "px;width:" + w2 + "px;height:" + CHH + 'px">' + X.colName(c2) + srt + flt + '<span class="xl-rz" data-rz="' + c2 + '"></span></div>');
		};
		for (var c2 = c0; c2 <= c1; c2++) colHead(c2, hh);
		for (var c4 = 0; c4 < FC; c4++) colHead(c4, hf);
		var chIn = $("xl-colh-in"); chIn.innerHTML = hh.join(""); chIn.style.transform = "translateX(" + (-I.sl) + "px)";
		$("xl-colhf").innerHTML = hf.join("");
		srows.forEach(function (rw) { rh.push('<div class="xl-rh' + (rw.dr >= R.r1 && rw.dr <= R.r2 ? " is-on" : "") + (hidShown && rw.ar != null && rowHid(rw.ar) ? " is-hid" : "") + '" data-dr="' + rw.dr + '" style="top:' + (rw.dr * RH - I.P) + "px;width:" + HW + "px;height:" + RH + 'px">' + (rw.ar == null ? "" : rw.ar + 1) + "</div>"); });
		var rhIn = $("xl-rowh-in"); rhIn.innerHTML = rh.join(""); rhIn.style.transform = "";
		if (FW) {
			var fc = $("xl-fcols"); fc.style.height = I.vh + "px";
			$("xl-fcol-in").innerHTML = block(srows.map(function (rw) { return { dr: rw.dr, ar: rw.ar, y: rw.dr * RH - I.P }; }), fcols, { r0: 0, r1: NR - 1, c0: 0, c1: FC - 1 }, function (d) { return d * RH - I.P; }, xFz);
		}
		if (base) {
			var fIn = $("xl-frz-in"); fIn.innerHTML = block(frows, scols, domF, yFz, xSc); fIn.style.transform = "translateX(" + (-I.sl) + "px)";
			if (FW) $("xl-frzc").innerHTML = block(frows, fcols, { r0: -base, r1: -1, c0: 0, c1: FC - 1 }, yFz, xFz);
			$("xl-frzh").innerHTML = frows.map(function (rw) { return '<div class="xl-rh' + (rw.dr >= R.r1 && rw.dr <= R.r2 ? " is-on" : "") + '" data-dr="' + rw.dr + '" style="top:' + rw.y + "px;width:" + HW + "px;height:" + RH + 'px">' + (rw.ar + 1) + "</div>"; }).join("");
		}
		if (editing && editing.where === "cell") placeEditor();
	}

	/* ---------- charts and pictures (drawn into the scrolling area, redrawn only when something changes) ---------- */
	function yOfAr(ar) { if (ar < base) return (ar - base) * RH; var d = drNear(ar); return d == null ? null : d * RH; }
	// Excel position (column / row + offset in Excel pixels) -> our grid
	function gridX(c, off) { var x = c < colX.length ? colX[c] : colX[colX.length - 1], ex = xlColPx(c), ow = colX[c + 1] - colX[c]; return x + (ex ? Math.min(off, ex) / ex * ow : 0) - FW; }
	function gridY(r, off) { var y = yOfAr(r); if (y == null) return null; var ex = xlRowPx(r); return y + (ex ? Math.min(off, ex) / ex * RH : 0); }
	function walk(start, off, len, size, max) { var c = start, left = off + len; while (c < max && left > size(c)) { left -= size(c); c++; } return { c: c, off: left }; }
	function rectOf(a) {
		if (!a.from) { if (!a.pos || !a.ext) return null; var px = walk(0, 0, a.pos.x, xlColPx, NC + 200), py = walk(0, 0, a.pos.y, xlRowPx, nRows + 2000); a = { from: { c: px.c, co: px.off, r: py.c, ro: py.off }, ext: a.ext }; }
		var to = a.to;
		if (!to && a.ext) { var ec = walk(a.from.c, a.from.co, a.ext.w, xlColPx, a.from.c + 400), er = walk(a.from.r, a.from.ro, a.ext.h, xlRowPx, a.from.r + 4000); to = { c: ec.c, co: ec.off, r: er.c, ro: er.off }; }
		if (!to) return null;
		while (colX.length <= to.c + 1) colX.push(colX[colX.length - 1] + 88);
		var x1 = gridX(a.from.c, a.from.co), x2 = gridX(to.c, to.co), y1 = gridY(a.from.r, a.from.ro), y2 = gridY(to.r, to.ro);
		if (y1 == null || y2 == null) return null;
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
	}
	function readRef(ref, num, vis) {
		if (!ref) return [];
		var areas = ref.f ? O.parseRefs(ref.f) : [];
		if (!areas.length || !areas.every(function (a) { return wb.Sheets[a.sheet]; })) return (ref.cache || []).map(function (v) { if (v == null) return null; if (num) { var n = parseFloat(v); return isFinite(n) ? n : null; } return v; });
		var out = [];
		areas.forEach(function (a) {
			var w = wb.Sheets[a.sheet], d = w["!data"] || [], rows = w["!rows"] || [], cs = w["!cols"] || [], g = a.g;
			for (var r = g.s.r; r <= Math.min(g.e.r, g.s.r + 20000); r++) {
				if (vis && rows[r] && rows[r].hidden && g.e.r > g.s.r) continue;
				for (var c = g.s.c; c <= Math.min(g.e.c, g.s.c + 2000); c++) {
					if (vis && cs[c] && cs[c].hidden && g.e.c > g.s.c) continue;
					var cell = (d[r] || [])[c];
					if (num) { var v = X.cellValue(cell); out.push(typeof v === "number" ? v : null); }
					else out.push(cell ? disp(cell) : "");
				}
			}
		});
		return out;
	}
	function chartModel(ch) {
		var p0 = pkgOf(), theme = p0 ? p0.theme : null, n = 0, total = 0;
		ch.plots.forEach(function (p) { total += p.series.length; });
		var plots = ch.plots.map(function (p) {
			return Object.assign({}, p, { series: p.series.map(function (s, k) {
				var vals = readRef(s.val, true, ch.visOnly), cats = s.cat ? readRef(s.cat, false, ch.visOnly) : [], xs = p.type === "scatter" && s.x ? readRef(s.x, true, ch.visOnly) : null;
				if (p.type === "scatter" && s.x && !xs.some(function (v) { return v != null; })) xs = null;
				var name = s.name ? (readRef(s.name, false, false).filter(function (t) { return t !== ""; }).join(" ") || "Series " + (n + 1)) : "Series " + (n + 1);
				var lineish = p.type === "line" || p.type === "scatter" || p.type === "radar";
				var col = (lineish ? s.look.line || s.look.fill : s.look.fill || s.look.line) || O.seriesColor(s.idx != null ? s.idx : n, theme);
				var pts = [];
				if (p.vary || p.type === "pie" || p.type === "doughnut") for (var i = 0; i < vals.length; i++) pts[i] = O.seriesColor(i, theme);
				s.pts.forEach(function (d) { if (d.look.fill) pts[d.idx] = d.look.fill; });
				if (p.type !== "pie" && p.type !== "doughnut" && !p.vary) pts = pts.length ? pts : null;
				n++;
				return { name: name, values: vals, cats: cats.length ? cats : null, xs: xs, color: col, ptColors: pts, fmt: s.val && s.val.fmt, marker: s.marker, markerFill: s.markerFill, noLine: s.look.noLine, lw: s.look.lw, labels: s.labels };
			}) });
		});
		var title = ch.title;
		if (ch.titleRef) title = readRef(ch.titleRef, false, false).join(" ") || title;
		if (title == null && !ch.autoDel && total === 1) title = plots[0].series[0].name;
		return { title: title || null, plots: plots };
	}
	function fmtVal(v, code) { if (typeof v !== "number") return v == null ? "" : String(v); if (code && code !== "General" && window.XLSX) { try { return window.XLSX.SSF.format(code, v); } catch (e) { /* ignore */ } } return X.fmtGeneral(+v.toPrecision(10)); }
	function objUrl(o) { if (!o.url) { try { o.url = URL.createObjectURL(new Blob([o.bytes], { type: o.mime })); } catch (e) { o.url = ""; } } return o.url; }
	var objT = 0;
	function drawObjects(now) {
		if (!now) { clearTimeout(objT); objT = setTimeout(function () { drawObjects(true); }, 60); return; }
		var box = $("xl-objs"); if (!box) return;
		var x = wb && sx();
		var mine = ws()["!mescharts"];
		if ((!x || !x.objects.length) && !(mine && mine.length) || !S.objs || isSF() || NR * RH > MAXH) { box.innerHTML = ""; return; }
		var html = [], dark = isDark();
		(x ? x.objects : []).forEach(function (o, i) {
			if (o.hidden) return;
			var r = rectOf(o.anchor); if (!r || r.w < 6 || r.h < 6) return;
			var pos = "left:" + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + "px";
			if (o.type === "pic") { var u = objUrl(o); if (u) html.push('<img class="xl-obj xl-pic" alt="' + esc(o.name || "Picture") + '" src="' + u + '" style="' + pos + '" draggable="false">'); return; }
			var svg = "";
			try { svg = O.chartSvg(o.chart, chartModel(o.chart), { w: Math.round(r.w), h: Math.round(r.h), dark: dark, fmt: fmtVal }); } catch (e) { svg = ""; if (window.console) console.warn("[excel] chart", e); }
			if (svg) html.push('<div class="xl-obj xl-chart" data-oi="' + i + '" role="img" aria-label="' + esc((o.name || "Chart") + (o.chart.title ? ": " + o.chart.title : "")) + '" style="' + pos + '">' + svg + "</div>");
		});
		drawMyCharts(html, dark);
		box.innerHTML = html.join("");
	}
	// toolbar buttons that depend on the sheet (hidden rows / columns, charts, freeze)
	function toolState() {
		if (!wb) return;
		var hc = hiddenCounts(), hb = $("xl-hid"), ob = $("xl-objbtn"), x = sx(), f = frzOf();
		hb.hidden = !(hc.r || hc.c);
		hb.setAttribute("aria-pressed", String(!!S.showHidden));
		$("xl-hidn").textContent = (hc.r ? hc.r + " row" + (hc.r > 1 ? "s" : "") : "") + (hc.r && hc.c ? ", " : "") + (hc.c ? hc.c + " col" + (hc.c > 1 ? "s" : "") : "");
		hb.title = (S.showHidden ? "Showing" : "Show") + " the hidden rows and columns of this sheet (they stay hidden in the file)";
		ob.hidden = !((x && x.objects.length) || (ws()["!mescharts"] || []).length);
		ob.setAttribute("aria-pressed", String(!!S.objs));
		grid.classList.toggle("xl-nogrid", !!(x && x.view && x.view.showGridLines === false));
		var hd = $("xl-hdr"); hd.setAttribute("aria-pressed", String(!!(f.r || f.c)));
		$("xl-frzl").textContent = f.r || f.c ? "Frozen" + (f.r ? " " + f.r + "R" : "") + (f.c ? " " + f.c + "C" : "") : "Freeze";
		var fb = $("xl-frzfile"); if (fb) { fb.hidden = !(x && x.pane); if (x && x.pane) fb.querySelector("small").textContent = (x.pane.r ? x.pane.r + " row" + (x.pane.r > 1 ? "s" : "") : "") + (x.pane.r && x.pane.c ? " and " : "") + (x.pane.c ? x.pane.c + " column" + (x.pane.c > 1 ? "s" : "") : "") + ", as saved in the file"; }
	}

	/* ---------- selection ---------- */
	function minRow() { return -base; }
	function clampSel() {
		var lo = minRow();
		sel.ar = Math.max(lo, Math.min(NR - 1, sel.ar)); sel.fr = Math.max(lo, Math.min(NR - 1, sel.fr));
		sel.ac = Math.max(0, Math.min(NC - 1, sel.ac)); sel.fc = Math.max(0, Math.min(NC - 1, sel.fc));
	}
	function select(dr, c, extend, keepMode) {
		if (extend) { sel.fr = dr; sel.fc = c; }
		else { sel.ar = sel.fr = dr; sel.ac = sel.fc = c; }
		if (!keepMode) sel.mode = "";
		clampSel();
		reveal(sel.fr, sel.fc);
		showActive();
		render();
	}
	function reveal(dr, c) {
		var I = scrollInfo();
		if (dr >= 0) {
			var y = dr * RH, P = I.P;
			if (y < P) P = y; else if (y + RH > P + I.vh) P = y + RH - I.vh;
			if (P !== I.P) scroll.scrollTop = (I.T > I.H && I.H > I.vh) ? P * (I.H + RH - I.vh) / (I.T + RH - I.vh) : P;
		}
		if (c < FC) return;
		var x = colX[c] - FW, w = colX[c + 1] - colX[c];
		if (x < I.sl) scroll.scrollLeft = x; else if (x + w > I.sl + I.vw) scroll.scrollLeft = Math.min(x, x + w - I.vw);
	}
	function showActive() {
		if (!wb) return;
		var ar = actualRow(sel.ar), cell = getCell(ar, sel.ac), R = selRect();
		nameBox.value = R.r1 === R.r2 && R.c1 === R.c2 ? X.a1(ar, sel.ac) : X.a1(actualRow(R.r1), R.c1) + ":" + X.a1(actualRow(R.r2), R.c2);
		if (!editing) fxin.value = editText(cell);
		fxin.classList.toggle("is-ghost", !!(cell && cell.sp && !editing));
		status(); fmtState();
	}
	function selectedActualRows() { var R = selRect(), out = []; for (var r = R.r1; r <= R.r2; r++) out.push(actualRow(r)); return out; }

	/* ---------- status bar ---------- */
	function status() {
		if (!wb) { $("xl-status").innerHTML = ""; return; }
		var parts = [], v = view(), R = selRect();
		parts.push("<span><b>" + esc(wb.SheetNames[si]) + "</b> &middot; " + nf(nRows) + " rows &times; " + nf(nCols) + " columns</span>");
		if (isSF(v)) parts.push("<span>Showing <b>" + nf(v.dataN != null ? v.dataN : v.rows.length) + "</b> of " + nf(Math.max(0, nRows - base)) + " rows (sorted / filtered view)</span>");
		var hc = hiddenCounts(), fz = frzOf();
		if (hc.r || hc.c) parts.push("<span>" + (hc.r ? nf(hc.r) + " hidden row" + (hc.r > 1 ? "s" : "") : "") + (hc.r && hc.c ? ", " : "") + (hc.c ? nf(hc.c) + " hidden column" + (hc.c > 1 ? "s" : "") : "") + (S.showHidden ? " (shown, striped headers)" : " (not shown)") + "</span>");
		if (base || FC) parts.push("<span>Frozen: " + (base ? base + " row" + (base > 1 ? "s" : "") : "") + (base && FC ? " and " : "") + (FC ? FC + " column" + (FC > 1 ? "s" : "") : "") + "</span>");
		var x0 = sx(), ar0 = actualRow(sel.ar);
		if (x0) x0.tables.forEach(function (t) { if (ar0 >= t.g.s.r && ar0 <= t.g.e.r && sel.ac >= t.g.s.c && sel.ac <= t.g.e.c) parts.push("<span>Table <b>" + esc(t.name) + "</b> (" + esc(t.ref) + (t.style ? ", " + esc(t.style.replace(/^TableStyle/, "")) : "") + ")</span>"); });
		var cnt = (R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1);
		if (cnt > 1 && cnt <= 400000) {
			var sum = 0, n = 0, filled = 0, c2 = Math.min(R.c2, nCols - 1);
			for (var r = Math.max(R.r1, minRow()); r <= R.r2; r++) {
				var ar = actualRow(r); if (ar == null || ar >= nRows) { if (!view()) break; continue; }
				var row = data()[ar]; if (!row) continue;
				for (var c = R.c1; c <= c2; c++) { var cell = row[c]; if (!cell || cell.t === "z") continue; filled++; if (cell.t === "n" && typeof cell.v === "number") { sum += cell.v; n++; } }
			}
			if (n) parts.push("<span>Sum <b>" + esc(X.fmtGeneral(+sum.toPrecision(15))) + "</b> &middot; Average <b>" + esc(X.fmtGeneral(+(sum / n).toPrecision(15))) + "</b> &middot; Count <b>" + nf(filled) + "</b></span>");
			else if (filled) parts.push("<span>Count <b>" + nf(filled) + "</b></span>");
		}
		var cell1 = getCell(actualRow(sel.ar), sel.ac);
		if (cell1 && cell1.f) {
			var unk = []; try { unk = X.unknownFunctions(X.parse(cell1.f)); } catch (e) { unk = ["?"]; }
			if (unk.length) parts.push('<span class="xl-warn">' + (unk[0] === "?" ? "This formula can't be read here" : "Uses " + esc(unk.join(", ")) + ", which this page can't calculate") + ": showing the value saved in the file.</span>");
		}
		var ns = Object.keys(stale).length;
		if (ns) parts.push('<span class="xl-warn">' + nf(ns) + " formula" + (ns > 1 ? "s were" : " was") + " not recalculated (marked with a corner)</span>");
		$("xl-status").innerHTML = parts.join("");
	}

	/* ---------- editing ---------- */
	function placeEditor() {
		var I = scrollInfo(), dr = editing.dr, c = editing.c;
		ed.style.visibility = editing.si != null && editing.si !== si ? "hidden" : "";
		var top = dr < 0 ? CHH + (dr + base) * RH : CHH + FR + dr * RH - I.P, left = c < FC ? HW + colX[c] : HW + colX[c] - I.sl;
		ed.style.left = left + "px"; ed.style.top = top + "px";
		ed.style.minWidth = (colX[c + 1] - colX[c] + 1) + "px"; ed.style.height = "auto";
		ed.style.width = "1px"; ed.style.width = Math.min(grid.clientWidth - left - 4, Math.max(colX[c + 1] - colX[c] + 1, ed.scrollWidth + 6)) + "px";
		ed.style.height = Math.max(RH + 1, ed.scrollHeight + 2) + "px";
		paintEdHL();
	}
	function startEdit(text, where) {
		if (!wb) return;
		if (editing) commitEdit();
		var ar = actualRow(sel.ar), cell = getCell(ar, sel.ac);
		editing = { dr: sel.ar, c: sel.ac, ar: ar, si: si, where: where || "cell", orig: cell && cell.sp ? "" : editText(cell), mode: text != null ? "enter" : "edit", pick: null };
		if (editing.where === "cell") {
			ed.hidden = false; ed.value = text != null ? text : (cell && cell.sp ? "" : editing.orig);
			placeEditor(); ed.focus(); var n = ed.value.length; ed.setSelectionRange(n, n);
			fxin.value = ed.value;
		}
		refHL(); status();
	}
	function cancelEdit() { if (!editing) return; backToEditSheet(); var w = editing.where; editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); fxin.value = editText(getCell(actualRow(sel.ar), sel.ac)); if (w === "cell") scroll.focus({ preventScroll: true }); note(""); render(); status(); }
	function commitEdit() {
		if (!editing) return true;
		var e = editing, val = e.where === "cell" ? ed.value : fxin.value;
		if (isFormulaText(val)) val = autoClose(val);
		backToEditSheet();
		if (val === e.orig) { editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); render(); return true; }
		try { setCells([{ r: e.ar, c: e.c, text: val }], "Edit " + X.a1(e.ar, e.c)); }
		catch (err) { note(esc(err.message || "That formula can't be read."), true); if (e.where === "cell") ed.focus(); else fxin.focus(); return false; }
		editing = null; ed.hidden = true; hlRefs = []; paintEdHL(); note(""); render();
		return true;
	}
	function buildCell(text, old) {
		var p = X.parseInput(text), cell;
		if (p.f != null) {
			var ast;
			try { ast = X.parse(p.f); } catch (e) { throw new Error("That formula can't be read: " + e.message + " (start with an apostrophe, like '=, to type it as text)"); }
			var unk = X.unknownFunctions(ast);
			cell = unk.length ? { t: "e", v: 29, w: "#NAME?", f: p.f, da: 1 } : { t: "n", v: 0, f: p.f, da: 1 };
			if (old && old.z) cell.z = old.z;
		} else if (p.t === "z") {
			if (old && (old.s || old.xs != null || old.ml || old.z)) { var stub = { t: "z" }; if (old.s) stub.s = old.s; if (old.ml) stub.ml = old.ml; if (old.z) stub.z = old.z; if (old.xs != null) { stub.xs = old.xs; stub.xz = old.xz; } return stub; }
			return undefined;
		} else {
			cell = { t: p.t, v: p.v };
			if (p.z) cell.z = p.z;
			if (p.z && /%/.test(p.z) && old && old.z && /%/.test(old.z)) cell.z = old.z;   // "50%" typed into a 0.0% cell keeps 0.0%
			else if (p.t === "n" && old && old.z && old.t === "n") cell.z = old.z;
		}
		if (old && old.s) cell.s = old.s;
		if (old && old.ml) cell.ml = old.ml;
		if (old && old.xs != null) { cell.xs = old.xs; cell.xz = old.xz; if (!cell.z && old.xz && old.t === "z" && p.t === "n") cell.z = old.xz; }
		return cell;
	}
	function ensureCalc() {
		if (!calc) calc = new X.Calc({ sheets: wb.SheetNames.map(function (n) { return { name: n, get data() { var w = wb.Sheets[n]; if (!w["!data"]) w["!data"] = []; return w["!data"]; } }; }), names: bookNames, tables: calcTables });
		return calc;
	}
	function resetCalc() { calc = null; }
	function writeCells(s, list, which) {
		var w = wb.Sheets[wb.SheetNames[s]], d = w["!data"] || (w["!data"] = []), C = ensureCalc(), changed = [];
		list.forEach(function (x) {
			var cell = x[which];
			if (!d[x.r]) d[x.r] = [];
			d[x.r][x.c] = cell;
			if (cell && cell.f) C.add(s, x.r, x.c, cell.f); else C.remove(s, x.r, x.c);
			delete stale[s + ":" + x.r + ":" + x.c];
			changed.push({ si: s, r: x.r, c: x.c });
		});
		var res = C.recalc(changed);
		res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; });
		if (res.cycles) { var cc = res.cycleCells[0]; note("Circular reference: a formula refers to its own cell" + (cc ? " (" + esc((cc.si !== s ? wb.SheetNames[cc.si] + "!" : "") + X.a1(cc.r, cc.c)) + ")" : "") + ", directly or through other cells, so it shows #CYCLE!.", true); }
		return res;
	}
	function setCells(list, label) {
		var s = si, ch = [];
		list.forEach(function (x) { var b = getCell(x.r, x.c); var a = buildCell(x.text, b); if (!b && !a) return; ch.push({ r: x.r, c: x.c, b: b, a: a }); });
		if (!ch.length) return;
		var res = writeCells(s, ch, "a");
		pushUndo({ k: "cells", si: s, ch: ch, label: label });
		afterChange(ch.some(function (x) { return x.r >= nRows || x.c >= nCols; }) || ch.some(function (x) { return !x.a; }) || !!(res && res.spilled.length));
	}
	function afterChange(redim) {
		if (redim) { var r0 = NR, c0 = NC; dims(); setRef(); layout(); if (NR !== r0 || NC !== c0) clampSel(); }
		dver++; file.dirty = true; file.saved = false; renderName(); showActive(); render(); drawObjects(); autosave();
		if (hits.length || $("xl-q").value) runFind(true);
	}
	function pushUndo(op) { undo.push(op); if (undo.length > 200) undo.shift(); var structs = undo.filter(function (o) { return o.k === "struct"; }); if (structs.length > 12) undo.splice(undo.indexOf(structs[0]), 1); redo = []; undoBtns(); }
	function undoBtns() { $("xl-undo").disabled = !undo.length; $("xl-redo").disabled = !redo.length; $("xl-undo").title = undo.length ? "Undo " + (undo[undo.length - 1].label || "") + " (Ctrl+Z)" : "Undo (Ctrl+Z)"; }
	function doUndo(isRedo) {
		if (editing) cancelEdit();
		var from = isRedo ? redo : undo, to = isRedo ? undo : redo, op = from.pop();
		if (!op) return;
		if (op.k === "cells") {
			if (op.si !== si) showSheet(op.si);
			if (op.nocalc) { var d0 = wb.Sheets[wb.SheetNames[op.si]]["!data"]; op.ch.forEach(function (x) { if (!d0[x.r]) d0[x.r] = []; d0[x.r][x.c] = isRedo ? x.a : x.b; }); cssCache = {}; }
			else writeCells(op.si, op.ch, isRedo ? "a" : "b");
			var f = op.ch[0], dr = displayRow(f.r);
			if (dr != null) { sel.ar = sel.fr = dr; sel.ac = sel.fc = f.c; }
		} else if (op.k === "struct") {
			restore(isRedo ? op.after : op.before);
			if (op.si != null && op.si < wb.SheetNames.length) si = op.si;
			afterStruct();
		}
		to.push(op); undoBtns();
		afterChange(true);
		toast((isRedo ? "Redo: " : "Undo: ") + (op.label || "change"));
	}

	/* ---------- structural changes (rows, columns, sheets) ---------- */
	function snapshot() {
		var snap = { names: wb.SheetNames.slice(), wbs: wb.Workbook && wb.Workbook.Sheets ? JSON.parse(JSON.stringify(wb.Workbook.Sheets)) : null, sheets: {} };
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n];
			snap.sheets[n] = { ws: w, data: (w["!data"] || []).map(function (r) { return r && r.slice(); }), cols: w["!cols"] ? w["!cols"].map(function (o) { return o && Object.assign({}, o); }) : null, ref: w["!ref"],
				rows: w["!rows"] ? w["!rows"].slice() : null, merges: w["!merges"] ? w["!merges"].map(function (g) { return { s: Object.assign({}, g.s), e: Object.assign({}, g.e) }; }) : null,
				mine: JSON.stringify({ t: (w["!mestables"] || []).map(function (t) { var o = Object.assign({}, t); delete o.els; return o; }), c: (w["!mescharts"] || []).map(function (c) { return { id: c.id, m: c.m, range: c.range, byRow: c.byRow, at: c.at, name: c.name }; }), f: w["!mescf"] || [] }) };
		});
		return snap;
	}
	function restore(snap) {
		wb.SheetNames = snap.names.slice(); wb.Sheets = {};
		if (snap.wbs && wb.Workbook) wb.Workbook.Sheets = JSON.parse(JSON.stringify(snap.wbs));
		snap.names.forEach(function (n) {
			var s = snap.sheets[n], w = s.ws;
			w["!data"] = s.data.map(function (r) { return r && r.slice(); });
			if (s.cols) w["!cols"] = s.cols.map(function (o) { return o && Object.assign({}, o); }); else delete w["!cols"];
			if (s.rows) w["!rows"] = s.rows.slice(); else delete w["!rows"];
			if (s.merges) w["!merges"] = s.merges.map(function (g) { return { s: Object.assign({}, g.s), e: Object.assign({}, g.e) }; }); else delete w["!merges"];
			w["!ref"] = s.ref; wb.Sheets[n] = w;
			var mine = JSON.parse(s.mine || "{}"); w["!mestables"] = mine.t || []; w["!mescharts"] = (mine.c || []).map(function (c) { chartBuild(c); return c; }); w["!mescf"] = mine.f || [];
		});
		stale = {}; cssCache = {}; cfc = null;
	}
	function afterStruct() { resetCalc(); views = {}; si = Math.min(si, wb.SheetNames.length - 1); dims(); layout(); ensureView(); renderSheets(); clampSel(); }
	function struct(label, fn, soft) {
		if (editing) commitEdit();
		var hadView = isSF();
		if (view()) { views[wb.SheetNames[si]] = null; layout(); }
		if (file && !soft) file.structN = (file.structN || 0) + 1;
		var before = snapshot(), s0 = si;
		var changedF = fn(); stale = {};
		var after = snapshot();
		resetCalc();
		if (changedF && changedF.length) { var C = ensureCalc(), res = C.recalc(changedF); res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; }); }
		pushUndo({ k: "struct", before: before, after: after, si: s0, label: label });
		afterStruct();
		afterChange(true);
		if (hadView) note("The sort / filter view was cleared before changing rows or columns.");
	}
	function adjustAll(op) {
		var changed = [];
		wb.SheetNames.forEach(function (n, s) {
			var d = wb.Sheets[n]["!data"] || [];
			for (var r = 0; r < d.length; r++) {
				var row = d[r]; if (!row) continue;
				for (var c = 0; c < row.length; c++) {
					var cell = row[c]; if (!cell || !cell.f) continue;
					var f2 = X.adjust(cell.f, { axis: op.axis, at: op.at, n: op.n, sheet: op.sheet, here: n });
					if (f2 !== cell.f) { var nc = Object.assign({}, cell, { f: f2 }); delete nc.w; row[c] = nc; changed.push({ s: s, r: r, c: c }); }
				}
			}
		});
		return changed;
	}
	function finalPositions(changed) { return changed.map(function (p) { return { si: p.s, r: p.r, c: p.c }; }); }
	function insertRows(at, n) {
		struct((n > 0 ? "Insert " : "Delete ") + Math.abs(n) + " row" + (Math.abs(n) > 1 ? "s" : ""), function () {
			var d = data(), name = wb.SheetNames[si];
			if (n > 0) { while (d.length < at) d.push(undefined); var add = []; for (var i = 0; i < n; i++) add.push(undefined); Array.prototype.splice.apply(d, [at, 0].concat(add)); }
			else d.splice(at, -n);
			var rm = ws()["!rows"]; if (rm && rm.length > at) { if (n > 0) Array.prototype.splice.apply(rm, [at, 0].concat(new Array(n))); else rm.splice(at, -n); }
			shiftMerges("r", at, n); shiftObjects("r", at, n, name);
			return finalPositions(adjustAll({ axis: "r", at: at, n: n, sheet: name }));
		});
	}
	function insertCols(at, n) {
		struct((n > 0 ? "Insert " : "Delete ") + Math.abs(n) + " column" + (Math.abs(n) > 1 ? "s" : ""), function () {
			var d = data(), name = wb.SheetNames[si], w = ws();
			var spl = function (arr) { if (!arr) return; if (n > 0) { if (arr.length < at) return; var add = []; for (var i = 0; i < n; i++) add.push(undefined); Array.prototype.splice.apply(arr, [at, 0].concat(add)); } else arr.splice(at, -n); };
			d.forEach(function (row, i) { if (row) spl(row); });
			if (w["!cols"]) spl(w["!cols"]);
			shiftMerges("c", at, n); shiftObjects("c", at, n, name);
			return finalPositions(adjustAll({ axis: "c", at: at, n: n, sheet: name }));
		});
	}
	function shiftMerges(axis, at, n) {
		var w = ws(), list = w["!merges"]; if (!list || !list.length) return;
		var k = axis, out = [];
		list.forEach(function (g0) {
			var g = { s: Object.assign({}, g0.s), e: Object.assign({}, g0.e) };
			if (n > 0) { if (g.s[k] >= at) g.s[k] += n; if (g.e[k] >= at) g.e[k] += n; }
			else { var a = at, b = at - n - 1; if (g.e[k] < a) { /* above */ } else if (g.s[k] > b) { g.s[k] += n; g.e[k] += n; } else { var s2 = g.s[k] < a ? g.s[k] : a, e2 = g.e[k] > b ? g.e[k] + n : a - 1; if (e2 < s2) return; g.s[k] = s2; g.e[k] = e2; } }
			if (g.e.r > g.s.r || g.e.c > g.s.c) out.push(g);
		});
		w["!merges"] = out;
	}
	function rowsCols(kind) {
		if (!wb) return;
		var R = selRect(), rows = selectedActualRows().filter(function (r) { return r != null; });
		var rmin = Math.min.apply(null, rows), rmax = Math.max.apply(null, rows);
		if (isSF()) { rmin = actualRow(Math.max(R.r1, minRow())); rmax = rmin; }
		var nrSel = rmax - rmin + 1, ncSel = R.c2 - R.c1 + 1;
		if (sel.mode === "all") { nrSel = Math.max(1, nRows); ncSel = Math.max(1, nCols); }
		if (kind === "row-above") insertRows(rmin, sel.mode === "row" ? nrSel : 1);
		else if (kind === "row-below") insertRows(rmax + 1, sel.mode === "row" ? nrSel : 1);
		else if (kind === "row-del") { if (nrSel > 1000 && !confirm("Delete " + nf(nrSel) + " rows?")) return; insertRows(rmin, -Math.min(nrSel, Math.max(1, nRows - rmin))); }
		else if (kind === "col-left") insertCols(R.c1, sel.mode === "col" ? ncSel : 1);
		else if (kind === "col-right") insertCols(R.c2 + 1, sel.mode === "col" ? ncSel : 1);
		else if (kind === "col-del") insertCols(R.c1, -ncSel);
		else if (kind === "sheet-add") addSheet();
		else if (kind === "sheet-ren") renameSheet(si);
		else if (kind === "sheet-del") deleteSheet(si);
	}
	function addSheet() {
		var name = X.safeSheetName("Sheet" + (wb.SheetNames.length + 1), wb.SheetNames);
		struct("Add sheet", function () { window.XLSX.utils.book_append_sheet(wb, { "!data": [], "!ref": "A1" }, name); si = wb.SheetNames.length - 1; return []; });
		si = wb.SheetNames.length - 1; showSheet(si);
	}
	function renameSheet(i) {
		var old = wb.SheetNames[i], nn = prompt("New name for the sheet “" + old + "”:", old);
		if (nn == null) return;
		nn = X.safeSheetName(nn, wb.SheetNames.filter(function (x, j) { return j !== i; }));
		if (nn === old) return;
		struct("Rename sheet", function () {
			var changed = [];
			wb.SheetNames[i] = nn; wb.Sheets[nn] = wb.Sheets[old]; delete wb.Sheets[old];
			if (wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]) wb.Workbook.Sheets[i].name = nn;
			wb.SheetNames.forEach(function (n, s) { var d = wb.Sheets[n]["!data"] || []; d.forEach(function (row, r) { if (row) row.forEach(function (cell, c) { if (cell && cell.f) { var f2 = X.renameSheetRefs(cell.f, old, nn); if (f2 !== cell.f) { row[c] = Object.assign({}, cell, { f: f2 }); changed.push({ si: s, r: r, c: c }); } } }); }); });
			wb.SheetNames.forEach(function (n) { (wb.Sheets[n]["!mescharts"] || []).forEach(function (ch) { if (ch.m.sheet === old) ch.m.sheet = nn; ch.m.series.forEach(function (sr) { ["name", "cat", "val"].forEach(function (k) { if (sr[k] && sr[k].sheet === old) sr[k].sheet = nn; }); }); chartBuild(ch); }); });
			return [];
		});
	}
	function deleteSheet(i) {
		if (wb.SheetNames.length < 2) { toast("A workbook needs at least one sheet."); return; }
		if (!confirm("Delete the sheet “" + wb.SheetNames[i] + "”? (Undo brings it back.)")) return;
		struct("Delete sheet", function () {
			var n = wb.SheetNames[i]; wb.SheetNames.splice(i, 1); delete wb.Sheets[n];
			if (wb.Workbook && wb.Workbook.Sheets) wb.Workbook.Sheets.splice(i, 1);
			si = Math.max(0, i - 1);
			var all = []; wb.SheetNames.forEach(function (nm, s) { (wb.Sheets[nm]["!data"] || []).forEach(function (row, r) { if (row) row.forEach(function (cell, c) { if (cell && cell.f && cell.f.indexOf(n) >= 0) all.push({ si: s, r: r, c: c }); }); }); });
			return all;
		});
	}

	/* ---------- sheets ---------- */
	function renderSheets() {
		var hidden = function (i) { var s = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return s && s.Hidden; };
		$("xl-stabs").innerHTML = wb.SheetNames.map(function (n, i) {
			var h = hidden(i), x = sx(wb.Sheets[n]), tc = x && x.tabColor;
			var lab = h === 2 ? "very hidden" : h ? "hidden" : "";
			return '<button type="button" class="xl-stab' + (i === si ? " is-on" : "") + (h ? " is-hid" : "") + '" role="tab" aria-selected="' + (i === si) + '" data-si="' + i + '" title="' + esc(n) + (h === 2 ? " (very hidden: Excel only shows it through VBA)" : h ? " (hidden in Excel: right-click a tab and choose Unhide there)" : "") + ' (double-click to rename)"' + (tc ? ' style="box-shadow:inset 0 -3px 0 #' + tc + '"' : "") + ">" + (h ? '<span class="xl-eye" aria-hidden="true">&#9680;</span> ' : "") + esc(n) + (lab ? ' <small class="xl-hidl">(' + lab + ")</small>" : "") + "</button>";
		}).join("");
	}
	function showSheet(i, keepEdit) {
		if (editing && !keepEdit) commitEdit();
		if (wb.SheetNames[si]) views["@" + wb.SheetNames[si]] = { st: scroll.scrollTop, sl: scroll.scrollLeft, sel: Object.assign({}, sel) };
		si = i; hits = []; hitSet = null; hitIx = -1; $("xl-qn").textContent = "";
		dims(); layout(); renderSheets();
		var back = views["@" + wb.SheetNames[si]];
		if (back) { sel = back.sel; scroll.scrollTop = back.st; scroll.scrollLeft = back.sl; } else { sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }; scroll.scrollTop = 0; scroll.scrollLeft = 0; }
		ensureView();
		clampSel(); showActive(); renderFilterBar(); render(); drawObjects();
		var hs = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[si];
		if (hs && hs.Hidden) note("“" + esc(wb.SheetNames[si]) + "” is a " + (hs.Hidden === 2 ? "very hidden" : "hidden") + " sheet: Excel does not show its tab. <button type=\"button\" class=\"xl-link\" id=\"xl-unhide\">Unhide it in the saved file</button>");
		else if ($("xl-unhide")) note("");
		var ub = $("xl-unhide"); if (ub) ub.onclick = function () { var s2 = wb.Workbook.Sheets[si]; if (s2) s2.Hidden = 0; note(""); renderSheets(); file.dirty = true; file.saved = false; renderName(); autosave(); toast("The sheet will be visible when you save the file."); };
		if ($("xl-q").value) runFind(true);
		var b = $("xl-stabs").querySelector(".is-on"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" });
	}
	$("xl-stabs").addEventListener("pointerdown", function (e) { if (editing && isFormulaText(edText()) && e.target.closest("[data-si]")) e.preventDefault(); });
	$("xl-stabs").addEventListener("click", function (e) { var b = e.target.closest("[data-si]"); if (!b) return; var i = +b.getAttribute("data-si"); if (editing && isFormulaText(edText())) { if (i !== si) editSheetSwitch(i); else (editing.where === "bar" ? fxin : ed).focus(); return; } if (i !== si) showSheet(i); });
	$("xl-stabs").addEventListener("dblclick", function (e) { var b = e.target.closest("[data-si]"); if (b) renameSheet(+b.getAttribute("data-si")); });
	$("xl-sadd").onclick = function () { if (!wb) newBook(); else addSheet(); };

	/* ---------- sort / filter view ---------- */
	function vstate() { var n = wb.SheetNames[si]; return views[n] || (views[n] = { sort: null, filters: [], rows: null }); }
	// keep: true = leave the selection and scroll position alone (hidden rows toggled, freeze changed, file loaded)
	function computeView(keep) {
		setFrozen();
		var v = vstate(), d = data(), hid = !S.showHidden && hiddenCounts().r > 0, ar = keep ? actualRow(sel.ar) : null;
		var rows = X.viewRows({ nrows: nRows, header: base, sort: v.sort, filters: v.filters, hidden: hid ? rowHid : null,
			value: function (r, c) { var row = d[r]; return X.cellValue(row ? row[c] : undefined); },
			text: function (r, c) { var row = d[r]; return disp(row ? row[c] : undefined); } });
		if (rows && base) rows.splice(0, base);
		if (rows) { v.dataN = rows.length; if (!(v.sort || v.filters.length)) for (var r = nRows; r < nRows + 60; r++) rows.push(r); }   // room to type below the data
		v.rows = rows; v.inv = null;
		layout();
		if (keep) { var dr = ar == null ? null : displayRow(ar); if (dr == null) dr = drNear(ar || 0); sel = { ar: dr == null ? 0 : dr, ac: sel.ac, fr: dr == null ? 0 : dr, fc: sel.ac, mode: "" }; }
		else { sel = { ar: base ? -1 : 0, ac: sel.ac, fr: base ? -1 : 0, fc: sel.ac, mode: "" }; scroll.scrollTop = 0; }
		clampSel(); showActive(); renderFilterBar(); render(); drawObjects();
		if ($("xl-q").value) runFind(true);
	}
	// a view is needed for a sort / filter, or to leave hidden rows out
	function ensureView() {
		if (!wb) return;
		var v = vstate();
		if (v.sort || v.filters.length || (!S.showHidden && hiddenCounts().r > 0)) computeView(true);
		else if (v.rows) { var ar = actualRow(sel.ar); v.rows = null; v.inv = null; layout(); var dr = displayRow(ar); sel.ar = sel.fr = dr == null ? 0 : dr; clampSel(); render(); drawObjects(); }
	}
	function sortBy(dir) { if (!wb) return; var v = vstate(); v.sort = { c: sel.ac, dir: dir }; computeView(); toast("Sorted by column " + X.colName(sel.ac) + (dir > 0 ? ", A to Z" : ", Z to A") + ". The file itself is not changed."); }
	$("xl-sasc").onclick = function () { sortBy(1); };
	$("xl-sdesc").onclick = function () { sortBy(-1); };
	function colLabel(c) { var h = base ? disp(getCell(0, c)) : ""; return X.colName(c) + (h ? ": " + (h.length > 24 ? h.slice(0, 23) + "…" : h) : ""); }
	function renderFilterBar() {
		if (!wb) return;
		var v = views[wb.SheetNames[si]], bar = $("xl-filterbar");
		var on = !bar.hidden;
		$("xl-filt").setAttribute("aria-pressed", String(on || !!(v && v.filters && v.filters.length)));
		var opts = []; for (var c = 0; c < Math.max(nCols, 1) && c < 500; c++) opts.push('<option value="' + c + '"' + (c === sel.ac ? " selected" : "") + ">" + esc(colLabel(c)) + "</option>");
		$("xl-fcol").innerHTML = opts.join("");
		var chips = [];
		if (v && v.sort) chips.push('<span class="xl-chip">Sorted by ' + esc(X.colName(v.sort.c)) + (v.sort.dir > 0 ? " ↑" : " ↓") + '<button type="button" data-rm="sort" aria-label="Remove the sort">&times;</button></span>');
		(v && v.filters || []).forEach(function (f, i) { chips.push('<span class="xl-chip">' + esc(X.colName(f.c)) + " " + esc(X.FILTER_OPS[f.op]) + (f.op === "blank" || f.op === "notblank" ? "" : f.op === "in" ? " " + esc(f.v) + (f.t ? " (" + esc(f.t) + ")" : "") : " “" + esc(f.v) + "”") + '<button type="button" data-rm="' + i + '" aria-label="Remove this filter">&times;</button></span>'); });
		$("xl-fchips").innerHTML = chips.join("");
		$("xl-fclear").hidden = !chips.length;
		if (chips.length && bar.hidden) bar.hidden = false;
	}
	$("xl-filt").onclick = function () { if (!wb) return; var bar = $("xl-filterbar"); bar.hidden = !bar.hidden; renderFilterBar(); if (!bar.hidden) $("xl-fval").focus(); };
	$("xl-fop").onchange = function () { $("xl-fval").disabled = /blank/.test(this.value); };
	function addFilter() {
		var c = +$("xl-fcol").value, op = $("xl-fop").value, val = $("xl-fval").value;
		if (!/blank/.test(op) && val === "") { $("xl-fval").focus(); return; }
		vstate().filters.push({ c: c, op: op, v: val }); $("xl-fval").value = ""; computeView();
	}
	$("xl-fadd").onclick = addFilter;
	$("xl-fval").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addFilter(); } });
	$("xl-fchips").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; var v = vstate(), w = b.getAttribute("data-rm"); if (w === "sort") v.sort = null; else v.filters.splice(+w, 1); computeView(); });
	$("xl-fclear").onclick = function () { var v = vstate(); v.sort = null; v.filters = []; computeView(); };
	// freeze panes: top row, first column, at the selected cell, as in the file, or none
	function setFreeze(kind) {
		if (!wb) return;
		if (editing) commitEdit();
		var w = ws(), ar = actualRow(sel.ar), x = sx(), was = frzOf();
		if (kind === "top") { w["!mesfrz"] = { r: 1, c: 0 }; S.freeze = true; }
		else if (kind === "col") w["!mesfrz"] = { r: 0, c: 1 };
		else if (kind === "sel") w["!mesfrz"] = { r: Math.min(30, ar == null ? 0 : ar), c: Math.min(30, sel.ac) };
		else if (kind === "file") delete w["!mesfrz"];
		else { w["!mesfrz"] = { r: 0, c: 0 }; S.freeze = false; }
		save();
		var now = frzOf();
		if (now.r !== was.r || now.c !== was.c) { file.dirty = true; file.saved = false; renderName(); autosave(); }
		if (view() || now.r !== was.r) { var v = vstate(); if (v.rows || v.sort || v.filters.length) { computeView(true); } else { layout(); var dr = displayRow(ar); select(dr == null ? 0 : dr, sel.ac); } }
		else layout();
		if (now.c && sel.ac < now.c) scroll.scrollLeft = 0;
		renderFilterBar(); render(); drawObjects(); status();
		toast(now.r || now.c ? "Frozen: " + (now.r ? now.r + " row" + (now.r > 1 ? "s" : "") : "") + (now.r && now.c ? " and " : "") + (now.c ? now.c + " column" + (now.c > 1 ? "s" : "") : "") : "Nothing frozen");
	}
	$("xl-frzmenu").addEventListener("click", function (e) { var b = e.target.closest("[data-frz]"); if (!b) return; closeMenus(); setFreeze(b.getAttribute("data-frz")); });
	$("xl-hid").onclick = function () { if (!wb) return; if (editing) commitEdit(); S.showHidden = !S.showHidden; save(); ensureView(); layout(); render(); drawObjects(); status(); };
	$("xl-objbtn").onclick = function () { if (!wb) return; S.objs = !S.objs; save(); toolState(); drawObjects(true); };

	/* ---------- find ---------- */
	var findT = 0;
	function runFind(keep) {
		var q = $("xl-q").value.trim().toLowerCase();
		hits = []; hitSet = null;
		if (!wb || !q) { $("xl-qn").textContent = ""; hitIx = -1; render(); return; }
		var d = data(), cap = 20000;
		outer: for (var r = 0; r < d.length; r++) { var row = d[r]; if (!row) continue; for (var c = 0; c < row.length; c++) { var cell = row[c]; if (!cell) continue; if (disp(cell).toLowerCase().indexOf(q) >= 0 || (cell.f && cell.f.toLowerCase().indexOf(q) >= 0)) { hits.push([r, c]); if (hits.length >= cap) break outer; } } }
		hitSet = new Set(hits.map(function (h) { return h[0] + ":" + h[1]; }));
		if (!keep) hitIx = -1;
		$("xl-qn").textContent = hits.length ? (hitIx >= 0 ? hitIx + 1 + " of " : "") + nf(hits.length) + (hits.length >= cap ? "+" : "") + (hitIx >= 0 ? "" : " found") : "No matches";
		render();
	}
	function gotoHit(step) {
		if (!hits.length) { runFind(); if (!hits.length) return; }
		hitIx = (hitIx + step + hits.length) % hits.length;
		var h = hits[hitIx], dr = displayRow(h[0]);
		$("xl-qn").textContent = (hitIx + 1) + " of " + nf(hits.length);
		if (dr == null) { note("Match " + (hitIx + 1) + " (" + esc(X.a1(h[0], h[1])) + ") is hidden by the filter. <button type=\"button\" class=\"xl-link\" id=\"xl-unf\">Clear the filter</button>"); var b = $("xl-unf"); if (b) b.onclick = function () { note(""); $("xl-fclear").click(); }; return; }
		note(""); select(dr, h[1]);
	}
	$("xl-q").addEventListener("input", function () { clearTimeout(findT); findT = setTimeout(function () { runFind(); }, 220); });
	$("xl-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(findT); if (!hits.length) runFind(); gotoHit(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { this.value = ""; runFind(); scroll.focus(); } });
	$("xl-qnext").onclick = function () { gotoHit(1); };
	$("xl-qprev").onclick = function () { gotoHit(-1); };

	/* ---------- pointer: select, drag, resize columns, headers ---------- */
	function hitCell(e, el) {
		var r = el.getBoundingClientRect(), I = scrollInfo();
		var x = e.clientX - r.left + I.sl, y = e.clientY - r.top;
		return { dr: Math.min(NR - 1, Math.max(0, Math.floor((y + I.P) / RH))), c: Math.max(FC, colAt(Math.max(0, x) + FW)) };
	}
	var drag = null;
	scroll.addEventListener("pointerdown", function (e) {
		if (!wb || e.button > 0) return;
		var p = hitCell(e, scroll);
		if (e.clientX - scroll.getBoundingClientRect().left > scroll.clientWidth || e.clientY - scroll.getBoundingClientRect().top > scroll.clientHeight) return;  // scroll bars
		if (e.target.closest && (e.target.closest(".xl-fh") || e.target.closest(".xl-tfb"))) return;
		if (editing && tryPoint(p, e)) return;
		if (editing) { if (!commitEdit()) return; }
		if (e.pointerType === "touch" || e.pointerType === "pen") { drag = { touch: true, x: e.clientX, y: e.clientY, p: p }; return; }
		e.preventDefault(); scroll.focus({ preventScroll: true });
		select(p.dr, p.c, e.shiftKey);
		drag = { el: scroll };
		try { scroll.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
	});
	scroll.addEventListener("pointermove", function (e) {
		if (!drag || drag.touch || drag.el !== scroll) return;
		var rect = scroll.getBoundingClientRect();
		if (drag.point) { if (!editing || !editing.pick) return; var pp = hitCell(e, scroll), pk = editing.pick; if (pp.dr !== pk.dr1 || pp.c !== pk.c1) pointSet(pk.dr0, pk.c0, pp.dr, pp.c); return; }
		if (e.clientY > rect.bottom - 6) scroll.scrollTop += RH; else if (e.clientY < rect.top + 6) scroll.scrollTop -= RH;
		if (e.clientX > rect.right - 6) scroll.scrollLeft += 40; else if (e.clientX < rect.left + 6) scroll.scrollLeft -= 40;
		var p = hitCell(e, scroll);
		if (p.dr !== sel.fr || p.c !== sel.fc) { sel.fr = p.dr; sel.fc = p.c; showActive(); render(); }
	});
	scroll.addEventListener("pointerup", function (e) {
		if (drag && drag.touch && Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) {
			var p = drag.p, again = p.dr === sel.ar && p.c === sel.ac && sel.ar === sel.fr && sel.ac === sel.fc;
			if (again) startEdit(); else select(p.dr, p.c);
		}
		drag = null;
	});
	scroll.addEventListener("pointercancel", function () { drag = null; });
	scroll.addEventListener("dblclick", function (e) { if (!wb) return; var p = hitCell(e, scroll); select(p.dr, p.c); startEdit(); });
	// clicks in the frozen parts: frozen rows (xl-frz), the corner block (xl-frzc) and frozen columns (xl-fcols)
	function frozenDown(e) {
		if (!wb || e.button > 0) return;
		var r = this.getBoundingClientRect(), id = this.id, x = e.clientX - r.left, y = e.clientY - r.top, dr, c;
		if (id === "xl-fcols") { dr = Math.min(NR - 1, Math.max(0, Math.floor((y + scrollInfo().P) / RH))); c = Math.min(FC - 1, colAt(x)); }
		else { dr = Math.min(-1, Math.floor(y / RH) - base); c = id === "xl-frzc" ? Math.min(FC - 1, colAt(x)) : Math.max(FC, colAt(x + scroll.scrollLeft + FW)); }
		if (editing && tryPoint({ dr: dr, c: c }, e)) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		if (e.detail > 1) { select(dr, c); startEdit(); return; }
		select(dr, c, e.shiftKey);
	}
	["xl-frz", "xl-frzc", "xl-fcols"].forEach(function (id) { $(id).addEventListener("pointerdown", frozenDown); });
	function rowHeadDown(e) {
		var t = e.target.closest("[data-dr]"); if (!t || !wb) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		var dr = +t.getAttribute("data-dr");
		if (e.shiftKey) { sel.fr = dr; } else { sel.ar = sel.fr = dr; }
		sel.ac = 0; sel.fc = Math.max(0, Math.max(nCols, 1) - 1); sel.mode = "row"; clampSel(); showActive(); render();
	}
	$("xl-rowh").addEventListener("pointerdown", rowHeadDown);
	$("xl-frzh").addEventListener("pointerdown", rowHeadDown);
	$("xl-corner").addEventListener("pointerdown", function (e) { if (!wb) return; e.preventDefault(); sel = { ar: minRow(), ac: 0, fr: Math.max(minRow(), dataN() - 1), fc: Math.max(0, nCols - 1), mode: "all" }; clampSel(); showActive(); render(); scroll.focus({ preventScroll: true }); });
	var rz = null;
	$("xl-colh").addEventListener("pointerdown", function (e) {
		if (!wb) return;
		var h = e.target.closest("[data-rz]");
		if (h) {
			e.preventDefault(); var c = +h.getAttribute("data-rz");
			rz = { c: c, x: e.clientX, w: colX[c + 1] - colX[c], h: h }; h.classList.add("is-drag");
			try { this.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			return;
		}
		var t = e.target.closest("[data-c]"); if (!t) return;
		if (editing && !commitEdit()) return;
		e.preventDefault(); scroll.focus({ preventScroll: true });
		var col = +t.getAttribute("data-c"), last = Math.max(minRow(), dataN() - 1);
		if (e.shiftKey) sel.fc = col; else { sel.ac = sel.fc = col; }
		sel.ar = minRow(); sel.fr = Math.max(last, minRow()); sel.mode = "col"; clampSel(); showActive(); render();
	});
	$("xl-colh").addEventListener("pointermove", function (e) {
		if (!rz) return;
		var w = Math.max(16, Math.round(rz.w + e.clientX - rz.x)), cs = ws()["!cols"] || (ws()["!cols"] = []);
		cs[rz.c] = Object.assign({}, cs[rz.c] || {}, { wpx: w, width: +(w / 7.2).toFixed(2) }); delete cs[rz.c].wch; delete cs[rz.c].hidden; delete cs[rz.c].MDW;
		layout(); render();
	});
	$("xl-colh").addEventListener("pointerup", function () { if (rz) { rz.h.classList.remove("is-drag"); rz = null; drawObjects(); file.dirty = true; renderName(); autosave(); } });
	$("xl-colh").addEventListener("dblclick", function (e) {
		var h = e.target.closest("[data-rz]"); if (!h) return;
		var c = +h.getAttribute("data-rz"), d = data(), mx = 4;
		for (var r = 0; r < Math.min(d.length, 3000); r++) { var row = d[r], cell = row && row[c]; if (cell) mx = Math.max(mx, disp(cell).length); }
		var cs = ws()["!cols"] || (ws()["!cols"] = []); var pxw = Math.min(600, Math.round(mx * 7.4 + 14)); cs[c] = { wpx: pxw, width: +(pxw / 7.2).toFixed(2) };
		layout(); render(); drawObjects(); file.dirty = true; renderName();
	});
	scroll.addEventListener("scroll", function () { render(); }, { passive: true });
	if (window.ResizeObserver) new ResizeObserver(function () { render(); }).observe(grid); else window.addEventListener("resize", render);

	/* ---------- keyboard ---------- */
	function dataN() { var v = view(); return v ? (v.dataN != null ? v.dataN : v.rows.length) : nRows - base; }
	function lastDataDr() { return Math.max(minRow(), dataN() - 1); }
	scroll.addEventListener("keydown", function (e) {
		if (!wb || editing) return;
		var mod = e.ctrlKey || e.metaKey, k = e.key, dr = sel.fr, c = sel.fc, page = Math.max(1, Math.floor(scroll.clientHeight / RH) - 1);
		var mv = function (r, cc, ext) { e.preventDefault(); select(r, cc, ext); };
		if (k === "ArrowDown") return mv(mod ? lastDataDr() : (e.shiftKey ? dr : sel.ar) + 1, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "ArrowUp") return mv(mod ? minRow() : (e.shiftKey ? dr : sel.ar) - 1, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "ArrowRight") { var row = data()[actualRow(sel.ar)]; return mv(e.shiftKey ? dr : sel.ar, mod ? Math.max(0, (row ? row.length : 1) - 1) : (e.shiftKey ? c : sel.ac) + 1, e.shiftKey); }
		if (k === "ArrowLeft") return mv(e.shiftKey ? dr : sel.ar, mod ? 0 : (e.shiftKey ? c : sel.ac) - 1, e.shiftKey);
		if (k === "PageDown") return mv((e.shiftKey ? dr : sel.ar) + page, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "PageUp") return mv((e.shiftKey ? dr : sel.ar) - page, e.shiftKey ? c : sel.ac, e.shiftKey);
		if (k === "Home") return mv(mod ? minRow() : sel.ar, 0, e.shiftKey);
		if (k === "End" && mod) return mv(lastDataDr(), Math.max(0, nCols - 1), e.shiftKey);
		if (k === "Tab") return mv(sel.ar, sel.ac + (e.shiftKey ? -1 : 1));
		if (k === "Enter") return mv(sel.ar + (e.shiftKey ? -1 : 1), sel.ac);
		if (k === "F2") { e.preventDefault(); startEdit(); return; }
		if (k === "Escape" && clip) { clip = null; render(); return; }
		if (mod && k.toLowerCase() === "d") { e.preventDefault(); fillDown(); return; }
		if (mod && k.toLowerCase() === "r") { e.preventDefault(); fillRight(); return; }
		if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearSel(); return; }
		if (mod && k.toLowerCase() === "a") { e.preventDefault(); $("xl-corner").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return; }
		if (mod && (k === "-" )) { e.preventDefault(); rowsCols(sel.mode === "col" ? "col-del" : "row-del"); return; }
		if (mod && e.shiftKey && (k === "+" || k === "=")) { e.preventDefault(); rowsCols(sel.mode === "col" ? "col-left" : "row-above"); return; }
		if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(k); return; }
	});
	function clearSel() {
		var R = selRect(), list = [], max = 200000;
		for (var r = Math.max(R.r1, minRow()); r <= R.r2; r++) {
			var ar = actualRow(r); if (ar == null || ar >= nRows) { if (!view()) break; continue; }
			var row = data()[ar]; if (!row) continue;
			for (var c = R.c1; c <= Math.min(R.c2, row.length - 1); c++) if (row[c] && row[c].t !== "z") { list.push({ r: ar, c: c, text: "" }); if (list.length > max) break; }
		}
		if (list.length) setCells(list, "Clear " + list.length + " cell" + (list.length > 1 ? "s" : ""));
	}
	ed.addEventListener("keydown", function (e) {
		var k = e.key;
		if (f4Key(e)) return;
		if (editing && editing.mode === "enter" && /^Arrow(Up|Down|Left|Right)$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey && pointable()) { e.preventDefault(); e.stopPropagation(); arrowPoint(k, e.shiftKey); return; }
		if (/^(Arrow|Home|End)/.test(k) && editing) editing.pick = null;
		if (k === "Enter" && !e.altKey) { e.preventDefault(); e.stopPropagation(); var d = e.shiftKey ? -1 : 1; if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar + d, sel.ac); } return; }
		if (k === "Enter" && e.altKey) { e.preventDefault(); var s = ed.selectionStart; ed.value = ed.value.slice(0, s) + "\n" + ed.value.slice(ed.selectionEnd); ed.setSelectionRange(s + 1, s + 1); placeEditor(); return; }
		if (k === "Tab") { e.preventDefault(); e.stopPropagation(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); } return; }
		if (k === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); return; }
		e.stopPropagation();
	});
	ed.addEventListener("input", function () { fxin.value = ed.value; placeEditor(); if (editing) { editing.pick = null; refHL(); } });
	ed.addEventListener("blur", function () { setTimeout(function () { if (editing && editing.where === "cell" && document.activeElement !== ed && document.activeElement !== fxin) commitEdit(); render(); }, 0); });
	fxin.addEventListener("focus", function () { if (!wb) return; if (editing && editing.where === "cell") { var v = ed.value; editing.where = "bar"; ed.hidden = true; fxin.value = v; return; } editing = { dr: sel.ar, c: sel.ac, ar: actualRow(sel.ar), si: si, where: "bar", mode: "edit", pick: null, orig: editText(getCell(actualRow(sel.ar), sel.ac)) }; refHL(); });
	fxin.addEventListener("input", function () { if (!editing) return; editing.pick = null; refHL(); });
	fxin.addEventListener("keydown", function (e) {
		if (!editing) return;
		if (f4Key(e)) return;
		if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar + (e.shiftKey ? -1 : 1), sel.ac); } }
		else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); scroll.focus({ preventScroll: true }); }
		else if (e.key === "Tab") { e.preventDefault(); if (commitEdit()) { scroll.focus({ preventScroll: true }); select(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); } }
	});
	fxin.addEventListener("blur", function () { if (editing && editing.where === "bar") { if (!commitEdit()) { cancelEdit(); } } });
	$("xl-editbtn").onclick = function () { if (!wb) return; scroll.focus({ preventScroll: true }); startEdit(); };
	nameBox.addEventListener("keydown", function (e) {
		if (e.key !== "Enter" || !wb) return;
		e.preventDefault();
		var g = X.parseRange(this.value.replace(/^.*!/, ""));
		if (!g) { toast("Type a cell address such as B12, or a range such as A1:C10."); return; }
		var a = displayRow(g.s.r), b = displayRow(g.e.r);
		if (a == null) { toast("Row " + (g.s.r + 1) + " is hidden by the filter."); return; }
		while (g.s.r >= NR + base && !view()) { NR += 1000; }
		layout();
		sel = { ar: a, ac: g.s.c, fr: b == null ? a : b, fc: g.e.c, mode: "" }; clampSel(); reveal(sel.ar, sel.ac); showActive(); render(); scroll.focus({ preventScroll: true });
	});
	nameBox.addEventListener("focus", function () { this.select(); });

	/* ---------- clipboard (TSV, compatible with Excel and Google Sheets) ---------- */
	function selTSV() {
		var R = selRect(), rows = [];
		var r2 = Math.min(R.r2, dataN() - 1), c2 = Math.min(R.c2, Math.max(nCols - 1, R.c1));
		if ((r2 - R.r1 + 1) * (c2 - R.c1 + 1) > 500000) { toast("That is too many cells to copy at once."); return null; }
		for (var r = R.r1; r <= Math.max(r2, R.r1); r++) { var row = data()[actualRow(r)], out = []; for (var c = R.c1; c <= c2; c++) out.push(disp(row ? row[c] : undefined)); rows.push(out); }
		return X.toDelimited(rows, "\t", "\n");
	}
	function inGridFocus() { var a = document.activeElement; return a === scroll || (a && a.closest && a.closest("#xl-grid") && a !== ed); }
	function copyEvent(e, cut) {
		if (!wb || editing || !inGridFocus()) return;
		var o = doCopy(cut); if (!o) return;
		e.preventDefault(); e.clipboardData.setData("text/plain", o.text); e.clipboardData.setData("text/html", o.html);
		var R = selRect(); toast((cut ? "Cut " : "Copied ") + nf((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1)) + " cell" + ((R.r2 - R.r1 + R.c2 - R.c1) ? "s" : "") + (cut ? ": select where it goes and paste" : ""));
	}
	document.addEventListener("copy", function (e) { copyEvent(e, false); });
	document.addEventListener("cut", function (e) { copyEvent(e, true); });
	function pasteText(text) {
		if (!wb || text == null) return;
		var rows = X.parseDelimited(text.replace(/\r?\n$/, ""), text.indexOf("\t") >= 0 || text.indexOf("\n") < 0 ? "\t" : null);
		if (!rows.length) return;
		var R = selRect(), v = view(), list = [], cut = false;
		var h = rows.length, w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
		var tile = rows.length === 1 && w === 1 && (R.r2 > R.r1 || R.c2 > R.c1);    // one value pasted into a selection fills it
		var rN = tile ? R.r2 - R.r1 + 1 : h, cN = tile ? R.c2 - R.c1 + 1 : w;
		if (rN * cN > 300000) { toast("That is too much to paste at once (" + nf(rN * cN) + " cells)."); return; }
		for (var i = 0; i < rN; i++) {
			var dr = R.r1 + i;
			if (v && dr >= v.rows.length) { cut = true; break; }
			var ar = actualRow(dr);
			for (var j = 0; j < cN; j++) { var t = tile ? rows[0][0] : rows[i][j]; if (t === undefined) continue; list.push({ r: ar, c: R.c1 + j, text: t }); }
		}
		try { setCells(list, "Paste"); } catch (err) { note(esc(err.message), true); return; }
		sel.fr = Math.min(NR - 1, R.r1 + rN - 1); sel.fc = R.c1 + cN - 1; clampSel(); showActive(); render();
		if (cut) note("Only the rows showing in the sorted / filtered view were filled.");
	}
	document.addEventListener("paste", function (e) {
		var fs = [].filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return /\.(xlsx|xlsm|xls|ods|csv|tsv|xlsb|numbers)$/i.test(f.name || ""); });
		if (fs.length && !(document.activeElement && /input|textarea/i.test(document.activeElement.tagName) && document.activeElement !== scroll)) { e.preventDefault(); openFile(fs[0]); return; }
		if (!wb || editing || !inGridFocus()) return;
		e.preventDefault();
		var txt = e.clipboardData.getData("text/plain");
		if (clipSame(txt)) pasteInternal(); else pasteText(txt);
	});

	/* ---------- global shortcuts ---------- */
	document.addEventListener("keydown", function (e) {
		var mod = e.ctrlKey || e.metaKey;
		if (!mod || e.altKey) return;
		var inUs = root.contains(document.activeElement) || app.classList.contains("mes-pfill") || document.activeElement === document.body;
		if (!inUs) return;
		var k = e.key.toLowerCase(), typing = document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
		if (k === "o") { e.preventDefault(); pick(); }
		else if (k === "s" && wb) { e.preventDefault(); if (editing && !commitEdit()) return; if (!(cloud && cloud.save(file))) saveAs(wb.vbaraw ? "xlsm" : "xlsx"); }
		else if (k === "p" && wb) { e.preventDefault(); printSheet(); }
		else if (k === "f" && wb) { e.preventDefault(); $("xl-q").focus(); $("xl-q").select(); }
		else if ((k === "z" || k === "y") && wb && !typing) { e.preventDefault(); doUndo(k === "y" || e.shiftKey); }
	});

	/* ---------- opening files ---------- */
	var input = $("xl-input");
	function pick() { input.click(); }
	$("xl-open").onclick = pick; $("xl-e-open").onclick = function (e) { e.stopPropagation(); pick(); };
	$("xl-new").onclick = $("xl-e-new").onclick = function (e) { e.stopPropagation(); if (confirmLeave()) newBook(); };
	$("xl-drop").addEventListener("click", function (e) { if (!e.target.closest("button,label,input")) pick(); });
	$("xl-drop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
	input.onchange = function () { if (input.files[0]) openFile(input.files[0]); input.value = ""; };
	var hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (hasFiles(e)) { e.preventDefault(); app.classList.add("is-over"); } }); });
	document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) app.classList.remove("is-over"); });
	document.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); app.classList.remove("is-over"); var f = e.dataTransfer.files[0]; if (f) openFile(f); });
	function confirmLeave() { return !(file && file.dirty && !file.autosaved && !confirm("You have changes that are not saved. Open another file anyway?")); }
	function openFile(f) {
		if (!confirmLeave()) return;
		note("Opening " + esc(f.name) + "…");
		f.arrayBuffer().then(function (b) { return openBytes(new Uint8Array(b), f.name, {}); }).catch(function (err) { note(esc(f.name) + ": " + esc(err.message || "could not be read."), true); });
	}
	function decodeText(u8) {
		var t = new TextDecoder("utf-8").decode(u8);
		if (/�/.test(t.slice(0, 200000))) { try { t = new TextDecoder("windows-1252").decode(u8); } catch (e) { /* keep utf-8 */ } }
		return t;
	}
	function bookFromText(text, name, X2) {
		var ext = (/\.([a-z]+)$/i.exec(name) || [])[1] || "", delim = /^(tsv|tab)$/i.test(ext) ? "\t" : null;
		if (delim == null) delim = X.detectDelimiter(text);
		var rows = X.parseDelimited(text, delim), d = [], dec = delim === ";";   // semicolon files come from decimal-comma countries: 1,5 = 1.5
		for (var r = 0; r < rows.length; r++) {
			var row = rows[r], out = new Array(row.length);
			for (var c = 0; c < row.length; c++) {
				var p = row[c] === "" ? { t: "z" } : X.parseInput(dec && /^-?\d+(\.\d{3})*,\d+$/.test(row[c].trim()) ? row[c].trim().replace(/\./g, "").replace(",", ".") : row[c]);
				if (p.f != null) { try { X.parse(p.f); out[c] = { t: "z", f: p.f }; } catch (e) { out[c] = { t: "s", v: row[c] }; } }
				else if (p.t !== "z") out[c] = p.z ? { t: p.t, v: p.v, z: p.z } : { t: p.t, v: p.v };
			}
			d.push(out);
		}
		var book = X2.utils.book_new();
		X2.utils.book_append_sheet(book, { "!data": d, "!ref": "A1" }, X.safeSheetName(X.baseName(name)));
		return book;
	}
	function openBytes(u8, name, opt) {
		opt = opt || {};
		var kind = X.kindOf(name, u8);
		if (kind === "pdf") { note(esc(name) + ' is a PDF. <a href="/pdf">Open it in the PDF Editor</a>.', true); return Promise.resolve(); }
		if (/\.(docx|docm|dotx|doc)$/i.test(name)) { note(esc(name) + ' is a Word document. <a href="/docx">Open it in the Word Viewer</a>.', true); return Promise.resolve(); }
		return loadLib().then(function (XL) {
			var t0 = performance.now(), book;
			if (kind === "text") book = bookFromText(decodeText(u8), name, XL);
			else book = XL.read(u8, { type: "array", dense: true, cellFormula: true, cellNF: true, cellStyles: true, bookVBA: true, cellDates: false, WTF: false });
			if (!book.SheetNames.length) throw new Error("this file has no sheets.");
			load(book, { name: name, size: u8.length, bytes: u8, kind: kind, key: opt.key || ("x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) }, opt);
			// what SheetJS CE does not read (styles, tables, charts, pictures, freeze panes, conditional formatting): our own reader, then redraw
			readPkg(u8, kind).then(function (pkg) { if (pkg && wb === book) { try { applyPkg(book, pkg); } catch (e) { if (window.console) console.warn("[excel] package", e); } } });
			// formulas saved without a value (CSV files, files written by some libraries): work them out now
			var missing = [];
			wb.SheetNames.forEach(function (n, s) { var d = wb.Sheets[n]["!data"] || []; for (var r = 0; r < d.length && missing.length < 50000; r++) { var row = d[r]; if (row) for (var c = 0; c < row.length; c++) { var cl = row[c]; if (cl && cl.f && (cl.v == null || cl.t === "z")) missing.push({ si: s, r: r, c: c }); } } });
			if (missing.length) { var res = ensureCalc().recalc(missing); res.stale.forEach(function (p) { stale[p.si + ":" + p.r + ":" + p.c] = p.unknown; }); dims(); layout(); showActive(); render(); }
			var ms = Math.round(performance.now() - t0);
			if (!opt.quiet) note("");
			if (opt.draft) {
				note('This file has edits from earlier that you did not save. <button type="button" class="xl-link" id="xl-draftgo">Continue with my edits</button> <button type="button" class="xl-link" id="xl-draftno">Discard them</button>');
				$("xl-draftgo").onclick = function () { note(""); var keep = file; openBytes(new Uint8Array(opt.draft), name, { key: keep.key, fromDraft: true, orig: keep.bytes }).then(function () { file.dirty = true; file.autosaved = true; renderName(); }); };
				$("xl-draftno").onclick = function () { note(""); recentUpdate(file.key, function (r) { delete r.draft; delete r.draftTime; }); };
			}
			status();
			if (window.console) console.info("[excel] opened " + name + " in " + ms + " ms");
		}).catch(function (err) {
			var m = String(err && err.message || err || "");
			var msg = /password|encrypt/i.test(m) ? "this file is protected with a password. Remove the password in Excel first (File → Info → Protect Workbook)." :
				/Unsupported ZIP|zip|central|end of data|corrupt/i.test(m) ? "this file is damaged or is not a spreadsheet." : (m || "could not be opened.");
			note(esc(name) + ": " + esc(msg), true);
		});
	}
	/* ---------- the .xlsx package: our own reader for what SheetJS CE leaves out (ooxml.js) ---------- */
	function streamBytes(u8, ts) { return new Response(new Blob([u8]).stream().pipeThrough(ts)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
	function inflateRaw(u8) { return streamBytes(u8, new DecompressionStream("deflate-raw")); }
	function deflateRaw(u8) { return streamBytes(u8, new CompressionStream("deflate-raw")); }
	function canGraft() { return !!(O && window.CompressionStream && window.DecompressionStream); }
	function readPkg(u8, kind) {
		if (!canGraft() || !/^(zip|xlsx|xlsm|xltx|xltm)$/.test(kind)) return Promise.resolve(null);
		return O.readPackage(u8, inflateRaw).catch(function (e) { if (window.console) console.warn("[excel] could not read the package", e); return null; });
	}
	function applyPkg(book, pkg) {
		book["!mespkg"] = pkg;
		var xfs = pkg.styles.xfs, stubs = 0;
		pkg.sheets.forEach(function (sm) {
			var w = book.Sheets[sm.name]; if (!w) return;
			w["!mesx"] = sm;
			sm.colXf = []; sm.cols.forEach(function (c) { if (c.style) for (var i = c.min; i <= Math.min(c.max, c.min + 500); i++) sm.colXf[i] = c.style; });
			if (sm.rowsHidden.length) { var rm = w["!rows"] || (w["!rows"] = []); sm.rowsHidden.forEach(function (r) { if (!rm[r]) rm[r] = {}; rm[r].hidden = true; }); }
			// the style of every cell (empty formatted cells become stubs, so their fill and borders show and are saved)
			var d = w["!data"] || (w["!data"] = []), cs = sm.cells || [];
			for (var i = 0; i < cs.length; i += 3) {
				var r = cs[i], c = cs[i + 1], xs = cs[i + 2];
				var row = d[r] || (d[r] = []), cell = row[c];
				if (cell) { cell.xs = xs; cell.xz = cell.z; }
				else if (stubs < 2e6 && xfs[xs]) { stubs++; var code = xfs[xs].code; row[c] = code && code !== "General" ? { t: "z", xs: xs, xz: code, z: code } : { t: "z", xs: xs }; }
			}
			sm.cells = null;
		});
		cssCache = {}; dver++;
		if (wb !== book) return;
		dims(); layout(); ensureView(); renderSheets(); showActive(); render(); drawObjects(true); status();
		var n = { charts: 0, tables: 0, pics: 0 };
		pkg.sheets.forEach(function (sm) { (sm.objects || []).forEach(function (o) { if (o.type === "chart") n.charts++; else n.pics++; }); n.tables += (sm.tables || []).length; });
		if (window.console) console.info("[excel] package: " + n.charts + " charts, " + n.pics + " pictures, " + n.tables + " tables");
	}
	function load(book, f, opt) {
		if (editing) cancelEdit();
		wb = book; file = f; si = 0; calc = null; views = {}; stale = {}; undo = []; redo = []; undoBtns();
		if (opt.fromDraft && opt.orig) file.bytes = opt.orig;
		var first = 0; if (wb.Workbook && wb.Workbook.Sheets) for (var i = 0; i < wb.SheetNames.length; i++) { var s = wb.Workbook.Sheets[i]; if (!(s && s.Hidden)) { first = i; break; } }
		si = first;
		emptyEl.hidden = true;
		$("xl-save-xlsm").hidden = !wb.vbaraw;
		$("xl-save-orig").hidden = !file.bytes;
		$("xl-hdr").setAttribute("aria-pressed", String(S.freeze));
		dims(); layout(); renderSheets(); renderName();
		sel = { ar: 0, ac: 0, fr: 0, fc: 0, mode: "" }; scroll.scrollTop = 0; scroll.scrollLeft = 0; clampSel(); showActive(); renderFilterBar(); render();
		scroll.focus({ preventScroll: true });
		if (!opt.key && f.bytes) recentPut({ key: f.key, name: f.name, size: f.size, time: Date.now(), bytes: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) });
		else if (opt.key) recentUpdate(opt.key, function (r) { r.time = Date.now(); });
	}
	function newBook() {
		loadLib().then(function (XL) {
			var book = XL.utils.book_new(); XL.utils.book_append_sheet(book, { "!data": [], "!ref": "A1" }, "Sheet1");
			load(book, { name: "Untitled.xlsx", size: 0, bytes: null, kind: "new", key: "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, {});
			note("");
		}).catch(function (err) { note(esc(err.message), true); });
	}
	function renderName() {
		var n = $("xl-fname");
		if (!file) { n.textContent = "No file open"; return; }
		n.innerHTML = esc(file.name) + (file.dirty ? ' <span class="xl-dot" title="Edited">&bull;</span>' : "");
		n.title = file.name + (file.size ? " (" + X.fmtBytes(file.size) + ")" : "");
		document.title = (file.dirty ? "• " : "") + file.name + " - MES Spreadsheet Viewer";
	}
	window.addEventListener("beforeunload", function (e) { if (file && file.dirty && !file.autosaved && !file.saved) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- recent files + autosave (IndexedDB, this device only) ---------- */
	var idb = null;
	function db() {
		if (idb) return idb;
		idb = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-excel", 1);
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
			return recentList().then(function (all) {          // keep the 10 newest and at most ~120 MB
				var total = 0, drop = [], seen = {};
				all.forEach(function (r, i) {
					var id = r.name + "|" + r.size;
					if (seen[id] && !r.draft) { drop.push(r.key); return; } seen[id] = 1;
					total += (r.bytes ? r.bytes.byteLength : 0) + (r.draft ? r.draft.byteLength : 0); if (i >= 10 || total > 120e6) drop.push(r.key);
				});
				if (drop.length) return store("readwrite", function (st) { drop.forEach(function (k) { st.delete(k); }); });
			});
		}).catch(function () { /* storage full or blocked: not important */ });
	}
	function recentUpdate(key, fn, create) {
		return store("readwrite", function (st) { var g = st.get(key); g.onsuccess = function () { var r = g.result || (create ? create() : null); if (r) { fn(r); st.put(r); } }; }).catch(function () { });
	}
	function recentDel(key) { return store("readwrite", function (st) { if (key) st.delete(key); else st.clear(); }).catch(function () { }); }
	var asT = 0;
	function autosave() {
		if (!file) return;
		file.autosaved = false;
		if (cloud) cloud.changed(file);
		clearTimeout(asT);
		if (!S.remember) return;
		asT = setTimeout(function () {
			if (!wb || !window.XLSX) return;
			var cellsN = 0; wb.SheetNames.forEach(function (n) { var d = wb.Sheets[n]["!data"] || []; cellsN += d.length * 12; });
			if (cellsN > 3e6) { file.autosaveSkipped = true; return; }
			var f = file;
			xlsxBytes("xlsx").then(function (res) {
			var bytes = res.bytes, buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
			recentUpdate(f.key, function (r) { r.draft = buf; r.draftTime = Date.now(); r.time = Date.now(); r.name = f.name; }, function () { return { key: f.key, name: f.name, size: f.size || buf.byteLength, time: Date.now(), bytes: null }; }).then(function () { if (f === file) f.autosaved = true; });
			}).catch(function () { /* autosave is best effort */ });
		}, 2500);
	}
	function showRecent() {
		$("xl-remember").checked = !!S.remember;
		recentList().then(function (all) {
			var box = $("xl-recent"); box.hidden = !all.length || !S.remember;
			$("xl-rlist").innerHTML = all.map(function (r) {
				return '<div class="xl-ritem"><button type="button" class="xl-ropen" data-k="' + esc(r.key) + '"><b>' + esc(r.name) + "</b><small>" + (r.size ? esc(X.fmtBytes(r.size)) + " &middot; " : "") + esc(new Date(r.time).toLocaleString()) + (r.draft ? " &middot; has unsaved edits" : "") + '</small></button><button type="button" class="xl-link" data-del="' + esc(r.key) + '" aria-label="Forget ' + esc(r.name) + '">Forget</button></div>';
			}).join("");
		});
	}
	$("xl-rlist").addEventListener("click", function (e) {
		var o = e.target.closest("[data-k]"), d = e.target.closest("[data-del]");
		if (d) { recentDel(d.getAttribute("data-del")).then(showRecent); return; }
		if (o) recentList().then(function (all) {
			var r = all.find(function (x) { return x.key === o.getAttribute("data-k"); }); if (!r) return;
			if (r.bytes) openBytes(new Uint8Array(r.bytes), r.name, { key: r.key, draft: r.draft });
			else if (r.draft) openBytes(new Uint8Array(r.draft), /\.xlsx$/i.test(r.name) ? r.name : X.baseName(r.name) + ".xlsx", { key: r.key, fromDraft: true });
		});
	});
	$("xl-rclear").onclick = function () { if (confirm("Forget all recent files and saved edits on this device?")) recentDel(null).then(showRecent); };
	$("xl-remember").onchange = function () { S.remember = this.checked; save(); if (!S.remember) recentDel(null).then(showRecent); };

	/* ---------- menus ---------- */
	function menu(btn, m) {
		btn.addEventListener("click", function (e) { e.stopPropagation(); var open = m.hidden; closeMenus(); if (open && wb) { m.hidden = false; btn.setAttribute("aria-expanded", "true"); var f = m.querySelector("button:not([hidden])"); if (f) f.focus(); } });
		m.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closeMenus(); btn.focus(); } });
	}
	function closeMenus() { [["xl-rcbtn", "xl-rcmenu"], ["xl-insbtn", "xl-insmenu"], ["xl-save", "xl-savemenu"], ["xl-hdr", "xl-frzmenu"]].forEach(function (p) { $(p[1]).hidden = true; $(p[0]).setAttribute("aria-expanded", "false"); }); }
	document.addEventListener("click", function (e) { if (!e.target.closest(".xl-dd")) closeMenus(); });
	menu($("xl-rcbtn"), $("xl-rcmenu")); menu($("xl-insbtn"), $("xl-insmenu")); menu($("xl-save"), $("xl-savemenu")); menu($("xl-hdr"), $("xl-frzmenu"));
	$("xl-rcmenu").addEventListener("click", function (e) { var b = e.target.closest("[data-rc]"); if (!b) return; closeMenus(); rowsCols(b.getAttribute("data-rc")); });
	$("xl-savemenu").addEventListener("click", function (e) { var b = e.target.closest("[data-save]"); if (!b) return; closeMenus(); saveAs(b.getAttribute("data-save")); });
	$("xl-undo").onclick = function () { doUndo(false); };
	$("xl-redo").onclick = function () { doUndo(true); };

	/* ---------- save ---------- */
	function sheetRows() { var d = data(), out = []; for (var r = 0; r < nRows; r++) { var row = d[r], o = []; for (var c = 0; c < nCols; c++) o.push(disp(row ? row[c] : undefined)); out.push(o); } return out; }
	function saveAs(kind) {
		if (!wb) return;
		if (editing && !commitEdit()) return;
		var b = X.baseName(file.name);
		try {
			if (kind === "orig") { if (file.bytes) download(new Blob([file.bytes]), file.name); return; }
			if (kind === "csv" || kind === "tsv") {
				var txt = X.toDelimited(sheetRows(), kind === "csv" ? "," : "\t");
				download(new Blob(["﻿" + txt], { type: kind === "csv" ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8" }), b + (wb.SheetNames.length > 1 ? " - " + wb.SheetNames[si] : "") + "." + kind);
				toast("Saved this sheet as ." + kind); return;
			}
			var bt = kind === "xlsm" ? "xlsm" : kind === "ods" ? "ods" : "xlsx";
			var mime = bt === "ods" ? "application/vnd.oasis.opendocument.spreadsheet" : bt === "xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
			var f = file;
			(bt === "ods" ? (prepWrite(), Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: "ods", type: "array", compression: true }) })) : xlsxBytes(bt)).then(function (res) {
				download(new Blob([res.bytes], { type: mime }), b + "." + bt);
				if (f === file) { file.saved = true; file.dirty = false; renderName(); }
				var lost = res.lost && res.lost.length ? " Not kept, because rows, columns or sheets were changed: " + res.lost.join(", ") + ". (Save the Original file to keep them as they were.)" : "";
				if (lost) note(esc(lost.trim()));
				toast("Saved " + b + "." + bt);
			}).catch(function (err) { note("Could not save: " + esc(err && err.message || err), true); });
		} catch (err) { note("Could not save: " + esc(err.message || err), true); }
	}
	/* ---------- ☁ Cloud: open from / keep saved to OneDrive, Dropbox, Google Drive or a synced folder (/main_js/cloud-files.js) ---------- */
	var WRITABLE = { xlsx: 1, xlsm: 1, ods: 1, csv: 1, tsv: 1 };
	function cloudWriteName(n) { var e = (/\.([a-z0-9]+)$/i.exec(n || "") || [])[1]; e = e ? e.toLowerCase() : ""; if (e === "xlsm" && !(wb && wb.vbaraw)) return X.baseName(n) + ".xlsx"; return WRITABLE[e] ? n : X.baseName(n || "Untitled") + ".xlsx"; }
	function cloudBytes(f, name) {
		var e = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || "xlsx").toLowerCase();
		if (e === "csv" || e === "tsv") {
			if (wb.SheetNames.length > 1 && f.__mclCsvNote !== 1) { f.__mclCsvNote = 1; toast("A ." + e + " file holds one sheet: saving the sheet on screen"); }
			return Promise.resolve(new TextEncoder().encode("\ufeff" + X.toDelimited(sheetRows(), e === "csv" ? "," : "\t")));
		}
		if (e === "ods") { prepWrite(); return Promise.resolve(new Uint8Array(window.XLSX.write(wb, { bookType: "ods", type: "array", compression: true }))); }
		return xlsxBytes(e === "xlsm" ? "xlsm" : "xlsx").then(function (res) { return res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes); });
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "excel", folder: "MES Apps/Excel", what: "spreadsheet", defExt: "xlsx", btnClass: "xl-btn", before: $("xl-fname"), replaces: true, toast: toast,
		exts: [".xlsx", ".xlsm", ".xls", ".xlsb", ".ods", ".csv", ".tsv"],
		accept: [{ description: "Spreadsheet", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"], "application/vnd.ms-excel": [".xls"], "application/vnd.oasis.opendocument.spreadsheet": [".ods"], "text/csv": [".csv"], "text/tab-separated-values": [".tsv"] } }],
		doc: function () { return wb ? file : null; },
		name: function (f) { return f.name; },
		writeName: cloudWriteName,
		bytes: function (f, name) { if (f !== file) return Promise.reject(new Error("That spreadsheet is no longer open.")); return cloudBytes(f, name); },
		open: function (u8, name) { if (editing) cancelEdit(); return openBytes(u8, name, {}).then(function () { return wb && file && file.bytes === u8 ? file : null; }); },
		dirty: function (f) { return !!f.dirty; },
		saved: function (f, name) { if (name && name !== f.name) f.name = name; f.dirty = false; f.saved = true; renderName(); recentUpdate(f.key, function (r) { delete r.draft; delete r.draftTime; r.name = f.name; }); }
	}) : null;
	// .xlsx bytes: SheetJS writes the cells, then ooxml.js grafts back the original styles, theme, freeze panes, tables, charts,
	// pictures and conditional formatting (only the last four need the rows / columns / sheets to be unchanged since opening)
	function graftInfo() {
		var pkg = pkgOf(), info = { sheets: [], extraXfs: [], structOk: !!pkg && !(file && file.structN > 0), tableHeaders: {}, active: si }, lost = {};
		var raws = pkg ? O.rawXfs(pkg.styles.raw) : [], next = raws.length, nextFmt = pkg ? O.maxFmtId(pkg.styles.raw) + 1 : 164, made = {}, fmtIds = {};
		if (pkg) { for (var id in pkg.styles.fmts) fmtIds[pkg.styles.fmts[id]] = +id; for (var bi in O.BUILTIN_FMT) if (!(O.BUILTIN_FMT[bi] in fmtIds)) fmtIds[O.BUILTIN_FMT[bi]] = +bi; }
		var xfFor = function (xs, z) {
			var key = xs + "|" + z; if (made[key] != null) return made[key];
			var src = raws[xs] || raws[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', fid = fmtIds[z], nw = false;
			if (fid == null) { fid = nextFmt++; fmtIds[z] = fid; nw = true; }
			var xs2 = src.replace(/\snumFmtId="\d+"/, "").replace(/\sapplyNumberFormat="[^"]*"/, "").replace(/<xf\b/, '<xf numFmtId="' + fid + '" applyNumberFormat="1"');
			info.extraXfs.push({ fmtId: fid, code: z, newFmt: nw, xml: xs2 });
			return (made[key] = next++);
		};
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n], sm = sx(w), cells = null, stubs = [], rowAttrs = null, d = w["!data"] || [];
			if (pkg) {
				cells = new Map();
				for (var r = 0; r < d.length; r++) {
					var row = d[r]; if (!row) continue;
					for (var c = 0; c < row.length; c++) {
						var cl = row[c]; if (!cl) continue;
						var xs = cl.xs != null ? cl.xs : 0, z = cl.z, want = xs;
						if (z && z !== "General" && z !== cl.xz) want = xfFor(xs, z);
						if (cl.t === "z") { if (want) stubs.push([r, c, want]); }
						else if (want) cells.set(r + ":" + c, want);
					}
				}
				if (sm && sm.tables) sm.tables.forEach(function (t) { if (!t.header) return; var row0 = d[t.g.s.r] || [], names = []; for (var c2 = t.g.s.c; c2 <= t.g.e.c; c2++) names.push(row0[c2] ? disp(row0[c2]) : null); info.tableHeaders[t.part] = names; });
				if (sm && !info.structOk) { if (sm.objects && sm.objects.some(function (o) { return o.type === "chart"; })) lost.charts = 1; if (sm.objects && sm.objects.some(function (o) { return o.type === "pic"; })) lost.pictures = 1; if (sm.tables && sm.tables.length) lost["table formats"] = 1; if (sm.cfRaw && sm.cfRaw.length) lost["conditional formatting"] = 1; }
			}
			var rm = w["!rows"]; if (rm) for (var hr = 0; hr < rm.length; hr++) if (rm[hr] && rm[hr].hidden) (rowAttrs || (rowAttrs = {}))[hr] = ' hidden="1"';
			var add = mineParts(w, info.sheets.length);
			if (sm && sm.drawingPart && add.some(function (a) { return a.tag === "drawing"; })) { add = add.filter(function (a) { return a.tag !== "drawing"; }); lost["new charts (this sheet already has a drawing)"] = 1; }
			info.sheets.push({ model: sm, freeze: w["!mesfrz"] || (sm && sm.pane ? { r: sm.pane.r, c: sm.pane.c } : null), cells: cells, stubs: stubs, rowAttrs: rowAttrs, add: add });
		});
		info.lost = Object.keys(lost);
		return info;
	}
	// SheetJS's writer fails on a missing row inside the data (left by inserting rows): fill the holes first
	function prepWrite() { wb.SheetNames.forEach(function (n) { var d = wb.Sheets[n]["!data"]; if (d && !d.length) d.push([]); if (d) for (var r = 0; r < d.length; r++) if (!d[r]) d[r] = []; }); }
	function xlsxBytes(bt) {
		var vba = bt === "xlsm";
		prepWrite();
		if (!canGraft()) return Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: bt, type: "array", compression: true, bookVBA: vba }) });
		var info = graftInfo();
		if (!pkgOf() && !info.sheets.some(function (s) { return (s.freeze && (s.freeze.r || s.freeze.c)) || (s.add && s.add.length); })) return Promise.resolve({ bytes: window.XLSX.write(wb, { bookType: bt, type: "array", compression: true, bookVBA: vba }) });
		var raw = window.XLSX.write(wb, { bookType: bt, type: "array", compression: false, bookVBA: vba });
		return O.graft(new Uint8Array(raw), pkgOf(), info, inflateRaw, deflateRaw).then(function (res) { res.lost = info.lost; return res; });
	}

	/* ---------- print ---------- */
	function printSheet() {
		if (!wb) return;
		var d = data(), v = view(), maxRows = 5000, rows = [];
		if (base && nRows) rows.push(0);
		var n = v ? v.rows.length : Math.max(0, nRows - base);
		for (var i = 0; i < n && rows.length < maxRows; i++) rows.push(v ? v.rows[i] : i + base);
		var nc = Math.min(nCols, 80), html = [];
		html.push("<table><colgroup>"); for (var c = 0; c < nc; c++) if (colW(c)) html.push('<col style="width:' + colW(c) + 'px">'); html.push("</colgroup>");
		rows.forEach(function (r, i) {
			var row = d[r], tag = base && i === 0 ? "th" : "td";
			html.push("<tr>"); for (var c2 = 0; c2 < nc; c2++) { if (!colW(c2)) continue; var cell = row ? row[c2] : undefined, sa = styleAt(r, c2, cell), css = sa ? sa.css.css.replace(/color:#([0-9A-F]{6});/i, function (m0, h) { return sa.css.fill ? m0 : (O.luminance(h) > 0.6 ? "" : m0); }) : ""; html.push("<" + tag + (cell && cell.t === "n" ? ' class="n"' : "") + (css ? ' style="' + css + '"' : "") + ">" + esc(disp(cell)) + "</" + tag + ">"); }
			html.push("</tr>");
		});
		html.push("</table>");
		var more = n + base > maxRows ? "<p>Only the first " + nf(maxRows) + " rows are printed. Save the file and print it from a spreadsheet app for all " + nf(n) + ".</p>" : "";
		var doc = "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + esc(file.name + " - " + wb.SheetNames[si]) + "</title><style>@page{margin:12mm}body{font:10pt Calibri,Carlito,Arial,sans-serif;color:#000;margin:0}h1{font-size:12pt;margin:0 0 6px}table{border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #bbb;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;font-weight:normal;text-align:left}th{background:#eef2ef;font-weight:bold}td.n{text-align:right}tr{break-inside:avoid}thead{display:table-header-group}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h1>" + esc(file.name + " – " + wb.SheetNames[si]) + "</h1>" + html.join("") + more + "</body></html>";
		var fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; document.body.appendChild(fr);
		var w = fr.contentWindow; w.document.open(); w.document.write(doc); w.document.close();
		setTimeout(function () { try { w.focus(); w.print(); } catch (e) { note("Printing is blocked here.", true); } setTimeout(function () { fr.remove(); }, 60000); }, 250);
		toast("In the print window, choose “Save as PDF” to make a PDF.");
	}
	$("xl-print").onclick = printSheet;

	/* ---------- formula entry: click / drag cells to insert references, coloured outlines, F4 ---------- */
	var hlRefs = [], hlEl = null, clip = null, fillDrag = null, tfMenuEl = null, bookNamesCache = null;
	function isFormulaText(t) { return typeof t === "string" && t.length > 0 && t.charAt(0) === "="; }
	function edEl() { return editing && editing.where === "bar" ? fxin : ed; }
	function edText() { return editing ? edEl().value : ""; }
	function autoClose(v) {
		var q = false, depth = 0;
		for (var i = 0; i < v.length; i++) { var ch = v.charAt(i); if (ch === '"') q = !q; else if (!q) { if (ch === "(") depth++; else if (ch === ")" && depth > 0) depth--; } }
		if (q) v += '"';
		while (depth-- > 0) v += ")";
		return v;
	}
	function setEdText(v, a, b) {
		var el = edEl(); el.value = v;
		if (el === fxin) ed.value = v; else fxin.value = v;
		if (a != null) { try { el.setSelectionRange(a, b == null ? a : b); } catch (e) { /* ignore */ } }
		if (editing.where === "cell") placeEditor();
		refHL();
	}
	function refHL() {
		var t = edText(), was = hlRefs.length;
		hlRefs = editing && isFormulaText(t) ? X.refSpans(t) : [];
		paintEdHL();
		if (was || hlRefs.length) render();
	}
	// the cell editor is a textarea, which cannot colour parts of its text: a copy of the text sits behind it with the references coloured
	function paintEdHL() {
		if (!hlEl) { hlEl = document.createElement("div"); hlEl.className = "xl-edhl"; hlEl.setAttribute("aria-hidden", "true"); hlEl.hidden = true; grid.appendChild(hlEl); }
		var on = !!(editing && editing.where === "cell" && !ed.hidden && hlRefs.length && editing.si === si);
		ed.classList.toggle("xl-ed--hl", on); hlEl.hidden = !on;
		if (!on) return;
		var t = ed.value, h = "", p = 0;
		hlRefs.forEach(function (s) { h += esc(t.slice(p, s.start)) + '<span style="color:' + s.color + '">' + esc(t.slice(s.start, s.end)) + "</span>"; p = s.end; });
		h += esc(t.slice(p)); if (/\n$/.test(t)) h += " ";
		hlEl.innerHTML = h;
		hlEl.style.left = ed.style.left; hlEl.style.top = ed.style.top; hlEl.style.width = ed.style.width; hlEl.style.height = ed.style.height; hlEl.style.minWidth = ed.style.minWidth;
	}
	function backToEditSheet() { if (editing && editing.si != null && editing.si !== si && editing.si < wb.SheetNames.length) showSheet(editing.si, true); }
	function editSheetSwitch(i) {
		if (editing.pick) editing.pick = null;
		showSheet(i, true);
		var el = edEl(); el.focus({ preventScroll: true });
		render();
	}
	// is a click / arrow key now "pointing" (inserting a reference) rather than ending the edit?
	function pointable() {
		if (!editing || !isFormulaText(edText())) return false;
		var el = edEl(), t = el.value, p = editing.pick;
		if (p && p.si === si && t.slice(p.start, p.end) === p.text) return true;
		var s = el.selectionStart, e = el.selectionEnd;
		return X.canPoint(t.slice(0, s) + t.slice(e), s);
	}
	function pointSet(dr0, c0, dr1, c1) {
		var el = edEl(), t = el.value, p = editing.pick, s, e;
		if (p && p.si === si && t.slice(p.start, p.end) === p.text) { s = p.start; e = p.end; } else { s = el.selectionStart; e = el.selectionEnd; }
		var a = actualRow(Math.min(dr0, dr1)), b = actualRow(Math.max(dr0, dr1));
		if (a == null || b == null) return;
		var g = { s: { r: a, c: Math.min(c0, c1) }, e: { r: b, c: Math.max(c0, c1) } };
		var text = X.refText(g, si !== editing.si ? wb.SheetNames[si] : null);
		editing.pick = { start: s, end: s + text.length, text: text, si: si, dr0: dr0, c0: c0, dr1: dr1, c1: c1 };
		setEdText(t.slice(0, s) + text + t.slice(e), s + text.length);
	}
	function tryPoint(p, e) {
		if (!pointable()) return false;
		e.preventDefault();
		edEl().focus({ preventScroll: true });
		var pk = editing.pick && editing.pick.si === si ? editing.pick : null;
		if (e.shiftKey && pk) pointSet(pk.dr0, pk.c0, p.dr, p.c); else pointSet(p.dr, p.c, p.dr, p.c);
		if (e.pointerType !== "touch") { drag = { el: scroll, point: true }; try { scroll.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
		return true;
	}
	function arrowPoint(k, shift) {
		var p = editing.pick && editing.pick.si === si ? editing.pick : null, dy = k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0, dx = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
		var cur = p ? { dr0: p.dr0, c0: p.c0, dr1: p.dr1, c1: p.c1 } : (editing.si === si ? { dr0: editing.dr, c0: editing.c, dr1: editing.dr, c1: editing.c } : { dr0: sel.ar, c0: sel.ac, dr1: sel.ar, c1: sel.ac });
		cur.dr1 = Math.max(minRow(), Math.min(NR - 1, cur.dr1 + dy)); cur.c1 = Math.max(0, Math.min(NC - 1, cur.c1 + dx));
		if (!shift) { cur.dr0 = cur.dr1; cur.c0 = cur.c1; }
		pointSet(cur.dr0, cur.c0, cur.dr1, cur.c1);
		reveal(cur.dr1, cur.c1);
	}
	function f4Key(e) {
		if (e.key !== "F4" || !editing || !isFormulaText(edText())) return false;
		e.preventDefault(); e.stopPropagation();
		var el = edEl(), r = X.f4At(el.value, el.selectionStart, el.selectionEnd);
		if (r) {
			var pk = editing.pick;
			if (pk) editing.pick = Object.assign({}, pk, { start: r.start, end: r.end, text: r.text.slice(r.start, r.end) });
			setEdText(r.text, r.caret);
		}
		return true;
	}
	// outlines of the references being typed, in the colours the formula text uses
	function boxOf(g, dom, yOf, xOf) {
		var r0 = g.s.r, r1 = Math.min(g.e.r, Math.max(nRows - 1, g.s.r, 0));
		var d0 = displayRow(r0), d1 = displayRow(r1);
		if (d0 == null || d1 == null) return null;
		var a = Math.max(d0, dom.r0), b = Math.min(d1, dom.r1), c0 = Math.max(g.s.c, dom.c0), c1 = Math.min(g.e.c, dom.c1);
		if (a > b || c0 > c1) return null;
		return { l: xOf(c0), t: yOf(a), w: colX[c1 + 1] - colX[c0], h: (b - a + 1) * RH };
	}
	function boxDiv(b, cls, extra) { return b ? '<div class="' + cls + '" style="left:' + b.l + "px;top:" + b.t + "px;width:" + b.w + "px;height:" + b.h + "px;" + (extra || "") + '"></div>' : ""; }
	function refBoxes(dom, yOf, xOf) {
		if (!editing || !hlRefs.length) return "";
		var out = [];
		hlRefs.forEach(function (s) {
			var onSheet = s.sheet ? String(s.sheet).toLowerCase() === wb.SheetNames[si].toLowerCase() : editing.si === si;
			if (onSheet) out.push(boxDiv(boxOf(s.g, dom, yOf, xOf), "xl-refbox", "border-color:" + s.color + ";background:" + s.color + "1f"));
		});
		return out.join("");
	}
	function spillBox(dom, yOf, xOf) {
		if (!wb || !calc || editing || sel.mode) return "";
		var ar = actualRow(sel.ar); if (ar == null) return "";
		var g = calc.spillOf(si, ar, sel.ac);
		if (!g) { var k = calc.spilledBy[si + ":" + ar + ":" + sel.ac], p = k && k.split(":"); if (p && +p[0] === si) g = calc.spillOf(si, +p[1], +p[2]); }
		if (!g || (g.s.r === g.e.r && g.s.c === g.e.c)) return "";
		return boxDiv(boxOf(g, dom, yOf, xOf), "xl-spill");
	}
	function clipBox(dom, yOf, xOf) {
		if (!clip || clip.si !== si || editing) return "";
		var g = { s: { r: Math.min.apply(null, clip.ar), c: clip.c1 }, e: { r: Math.max.apply(null, clip.ar), c: clip.c2 } };
		return boxDiv(boxOf(g, dom, yOf, xOf), "xl-clip");
	}
	function fillPrevBox(dom, yOf, xOf) {
		if (!fillDrag || !fillDrag.prev) return "";
		var p = fillDrag.prev, a = Math.max(p.r1, dom.r0), b = Math.min(p.r2, dom.r1), c0 = Math.max(p.c1, dom.c0), c1 = Math.min(p.c2, dom.c1);
		if (a > b || c0 > c1) return "";
		return boxDiv({ l: xOf(c0), t: yOf(a), w: colX[c1 + 1] - colX[c0], h: (b - a + 1) * RH }, "xl-fillprev");
	}
	function fillHandle(dom, xOf, yOf) {
		if (!wb || editing || sel.mode === "all") return "";
		var R = selRect();
		if (R.r2 < dom.r0 || R.r2 > dom.r1 || R.c2 < dom.c0 || R.c2 > dom.c1 || R.c2 >= NC) return "";
		var w = colX[R.c2 + 1] - colX[R.c2]; if (!w) return "";
		return '<div class="xl-fh" data-fh="1" title="Drag to fill (double-click: fill down to the end of the data)" style="left:' + (xOf(R.c2) + w - 5) + "px;top:" + (yOf(R.r2) + RH - 5) + 'px"></div>';
	}
	function withMl(L, ml) { return O ? O.mergeLook(L, ml) : L; }
	function fmtState() { /* cell format toolbar: not built */ }

	/* ---------- internal clipboard (copy / cut / paste keep formulas and formats; relative references shift like Excel) ---------- */
	function isDateZ(z) { return !!(z && /[dy]/i.test(String(z).replace(/"[^"]*"/g, "")) && !/\[/.test(z)); }
	function cloneFor(cell, dr, dc) {
		if (!cell) return undefined;
		var n = Object.assign({}, cell); delete n.w; delete n.sp;
		if (n.f) { n.f = X.shiftFormula(n.f, dr, dc); n.t = n.t === "e" ? "n" : n.t; }
		return n;
	}
	function setCellObjs(list, label) {
		var s = si, ch = [];
		list.forEach(function (x) { var b = getCell(x.r, x.c); if (!b && !x.a) return; ch.push({ r: x.r, c: x.c, b: b, a: x.a }); });
		if (!ch.length) return;
		var res = writeCells(s, ch, "a");
		pushUndo({ k: "cells", si: s, ch: ch, label: label });
		afterChange(ch.some(function (x) { return x.r >= nRows || x.c >= nCols; }) || ch.some(function (x) { return !x.a; }) || !!(res && res.spilled && res.spilled.length));
	}
	function doCopy(cut) {
		if (!wb) return null;
		var R = selRect(), r2 = Math.min(R.r2, Math.max(dataN() - 1, R.r1)), c2 = Math.min(R.c2, Math.max(nCols - 1, R.c1));
		if ((r2 - R.r1 + 1) * (c2 - R.c1 + 1) > 500000) { toast("That is too many cells to copy at once."); return null; }
		var ars = [], cells = [], tsv = [], htm = [];
		for (var r = R.r1; r <= Math.max(r2, R.r1); r++) {
			var ar = actualRow(r), row = ar == null ? null : data()[ar], cr = [], tr = [], hr = [];
			for (var c = R.c1; c <= c2; c++) {
				var cell = row ? row[c] : undefined, t = disp(cell), css = "";
				try { var sa = cell ? styleAt(ar, c, cell) : null; css = sa && sa.css && sa.css.css || ""; } catch (e) { css = ""; }
				cr.push(cell ? Object.assign({}, cell) : undefined); tr.push(t); hr.push({ text: t, css: css, num: !!(cell && cell.t === "n") });
			}
			ars.push(ar); cells.push(cr); tsv.push(tr); htm.push(hr);
		}
		var text = X.toDelimited(tsv, "\t", "\n");
		clip = { si: si, ar: ars, c1: R.c1, c2: c2, cells: cells, text: text, cut: !!cut };
		render();
		return { text: text, html: X.htmlTable(htm) };
	}
	function clipSame(text) { return !!clip && String(text).replace(/\r?\n$/, "") === clip.text.replace(/\r?\n$/, ""); }
	function pasteInternal() {
		var R = selRect(), h = clip.ar.length, w = clip.c2 - clip.c1 + 1;
		var tr = R.r2 - R.r1 + 1, tc = R.c2 - R.c1 + 1;
		var nH = !clip.cut && tr > h && tr % h === 0 ? tr : h, nW = !clip.cut && tc > w && tc % w === 0 ? tc : w;
		if (nH * nW > 300000) { toast("That is too much to paste at once (" + nf(nH * nW) + " cells)."); return; }
		var t0 = actualRow(R.r1); if (t0 == null) return;
		if (clip.cut) return pasteCut(R, t0);
		var list = [], cutShort = false;
		for (var i = 0; i < nH; i++) {
			var trow = actualRow(R.r1 + i); if (trow == null) { cutShort = true; break; }
			for (var j = 0; j < nW; j++) {
				var sr = clip.ar[i % h], sc = clip.c1 + (j % w), tcol = R.c1 + j;
				if (sr == null) continue;
				list.push({ r: trow, c: tcol, a: cloneFor(clip.cells[i % h][j % w], trow - sr, tcol - sc) });
			}
		}
		try { setCellObjs(list, "Paste"); } catch (err) { note(esc(err.message), true); return; }
		sel.fr = Math.min(NR - 1, R.r1 + nH - 1); sel.fc = R.c1 + nW - 1; clampSel(); showActive(); render();
		if (cutShort) note("Only the rows showing in the sorted / filtered view were filled.");
	}
	function pasteCut(R, t0) {
		var srcName = wb.SheetNames[clip.si], dstName = wb.SheetNames[si], h = clip.ar.length, w = clip.c2 - clip.c1 + 1;
		var a0 = clip.ar[0], dr = t0 - a0, dc = R.c1 - clip.c1;
		var g = { s: { r: Math.min.apply(null, clip.ar), c: clip.c1 }, e: { r: Math.max.apply(null, clip.ar), c: clip.c2 } }, from = { sheet: srcName, g: g };
		var s0 = clip.si, dst = si;
		struct("Move cells", function () {
			var changed = [];
			// references (anywhere in the book) to cells that are moving follow them
			wb.SheetNames.forEach(function (n, s) {
				var d = wb.Sheets[n]["!data"] || [];
				for (var r = 0; r < d.length; r++) { var row = d[r]; if (!row) continue; for (var c = 0; c < row.length; c++) { var cell = row[c]; if (!cell || !cell.f) continue; var f2 = X.moveRefs(cell.f, from, dr, dc, n, dstName); if (f2 !== cell.f) { var nc = Object.assign({}, cell, { f: f2 }); delete nc.w; row[c] = nc; changed.push({ si: s, r: r, c: c }); } } }
			});
			var sd = wb.Sheets[srcName]["!data"] || (wb.Sheets[srcName]["!data"] = []), dd = wb.Sheets[dstName]["!data"] || (wb.Sheets[dstName]["!data"] = []), moved = [];
			for (var i = 0; i < h; i++) { var sr = clip.ar[i]; for (var j = 0; j < w; j++) { var cc = clip.c1 + j, cell2 = sd[sr] && sd[sr][cc]; moved.push({ r: sr + dr, c: cc + dc, cell: cell2 ? Object.assign({}, cell2) : undefined }); if (sd[sr]) sd[sr][cc] = undefined; changed.push({ si: s0, r: sr, c: cc }); } }
			moved.forEach(function (m) { if (m.cell) { delete m.cell.w; delete m.cell.sp; } if (!dd[m.r]) dd[m.r] = []; dd[m.r][m.c] = m.cell; changed.push({ si: dst, r: m.r, c: m.c }); });
			return changed;
		}, true);
		clip = null;
		sel.ar = Math.max(minRow(), R.r1); sel.ac = R.c1; sel.fr = Math.min(NR - 1, R.r1 + h - 1); sel.fc = R.c1 + w - 1; clampSel(); showActive(); render();
	}

	/* ---------- fill handle, Ctrl+D / Ctrl+R ---------- */
	function seriesVals(cells, n) {
		var src = cells.map(function (c) {
			if (!c) return { v: null };
			if (c.t === "n" && typeof c.v === "number") return { v: c.v, date: isDateZ(c.z) };
			if ((c.t === "s" || c.t === "str") && c.v != null) return { v: String(c.v) };
			if (c.t === "b") return { v: !!c.v };
			return { v: null };
		});
		if (src.some(function (x) { return x.v === null; })) return null;
		return X.fillSeries(src, n, {});
	}
	function fromVal(base, r) {
		var n = Object.assign({}, base || {}); delete n.f; delete n.w; delete n.sp; delete n.da; delete n.v; delete n.t;
		if (typeof r.v === "number") { n.t = "n"; n.v = r.v; } else if (typeof r.v === "boolean") { n.t = "b"; n.v = r.v; } else { n.t = "s"; n.v = String(r.v); }
		return n;
	}
	// R: selection (display rows); dir d / u / r / l; n = how many cells to add beyond it; copy = copy instead of making a series
	function fillCells(R, dir, n, copy, label) {
		var vert = dir === "d" || dir === "u", fwd = dir === "d" || dir === "r", ch = [], rows = [];
		for (var r = R.r1; r <= R.r2; r++) rows.push(actualRow(r));
		var nLines = vert ? R.c2 - R.c1 + 1 : rows.length, m = vert ? rows.length : R.c2 - R.c1 + 1;
		for (var L = 0; L < nLines; L++) {
			var src = [], pos = [];
			for (var i = 0; i < m; i++) { var ar = vert ? rows[i] : rows[L], c = vert ? R.c1 + L : R.c1 + i; if (ar == null) continue; src.push(getCell(ar, c)); pos.push({ r: ar, c: c }); }
			if (!src.length) continue;
			m = src.length;
			var ord = fwd ? src.slice() : src.slice().reverse(), ordPos = fwd ? pos : pos.slice().reverse();
			var hasF = ord.some(function (x) { return x && x.f; }), vals = !hasF && !copy ? seriesVals(ord, n) : null;
			for (var k = 0; k < n; k++) {
				var tr, tc;
				if (vert) { tc = R.c1 + L; tr = actualRow(fwd ? R.r2 + 1 + k : R.r1 - 1 - k); } else { tr = rows[L]; tc = fwd ? R.c2 + 1 + k : R.c1 - 1 - k; }
				if (tr == null || tr < 0 || tc < 0 || tc >= 16384) continue;
				var q = k % m, a = vals ? fromVal(ord[q], vals[k]) : cloneFor(ord[q], tr - ordPos[q].r, tc - ordPos[q].c);
				ch.push({ r: tr, c: tc, a: a });
			}
		}
		if (!ch.length) return false;
		try { setCellObjs(ch, label || "Fill"); } catch (err) { note(esc(err.message), true); return false; }
		return true;
	}
	function fillDown(copy) {
		var R = selRect(); if (!wb) return;
		if (R.r2 > R.r1) fillCells({ r1: R.r1, r2: R.r1, c1: R.c1, c2: R.c2 }, "d", R.r2 - R.r1, true, "Fill down");
		else if (R.r1 > minRow()) fillCells({ r1: R.r1 - 1, r2: R.r1 - 1, c1: R.c1, c2: R.c2 }, "d", 1, true, "Fill down");
		render(); void copy;
	}
	function fillRight() {
		var R = selRect(); if (!wb) return;
		if (R.c2 > R.c1) fillCells({ r1: R.r1, r2: R.r2, c1: R.c1, c2: R.c1 }, "r", R.c2 - R.c1, true, "Fill right");
		else if (R.c1 > 0) fillCells({ r1: R.r1, r2: R.r2, c1: R.c1 - 1, c2: R.c1 - 1 }, "r", 1, true, "Fill right");
		render();
	}
	function fillTarget(p) {
		var R = fillDrag.R, dv = p.dr > R.r2 ? p.dr - R.r2 : p.dr < R.r1 ? p.dr - R.r1 : 0, dh = p.c > R.c2 ? p.c - R.c2 : p.c < R.c1 ? p.c - R.c1 : 0;
		if (!dv && !dh) return { dir: null, n: 0, prev: null };
		if (Math.abs(dv) >= Math.abs(dh) * (dh ? 1 : 1) && dv) return dv > 0 ? { dir: "d", n: dv, prev: { r1: R.r1, r2: R.r2 + dv, c1: R.c1, c2: R.c2 } } : { dir: "u", n: -dv, prev: { r1: R.r1 + dv, r2: R.r2, c1: R.c1, c2: R.c2 } };
		return dh > 0 ? { dir: "r", n: dh, prev: { r1: R.r1, r2: R.r2, c1: R.c1, c2: R.c2 + dh } } : { dir: "l", n: -dh, prev: { r1: R.r1, r2: R.r2, c1: R.c1 + dh, c2: R.c2 } };
	}
	grid.addEventListener("pointerdown", function (e) {
		if (!wb || e.button > 0) return;
		var tf = e.target.closest && e.target.closest(".xl-tfb");
		if (tf) { e.preventDefault(); e.stopPropagation(); if (editing && !commitEdit()) return; tfMenu(tf); return; }
		var fh = e.target.closest && e.target.closest(".xl-fh");
		if (fh) {
			e.preventDefault(); e.stopPropagation();
			fillDrag = { R: selRect(), prev: null, dir: null, n: 0 };
			try { fh.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			var mv = function (ev) {
				var rect = scroll.getBoundingClientRect();
				if (ev.clientY > rect.bottom - 6) scroll.scrollTop += RH; else if (ev.clientY < rect.top + 6) scroll.scrollTop -= RH;
				if (ev.clientX > rect.right - 6) scroll.scrollLeft += 40; else if (ev.clientX < rect.left + 6) scroll.scrollLeft -= 40;
				var t = fillTarget(hitCell(ev, scroll)); fillDrag.dir = t.dir; fillDrag.n = t.n; fillDrag.prev = t.prev; render();
			};
			var up = function (ev) {
				document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
				var fd = fillDrag; if (fd && !fd.dir && ev.type === "pointerup") { var t2 = fillTarget(hitCell(ev, scroll)); fd.dir = t2.dir; fd.n = t2.n; fd.prev = t2.prev; } fillDrag = null;
				if (fd && fd.dir && fd.n > 0 && ev.type === "pointerup") {
					if (fillCells(fd.R, fd.dir, fd.n, ev.ctrlKey || ev.metaKey)) { var p = fd.prev; sel.ar = p.r1; sel.fr = p.r2; sel.ac = p.c1; sel.fc = p.c2; sel.mode = ""; clampSel(); showActive(); }
				}
				render();
			};
			document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
		}
	}, true);
	grid.addEventListener("dblclick", function (e) {
		var fh = e.target.closest && e.target.closest(".xl-fh"); if (!fh || !wb) return;
		e.preventDefault(); e.stopPropagation();
		var R = selRect(), nc = R.c1 > 0 ? R.c1 - 1 : R.c2 + 1, n = 0;
		for (var dr = R.r2 + 1; dr < NR && n < 100000; dr++) { var ar = actualRow(dr); var cl = ar == null ? null : getCell(ar, nc); if (!cl || cl.t === "z" || disp(cl) === "") break; n++; }
		if (n > 0 && fillCells(R, "d", n, false)) { sel.fr = R.r2 + n; clampSel(); showActive(); render(); }
	}, true);

	/* ---------- Excel tables (Insert > Table): banded rows, header sort / filter buttons ---------- */
	function myTables(w) { w = w || ws(); return w["!mestables"] || (w["!mestables"] = []); }
	function tableEls(t) { if (!t.els) { var p = pkgOf(); t.els = O.tableElements(t, p ? p.styles : null, p ? p.theme : null) || null; } return t.els; }
	function tableAt(ar, c) {
		var l = ws()["!mestables"]; if (!l) return null;
		for (var i = 0; i < l.length; i++) { var t = l[i]; if (ar >= t.g.s.r && ar <= t.g.e.r && c >= t.g.s.c && c <= t.g.e.c) return t; }
		return null;
	}
	function allTables() {
		var out = [];
		wb.SheetNames.forEach(function (n) {
			var w = wb.Sheets[n], x = sx(w);
			(x && x.tables || []).forEach(function (t) { out.push({ name: t.name, sheet: n, g: t.g, header: t.header, totals: t.totals, cols: t.columns || [] }); });
			(w["!mestables"] || []).forEach(function (t) { out.push({ name: t.name, sheet: n, g: t.g, header: t.header, totals: t.totals, cols: t.columns || [] }); });
		});
		return out;
	}
	var calcTables = function () { return allTables(); };
	var bookNames = function () {
		var o = {}, nm = wb && wb.Workbook && wb.Workbook.Names || [];
		nm.forEach(function (n) { if (n && n.Name && n.Ref && n.Sheet == null) o[String(n.Name).toUpperCase()] = n.Ref; });
		return o;
	};
	// the block of filled cells around (r, c) (what Excel selects for a one-cell selection)
	function region(r, c) {
		var d = data(), has = function (rr, cc) { var cl = d[rr] && d[rr][cc]; return !!(cl && cl.t !== "z" && disp(cl) !== ""); };
		var r1 = r, r2 = r, c1 = c, c2 = c, grew = true, guard = 0;
		while (grew && guard++ < 500) {
			grew = false;
			var rowHas = function (rr) { for (var cc = c1 - 1; cc <= c2 + 1; cc++) if (cc >= 0 && has(rr, cc)) return true; return false; };
			var colHas = function (cc) { for (var rr = r1 - 1; rr <= r2 + 1; rr++) if (rr >= 0 && has(rr, cc)) return true; return false; };
			if (r1 > 0 && rowHas(r1 - 1)) { r1--; grew = true; }
			if (r2 + 1 < nRows && rowHas(r2 + 1)) { r2++; grew = true; }
			if (c1 > 0 && colHas(c1 - 1)) { c1--; grew = true; }
			if (c2 + 1 < nCols && colHas(c2 + 1)) { c2++; grew = true; }
		}
		return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
	}
	function selGrid() {
		var R = selRect(), a = actualRow(R.r1), b = actualRow(Math.min(R.r2, Math.max(dataN() - 1, R.r1)));
		if (a == null || b == null) return null;
		var g = { s: { r: Math.min(a, b), c: R.c1 }, e: { r: Math.max(a, b), c: Math.min(R.c2, Math.max(nCols - 1, R.c1)) } };
		if (g.s.r === g.e.r && g.s.c === g.e.c) { var cl = getCell(g.s.r, g.s.c); if (!cl || cl.t === "z") return null; g = region(g.s.r, g.s.c); }
		return g;
	}
	function insertTable() {
		if (!wb) return;
		var g = selGrid();
		if (!g || g.e.r === g.s.r) { toast("Select the cells for the table first (a header row and at least one row of data)."); return; }
		var clash = (ws()["!mestables"] || []).some(function (t) { return !(g.e.r < t.g.s.r || g.s.r > t.g.e.r || g.e.c < t.g.s.c || g.s.c > t.g.e.c); });
		if (clash) { toast("Those cells are already in a table."); return; }
		var names = {}; allTables().forEach(function (t) { names[String(t.name).toLowerCase()] = 1; });
		var k = 1; while (names["table" + k]) k++;
		var id = 1; wb.SheetNames.forEach(function (n) { (wb.Sheets[n]["!mestables"] || []).forEach(function (t) { id = Math.max(id, t.id + 1); }); });
		struct("Insert table", function () {
			var d = data(), texts = [], c;
			for (c = g.s.c; c <= g.e.c; c++) texts.push(disp(d[g.s.r] && d[g.s.r][c]));
			var cols = O.tableColNames(texts), changed = [];
			if (!d[g.s.r]) d[g.s.r] = [];
			cols.forEach(function (nm, i) { var cc = g.s.c + i, old = d[g.s.r][cc]; if (!old || old.t === "n" || disp(old) !== nm) { d[g.s.r][cc] = Object.assign({}, old || {}, { t: "s", v: nm }); delete d[g.s.r][cc].w; delete d[g.s.r][cc].f; changed.push({ si: si, r: g.s.r, c: cc }); } });
			myTables().push({ id: id, name: "Table" + k, g: { s: { r: g.s.r, c: g.s.c }, e: { r: g.e.r, c: g.e.c } }, header: true, totals: false, style: "TableStyleMedium2", rowStripes: true, colStripes: false, firstCol: false, lastCol: false, columns: cols, cols: cols });
			return changed;
		}, true);
		toast("Made Table" + k + ". Use the arrows in the header row to sort it.");
	}
	function sortTable(t, c, dir) {
		var first = t.g.s.r + (t.header ? 1 : 0), last = t.g.e.r - (t.totals ? 1 : 0);
		if (last <= first) return;
		struct("Sort table", function () {
			var d = data(), rows = [], changed = [], i;
			for (i = first; i <= last; i++) rows.push({ i: i, row: d[i] ? d[i].slice() : [], key: X.cellValue(d[i] ? d[i][c] : undefined) });
			var rank = function (v) { return v == null || v === "" ? 3 : typeof v === "number" ? 0 : typeof v === "boolean" ? 2 : 1; };
			rows.sort(function (a, b) {
				var ra = rank(a.key), rb = rank(b.key); if (ra === 3 || rb === 3) return ra === rb ? a.i - b.i : ra === 3 ? 1 : -1;
				if (ra !== rb) return ra - rb;
				var cmp = ra === 1 ? String(a.key).toLowerCase().localeCompare(String(b.key).toLowerCase()) : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
				return cmp ? cmp * dir : a.i - b.i;
			});
			rows.forEach(function (o, k) {
				var tr = first + k; if (!d[tr]) d[tr] = [];
				for (var cc = t.g.s.c; cc <= t.g.e.c; cc++) { var src = o.row[cc]; d[tr][cc] = o.i === tr ? src : cloneFor(src, tr - o.i, 0); changed.push({ si: si, r: tr, c: cc }); }
			});
			return changed;
		}, true);
		toast("Sorted " + t.name + " by " + (t.columns[c - t.g.s.c] || X.colName(c)) + (dir > 0 ? ", A to Z." : ", Z to A."));
	}
	function closeTf() { if (tfMenuEl) { tfMenuEl.remove(); tfMenuEl = null; } }
	function tfMenu(btn) {
		closeTf();
		var parts = btn.getAttribute("data-tf").split(":"), ar = +parts[0], c = +parts[1], t = tableAt(ar, c); if (!t) return;
		var m = document.createElement("div"); m.className = "xl-menu xl-tfmenu"; m.setAttribute("role", "menu");
		var v = views[wb.SheetNames[si]], on = v && v.filters && v.filters.some(function (f) { return f.c === c && f.t === t.name; });
		m.innerHTML = '<button type="button" role="menuitem" data-a="asc"><b>Sort A to Z</b><small>smallest first</small></button><button type="button" role="menuitem" data-a="desc"><b>Sort Z to A</b><small>largest first</small></button>' +
			'<button type="button" role="menuitem" data-a="filter"><b>Show only rows that contain…</b><small>a view: the file is not changed</small></button>' + (on ? '<button type="button" role="menuitem" data-a="clear"><b>Clear this filter</b></button>' : "");
		var r = btn.getBoundingClientRect(), ar0 = app.getBoundingClientRect();
		m.style.position = "fixed"; m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 280)) + "px"; m.style.top = (r.bottom + 4) + "px"; m.style.width = "260px"; m.style.zIndex = 2147483000;
		(app.classList.contains("mes-pfill") ? app : document.body).appendChild(m); tfMenuEl = m; void ar0;
		m.addEventListener("click", function (e) {
			var b = e.target.closest("[data-a]"); if (!b) return; var a = b.getAttribute("data-a"); closeTf();
			if (a === "asc") sortTable(t, c, 1); else if (a === "desc") sortTable(t, c, -1);
			else if (a === "filter") { var val = window.prompt("Show only the rows where " + (t.columns[c - t.g.s.c] || X.colName(c)) + " contains:", ""); if (val) { var vs = vstate(); vs.filters.push({ c: c, op: "contains", v: val, t: t.name }); computeView(); } }
			else if (a === "clear") { var v2 = vstate(); v2.filters = v2.filters.filter(function (f) { return !(f.c === c && f.t === t.name); }); computeView(); }
		});
		setTimeout(function () { var f = m.querySelector("button"); if (f) f.focus(); }, 0);
		m.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeTf(); scroll.focus({ preventScroll: true }); } });
	}
	document.addEventListener("pointerdown", function (e) { if (tfMenuEl && !e.target.closest(".xl-tfmenu") && !e.target.closest(".xl-tfb")) closeTf(); }, true);
	// rows / columns inserted or deleted: tables and charts of this sheet follow (a table grows when rows go inside it; a deleted one goes)
	function shiftIdx(i, at, n, isEnd) {
		if (n > 0) return i >= at ? i + n : i;
		var m = -n; if (i >= at + m) return i + n; if (i >= at) return isEnd ? at - 1 : at; return i;
	}
	function shiftObjects(axis, at, n, name) {
		void name;
		var w = ws(), k = axis, tl = w["!mestables"], cl = w["!mescharts"];
		if (tl) w["!mestables"] = tl.filter(function (t) {
			var s0 = t.g.s[k], e0 = t.g.e[k], s1 = shiftIdx(s0, at, n, false), e1 = shiftIdx(e0, at, n, true);
			if (n < 0 && s0 >= at && e0 < at - n) return false;
			if (e1 < s1) return false;
			t.g = { s: Object.assign({}, t.g.s), e: Object.assign({}, t.g.e) }; t.g.s[k] = s1; t.g.e[k] = e1; delete t.els;
			if (k === "c") {
				var d = w["!data"] || [], cols = t.columns.slice();
				if (n > 0 && at > s0 && at <= e0) { for (var j = 0; j < n; j++) { var nm = "Column" + (cols.length + 1); while (cols.indexOf(nm) >= 0) nm += "x"; cols.splice(at - s0 + j, 0, nm); if (!d[t.g.s.r]) d[t.g.s.r] = []; d[t.g.s.r][at + j] = { t: "s", v: nm }; } }
				else if (n < 0) cols.splice(Math.max(0, at - s0), Math.min(cols.length, Math.max(0, Math.min(e0, at - n - 1) - Math.max(s0, at) + 1)));
				t.columns = cols; t.cols = cols;
			}
			return true;
		});
		if (cl) w["!mescharts"] = cl.filter(function (c) {
			var key = k === "r" ? "r" : "c", f = c.at.from, t2 = c.at.to;
			f[key] = shiftIdx(f[key], at, n, false); t2[key] = shiftIdx(t2[key], at, n, true); if (t2[key] < f[key]) t2[key] = f[key];
			["s", "e"].forEach(function (_) { /* data refs follow through the series ranges below */ });
			(c.m.series || []).forEach(function (s) { ["name", "cat", "val"].forEach(function (q) { var o = s[q]; if (o && o.g) { o.g = { s: Object.assign({}, o.g.s), e: Object.assign({}, o.g.e) }; o.g.s[k] = shiftIdx(o.g.s[k], at, n, false); o.g.e[k] = shiftIdx(o.g.e[k], at, n, true); } }); });
			chartBuild(c);
			return true;
		});
	}

	/* ---------- charts (Insert > Chart): drawn from the selection, saved into the .xlsx ---------- */
	function myCharts(w) { w = w || ws(); return w["!mescharts"] || (w["!mescharts"] = []); }
	function chartBuild(c) {
		c.xml = O.chartXml(c.m);
		var p = pkgOf();
		c.chart = O.parseChart(c.xml, p ? p.theme : null);
		return c;
	}
	function drawMyCharts(html, dark) {
		var l = ws()["!mescharts"]; if (!l) return;
		l.forEach(function (c, i) {
			var r = rectOf({ from: c.at.from, to: c.at.to }); if (!r || r.w < 30 || r.h < 30) return;
			var svg = "";
			try { svg = O.chartSvg(c.chart, chartModel(c.chart), { w: Math.round(r.w), h: Math.round(r.h), dark: dark, fmt: fmtVal }); } catch (e) { svg = ""; if (window.console) console.warn("[excel] chart", e); }
			if (svg) html.push('<div class="xl-obj xl-chart xl-mychart' + (i === mcSel ? " is-sel" : "") + '" data-mc="' + i + '" tabindex="0" role="img" aria-label="' + esc("Chart" + (c.m.title ? ": " + c.m.title : "")) + '" style="left:' + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + 'px">' + svg + '<button type="button" class="xl-mcx" data-mcx="' + i + '" aria-label="Delete this chart" title="Delete this chart">&times;</button></div>');
		});
	}
	var mcSel = -1;
	function numCell(c) { return !!(c && c.t === "n" && typeof c.v === "number"); }
	function textCell(c) { return !!(c && (c.t === "s" || c.t === "str") && String(c.v == null ? "" : c.v) !== ""); }
	function chartModelFor(type) {
		var g = selGrid();
		if (!g || (g.e.r === g.s.r && g.e.c === g.s.c)) { toast("Select the cells to chart first (for example a column of labels and a column of numbers)."); return null; }
		var d = data(), rows = g.e.r - g.s.r + 1, cols = g.e.c - g.s.c + 1;
		var cell = function (r, c) { return d[r] && d[r][c]; };
		// header row: the first row has text where the rows below have numbers
		var dataC0 = g.s.c, hasCat = false;
		var body0 = g.s.r + 1;
		var firstColText = 0, firstColNum = 0; for (var r = body0; r <= g.e.r; r++) { var q = cell(r, g.s.c); if (textCell(q)) firstColText++; else if (numCell(q)) firstColNum++; }
		var scatter = type === "scatter";
		if (cols > 1 && (scatter ? firstColNum > 0 && firstColText === 0 : firstColText > firstColNum || (firstColNum === 0 && firstColText === 0))) hasCat = true;
		if (hasCat) dataC0 = g.s.c + 1;
		var header = false;
		for (var c = dataC0; c <= g.e.c; c++) if (textCell(cell(g.s.r, c))) header = true;
		if (!header && rows > 1 && numCell(cell(g.s.r, dataC0)) === false && !textCell(cell(g.s.r, dataC0))) header = false;
		var r0 = header ? g.s.r + 1 : g.s.r;
		if (r0 > g.e.r) { toast("Select at least one row of numbers under the headings."); return null; }
		var series = [];
		for (var cc = dataC0; cc <= g.e.c; cc++) {
			var nums = 0; for (var rr = r0; rr <= g.e.r; rr++) if (numCell(cell(rr, cc))) nums++;
			if (!nums) continue;
			var s = { name: header && textCell(cell(g.s.r, cc)) ? { g: { s: { r: g.s.r, c: cc }, e: { r: g.s.r, c: cc } } } : "Series " + (series.length + 1), val: { g: { s: { r: r0, c: cc }, e: { r: g.e.r, c: cc } } } };
			if (hasCat) s.cat = { g: { s: { r: r0, c: g.s.c }, e: { r: g.e.r, c: g.s.c } } };
			series.push(s);
		}
		if (!series.length) { toast("No numbers in the selection to chart."); return null; }
		if (type === "pie" || type === "doughnut") series = series.slice(0, 1);
		var title = series.length === 1 && header && textCell(cell(g.s.r, dataC0)) ? String(cell(g.s.r, dataC0).v) : "";
		return { type: type, sheet: wb.SheetNames[si], title: title, legend: series.length > 1 || type === "pie" || type === "doughnut" ? "r" : null, series: series, grid: g };
	}
	function insertChart(type) {
		if (!wb) return;
		var m = chartModelFor(type); if (!m) return;
		var g = m.grid; delete m.grid;
		var from = { c: g.e.c + 2, co: 0, r: g.s.r, ro: 0 }, to = { c: g.e.c + 10, co: 0, r: g.s.r + 15, ro: 0 };
		var ch = chartBuild({ m: m, at: { from: from, to: to }, id: Date.now() });
		struct("Insert chart", function () { myCharts().push(ch); return []; }, true);
		S.objs = true; save(); toolState(); drawObjects(true);
		toast("Added a " + type + " chart. Drag it to move it; the × deletes it.");
	}
	function deleteChart(i) { struct("Delete chart", function () { myCharts().splice(i, 1); return []; }, true); mcSel = -1; drawObjects(true); }
	var mcDrag = null;
	$("xl-objs").addEventListener("pointerdown", function (e) {
		var x = e.target.closest("[data-mcx]"); if (x) { e.preventDefault(); e.stopPropagation(); deleteChart(+x.getAttribute("data-mcx")); return; }
		var o = e.target.closest("[data-mc]"); if (!o || e.button > 0) return;
		var i = +o.getAttribute("data-mc"), c = ws()["!mescharts"][i]; if (!c) return;
		mcSel = i; var p = hitCell(e, scroll);
		mcDrag = { i: i, dr: p.dr, c: p.c, from: JSON.parse(JSON.stringify(c.at)), moved: false };
		try { o.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
		e.preventDefault(); drawObjects(true);
	});
	$("xl-objs").addEventListener("pointermove", function (e) {
		if (!mcDrag) return;
		var p = hitCell(e, scroll), dr = actualRow(p.dr) - actualRow(mcDrag.dr), dc = p.c - mcDrag.c, c = ws()["!mescharts"][mcDrag.i]; if (!c) return;
		if (!dr && !dc && !mcDrag.moved) return;
		mcDrag.moved = true;
		var f0 = mcDrag.from.from, t0 = mcDrag.from.to, nr = Math.max(0, f0.r + dr), nc = Math.max(0, f0.c + dc);
		c.at = { from: { c: nc, co: f0.co, r: nr, ro: f0.ro }, to: { c: t0.c + (nc - f0.c), co: t0.co, r: t0.r + (nr - f0.r), ro: t0.ro } };
		drawObjects(true);
	});
	$("xl-objs").addEventListener("pointerup", function () { if (mcDrag && mcDrag.moved && file) { file.dirty = true; renderName(); autosave(); } mcDrag = null; });
	$("xl-objs").addEventListener("keydown", function (e) { var o = e.target.closest && e.target.closest("[data-mc]"); if (o && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteChart(+o.getAttribute("data-mc")); scroll.focus({ preventScroll: true }); } });
	// the editor's own tables and charts, as new parts for the .xlsx
	function mineParts(w, k) {
		var add = [], tl = w["!mestables"] || [], cl = w["!mescharts"] || [], d = w["!data"] || [];
		tl.forEach(function (t) {
			var texts = []; for (var c = t.g.s.c; c <= t.g.e.c; c++) texts.push(disp(d[t.g.s.r] && d[t.g.s.r][c]));
			t.cols = O.tableColNames(texts);
			add.push({ tag: "tablePart", relType: O.REL.table, part: "xl/tables/tableMes" + t.id + ".xml", xml: O.tableXml(t), ctType: O.CT.table });
		});
		if (cl.length) {
			var list = cl.map(function (c, i) { return { from: c.at.from, to: c.at.to, name: "Chart " + (i + 1), rid: "rId" + (i + 1) }; });
			add.push({ tag: "drawing", relType: O.REL.drawing, part: "xl/drawings/drawingMes" + (k + 1) + ".xml", xml: O.drawingXml(list), ctType: O.CT.drawing,
				rels: cl.map(function (c, i) { return { id: "rId" + (i + 1), type: O.REL.chart, target: "xl/charts/chartMes" + (k + 1) + "_" + (i + 1) + ".xml" }; }),
				sub: cl.map(function (c, i) { return { part: "xl/charts/chartMes" + (k + 1) + "_" + (i + 1) + ".xml", xml: O.chartXml(c.m), ctType: O.CT.chart }; }) });
		}
		return add;
	}

	/* ---------- Insert menu ---------- */
	if ($("xl-insmenu")) $("xl-insmenu").addEventListener("click", function (e) {
		var b = e.target.closest("[data-ins]"); if (!b) return; closeMenus();
		var w = b.getAttribute("data-ins");
		if (w === "table") insertTable(); else if (w.indexOf("chart:") === 0) insertChart(w.slice(6));
		else if (w === "fill-down") fillDown(); else if (w === "fill-right") fillRight();
	});

	/* ---------- fill window / full screen ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add(app, { bar: $("xl-pv"), onChange: function () { layout(); render(); } }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	/* ---------- start ---------- */
	$("xl-hdr").setAttribute("aria-pressed", String(S.freeze));
	showRecent();
	var q = /[?&]new=1/.test(location.search);
	if (q) newBook();
	// dark mode switched: cell colours (dark text without a fill is lightened) and charts follow
	if (window.MutationObserver) { var wasDark = isDark(); new MutationObserver(function () { var d = isDark(); if (d !== wasDark) { wasDark = d; cssCache = {}; if (wb) { render(); drawObjects(true); } } }).observe(document.body, { attributes: true, attributeFilter: ["class"] }); }
	window.MESExcelDebug = { get wb() { return wb; }, get sel() { return sel; }, openBytes: openBytes, setCells: setCells, pasteText: pasteText, get stale() { return stale; }, select: select, actualRow: actualRow,
		xlsxBytes: xlsxBytes, setFreeze: setFreeze, showSheet: showSheet, drawObjects: drawObjects, draw: draw };
})();
