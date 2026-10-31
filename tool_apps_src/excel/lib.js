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
	var E = {}; ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#CYCLE!"].forEach(function (c) { E[c] = new Err(c); });
	var ERRCODE = { 0: "#NULL!", 7: "#DIV/0!", 15: "#VALUE!", 23: "#REF!", 29: "#NAME?", 36: "#NUM!", 42: "#N/A" };
	var ERRNUM = { "#NULL!": 0, "#DIV/0!": 7, "#VALUE!": 15, "#REF!": 23, "#NAME?": 29, "#NUM!": 36, "#N/A": 42, "#CYCLE!": 15 };
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
				var rm = /^(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(])/.exec(after);
				if (!rm) throw new SyntaxError("Unreadable reference after " + m[0]);
				push("ref", { sheet: sheet, text: rm[1] }, m[0] + rm[1]); i += m[0].length + rm[1].length; continue;
			}
			if ((m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)/i.exec(rest))) { push("err", "#" + m[1].toUpperCase(), m[0]); i += m[0].length; continue; }
			if ((m = /^(\$?[A-Za-z]{1,3}\$?\d+:\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(!])/.exec(rest)) && !/^\d+(\.\d*)?$/.test(m[1])) {
				push("ref", { sheet: null, text: m[1] }, m[1]); i += m[1].length; continue;
			}
			if ((m = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_(!.])/.exec(rest)) && parseA1(m[0])) { push("ref", { sheet: null, text: m[0] }, m[0]); i += m[0].length; continue; }
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
		var g = parseRange(t);
		if (g) return { k: "ref", sheet: sheet, g: g, single: t.indexOf(":") < 0 };
		if ((m = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(t))) { var c1 = colIndex(m[1]), c2 = colIndex(m[2]); return { k: "ref", sheet: sheet, g: { s: { r: 0, c: Math.min(c1, c2) }, e: { r: MAXR - 1, c: Math.max(c1, c2) } }, single: false, whole: "c" }; }
		if ((m = /^\$?(\d+):\$?(\d+)$/.exec(t))) { var r1 = +m[1] - 1, r2 = +m[2] - 1; return { k: "ref", sheet: sheet, g: { s: { r: Math.min(r1, r2), c: 0 }, e: { r: Math.max(r1, r2), c: MAXC - 1 } }, single: false, whole: "r" }; }
		throw new SyntaxError("Unreadable reference " + t);
	}
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
			if (t.type === "name") return { k: "name", v: t.v };
			if (t.type === "(") { var e = cmp(); expect(")"); return e; }
			if (t.type === "func") {
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
			if (t.type === "op" && t.v === "{") throw new SyntaxError("Array constants are not supported.");
			throw new SyntaxError("Unexpected “" + (t.raw || t.v) + "”");
		}
		if (!toks.length) throw new SyntaxError("The formula is empty.");
		var ast = cmp();
		if (p < toks.length) throw new SyntaxError("Unexpected “" + (toks[p].raw || toks[p].v) + "”");
		return ast;
	}
	function walk(ast, fn) { if (!ast) return; fn(ast); if (ast.a) walk(ast.a, fn); if (ast.b) walk(ast.b, fn); if (ast.args) ast.args.forEach(function (x) { walk(x, fn); }); }
	function refsOf(ast) { var out = []; walk(ast, function (n) { if (n.k === "ref") out.push({ sheet: n.sheet, g: n.g }); }); return out; }
	function unknownFunctions(ast) {
		var out = [];
		walk(ast, function (n) {
			if (n.k === "call" && !FN[n.name] && out.indexOf(n.name) < 0) out.push(n.name);
			if (n.k === "name" && out.indexOf(n.v) < 0) out.push(n.v);
		});
		return out;
	}

	/* ---------- evaluation ---------- */
	function Range(sheet, g, ctx) { this.sheet = sheet; this.g = g; this.ctx = ctx; }
	Range.prototype.each = function (fn) {
		var g = this.g, b = this.ctx.bounds ? this.ctx.bounds(this.sheet) : null;
		var r2 = g.e.r, c2 = g.e.c;
		if (b) { r2 = Math.min(r2, b.r); c2 = Math.min(c2, b.c); }
		for (var r = g.s.r; r <= r2; r++) for (var c = g.s.c; c <= c2; c++) { if (fn(this.ctx.get(this.sheet, r, c), r, c) === false) return; }
	};
	function num(x) {
		if (isErr(x)) return x;
		if (x == null) return 0;
		if (typeof x === "number") return x;
		if (typeof x === "boolean") return x ? 1 : 0;
		if (x instanceof Range) return x.g.s.r === x.g.e.r && x.g.s.c === x.g.e.c ? num(x.ctx.get(x.sheet, x.g.s.r, x.g.s.c)) : E["#VALUE!"];
		var t = String(x).trim(); if (t === "") return E["#VALUE!"];
		var n = parseNumberText(t); return n ? n.v : E["#VALUE!"];
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
		if (isErr(x)) return x;
		if (x == null) return "";
		if (typeof x === "boolean") return x ? "TRUE" : "FALSE";
		if (typeof x === "number") return fmtGeneral(x);
		if (x instanceof Range) return x.g.s.r === x.g.e.r && x.g.s.c === x.g.e.c ? txt(x.ctx.get(x.sheet, x.g.s.r, x.g.s.c)) : E["#VALUE!"];
		return String(x);
	}
	function bool(x) {
		if (isErr(x)) return x;
		if (x == null) return false;
		if (typeof x === "boolean") return x;
		if (typeof x === "number") return x !== 0;
		if (x instanceof Range) return x.g.s.r === x.g.e.r && x.g.s.c === x.g.e.c ? bool(x.ctx.get(x.sheet, x.g.s.r, x.g.s.c)) : E["#VALUE!"];
		var u = String(x).toUpperCase(); if (u === "TRUE") return true; if (u === "FALSE") return false;
		return E["#VALUE!"];
	}
	function scalar(x) { if (x instanceof Range) { var g = x.g; if (g.s.r === g.e.r && g.s.c === g.e.c) return x.ctx.get(x.sheet, g.s.r, g.s.c); return E["#VALUE!"]; } return x; }
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
	// Each argument is either a Range (from a reference) or a scalar. Excel rules: numbers inside ranges are counted, text and
	// TRUE/FALSE inside ranges are skipped; typed-in arguments are converted ("3" -> 3, TRUE -> 1), other text = #VALUE!.
	function numbersOf(args, opts) {
		var out = [], e = null;
		for (var i = 0; i < args.length && !e; i++) {
			var a = args[i];
			if (a instanceof Range) a.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number") out.push(v); });
			else if (a === undefined) continue;
			else if (isErr(a)) e = a;
			else if (typeof a === "number") out.push(a);
			else if (typeof a === "boolean") out.push(a ? 1 : 0);
			else if (a == null) { if (!opts || !opts.skipBlank) out.push(0); }
			else { var n = parseNumberText(a); if (n) out.push(n.v); else if (!opts || !opts.lenient) e = E["#VALUE!"]; }
		}
		return e || out;
	}
	var FN = {
		SUM: function (a) { var n = numbersOf(a); if (isErr(n)) return n; var s = 0; n.forEach(function (x) { s += x; }); return s; },
		AVERAGE: function (a) { var n = numbersOf(a); if (isErr(n)) return n; if (!n.length) return E["#DIV/0!"]; var s = 0; n.forEach(function (x) { s += x; }); return s / n.length; },
		MIN: function (a) { var n = numbersOf(a); if (isErr(n)) return n; return n.length ? Math.min.apply(null, n) : 0; },
		MAX: function (a) { var n = numbersOf(a); if (isErr(n)) return n; return n.length ? Math.max.apply(null, n) : 0; },
		PRODUCT: function (a) { var n = numbersOf(a); if (isErr(n)) return n; if (!n.length) return 0; var s = 1; n.forEach(function (x) { s *= x; }); return s; },
		COUNT: function (a) {
			var k = 0;
			a.forEach(function (x) {
				if (x instanceof Range) x.each(function (v) { if (typeof v === "number") k++; });
				else if (typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && parseNumberText(x))) k++;
			});
			return k;
		},
		COUNTA: function (a) {
			var k = 0;
			a.forEach(function (x) {
				if (x instanceof Range) x.each(function (v) { if (v != null) k++; });
				else if (x !== undefined) k++;
			});
			return k;
		},
		COUNTBLANK: function (a) { var k = 0; a.forEach(function (x) { if (x instanceof Range) x.each(function (v) { if (v == null || v === "") k++; }); }); return k; },
		ROUND: function (a) { var x = num(scalar(a[0])), d = a.length > 1 ? num(scalar(a[1])) : 0; if (isErr(x)) return x; if (isErr(d)) return d; return roundHalfAway(x, d); },
		ROUNDUP: function (a) { var x = num(scalar(a[0])), d = a.length > 1 ? num(scalar(a[1])) : 0; if (isErr(x)) return x; if (isErr(d)) return d; var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.ceil(y); return (x < 0 ? -1 : 1) * y / f; },
		ROUNDDOWN: function (a) { var x = num(scalar(a[0])), d = a.length > 1 ? num(scalar(a[1])) : 0; if (isErr(x)) return x; if (isErr(d)) return d; var f = Math.pow(10, Math.trunc(d)), y = Math.abs(x) * f; y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : Math.floor(y); return (x < 0 ? -1 : 1) * y / f; },
		INT: function (a) { var x = num(scalar(a[0])); return isErr(x) ? x : Math.floor(x); },
		MOD: function (a) { var x = num(scalar(a[0])), y = num(scalar(a[1])); if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return E["#DIV/0!"]; return x - y * Math.floor(x / y); },
		POWER: function (a) { var x = num(scalar(a[0])), y = num(scalar(a[1])); if (isErr(x)) return x; if (isErr(y)) return y; var r = Math.pow(x, y); return isFinite(r) ? r : E["#NUM!"]; },
		ABS: function (a) { var x = num(scalar(a[0])); return isErr(x) ? x : Math.abs(x); },
		SQRT: function (a) { var x = num(scalar(a[0])); if (isErr(x)) return x; return x < 0 ? E["#NUM!"] : Math.sqrt(x); },
		PI: function () { return Math.PI; },
		AND: function (a) { var any = false, res = true, e = null; a.forEach(function (x) { if (e) return; if (x instanceof Range) x.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number" || typeof v === "boolean") { any = true; if (!v) res = false; } }); else { var b = bool(x); if (isErr(b)) e = b; else { any = true; if (!b) res = false; } } }); return e || (any ? res : E["#VALUE!"]); },
		OR: function (a) { var any = false, res = false, e = null; a.forEach(function (x) { if (e) return; if (x instanceof Range) x.each(function (v) { if (isErr(v)) { e = v; return false; } if (typeof v === "number" || typeof v === "boolean") { any = true; if (v) res = true; } }); else { var b = bool(x); if (isErr(b)) e = b; else { any = true; if (b) res = true; } } }); return e || (any ? res : E["#VALUE!"]); },
		NOT: function (a) { var b = bool(scalar(a[0])); return isErr(b) ? b : !b; },
		LEN: function (a) { var t = txt(scalar(a[0])); return isErr(t) ? t : t.length; },
		UPPER: function (a) { var t = txt(scalar(a[0])); return isErr(t) ? t : t.toUpperCase(); },
		LOWER: function (a) { var t = txt(scalar(a[0])); return isErr(t) ? t : t.toLowerCase(); },
		TRIM: function (a) { var t = txt(scalar(a[0])); return isErr(t) ? t : t.replace(/ +/g, " ").trim(); },
		CONCATENATE: function (a) { var s = ""; for (var i = 0; i < a.length; i++) { var t = txt(scalar(a[i])); if (isErr(t)) return t; s += t; } return s; },
		CONCAT: function (a) { var s = "", e = null; a.forEach(function (x) { if (e) return; if (x instanceof Range) x.each(function (v) { if (isErr(v)) { e = v; return false; } s += txt(v); }); else { var t = txt(x); if (isErr(t)) e = t; else s += t; } }); return e || s; }
	};
	var LAZY = {
		IF: function (args, ev) {
			if (!args.length) return E["#VALUE!"];
			var c = bool(scalar(ev(args[0])));
			if (isErr(c)) return c;
			if (c) return args.length > 1 && args[1].k !== "missing" ? ev(args[1]) : (args.length > 1 ? 0 : true);
			return args.length > 2 ? (args[2].k === "missing" ? 0 : ev(args[2])) : false;
		},
		IFERROR: function (args, ev) { var v = scalar(ev(args[0])); return isErr(v) ? (args.length > 1 ? ev(args[1]) : 0) : v; }
	};
	var FUNCTIONS = Object.keys(FN).concat(Object.keys(LAZY)).sort();
	function evaluate(ast, ctx) {
		function ev(n) {
			switch (n.k) {
				case "num": case "str": case "bool": return n.v;
				case "err": return err(n.v);
				case "missing": return undefined;
				case "name": throw new Unknown(n.v);
				case "ref": {
					var sh = n.sheet == null ? ctx.sheet : n.sheet;
					if (ctx.hasSheet && !ctx.hasSheet(sh)) return E["#REF!"];
					return new Range(sh, n.g, ctx);
				}
				case "neg": { var x = num(scalar(ev(n.a))); return isErr(x) ? x : -x; }
				case "pct": { var y = num(scalar(ev(n.a))); return isErr(y) ? y : y / 100; }
				case "bin": {
					var a = scalar(ev(n.a)), b = scalar(ev(n.b));
					if (isErr(a)) return a; if (isErr(b)) return b;
					if (n.op === "&") return txt(a) + txt(b);
					if (/^(=|<>|<|>|<=|>=)$/.test(n.op)) {
						var c = compare(a, b);
						return n.op === "=" ? c === 0 : n.op === "<>" ? c !== 0 : n.op === "<" ? c < 0 : n.op === ">" ? c > 0 : n.op === "<=" ? c <= 0 : c >= 0;
					}
					var p = num(a), q = num(b);
					if (isErr(p)) return p; if (isErr(q)) return q;
					var r;
					if (n.op === "+") r = p + q; else if (n.op === "-") r = p - q; else if (n.op === "*") r = p * q;
					else if (n.op === "/") { if (q === 0) return E["#DIV/0!"]; r = p / q; }
					else if (n.op === "^") { if (p === 0 && q === 0) return E["#NUM!"]; r = Math.pow(p, q); }
					return isFinite(r) ? r : E["#NUM!"];
				}
				case "call": {
					if (LAZY[n.name]) return LAZY[n.name](n.args, ev);
					var f = FN[n.name];
					if (!f) throw new Unknown(n.name);
					return f(n.args.map(function (x) { return x.k === "missing" ? undefined : ev(x); }));
				}
			}
			return E["#VALUE!"];
		}
		var out = ev(ast);
		out = scalar(out);
		if (out === undefined) out = 0;
		if (out == null) out = 0;
		if (typeof out === "number" && !isFinite(out)) out = E["#NUM!"];
		return out;
	}
	// One-shot helper: evaluate a formula text with a get(sheet, r, c) function.
	function calc(formula, get, sheet) {
		var ast = parse(String(formula).replace(/^=/, ""));
		return evaluate(ast, { get: get, sheet: sheet || "Sheet1" });
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
		if (isErr(v)) { c.t = "e"; c.v = ERRNUM[v.code] != null ? ERRNUM[v.code] : 15; c.w = v.code; }
		else if (typeof v === "number") { c.t = "n"; c.v = v; }
		else if (typeof v === "boolean") { c.t = "b"; c.v = v; }
		else { c.t = "s"; c.v = v == null ? "" : String(v); }
		if (!c.f) delete c.f;
		return c;
	}

	/* ---------- dependency index + recalculation ---------- */
	// book = {sheets: [{name, data: [[cell, ...], ...]}]}. Calc reads book.sheets each time, so the app can swap data.
	function Calc(book) { this.book = book; this.reindex(); }
	Calc.prototype.sheetIndex = function (name) {
		var ss = this.book.sheets;
		for (var i = 0; i < ss.length; i++) if (ss[i].name === name) return i;
		var low = String(name).toLowerCase();
		for (var j = 0; j < ss.length; j++) if (ss[j].name.toLowerCase() === low) return j;
		return -1;
	};
	Calc.prototype.reindex = function () {
		this.entries = {}; this.single = {}; this.ranges = {}; this.count = 0;
		var ss = this.book.sheets;
		for (var si = 0; si < ss.length; si++) {
			var data = ss[si].data || [];
			for (var r = 0; r < data.length; r++) { var row = data[r]; if (!row) continue; for (var c = 0; c < row.length; c++) { var cell = row[c]; if (cell && cell.f) this.add(si, r, c, cell.f); } }
		}
	};
	Calc.prototype.key = function (si, r, c) { return si + ":" + r + ":" + c; };
	Calc.prototype.add = function (si, r, c, f) {
		var k = this.key(si, r, c), self = this, ent = { si: si, r: r, c: c, f: f, ast: null, refs: [], unknown: [], bad: null };
		if (this.entries[k]) this.remove(si, r, c);
		try { ent.ast = parse(f); ent.unknown = unknownFunctions(ent.ast); } catch (e) { ent.bad = e.message || "Unreadable formula"; }
		if (ent.ast) refsOf(ent.ast).forEach(function (x) {
			var tsi = x.sheet == null ? si : self.sheetIndex(x.sheet);
			if (tsi < 0) return;
			var ref = { si: tsi, g: x.g, ent: ent };
			ent.refs.push(ref);
			var sz = (x.g.e.r - x.g.s.r + 1) * (x.g.e.c - x.g.s.c + 1);
			if (sz <= 64) { for (var rr = x.g.s.r; rr <= x.g.e.r; rr++) for (var cc = x.g.s.c; cc <= x.g.e.c; cc++) { var kk = self.key(tsi, rr, cc); (self.single[kk] = self.single[kk] || []).push(ent); } ref.small = true; }
			else (self.ranges[tsi] = self.ranges[tsi] || []).push(ref);
		});
		this.entries[k] = ent; this.count++;
		return ent;
	};
	Calc.prototype.remove = function (si, r, c) {
		var k = this.key(si, r, c), ent = this.entries[k], self = this;
		if (!ent) return;
		delete this.entries[k]; this.count--;
		ent.refs.forEach(function (ref) {
			if (ref.small) { for (var rr = ref.g.s.r; rr <= ref.g.e.r; rr++) for (var cc = ref.g.s.c; cc <= ref.g.e.c; cc++) { var kk = self.key(ref.si, rr, cc), a = self.single[kk]; if (a) { var i = a.indexOf(ent); if (i >= 0) a.splice(i, 1); if (!a.length) delete self.single[kk]; } } }
			else { var l = self.ranges[ref.si]; if (l) { var j = l.indexOf(ref); if (j >= 0) l.splice(j, 1); } }
		});
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
	// changed = [{si, r, c}] cells whose value or formula just changed (formulas already registered with add()).
	// Recalculates everything that depends on them, in order. Returns {updated: [{si, r, c}], stale: [{si, r, c, unknown}], cycles: n}.
	Calc.prototype.recalc = function (changed) {
		var self = this, dirty = {}, order = [], queue = [];
		changed.forEach(function (p) { var e = self.entry(p.si, p.r, p.c); if (e) queue.push(e); queue = queue.concat(self.dependents(p.si, p.r, p.c)); });
		while (queue.length) {
			var e = queue.shift(), k = self.key(e.si, e.r, e.c);
			if (dirty[k]) continue;
			dirty[k] = e; order.push(e);
			var ds = self.dependents(e.si, e.r, e.c);
			for (var i = 0; i < ds.length; i++) if (!dirty[self.key(ds[i].si, ds[i].r, ds[i].c)]) queue.push(ds[i]);
		}
		var state = {}, updated = [], stale = [], cycles = 0, bmemo = {};
		var sheetName = function (si) { return self.book.sheets[si].name; };
		var ctx = {
			sheet: null,
			hasSheet: function (n) { return self.sheetIndex(n) >= 0; },
			bounds: function (n) { if (bmemo[n]) return bmemo[n]; var si = self.sheetIndex(n), d = self.book.sheets[si].data || []; var mc = 0; for (var i = 0; i < d.length; i++) if (d[i] && d[i].length > mc) mc = d[i].length; return (bmemo[n] = { r: d.length - 1, c: mc - 1 }); },
			get: function (n, r, c) {
				var si = self.sheetIndex(n), k = self.key(si, r, c);
				if (dirty[k] && state[k] !== 2) { if (state[k] === 1) { cycles++; return E["#CYCLE!"]; } compute(dirty[k]); }
				return cellValue(self.getCell(si, r, c));
			}
		};
		function compute(e) {
			var k = self.key(e.si, e.r, e.c);
			if (state[k] === 2) return;
			state[k] = 1;
			var old = self.getCell(e.si, e.r, e.c);
			if (!e.ast || e.unknown.length) { state[k] = 2; stale.push({ si: e.si, r: e.r, c: e.c, unknown: e.ast ? e.unknown : [], bad: e.bad }); return; }
			var saved = ctx.sheet; ctx.sheet = sheetName(e.si);
			var v;
			try { v = evaluate(e.ast, ctx); } catch (x) { if (x instanceof Unknown) { state[k] = 2; ctx.sheet = saved; stale.push({ si: e.si, r: e.r, c: e.c, unknown: [x.name] }); return; } v = E["#VALUE!"]; }
			ctx.sheet = saved;
			var cell = resultCell(v, old); cell.f = e.f;
			self.setCell(e.si, e.r, e.c, cell);
			state[k] = 2;
			updated.push({ si: e.si, r: e.r, c: e.c });
		}
		order.forEach(compute);
		return { updated: updated, stale: stale, cycles: cycles };
	};

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
	// opts: {nrows, header (true = row 0 stays first and is never filtered), sort: {c, dir: 1|-1} | null, filters: [{c, op, v}],
	//        value(r, c), text(r, c)}. Returns the row indexes to show, in order (null when there is nothing to do).
	function viewRows(opts) {
		var hasF = opts.filters && opts.filters.length, hasS = opts.sort && opts.sort.c != null;
		if (!hasF && !hasS) return null;
		var start = opts.header ? 1 : 0, rows = [];
		for (var r = start; r < opts.nrows; r++) {
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
		if (opts.header && opts.nrows > 0) rows.unshift(0);
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
		tokenize: tokenize, parse: parse, refsOf: refsOf, unknownFunctions: unknownFunctions, evaluate: evaluate, calc: calc, FUNCTIONS: FUNCTIONS,
		fmtGeneral: fmtGeneral, roundHalfAway: roundHalfAway, compare: compare,
		adjust: adjust, renameSheetRefs: renameSheetRefs, shiftIdx: shiftIdx,
		cellValue: cellValue, resultCell: resultCell, Calc: Calc,
		cmpValues: cmpValues, matchFilter: matchFilter, viewRows: viewRows, FILTER_OPS: FILTER_OPS,
		fmtBytes: fmtBytes, kindOf: kindOf, baseName: baseName, safeSheetName: safeSheetName
	};
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.MESXL = api;
})(typeof window !== "undefined" ? window : this);
