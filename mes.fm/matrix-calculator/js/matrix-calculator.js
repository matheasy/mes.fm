/* MES Matrix Calculator -- pure maths and the matrix text reader (no DOM). Browser global `MESMat`; node: require('./tool_apps_src/matrix-calculator/lib.js'); tests: node tool_apps_src/matrix-calculator-tests.js
 * A matrix is an array of rows (arrays of numbers). Everything returns new matrices; errors are thrown as Error with a plain-English message. */
(function (root) {
	"use strict";
	var EPS = 1e-12;
	function shape(A) { return [A.length, A.length ? A[0].length : 0]; }
	function clone(A) { return A.map(function (r) { return r.slice(); }); }
	function zeros(r, c) { var A = []; for (var i = 0; i < r; i++) A.push(new Array(c).fill(0)); return A; }
	function eye(n) { var A = zeros(n, n); for (var i = 0; i < n; i++) A[i][i] = 1; return A; }
	function need(c, m) { if (!c) throw new Error(m); }
	function square(A, what) { need(A.length && A.length === A[0].length, what + " needs a square matrix (same number of rows and columns), but this one is " + A.length + " × " + (A[0] || []).length + "."); }
	/* ---------- one cell: a small, safe expression evaluator (no eval) ---------- */
	// numbers (1.5, .5, 2e-3), fractions 1/3, pi π e, + - * / ^ ( ), × · ÷ − ² ³, √2, sqrt( ) cbrt abs exp ln log (natural) log10 log2 sin cos tan (radians), 30° and 50%, 2pi (implicit multiply), LaTeX bits (\frac{1}{3}, \pi, \sqrt{2})
	var FN = { sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
	var CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
	function latexCell(t) {   // the LaTeX inside one cell -> plain expression text
		var s = t.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, "").replace(/\\(?:[,;:!> ]|quad|qquad)/g, " ").replace(/~/g, " ").replace(/\\(?:mathrm|text|textrm|operatorname|mathit|mbox)\s*\{([^{}]*)\}/g, "$1");
		for (var k = 0; k < 8; k++) {   // innermost first, so nested fractions and roots work
			var s2 = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (m0, a, b) { var g = function (x) { x = x.trim(); return /^-?[\w.]+(\([^()]*\))?$/.test(x) ? x : "(" + x + ")"; }; return g(a) + "/" + g(b); })
				.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, "($2)^(1/($1))").replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)").replace(/\^\s*\{([^{}]*)\}/g, "^($1)");
			if (s2 === s) break; s = s2;
		}
		return s.replace(/\\(?:cdot|times|ast)/g, "*").replace(/\\div/g, "/").replace(/\\pi\b/g, "pi").replace(/\\(sin|cos|tan|ln|log|exp|sqrt)\b/g, "$1").replace(/\\(?:mathrm\s*)?e\b/g, "e").replace(/[{]/g, "(").replace(/[}]/g, ")");
	}
	function num(tok) {
		var src = String(tok), s = src.replace(/[−‒–]/g, "-").replace(/[×·⋅∗]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/²/g, "^2").replace(/³/g, "^3").replace(/π/g, "pi").trim();
		if (/\\/.test(s)) s = latexCell(s);
		var bad = function () { return new Error("“" + src.trim() + "” is not a number"); }, i = 0, n = s.length;
		need(n, "This cell is empty");
		function ws() { while (i < n && /\s/.test(s[i])) i++; }
		function peek() { ws(); return s[i]; }
		function expr() { var v = term(); for (;;) { var c = peek(); if (c === "+" || c === "-") { i++; var w = term(); v = c === "+" ? v + w : v - w; } else return v; } }
		function term() {
			var v = unary(); for (;;) {
				var c = peek();
				if (c === "*" || c === "/") { i++; var w = unary(); if (c === "/") { if (w === 0) throw new Error("Division by zero in “" + src.trim() + "”"); v /= w; } else v *= w; }
				else if (c === "(" || c === "√" || (c && /[a-z]/i.test(c))) v *= power();   // implicit multiplication: 2pi, 3(4), 2sqrt(3)
				else return v;
			}
		}
		function unary() { var c = peek(); if (c === "-") { i++; return -unary(); } if (c === "+") { i++; return unary(); } return power(); }
		function power() { var b = postfix(); if (peek() === "^") { i++; return Math.pow(b, unary()); } return b; }
		function postfix() { var v = primary(); for (;;) { var c = peek(); if (c === "%") { i++; v /= 100; } else if (c === "°") { i++; v *= Math.PI / 180; } else return v; } }
		function primary() {
			var c = peek(), m;
			if (c === "(") { i++; var v = expr(); if (peek() !== ")") throw bad(); i++; return v; }
			if (c === "√") { i++; return Math.sqrt(postfix()); }
			if ((m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i)))) { i += m[0].length; return parseFloat(m[0]); }
			if ((m = /^[a-z]+\d*/i.exec(s.slice(i)))) {
				var id = m[0].toLowerCase(); i += m[0].length;
				if (FN[id]) { if (peek() !== "(") throw bad(); i++; var a = expr(); if (peek() !== ")") throw bad(); i++; return FN[id](a); }
				if (id in CONST) return CONST[id];
				throw bad();
			}
			throw bad();
		}
		var v = expr(); ws(); if (i < n) throw bad(); need(isFinite(v), "“" + src.trim() + "” does not give a finite number"); return v;
	}
	/* ---------- reading a whole matrix from text (typed or pasted) ---------- */
	// Returns { rows: [[cell text]], format, notes }. Cells stay text (blank = ""); num() turns them into numbers.
	// Formats: spreadsheet copies (tabs), plain "1 2; 3 4" / one row per line / commas, MATLAB [1 2; 3 4], NumPy / Python [[1, 2], [3, 4]] and np.array(...), LaTeX bmatrix / pmatrix (& and \\),
	// Mathematica {{1,2},{3,4}}, Markdown tables. A trailing ' (MATLAB) or .T (NumPy) transposes.
	function isNum(t) { try { num(t); return true; } catch (e) { return false; } }
	function splitTop(str, re) {   // split on separators that are not inside ( ) or [ ]
		var out = [], cur = "", d = 0; for (var i = 0; i < str.length; i++) { var ch = str[i]; if (ch === "(" || ch === "[") d++; else if ((ch === ")" || ch === "]") && d > 0) d--; if (!d && re.test(ch)) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out;
	}
	function rect(rows, what, pad) {
		rows = rows.filter(function (r) { return r.length && !(r.length === 1 && r[0] === ""); }); if (!rows.length) return rows;
		var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
		rows.forEach(function (r, i) { if (r.length < w) { need(pad, "Row " + (i + 1) + " has " + r.length + " " + what + (r.length === 1 ? "" : "s") + " but " + (rows[0].length === w ? "row 1" : "another row") + " has " + w + ". Every row needs the same count."); while (r.length < w) r.push(""); } });
		return rows;
	}
	function dropHeaders(rows, notes) {   // a spreadsheet block copied with its titles: skip a first row / column of words
		var words = function (cells) { return cells.some(function (c) { return c.trim(); }) && cells.every(function (c) { return !c.trim() || !isNum(c); }); };
		if (rows.length > 1 && words(rows[0]) && rows.slice(1).some(function (r) { return r.some(isNum); })) { rows = rows.slice(1); notes.push("Skipped the header row."); }
		if (rows.length && rows[0].length > 1 && words(rows.map(function (r) { return r[0]; })) && rows.some(function (r) { return r.slice(1).some(isNum); })) { rows = rows.map(function (r) { return r.slice(1); }); notes.push("Skipped the first column of labels."); }
		return rows;
	}
	function sheetCell(c) {   // spreadsheet cell: quotes, thousands separators, a decimal comma
		var t = c.trim().replace(/^"([\s\S]*)"$/, "$1").trim();
		if (/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?%?$/.test(t)) return t.replace(/,/g, "");
		if (/^[+-]?\d+,\d+%?$/.test(t)) return t.replace(",", ".");
		return t;
	}
	function closing(s, at, open, close) { var d = 0; for (var i = at; i < s.length; i++) { if (s[i] === open) d++; else if (s[i] === close) { d--; if (!d) return i; } } return -1; }
	function mathematica(s) {   // Sqrt[2] -> sqrt(2), Pi -> pi, {{..}} -> [[..]]
		var out = "", st = []; for (var i = 0; i < s.length; i++) { var m = /^([A-Z][a-zA-Z]*)\[/.exec(s.slice(i)); if (m) { out += m[1].toLowerCase() + "("; st.push(")"); i += m[0].length - 1; continue; } var ch = s[i]; if (ch === "[") { st.push("]"); out += "["; } else if (ch === "]") out += st.pop() || "]"; else out += ch; }
		return out.replace(/\*\^/g, "e").replace(/\bPi\b/g, "pi").replace(/\bE\b/g, "e").replace(/\{/g, "[").replace(/\}/g, "]");
	}
	function parseTable(text) {
		var notes = [], fmtName = "text", tr = false;
		var s = String(text == null ? "" : text).replace(/\r\n?/g, "\n").replace(/[−‒–]/g, "-").replace(/ /g, " ").replace(/^[ \n]+|[ \n]+$/g, "");
		if (!s.replace(/\s/g, "")) return { rows: [], format: "empty", notes: notes };
		s = s.replace(/^[A-Za-z_]\w*\s*(?:=|<-)\s*(?=\S)/, "");   // "A = ..."
		var rows;
		if (/\\begin\s*\{|\\\\|&/.test(s)) {   // LaTeX: & between columns, \\ between rows
			fmtName = "LaTeX"; s = s.replace(/^\$+|\$+$/g, "").replace(/^\\\[|\\\]$/g, "").replace(/\\begin\s*\{array\}\s*\{[^}]*\}/g, "").replace(/\\(?:begin|end)\s*\{[a-zA-Z*]*\}/g, "").replace(/\\hline/g, "").replace(/\\(?:left|right)\s*(?:[\[\]()|.]|\\[{}|]|\\[lr]?[vV]ert)/g, "");
			rows = rect(s.split(/\\\\(?:\s*\[[^\]]*\])?/).map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) { return r.split("&").map(function (c) { return latexCell(c).replace(/\s+/g, " ").trim(); }); }), "number");
		}
		else if (/\t/.test(s)) {   // spreadsheet copy: tabs between columns, one row per line; short rows are padded with blanks
			fmtName = "spreadsheet"; rows = rect(s.split("\n").filter(function (r) { return r.trim(); }).map(function (r) { return r.split("\t").map(sheetCell); }), "cell", true); rows = dropHeaders(rows, notes);
		}
		else if (/^\s*\|.*\|\s*$/m.test(s) && s.split("\n").every(function (l) { return !l.trim() || /^\s*\|/.test(l); })) {   // Markdown table
			fmtName = "Markdown"; rows = s.split("\n").filter(function (l) { return l.trim() && !/^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(l); }).map(function (l) { return l.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); });
			rows = dropHeaders(rect(rows, "cell", true), notes);
		}
		else {
			if (/^\{/.test(s)) { fmtName = "Mathematica"; s = mathematica(s); }
			var py = /\b(?:np|numpy|math|torch|tf)\./.test(s);
			s = s.replace(/\b(?:np|numpy|math|torch|tf|sympy|sp)\./g, "").replace(/\*\*/g, "^");
			for (var k = 0; k < 3; k++) { var w = /^(?:array|asarray|matrix|Matrix|mat|tensor|constant)\s*\(/.exec(s); if (!w) break; var e = closing(s, w[0].length - 1, "(", ")"); need(e > 0, "A bracket is not closed."); s = (s.slice(w[0].length, e) + s.slice(e + 1)).trim(); py = true; }
			s = s.replace(/,\s*\w+\s*=\s*[\w.'"]+\s*$/, "").replace(/;\s*$/, "").trim();
			if (/(?:\.T|')\s*$/.test(s) && /[\])]\s*(?:\.T|')\s*$/.test(s)) { tr = true; s = s.replace(/(?:\.T|')\s*$/, "").trim(); }
			var open = s[0], close = open === "[" ? "]" : ")", end = /^[\[(]/.test(s) ? closing(s, 0, open, close) : -1;
			if (open === "(" && (end < 0 || s.slice(end + 1).trim())) end = -1;   // (1+2)*3 4 is plain text that starts with a bracket
			if (open === "[" || end > 0) {
				need(end > 0, "A bracket is not closed."); need(!s.slice(end + 1).trim(), "Could not read the text after the closing " + close + ".");
				var inner = s.slice(1, end), depth = 0, maxd = 0, pd = 0; for (var q = 0; q < inner.length; q++) { var ch = inner[q]; if (ch === "(") pd++; else if (ch === ")") pd--; else if (!pd && ch === "[") maxd = Math.max(maxd, ++depth); else if (!pd && ch === "]") depth--; }
				need(maxd < 2, "This looks like a 3D array. Paste one 2D matrix at a time.");
				var cellsOf = function (r) { return splitTop(r.trim(), /[,]/).length > 1 ? splitTop(r.trim(), /[,]/).map(function (c) { return c.trim(); }) : splitTop(r.trim(), /\s/).filter(Boolean); };
				if (maxd === 1) {   // [[1, 2], [3, 4]] or numpy's printout [[1 2]\n [3 4]]
					fmtName = fmtName === "Mathematica" ? fmtName : "NumPy / Python"; rows = [];
					for (var p = 0; p < inner.length; p++) { if (inner[p] === "[") { var e2 = closing(inner, p, "[", "]"); rows.push(cellsOf(inner.slice(p + 1, e2))); p = e2; } else need(/[\s,]/.test(inner[p]), "Could not read “" + inner.slice(p, p + 12).trim() + "”: every row needs its own [ ]."); }
				} else {   // [1 2; 3 4] (MATLAB) or a single Python list [1, 2, 3]
					fmtName = py ? "NumPy / Python" : fmtName === "Mathematica" ? fmtName : open === "(" ? "text" : /[;\n]/.test(inner) || !/,/.test(inner) ? "MATLAB" : "Python";
					rows = splitTop(inner, /[;\n]/).map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) { return splitTop(r, /[\s,]/).filter(Boolean); });
				}
				rows = rows.map(function (r) { return r.length > 1 && r[r.length - 1] === "" ? r.slice(0, -1) : r; });   // [1, 2,] (Python allows a trailing comma)
				rows = rect(rows, "number");
			} else {   // plain: rows separated by ; or new lines (or |), numbers by spaces or commas
				rows = rect(splitTop(s, /[;\n|]/).map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) { return splitTop(r, /[\s,]/).filter(Boolean); }), "number");
			}
		}
		if (tr && rows.length) rows = rows[0].map(function (_, j) { return rows.map(function (r) { return r[j]; }); });
		return { rows: rows, format: fmtName, notes: notes };
	}
	function toNums(rows, name) {   // text cells -> numbers; blank cells count as 0; { M, blanks, bad: [{i, j, msg}] }
		var blanks = 0, bad = [], Mx = rows.map(function (r, i) { return r.map(function (c, j) { if (!String(c).trim()) { blanks++; return 0; } try { return num(c); } catch (e) { bad.push({ i: i, j: j, msg: (name ? name + ", " : "") + "row " + (i + 1) + ", column " + (j + 1) + ": " + e.message + "." }); return NaN; } }); });
		return { M: Mx, blanks: blanks, bad: bad };
	}
	function parse(text) { var t = toNums(parseTable(text).rows); if (t.bad.length) throw new Error(t.bad[0].msg.replace(/^r/, "R")); return t.M; }
	function cellStr(x) {   // a number as cell text that keeps its value: simple fractions stay exact, other numbers keep 10 significant digits
		if (!isFinite(x)) return String(x); if (Math.abs(x) < 1e-12) return "0"; if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
		var f = frac(x, 1000), d = String(+x.toPrecision(10)); return f && f.indexOf("/") > 0 && d.replace(/^-?\d*\.?/, "").length > 4 ? f : d;
	}
	function matText(A, kind, f) {   // a matrix as text to copy: text (aligned columns) | compact ("1 2; 3 4") | tsv | latex | numpy; f = number -> display text
		f = f || cellStr; var S = A.map(function (r) { return r.map(function (v) { return typeof v === "number" ? f(v) : String(v).trim() || "0"; }); });
		if (kind === "tsv") return S.map(function (r) { return r.join("\t"); }).join("\n");
		if (kind === "compact") return S.map(function (r) { return r.map(function (c) { return c.replace(/\s+/g, ""); }).join(" "); }).join("; ");
		if (kind === "latex") return "\\begin{bmatrix} " + S.map(function (r) { return r.map(latexNum).join(" & "); }).join(" \\\\ ") + " \\end{bmatrix}";
		if (kind === "numpy") return "np.array([" + S.map(function (r) { return "[" + r.map(function (c) { return c.replace(/\^/g, "**"); }).join(", ") + "]"; }).join(", ") + "])";
		var w = S[0] ? S[0].map(function (_, j) { return Math.max.apply(null, S.map(function (r) { return r[j].length; })); }) : [];
		return S.map(function (r) { return r.map(function (c, j) { return (" ".repeat(w[j]) + c).slice(-Math.max(w[j], c.length)); }).join("  "); }).join("\n");
	}
	function latexNum(c) {
		var m = /^(-?)(\d+)\/(\d+)$/.exec(c); if (m) return m[1] + "\\frac{" + m[2] + "}{" + m[3] + "}";
		m = /^(-?[\d.]+)e([+-]?)(\d+)$/i.exec(c); if (m) return m[1] + " \\times 10^{" + (m[2] === "-" ? "-" : "") + m[3] + "}";
		return c.replace(/^-/, "-");
	}
	function fmt(x, d) {
		if (!isFinite(x)) return String(x); if (Math.abs(x) < 1e-12) x = 0; d = d == null ? 4 : d; var s = Math.abs(x) >= 1e7 || (Math.abs(x) < 1e-4 && x !== 0) ? x.toExponential(Math.max(0, d - 1)) : String(+x.toFixed(d)); return s === "-0" ? "0" : s;
	}
	function frac(x, maxDen) {   // nearest simple fraction as text ("0.3333" -> "1/3"), or null
		maxDen = maxDen || 1000; if (Number.isInteger(x)) return String(x); var sign = x < 0 ? -1 : 1, a = Math.abs(x), h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = a;
		for (var i = 0; i < 20; i++) { var q = Math.floor(b), h2 = q * h1 + h0, k2 = q * k1 + k0; if (k2 > maxDen) break; h0 = h1; h1 = h2; k0 = k1; k1 = k2; if (Math.abs(a - h1 / k1) < 1e-10) return (sign < 0 ? "-" : "") + h1 + "/" + k1; var fr = b - q; if (fr < 1e-12) break; b = 1 / fr; }
		return null;
	}
	/* ---------- basic ---------- */
	function add(A, B, sign) { var s = shape(A), t = shape(B); need(s[0] === t[0] && s[1] === t[1], "To " + (sign < 0 ? "subtract" : "add") + ", both matrices must be the same size: A is " + s[0] + " × " + s[1] + " but B is " + t[0] + " × " + t[1] + "."); return A.map(function (r, i) { return r.map(function (v, j) { return v + (sign < 0 ? -1 : 1) * B[i][j]; }); }); }
	function mul(A, B) {
		var s = shape(A), t = shape(B); need(s[1] === t[0], "To multiply A × B, the columns of A (" + s[1] + ") must equal the rows of B (" + t[0] + "). A is " + s[0] + " × " + s[1] + ", B is " + t[0] + " × " + t[1] + ".");
		var C = zeros(s[0], t[1]); for (var i = 0; i < s[0]; i++) for (var k = 0; k < s[1]; k++) { var a = A[i][k]; for (var j = 0; j < t[1]; j++) C[i][j] += a * B[k][j]; } return C;
	}
	function hadamard(A, B) { var s = shape(A), t = shape(B); need(s[0] === t[0] && s[1] === t[1], "Element-wise multiplication needs matrices of the same size."); return A.map(function (r, i) { return r.map(function (v, j) { return v * B[i][j]; }); }); }
	function scale(A, k) { return A.map(function (r) { return r.map(function (v) { return v * k; }); }); }
	function T(A) { var s = shape(A), B = zeros(s[1], s[0]); for (var i = 0; i < s[0]; i++) for (var j = 0; j < s[1]; j++) B[j][i] = A[i][j]; return B; }
	function trace(A) { square(A, "The trace"); return A.reduce(function (s, r, i) { return s + r[i]; }, 0); }
	function power(A, n) { square(A, "A power"); need(Number.isInteger(n) && n >= 0 && n <= 64, "Use a whole-number power from 0 to 64."); var R = eye(A.length), P = A; while (n > 0) { if (n & 1) R = mul(R, P); P = mul(P, P); n >>= 1; } return R; }
	function outer(a, b) { return a.map(function (x) { return b.map(function (y) { return x * y; }); }); }
	function dot(a, b) { need(a.length === b.length, "A dot product needs vectors of the same length."); return a.reduce(function (s, v, i) { return s + v * b[i]; }, 0); }
	/* ---------- elimination: determinant, inverse, rank, rref, solve (with a log of row operations) ---------- */
	function rref(A, aug) {   // reduced row echelon form of [A | aug]; returns { M, pivots, steps, swaps, det }
		var M = A.map(function (r, i) { return r.concat(aug ? aug[i] : []); }), n = M.length, c = A[0].length, steps = [], pr = 0, pivots = [], det = 1, swaps = 0;
		var snap = function () { return n * M[0].length <= 240 ? clone(M) : null; };   // a copy of the matrix after each step, only for small matrices (a 50 × 50 inverse takes ~2,500 steps)
		for (var col = 0; col < c && pr < n; col++) {
			var best = pr; for (var i = pr + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[best][col])) best = i;
			if (Math.abs(M[best][col]) < 1e-10) { continue; }
			if (best !== pr) { var tmp = M[best]; M[best] = M[pr]; M[pr] = tmp; swaps++; det = -det; steps.push({ op: "swap", a: pr, b: best, text: "Swap row " + (pr + 1) + " and row " + (best + 1) + " (the biggest number in this column goes on top)", M: snap() }); }
			var p = M[pr][col]; det *= p; if (Math.abs(p - 1) > 1e-12) { for (var j = 0; j < M[pr].length; j++) M[pr][j] /= p; steps.push({ op: "scale", a: pr, k: 1 / p, text: "Divide row " + (pr + 1) + " by " + fmt(p, 4) + " so its pivot becomes 1", M: snap() }); }
			for (var r = 0; r < n; r++) if (r !== pr && Math.abs(M[r][col]) > 1e-12) { var f = M[r][col]; for (var k2 = 0; k2 < M[r].length; k2++) M[r][k2] -= f * M[pr][k2]; M[r][col] = 0; steps.push({ op: "add", a: r, b: pr, k: -f, text: "Row " + (r + 1) + " − " + fmt(f, 4) + " × row " + (pr + 1) + " (clears column " + (col + 1) + ")", M: snap() }); }
			pivots.push(col); pr++;
		}
		return { M: M, pivots: pivots, steps: steps, swaps: swaps, det: pivots.length === Math.min(n, c) && n === c ? det : (n === c ? 0 : null) };
	}
	function det(A) { square(A, "The determinant"); var n = A.length; if (n === 1) return A[0][0]; if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0]; var M = clone(A), d = 1; for (var c = 0; c < n; c++) { var p = c; for (var i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i; if (Math.abs(M[p][c]) < 1e-14) return 0; if (p !== c) { var t = M[p]; M[p] = M[c]; M[c] = t; d = -d; } d *= M[c][c]; for (var r = c + 1; r < n; r++) { var f = M[r][c] / M[c][c]; for (var k = c; k < n; k++) M[r][k] -= f * M[c][k]; } } return d; }
	function rank(A) { return rref(A).pivots.length; }
	function inverse(A) {
		square(A, "The inverse"); var n = A.length, R = rref(A, eye(n)); need(R.pivots.length === n && R.pivots[n - 1] === n - 1, "This matrix has no inverse: it is singular (its determinant is 0, so some rows are combinations of others)."); 
		return { inv: R.M.map(function (r) { return r.slice(n); }), steps: R.steps };
	}
	function solve(A, b) {   // A x = b for a square A (b as a column matrix or vector); several columns in b = several systems at once (X has one column per column of b)
		square(A, "Solving A x = b"); var col = b.map(function (v) { return Array.isArray(v) ? v : [v]; }); need(col.length === A.length, "b must have " + A.length + " rows (one per row of A), but it has " + col.length + "."); var n = A.length, R = rref(A, col);
		need(R.pivots.length === n, "A is singular, so A x = b has no single solution (it has none, or infinitely many)."); return { x: R.M.map(function (r) { return r[n]; }), X: R.M.map(function (r) { return r.slice(n); }), steps: R.steps };
	}
	/* ---------- eigenvalues, SVD ---------- */
	function isSym(A) { for (var i = 0; i < A.length; i++) for (var j = 0; j < i; j++) if (Math.abs(A[i][j] - A[j][i]) > 1e-9 * (1 + Math.abs(A[i][j]))) return false; return true; }
	function jacobi(A) {   // symmetric: eigenvalues (descending) + orthonormal eigenvectors as columns
		var n = A.length, M = clone(A), V = eye(n);
		for (var sweep = 0; sweep < 100; sweep++) {
			var off = 0; for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) off += M[i][j] * M[i][j]; if (off < 1e-22) break;
			for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
				if (Math.abs(M[p][q]) < 1e-300) continue; var th = (M[q][q] - M[p][p]) / (2 * M[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
				for (var k = 0; k < n; k++) { var kp = M[k][p], kq = M[k][q]; M[k][p] = c * kp - s * kq; M[k][q] = s * kp + c * kq; }
				for (var k2 = 0; k2 < n; k2++) { var pk = M[p][k2], qk = M[q][k2]; M[p][k2] = c * pk - s * qk; M[q][k2] = s * pk + c * qk; }
				for (var k3 = 0; k3 < n; k3++) { var vp = V[k3][p], vq = V[k3][q]; V[k3][p] = c * vp - s * vq; V[k3][q] = s * vp + c * vq; }
			}
		}
		var idx = M.map(function (_, i) { return i; }).sort(function (a, b) { return M[b][b] - M[a][a]; });
		return { values: idx.map(function (i) { return M[i][i]; }), vectors: V.map(function (r) { return idx.map(function (i) { return r[i]; }); }) };
	}
	function eig(A) {   // { values: [{re, im}], vectors (symmetric only) }
		square(A, "Eigenvalues"); var n = A.length; if (isSym(A)) { var J = jacobi(A); return { values: J.values.map(function (v) { return { re: v, im: 0 }; }), vectors: J.vectors, symmetric: true }; }
		// general real matrix: balance, reduce to upper Hessenberg form, then the Francis double-shift QR algorithm with deflation (EISPACK balanc / elmhes / hqr), O(n^3)
		return { values: hqrEig(A), vectors: null, symmetric: false };
	}
	function hqrEig(A0) {   // all eigenvalues {re, im} of a real square matrix, biggest |λ| first; 1-based work array as in the Fortran original
		var n = A0.length, a = [[]], i, j, k, l, m, nn, its, mmin, x, y, z, w, v, u, t, s, r, q, p, anorm, c, f, g, last, wr = [], wi = [];
		for (i = 0; i < n; i++) a.push([0].concat(A0[i]));
		var sign = function (aa, bb) { return bb >= 0 ? Math.abs(aa) : -Math.abs(aa); };
		do { last = true; for (i = 1; i <= n; i++) {   // balance: scale rows / columns by powers of 2 so their norms are similar (better accuracy, exact in binary)
			r = c = 0; for (j = 1; j <= n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
			if (c && r) { g = r / 2; f = 1; s = c + r; while (c < g) { f *= 2; c *= 4; } g = r * 2; while (c > g) { f /= 2; c /= 4; } if ((c + r) / f < 0.95 * s) { last = false; g = 1 / f; for (j = 1; j <= n; j++) a[i][j] *= g; for (j = 1; j <= n; j++) a[j][i] *= f; } }
		} } while (!last);
		for (m = 2; m < n; m++) {   // reduce to upper Hessenberg form by elimination with pivoting (a similarity transform: same eigenvalues)
			x = 0; i = m; for (j = m; j <= n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
			if (i !== m) { for (j = m - 1; j <= n; j++) { t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; } for (j = 1; j <= n; j++) { t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; } }
			if (x) for (i = m + 1; i <= n; i++) { y = a[i][m - 1]; if (y) { y /= x; a[i][m - 1] = y; for (j = m; j <= n; j++) a[i][j] -= y * a[m][j]; for (j = 1; j <= n; j++) a[j][m] += y * a[j][i]; } }
		}
		for (i = 3; i <= n; i++) for (j = 1; j < i - 1; j++) a[i][j] = 0;   // drop the multipliers below the subdiagonal
		anorm = 0; for (i = 1; i <= n; i++) for (j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
		nn = n; t = 0;
		while (nn >= 1) {
			its = 0;
			do {
				for (l = nn; l >= 2; l--) { s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]); if (s === 0) s = anorm; if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; } }
				x = a[nn][nn];
				if (l === nn) { wr[nn] = x + t; wi[nn--] = 0; }   // one real root found
				else {
					y = a[nn - 1][nn - 1]; w = a[nn][nn - 1] * a[nn - 1][nn];
					if (l === nn - 1) {   // two roots found
						p = 0.5 * (y - x); q = p * p + w; z = Math.sqrt(Math.abs(q)); x += t;
						if (q >= 0) { z = p + sign(z, p); wr[nn - 1] = wr[nn] = x + z; if (z) wr[nn] = x - w / z; wi[nn - 1] = wi[nn] = 0; }
						else { wr[nn - 1] = wr[nn] = x + p; wi[nn - 1] = -(wi[nn] = z); }
						nn -= 2;
					} else {
						need(its < 60, "The eigenvalues did not converge (too many iterations).");
						if (its === 10 || its === 20 || its === 40) { t += x; for (i = 1; i <= nn; i++) a[i][i] -= x; s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]); y = x = 0.75 * s; w = -0.4375 * s * s; }   // exceptional shift
						++its;
						for (m = nn - 2; m >= l; m--) {   // look for two consecutive small subdiagonal elements
							z = a[m][m]; r = x - z; s = y - z; p = (r * s - w) / a[m + 1][m] + a[m][m + 1]; q = a[m + 1][m + 1] - z - r - s; r = a[m + 2][m + 1];
							s = Math.abs(p) + Math.abs(q) + Math.abs(r); p /= s; q /= s; r /= s;
							if (m === l) break;
							u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r)); v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
							if (u + v === v) break;
						}
						for (i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
						for (k = m; k <= nn - 1; k++) {   // double QR step on rows l..nn, columns m..nn
							if (k !== m) { p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0; if (k !== nn - 1) r = a[k + 2][k - 1]; if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; } }
							if ((s = sign(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
								if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
								p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
								for (j = k; j <= nn; j++) { p = a[k][j] + q * a[k + 1][j]; if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; } a[k + 1][j] -= p * y; a[k][j] -= p * x; }
								mmin = nn < k + 3 ? nn : k + 3;
								for (i = l; i <= mmin; i++) { p = x * a[i][k] + y * a[i][k + 1]; if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; } a[i][k + 1] -= p * q; a[i][k] -= p; }
							}
						}
					}
				}
			} while (l < nn - 1);
		}
		var vals = []; for (i = 1; i <= n; i++) vals.push({ re: wr[i], im: Math.abs(wi[i]) < 1e-14 * (1 + Math.abs(wr[i])) ? 0 : wi[i] });
		vals.sort(function (P, Q) { return Math.hypot(Q.re, Q.im) - Math.hypot(P.re, P.im) || Q.re - P.re || Q.im - P.im; }); return vals;
	}
	function qrDecomp(A) {   // Gram-Schmidt (modified), square or tall
		var s = shape(A), m = s[0], n = s[1], Q = zeros(m, n), R = zeros(n, n), V = T(A);
		for (var j = 0; j < n; j++) { var v = V[j].slice(); for (var i = 0; i < j; i++) { var qi = Q.map(function (r) { return r[i]; }), r = dot(qi, v); R[i][j] = r; for (var k = 0; k < m; k++) v[k] -= r * qi[k]; } var nr = Math.sqrt(dot(v, v)); R[j][j] = nr; for (var k2 = 0; k2 < m; k2++) Q[k2][j] = nr > 1e-14 ? v[k2] / nr : 0; }
		return { Q: Q, R: R };
	}
	function svd(A) {   // singular values (descending) and V (right singular vectors) via the symmetric matrix AtA; U from A V / sigma
		var AtA = mul(T(A), A), J = jacobi(AtA), sig = J.values.map(function (v) { return Math.sqrt(Math.max(0, v)); }), k = Math.min(shape(A)[0], shape(A)[1]), U = [];
		var AV = mul(A, J.vectors); U = AV.map(function (r) { return r.map(function (v, j) { return sig[j] > 1e-10 ? v / sig[j] : 0; }); });
		return { s: sig.slice(0, k), V: J.vectors, U: U.map(function (r) { return r.slice(0, k); }) };
	}
	/* ---------- vectors and ML helpers ---------- */
	function norm(A, kind) { var flat = [].concat.apply([], A); if (kind === "1") return flat.reduce(function (s, v) { return s + Math.abs(v); }, 0); if (kind === "inf") return Math.max.apply(null, flat.map(Math.abs)); return Math.sqrt(flat.reduce(function (s, v) { return s + v * v; }, 0)); }
	function softmax(v, temp) { temp = temp || 1; var m = Math.max.apply(null, v), e = v.map(function (x) { return Math.exp((x - m) / temp); }), s = e.reduce(function (a, b) { return a + b; }, 0); return e.map(function (x) { return x / s; }); }
	function softmaxRows(A, temp) { return A.map(function (r) { return softmax(r, temp); }); }
	var ACT = { relu: function (x) { return x > 0 ? x : 0; }, sigmoid: function (x) { return 1 / (1 + Math.exp(-x)); }, tanh: Math.tanh, leaky: function (x) { return x > 0 ? x : 0.01 * x; }, identity: function (x) { return x; }, gelu: function (x) { return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))); } };
	function mapAct(A, name) { var f = ACT[name]; need(f, "Unknown activation " + name); return A.map(function (r) { return r.map(f); }); }
	function layer(W, x, b, act) {   // y = act(W x + b), x column or vector
		var X = x.map(function (v) { return Array.isArray(v) ? v : [v]; }), Z = mul(W, X); if (b) { var B = b.map(function (v) { return Array.isArray(v) ? v[0] : v; }); need(B.length === Z.length, "b must have " + Z.length + " numbers (one per row of W)."); Z = Z.map(function (r, i) { return r.map(function (v) { return v + B[i]; }); }); }
		return { z: Z, a: mapAct(Z, act || "identity") };
	}
	function attention(Q, K, V, causal) {   // softmax(Q K^T / sqrt(d)) V
		var d = shape(Q)[1], S = scale(mul(Q, T(K)), 1 / Math.sqrt(d)); if (causal) S = S.map(function (r, i) { return r.map(function (v, j) { return j > i ? -Infinity : v; }); });
		var P = softmaxRows(S.map(function (r) { return r.map(function (v) { return v === -Infinity ? -1e9 : v; }); })); return { scores: S, weights: P, out: mul(P, V) };
	}
	function cosine(a, b) { var na = Math.sqrt(dot(a, a)), nb = Math.sqrt(dot(b, b)); need(na > 0 && nb > 0, "Cosine similarity is undefined for a zero vector."); return dot(a, b) / (na * nb); }
	function mulExplain(A, B, i, j) { var terms = A[i].map(function (v, k) { return fmt(v, 4) + " × " + fmt(B[k][j], 4); }); var val = A[i].reduce(function (s, v, k) { return s + v * B[k][j]; }, 0); return "Row " + (i + 1) + " of A · column " + (j + 1) + " of B = " + terms.join(" + ") + " = " + fmt(val, 6); }
	var M = { shape: shape, clone: clone, zeros: zeros, eye: eye, num: num, parseTable: parseTable, toNums: toNums, parse: parse, cellStr: cellStr, matText: matText, latexNum: latexNum, fmt: fmt, frac: frac, add: add, mul: mul, hadamard: hadamard, hqrEig: hqrEig, scale: scale, T: T, trace: trace, power: power, outer: outer, dot: dot, rref: rref, det: det, rank: rank, inverse: inverse, solve: solve, isSym: isSym, eig: eig, svd: svd, qr: qrDecomp, norm: norm, softmax: softmax, softmaxRows: softmaxRows, ACT: ACT, mapAct: mapAct, layer: layer, attention: attention, cosine: cosine, mulExplain: mulExplain };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESMat = M;
})(typeof window !== "undefined" ? window : globalThis);

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
