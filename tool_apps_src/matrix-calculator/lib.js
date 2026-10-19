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
