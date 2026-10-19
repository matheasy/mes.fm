/* MES Matrix Calculator for Machine Learning -- pure maths (no DOM). Browser global `MESMat`; node: require('./tool_apps_src/matrix-calculator/lib.js'); tests: node tool_apps_src/matrix-calculator-tests.js
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
	/* ---------- parsing ---------- */
	// "1 2 3; 4 5 6", rows on lines, commas or spaces or tabs between numbers, fractions like 1/3 and pi / e allowed, [[1,2],[3,4]] brackets stripped
	function num(tok) {
		var t = tok.trim().toLowerCase(); if (t === "pi" || t === "π") return Math.PI; if (t === "e") return Math.E; if (t === "-pi") return -Math.PI;
		var m = /^([+-]?[0-9.]+(?:e[+-]?\d+)?)\/([+-]?[0-9.]+(?:e[+-]?\d+)?)$/.exec(t); if (m) { var d = parseFloat(m[2]); need(d !== 0, "Division by zero in " + tok); return parseFloat(m[1]) / d; }
		need(/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t), "“" + tok + "” is not a number"); return parseFloat(t);
	}
	function parse(text) {
		var s = String(text || "").replace(/\]\s*,?\s*\[/g, ";").replace(/[\[\]\(\)]/g, " ").replace(/−/g, "-").trim(); if (!s) return [];
		var rows = s.split(/;|\n|\|/).map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) { return r.split(/[\s,]+/).filter(Boolean).map(num); });
		var w = rows[0].length; rows.forEach(function (r, i) { need(r.length === w, "Row " + (i + 1) + " has " + r.length + " numbers but row 1 has " + w + ". Every row needs the same count."); }); return rows;
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
		for (var col = 0; col < c && pr < n; col++) {
			var best = pr; for (var i = pr + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[best][col])) best = i;
			if (Math.abs(M[best][col]) < 1e-10) { continue; }
			if (best !== pr) { var tmp = M[best]; M[best] = M[pr]; M[pr] = tmp; swaps++; det = -det; steps.push({ op: "swap", a: pr, b: best, text: "Swap row " + (pr + 1) + " and row " + (best + 1) + " (the biggest number in this column goes on top)", M: clone(M) }); }
			var p = M[pr][col]; det *= p; if (Math.abs(p - 1) > 1e-12) { for (var j = 0; j < M[pr].length; j++) M[pr][j] /= p; steps.push({ op: "scale", a: pr, k: 1 / p, text: "Divide row " + (pr + 1) + " by " + fmt(p, 4) + " so its pivot becomes 1", M: clone(M) }); }
			for (var r = 0; r < n; r++) if (r !== pr && Math.abs(M[r][col]) > 1e-12) { var f = M[r][col]; for (var k2 = 0; k2 < M[r].length; k2++) M[r][k2] -= f * M[pr][k2]; M[r][col] = 0; steps.push({ op: "add", a: r, b: pr, k: -f, text: "Row " + (r + 1) + " − " + fmt(f, 4) + " × row " + (pr + 1) + " (clears column " + (col + 1) + ")", M: clone(M) }); }
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
	function solve(A, b) {   // A x = b for a square A (b as a column matrix or vector)
		square(A, "Solving A x = b"); var col = b.map(function (v) { return Array.isArray(v) ? v : [v]; }); need(col.length === A.length, "b must have " + A.length + " numbers."); var n = A.length, R = rref(A, col);
		need(R.pivots.length === n, "A is singular, so A x = b has no single solution (it has none, or infinitely many)."); return { x: R.M.map(function (r) { return r[n]; }), steps: R.steps };
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
		// general real matrix: unshifted-with-Wilkinson-style QR on the Hessenberg-free matrix (fine for the small sizes used here), then read 1x1 and 2x2 blocks
		var M = clone(A); for (var it = 0; it < 500 * n; it++) { var mu = M[n - 1][n - 1], S = M.map(function (r, i) { return r.map(function (v, j) { return i === j ? v - mu : v; }); }), qr = qrDecomp(S); M = mul(qr.R, qr.Q).map(function (r, i) { return r.map(function (v, j) { return i === j ? v + mu : v; }); }); var low = 0; for (var i = 1; i < n; i++) for (var j = 0; j < i - 1; j++) low += Math.abs(M[i][j]); if (low < 1e-11) { var sub = 0; for (var q = 1; q < n; q++) sub = Math.max(sub, Math.abs(M[q][q - 1])); if (sub < 1e-9 || n <= 2) break; } }
		var vals = [], i2 = 0; while (i2 < n) { if (i2 + 1 < n && Math.abs(M[i2 + 1][i2]) > 1e-8) { var a = M[i2][i2], b = M[i2][i2 + 1], c = M[i2 + 1][i2], d = M[i2 + 1][i2 + 1], tr = a + d, dt = a * d - b * c, disc = tr * tr / 4 - dt; if (disc >= 0) { vals.push({ re: tr / 2 + Math.sqrt(disc), im: 0 }, { re: tr / 2 - Math.sqrt(disc), im: 0 }); } else { vals.push({ re: tr / 2, im: Math.sqrt(-disc) }, { re: tr / 2, im: -Math.sqrt(-disc) }); } i2 += 2; } else { vals.push({ re: M[i2][i2], im: 0 }); i2++; } }
		vals.sort(function (x, y) { return Math.hypot(y.re, y.im) - Math.hypot(x.re, x.im); }); return { values: vals, vectors: null, symmetric: false };
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
	var M = { shape: shape, clone: clone, zeros: zeros, eye: eye, parse: parse, fmt: fmt, frac: frac, add: add, mul: mul, hadamard: hadamard, scale: scale, T: T, trace: trace, power: power, outer: outer, dot: dot, rref: rref, det: det, rank: rank, inverse: inverse, solve: solve, isSym: isSym, eig: eig, svd: svd, qr: qrDecomp, norm: norm, softmax: softmax, softmaxRows: softmaxRows, ACT: ACT, mapAct: mapAct, layer: layer, attention: attention, cosine: cosine, mulExplain: mulExplain };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESMat = M;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Matrix Calculator for Machine Learning: UI over MESMat (lib.js). */
(function () {
	"use strict";
	var M = window.MESMat, $ = function (id) { return document.getElementById(id); }, root = $("mx"); if (!root || !M) return;
	var KEY = "mes-matrix:v1", S = { a: "1 2; 3 4", b: "5 6; 7 8", c: "", op: "mul", p: "2", act: "relu", dp: 4, fr: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search); if (qp.get("a")) S.a = qp.get("a"); if (qp.get("b")) S.b = qp.get("b"); if (qp.get("op")) S.op = qp.get("op");
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	var toastT; function toast(m) { var t = $("mx-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function numTxt(x) { var d = +S.dp; if (S.fr) { var f = M.frac(x, 500); if (f && f.indexOf("/") > 0) return f; } return M.fmt(x, d); }
	function matHtml(A, opt) {
		opt = opt || {}; var h = '<table class="mx-m' + (opt.cls ? " " + opt.cls : "") + '" role="grid"><tbody>';
		A.forEach(function (r, i) { h += "<tr>" + r.map(function (v, j) { var heat = opt.heat ? ' style="background:rgba(124,58,237,' + (0.08 + 0.55 * Math.max(0, Math.min(1, v))).toFixed(2) + ')"' : ""; return "<td" + (opt.click ? ' data-i="' + i + '" data-j="' + j + '" tabindex="0" class="mx-click"' : "") + heat + ">" + esc(opt.fmt ? opt.fmt(v) : numTxt(v)) + "</td>"; }).join("") + "</tr>"; });
		return h + "</tbody></table>";
	}
	function block(title, inner, note) { return '<div class="tu-card mx-blk"><h3>' + esc(title) + "</h3>" + inner + (note ? '<p class="tu-note">' + note + "</p>" : "") + "</div>"; }
	function stepsHtml(steps, A) { return '<details class="mx-steps"><summary>Show the row operations (' + steps.length + " steps)</summary><ol>" + steps.map(function (s) { return "<li>" + esc(s.text) + matHtml(s.M, { cls: "mx-small" }) + "</li>"; }).join("") + "</ol></details>"; }
	function cplx(z) { return z.im ? M.fmt(z.re, +S.dp) + (z.im > 0 ? " + " : " − ") + M.fmt(Math.abs(z.im), +S.dp) + "i" : numTxt(z.re); }
	var needB = { add: 1, sub: 1, mul: 1, had: 1, vec: 1, solve: 1, layer: 1, attn: 1 };
	var OPS = [
		["Basic", [["add", "A + B"], ["sub", "A − B"], ["mul", "A × B (matrix multiplication)"], ["had", "A ∘ B (multiply number by number)"], ["scale", "k × A (multiply by a number)"], ["T", "Transpose of A"], ["pow", "A to the power n"]]],
		["Square matrices", [["det", "Determinant of A"], ["inv", "Inverse of A (with working)"], ["rank", "Rank of A"], ["trace", "Trace of A"], ["rref", "Row-reduce A (RREF, with working)"], ["solve", "Solve A·x = b (b = first column of B)"]]],
		["Decompositions", [["eig", "Eigenvalues and eigenvectors of A"], ["svd", "Singular value decomposition (SVD) of A"], ["qr", "QR decomposition of A"]]],
		["Vectors and similarity", [["vec", "Dot product, norms and cosine similarity (A and B as vectors)"], ["norm", "Norms of A"]]],
		["Machine learning", [["softmax", "Softmax of each row of A (with temperature)"], ["act", "Apply an activation function to A"], ["layer", "One dense layer: y = activation(W·x + b)"], ["attn", "Attention: softmax(Q·Kᵀ/√d)·V"]]]
	];
	$("mx-op").innerHTML = OPS.map(function (g) { return '<optgroup label="' + g[0] + '">' + g[1].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</optgroup>"; }).join("");
	var EX = [["Multiply", "1 2 3; 4 5 6", "7 8; 9 10; 11 12", "mul"], ["Inverse", "4 7; 2 6", "1 0; 0 1", "inv"], ["Eigenvalues", "2 1; 1 2", "1 0; 0 1", "eig"], ["Solve equations", "2 1; 1 3", "3; 5", "solve"], ["Softmax scores", "2 1 0.1; 0.5 0.5 3", "1 0; 0 1", "softmax"], ["Dense layer", "0.5 -1 2; 1 1 -0.5", "1; 2; 3", "layer", "0.1; -0.2"], ["Attention", "1 0; 0 1; 1 1", "1 0; 0 1; 1 1", "attn", "1 2; 3 4; 5 6"], ["SVD", "3 0; 4 5; 0 1", "1 0; 0 1", "svd"]];
	EX.forEach(function (e) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = e[0]; b.onclick = function () { S.a = e[1]; S.b = e[2]; S.c = e[4] || ""; S.op = e[3]; load(); run(); }; $("mx-ex").appendChild(b); });
	function load() { $("mx-a").value = S.a; $("mx-b").value = S.b; $("mx-c").value = S.c; $("mx-op").value = S.op; $("mx-p").value = S.p; $("mx-act").value = S.act; $("mx-dp").value = S.dp; $("mx-fr").checked = S.fr; ui(); }
	function ui() {
		var op = S.op; $("mx-pw").hidden = !(op === "scale" || op === "pow" || op === "softmax"); $("mx-pl").textContent = op === "pow" ? "Power n" : op === "scale" ? "Number k" : "Temperature"; if (op === "softmax" && $("mx-p").dataset.k !== "t") { $("mx-p").value = "1"; S.p = "1"; $("mx-p").dataset.k = "t"; } else if (op !== "softmax") $("mx-p").dataset.k = "";
		$("mx-actw").hidden = !(op === "act" || op === "layer"); $("mx-cw").hidden = !(op === "layer" || op === "attn"); $("mx-cl").textContent = op === "layer" ? "Bias b (one number per row of W)" : "Matrix V (values)";
		document.querySelector('label[for="mx-a"]').firstChild.textContent = op === "layer" ? "Weights W " : op === "attn" ? "Queries Q " : "Matrix A "; document.querySelector('label[for="mx-b"]').firstChild.textContent = op === "layer" ? "Input x (a column) " : op === "attn" ? "Keys K " : "Matrix B ";
	}
	function shapes() { ["a", "b", "c"].forEach(function (k) { var el = $("mx-s" + k); try { var A = M.parse($("mx-" + k).value); el.textContent = A.length ? "(" + A.length + " × " + A[0].length + ")" : ""; el.classList.remove("mx-bad"); } catch (e) { el.textContent = "(check numbers)"; el.classList.add("mx-bad"); } }); }
	var last = null, pa, pb;
	function run() {
		S.a = $("mx-a").value; S.b = $("mx-b").value; S.c = $("mx-c").value; S.op = $("mx-op").value; S.p = $("mx-p").value; S.act = $("mx-act").value; S.dp = +$("mx-dp").value; S.fr = $("mx-fr").checked; save(); shapes(); ui();
		var out = $("mx-out"), err = $("mx-err"); err.hidden = true; out.innerHTML = ""; last = null;
		try {
			var A = M.parse(S.a), B = M.parse(S.b), C = M.parse(S.c); pa = A; pb = B; var op = S.op, H = "", res = null;
			if (!A.length) { out.innerHTML = '<div class="tu-card tu-card--tint">Type a matrix in A to begin, or press one of the examples.</div>'; return; }
			if (needB[op] && !B.length) throw new Error("This operation needs a second matrix: fill in B.");
			var P = parseFloat(String(S.p).replace(",", ".")), sh = M.shape(A);
			if (op === "add" || op === "sub") { res = M.add(A, B, op === "sub" ? -1 : 1); H = block("A " + (op === "sub" ? "−" : "+") + " B", matHtml(res), "Each number is added to the number in the same place, so both matrices must be the same size."); }
			else if (op === "mul") { res = M.mul(A, B); H = block("A × B  (" + sh[0] + " × " + sh[1] + " times " + M.shape(B)[0] + " × " + M.shape(B)[1] + " = " + res.length + " × " + res[0].length + ")", matHtml(res, { click: true }) + '<p class="mx-why" id="mx-why">Click a number to see how it was made.</p>', "Every number is a row of A paired with a column of B: multiply the pairs, then add."); }
			else if (op === "had") { res = M.hadamard(A, B); H = block("A ∘ B", matHtml(res), "The Hadamard (element-wise) product. Neural networks use it for gating, for example in LSTMs."); }
			else if (op === "scale") { need(isFinite(P), "Type a number for k."); res = M.scale(A, P); H = block(numTxt(P) + " × A", matHtml(res)); }
			else if (op === "T") { res = M.T(A); H = block("Aᵀ  (" + res.length + " × " + res[0].length + ")", matHtml(res), "Rows become columns. In attention the transposed keys Kᵀ line up with the queries Q."); }
			else if (op === "pow") { need(Number.isInteger(P), "Type a whole number for n."); res = M.power(A, P); H = block("A^" + P, matHtml(res), "A multiplied by itself " + P + " times. Powers of a transition matrix show where a process ends up after " + P + " steps."); }
			else if (op === "det") { var d = M.det(A); H = block("Determinant of A", '<div class="mx-big">' + numTxt(d) + "</div>", Math.abs(d) < 1e-9 ? "The determinant is 0: the matrix squashes space flat, so it has no inverse." : "Not zero, so A has an inverse. The size of the determinant is how much A scales areas (or volumes)."); res = [[d]]; }
			else if (op === "inv") { var iv = M.inverse(A); res = iv.inv; H = block("Inverse of A", matHtml(res, {}) + stepsHtml(iv.steps), "Gauss-Jordan: row-reduce [A | I] until the left half is I; the right half is A⁻¹. Check: A × A⁻¹ = I."); H += block("Check: A × A⁻¹", matHtml(M.mul(A, res))); }
			else if (op === "rank") { var rk = M.rank(A); H = block("Rank of A", '<div class="mx-big">' + rk + "</div>", "The number of independent rows. Rank " + rk + " of a " + sh[0] + " × " + sh[1] + " matrix" + (rk < Math.min(sh[0], sh[1]) ? ": some rows or columns carry no new information (low rank, which is what compression and LoRA exploit)." : ": full rank.")); res = [[rk]]; }
			else if (op === "trace") { var tr = M.trace(A); H = block("Trace of A", '<div class="mx-big">' + numTxt(tr) + "</div>", "The sum of the diagonal. It also equals the sum of the eigenvalues."); res = [[tr]]; }
			else if (op === "rref") { var R = M.rref(A); res = R.M; H = block("Row-reduced form (RREF)", matHtml(res) + stepsHtml(R.steps), "Pivot columns: " + (R.pivots.map(function (c) { return c + 1; }).join(", ") || "none") + ". The number of pivots is the rank."); }
			else if (op === "solve") { var s = M.solve(A, B.map(function (r) { return [r[0]]; })); res = s.x.map(function (v) { return [v]; }); H = block("Solution x of A·x = b", matHtml(res) + stepsHtml(s.steps), "Check: A × x = " + M.mul(A, res).map(function (r) { return numTxt(r[0]); }).join(", ") + " (should equal b = " + B.map(function (r) { return numTxt(r[0]); }).join(", ") + ")."); }
			else if (op === "eig") {
				var e = M.eig(A); H = block("Eigenvalues", '<ol class="mx-ev">' + e.values.map(function (z) { return "<li>" + esc(cplx(z)) + "</li>"; }).join("") + "</ol>", e.symmetric ? "A is symmetric, so the eigenvalues are real and the eigenvectors are perpendicular (these are the principal components if A is a covariance matrix)." : "A is not symmetric: eigenvalues can be complex (a rotation), shown with i.");
				if (e.vectors) { res = e.vectors; H += block("Eigenvectors (columns, in the same order)", matHtml(e.vectors), "A·v = λ·v for each column v and its eigenvalue λ."); }
			}
			else if (op === "svd") { var sv2 = M.svd(A); H = block("Singular values", '<ol class="mx-ev">' + sv2.s.map(function (z) { return "<li>" + numTxt(z) + "</li>"; }).join("") + "</ol>", "A = U · Σ · Vᵀ. Keeping only the biggest singular values gives the best low-rank approximation of A (image compression, PCA, LoRA)."); H += block("U", matHtml(sv2.U)) + block("V", matHtml(sv2.V)); res = sv2.V; }
			else if (op === "qr") { var q = M.qr(A); H = block("Q (orthonormal columns)", matHtml(q.Q)) + block("R (upper triangular)", matHtml(q.R), "A = Q × R. Used for solving least-squares problems stably."); res = q.R; }
			else if (op === "vec") {
				var a1 = [].concat.apply([], A), b1 = [].concat.apply([], B); var dt = M.dot(a1, b1), na = M.norm(A), nb = M.norm(B), cs = (na && nb) ? dt / (na * nb) : NaN;
				H = block("A and B as vectors", '<table class="mx-kv"><tr><td>Dot product A·B</td><td>' + numTxt(dt) + "</td></tr><tr><td>Length of A (‖A‖)</td><td>" + numTxt(na) + "</td></tr><tr><td>Length of B (‖B‖)</td><td>" + numTxt(nb) + "</td></tr><tr><td>Cosine similarity</td><td>" + (isFinite(cs) ? numTxt(cs) : "undefined (a zero vector)") + "</td></tr><tr><td>Angle between them</td><td>" + (isFinite(cs) ? M.fmt(Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI, 2) + "°" : "—") + "</td></tr></table>", "All the numbers of each matrix are read in order as one long vector. Cosine similarity is 1 for the same direction, 0 for unrelated (perpendicular), −1 for opposite: it is how embeddings are compared."); res = [[dt]];
			}
			else if (op === "norm") { H = block("Norms of A", '<table class="mx-kv"><tr><td>Frobenius / L2 (√ sum of squares)</td><td>' + numTxt(M.norm(A)) + "</td></tr><tr><td>L1 (sum of absolute values)</td><td>" + numTxt(M.norm(A, "1")) + "</td></tr><tr><td>Max (largest absolute value)</td><td>" + numTxt(M.norm(A, "inf")) + "</td></tr></table>", "L1 and L2 penalties (weight decay) shrink a model's weights using these."); res = [[M.norm(A)]]; }
			else if (op === "softmax") { need(isFinite(P) && P > 0, "Temperature must be a number above 0."); res = M.softmaxRows(A, P); H = block("Softmax of each row (temperature " + numTxt(P) + ")", matHtml(res, { heat: true, fmt: function (v) { return M.fmt(v * 100, 1) + "%"; } }), "Each row now adds up to 100%. Try temperature 0.2 (almost all on the biggest) and 5 (almost even)."); }
			else if (op === "act") { res = M.mapAct(A, S.act); H = block(S.act + "(A)", matHtml(res), "Applied to every number separately. Without an activation function, stacking layers would still just be one big matrix multiplication."); }
			else if (op === "layer") {
				var bb = C.length ? C : null; var L = M.layer(A, B, bb, S.act); res = L.a; H = block("z = W·x + b", matHtml(L.z), "W is " + sh[0] + " × " + sh[1] + ", x has " + B.length + " numbers" + (bb ? ", b has " + bb.length : "") + ": the layer turns " + sh[1] + " inputs into " + sh[0] + " outputs.") + block("a = " + S.act + "(z)  (the layer's output)", matHtml(L.a));
			}
			else if (op === "attn") {
				need(C.length, "Fill in the values matrix V (same number of rows as K)."); need(M.shape(B)[1] === sh[1], "Q and K must have the same number of columns (the key size d)."); need(C.length === B.length, "V must have as many rows as K."); var at = M.attention(A, B, C, false);
				H = block("Scores = Q·Kᵀ / √" + sh[1], matHtml(at.scores)) + block("Attention weights = softmax(scores), each row adds to 100%", matHtml(at.weights, { heat: true, fmt: function (v) { return M.fmt(v * 100, 1) + "%"; } }), "Row i says how much token i looks at every other token.") + block("Output = weights · V", matHtml(at.out)); res = at.out;
			}
			out.innerHTML = H; last = res;
			var cell = out.querySelector(".mx-click"); if (cell) { /* click handler delegated */ }
		} catch (e) { err.hidden = false; err.textContent = e.message || String(e); }
		function need(c, m) { if (!c) throw new Error(m); }
	}
	$("mx-out").addEventListener("click", function (e) { var td = e.target.closest("td[data-i]"); if (!td || S.op !== "mul") return; var w = $("mx-why"); if (w) w.textContent = M.mulExplain(pa, pb, +td.dataset.i, +td.dataset.j); });
	$("mx-out").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.i) { e.preventDefault(); e.target.click(); } });
	["mx-a", "mx-b", "mx-c", "mx-p"].forEach(function (id) { $(id).addEventListener("input", run); }); ["mx-op", "mx-act", "mx-dp", "mx-fr"].forEach(function (id) { $(id).addEventListener("change", run); });
	$("mx-swap").onclick = function () { var t = $("mx-a").value; $("mx-a").value = $("mx-b").value; $("mx-b").value = t; run(); };
	$("mx-rand").onclick = function () { function rnd(r, c) { var o = []; for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push(Math.round((Math.random() * 10 - 5) * 10) / 10); o.push(row.join(" ")); } return o.join("; "); } var n = 2 + Math.floor(Math.random() * 2), m = 2 + Math.floor(Math.random() * 2), k = 2 + Math.floor(Math.random() * 2); $("mx-a").value = rnd(n, m); $("mx-b").value = rnd(m, k); run(); };
	$("mx-copy").onclick = function () { if (!last) { toast("Nothing to copy yet"); return; } var t = last.map(function (r) { return r.map(function (v) { return M.fmt(v, 6); }).join("\t"); }).join("\n"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied (paste into a spreadsheet)"); }, function () { toast("Select the numbers and press Ctrl+C"); }); };
	$("mx-use").onclick = function () { if (!last) { toast("Nothing to use yet"); return; } $("mx-a").value = last.map(function (r) { return r.map(function (v) { return M.fmt(v, 8); }).join(" "); }).join("; "); run(); };
	load(); run();
})();
