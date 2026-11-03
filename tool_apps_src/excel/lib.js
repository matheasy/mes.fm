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
