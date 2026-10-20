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
