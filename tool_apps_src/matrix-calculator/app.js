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
