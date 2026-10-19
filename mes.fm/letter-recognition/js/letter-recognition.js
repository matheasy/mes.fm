/* MES neural network engine (no DOM): window.MESNN. A small multi-layer perceptron with backpropagation, SGD or Adam, sigmoid (binary) or softmax (many classes) output,
 * plus the 2D datasets and feature maps of the playground. Node: require('./tool_apps_src/neural-network-playground/lib.js'); tests: node tool_apps_src/neural-network-playground-tests.js */
(function (root) {
	"use strict";
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
	var ACT = {
		tanh: { f: Math.tanh, d: function (z, a) { return 1 - a * a; } },
		relu: { f: function (z) { return z > 0 ? z : 0; }, d: function (z) { return z > 0 ? 1 : 0; } },
		leaky: { f: function (z) { return z > 0 ? z : 0.01 * z; }, d: function (z) { return z > 0 ? 1 : 0.01; } },
		sigmoid: { f: function (z) { return 1 / (1 + Math.exp(-z)); }, d: function (z, a) { return a * (1 - a); } },
		linear: { f: function (z) { return z; }, d: function () { return 1; } }
	};
	/* sizes = [inputs, hidden..., outputs]; out = "sigmoid" (one output, binary) or "softmax" (one output per class) */
	function Net(sizes, o) {
		o = o || {}; this.sizes = sizes.slice(); this.act = o.act || "tanh"; this.out = o.out || (sizes[sizes.length - 1] === 1 ? "sigmoid" : "softmax"); this.l2 = o.l2 || 0; this.seed = o.seed == null ? 1 : o.seed; this.t = 0;
		var r = rng(this.seed); this.W = []; this.b = []; this.mW = []; this.vW = []; this.mb = []; this.vb = [];
		for (var l = 1; l < sizes.length; l++) {
			var fin = sizes[l - 1], fout = sizes[l], sc = (this.act === "relu" || this.act === "leaky") ? Math.sqrt(2 / fin) : Math.sqrt(1 / fin) * (this.act === "tanh" ? 1.4 : 1), W = new Float64Array(fin * fout);
			for (var i = 0; i < W.length; i++) W[i] = gauss(r) * sc; this.W.push(W); this.b.push(new Float64Array(fout)); this.mW.push(new Float64Array(W.length)); this.vW.push(new Float64Array(W.length)); this.mb.push(new Float64Array(fout)); this.vb.push(new Float64Array(fout));
		}
	}
	Net.prototype.forward = function (x, keep) {
		var L = this.sizes.length - 1, a = Float64Array.from(x), As = [a], Zs = [null];
		for (var l = 0; l < L; l++) {
			var fin = this.sizes[l], fout = this.sizes[l + 1], W = this.W[l], b = this.b[l], z = new Float64Array(fout), last = l === L - 1;
			for (var j = 0; j < fout; j++) { var s = b[j], o = j * fin; for (var i = 0; i < fin; i++) s += W[o + i] * a[i]; z[j] = s; }
			var na = new Float64Array(fout);
			if (last) { if (this.out === "softmax") { var m = -Infinity, sum = 0, k; for (k = 0; k < fout; k++) if (z[k] > m) m = z[k]; for (k = 0; k < fout; k++) { na[k] = Math.exp(z[k] - m); sum += na[k]; } for (k = 0; k < fout; k++) na[k] /= sum; } else for (var q = 0; q < fout; q++) na[q] = 1 / (1 + Math.exp(-z[q])); }
			else { var f = ACT[this.act].f; for (var q2 = 0; q2 < fout; q2++) na[q2] = f(z[q2]); }
			Zs.push(z); As.push(na); a = na;
		}
		return keep ? { A: As, Z: Zs, y: a } : a;
	};
	Net.prototype.predict = function (x) { return this.forward(x); };
	// gradients of the mean loss over a batch (+ L2 on weights); returns { gW, gb, loss }
	Net.prototype.grads = function (X, Y) {
		var L = this.sizes.length - 1, gW = this.W.map(function (w) { return new Float64Array(w.length); }), gb = this.b.map(function (b) { return new Float64Array(b.length); }), loss = 0, n = X.length, d = ACT[this.act].d;
		for (var s = 0; s < n; s++) {
			var c = this.forward(X[s], true), y = Y[s], out = c.y, delta = new Float64Array(out.length), k;
			if (this.out === "softmax") { for (k = 0; k < out.length; k++) { delta[k] = out[k] - (y === k ? 1 : 0); } loss -= Math.log(Math.max(1e-12, out[y])); }
			else { var t = Array.isArray(y) ? y[0] : y, p = out[0]; delta[0] = p - t; loss -= t * Math.log(Math.max(1e-12, p)) + (1 - t) * Math.log(Math.max(1e-12, 1 - p)); }
			for (var l = L; l >= 1; l--) {
				var fin = this.sizes[l - 1], fout = this.sizes[l], aPrev = c.A[l - 1], W = this.W[l - 1], gw = gW[l - 1], gbl = gb[l - 1];
				for (var j = 0; j < fout; j++) { gbl[j] += delta[j]; var o = j * fin, dj = delta[j]; for (var i = 0; i < fin; i++) gw[o + i] += dj * aPrev[i]; }
				if (l > 1) { var nd = new Float64Array(fin); for (var i2 = 0; i2 < fin; i2++) { var sum = 0; for (var j2 = 0; j2 < fout; j2++) sum += W[j2 * fin + i2] * delta[j2]; nd[i2] = sum * d(c.Z[l - 1][i2], c.A[l - 1][i2]); } delta = nd; }
			}
		}
		var reg = 0; for (var l2 = 0; l2 < L; l2++) { var w2 = this.W[l2], g2 = gW[l2]; for (var q = 0; q < w2.length; q++) { g2[q] = g2[q] / n + this.l2 * w2[q]; reg += 0.5 * this.l2 * w2[q] * w2[q]; } for (var q2 = 0; q2 < gb[l2].length; q2++) gb[l2][q2] /= n; }
		return { gW: gW, gb: gb, loss: loss / n + reg };
	};
	Net.prototype.step = function (g, lr, optim, momentum) {
		this.t++; var L = this.W.length, b1 = 0.9, b2 = 0.999, adam = optim === "adam";
		for (var l = 0; l < L; l++) for (var pass = 0; pass < 2; pass++) {
			var P = pass ? this.b[l] : this.W[l], G = pass ? g.gb[l] : g.gW[l], M1 = pass ? this.mb[l] : this.mW[l], V = pass ? this.vb[l] : this.vW[l];
			for (var i = 0; i < P.length; i++) {
				if (adam) { M1[i] = b1 * M1[i] + (1 - b1) * G[i]; V[i] = b2 * V[i] + (1 - b2) * G[i] * G[i]; P[i] -= lr * (M1[i] / (1 - Math.pow(b1, this.t))) / (Math.sqrt(V[i] / (1 - Math.pow(b2, this.t))) + 1e-8); }
				else if (momentum) { M1[i] = momentum * M1[i] - lr * G[i]; P[i] += M1[i]; } else P[i] -= lr * G[i];
			}
		}
	};
	Net.prototype.train = function (X, Y, o) {   // one pass over the data in shuffled mini-batches; returns the mean batch loss
		o = o || {}; var n = X.length, bs = Math.max(1, Math.min(o.batch || 16, n)), idx = []; for (var i = 0; i < n; i++) idx.push(i);
		var r = o.rand || Math.random; for (var j = n - 1; j > 0; j--) { var k = Math.floor(r() * (j + 1)), t = idx[j]; idx[j] = idx[k]; idx[k] = t; }
		var tot = 0, nb = 0; for (var s = 0; s < n; s += bs) { var bx = [], by = []; for (var q = s; q < Math.min(n, s + bs); q++) { bx.push(X[idx[q]]); by.push(Y[idx[q]]); } var g = this.grads(bx, by); this.step(g, o.lr || 0.03, o.optim || "adam", o.momentum || 0); tot += g.loss; nb++; }
		return tot / nb;
	};
	Net.prototype.loss = function (X, Y) { var l = 0; for (var s = 0; s < X.length; s++) { var out = this.forward(X[s]), y = Y[s]; if (this.out === "softmax") l -= Math.log(Math.max(1e-12, out[y])); else { var t = Array.isArray(y) ? y[0] : y, p = out[0]; l -= t * Math.log(Math.max(1e-12, p)) + (1 - t) * Math.log(Math.max(1e-12, 1 - p)); } } return l / X.length; };
	Net.prototype.classify = function (x) { var o = this.forward(x); if (this.out === "softmax") { var b = 0; for (var k = 1; k < o.length; k++) if (o[k] > o[b]) b = k; return b; } return o[0] >= 0.5 ? 1 : 0; };
	Net.prototype.accuracy = function (X, Y) { var ok = 0; for (var s = 0; s < X.length; s++) if (this.classify(X[s]) === (Array.isArray(Y[s]) ? Y[s][0] : Y[s])) ok++; return ok / X.length; };
	Net.prototype.paramCount = function () { var n = 0; for (var l = 0; l < this.W.length; l++) n += this.W[l].length + this.b[l].length; return n; };
	Net.prototype.toJSON = function () { return { sizes: this.sizes, act: this.act, out: this.out, l2: this.l2, W: this.W.map(function (w) { return Array.from(w); }), b: this.b.map(function (b) { return Array.from(b); }) }; };
	Net.fromJSON = function (j) { var n = new Net(j.sizes, { act: j.act, out: j.out, l2: j.l2 }); n.W = j.W.map(function (w) { return Float64Array.from(w); }); n.b = j.b.map(function (b) { return Float64Array.from(b); }); return n; };

	/* ---------- 2D datasets in [-1, 1]^2: { X: [[x, y]], y: [0|1] } ---------- */
	var DATASETS = [["circle", "Circle"], ["xor", "XOR (four corners)"], ["gauss", "Two clusters"], ["moons", "Two moons"], ["spiral", "Spiral"], ["line", "Split by a line"]];
	function makeData(kind, n, noise, seed) {
		var r = rng(seed == null ? 7 : seed), X = [], y = [], i, nz = noise || 0;
		function push(x0, y0, c) { X.push([Math.max(-1, Math.min(1, x0 + gauss(r) * nz * 0.25)), Math.max(-1, Math.min(1, y0 + gauss(r) * nz * 0.25))]); y.push(c); }
		for (i = 0; i < n; i++) {
			var c = i % 2;
			if (kind === "circle") { var a = r() * 2 * Math.PI, rad = c ? 0.25 + r() * 0.2 : 0.65 + r() * 0.25; push(Math.cos(a) * rad, Math.sin(a) * rad, c); }
			else if (kind === "xor") { var sx = (r() < 0.5 ? -1 : 1), sy = (r() < 0.5 ? -1 : 1); push(sx * (0.15 + r() * 0.75), sy * (0.15 + r() * 0.75), sx * sy > 0 ? 1 : 0); }
			else if (kind === "gauss") push((c ? 0.45 : -0.45) + gauss(r) * 0.2, (c ? 0.4 : -0.4) + gauss(r) * 0.2, c);
			else if (kind === "moons") { var t = r() * Math.PI; if (c) push(0.4 - Math.cos(t) * 0.6 + 0.0, -0.1 + Math.sin(t) * 0.0 - Math.sin(t) * 0.6 + 0.4, c); else push(-0.4 + Math.cos(t) * 0.6, 0.0 + Math.sin(t) * 0.6 - 0.1, c); }
			else if (kind === "spiral") { var tt = r() * 3.2 + 0.2, ang = tt * 1.6 + c * Math.PI; push(Math.cos(ang) * tt * 0.27, Math.sin(ang) * tt * 0.27, c); }
			else { var px = r() * 2 - 1, py = r() * 2 - 1, d = px - py; if (Math.abs(d) < 0.12) { i--; continue; } push(px, py, d > 0 ? 1 : 0); }
		}
		return { X: X, y: y };
	}
	/* ---------- input features of a 2D point ---------- */
	var FEATS = [["x", "x", function (x) { return x[0]; }], ["y", "y", function (x) { return x[1]; }], ["x2", "x²", function (x) { return x[0] * x[0]; }], ["y2", "y²", function (x) { return x[1] * x[1]; }], ["xy", "x·y", function (x) { return x[0] * x[1]; }], ["sinx", "sin(3x)", function (x) { return Math.sin(3 * x[0]); }], ["siny", "sin(3y)", function (x) { return Math.sin(3 * x[1]); }]];
	function featurize(P, keys) { var fs = keys.map(function (k) { return FEATS.filter(function (f) { return f[0] === k; })[0][2]; }); return P.map(function (p) { return fs.map(function (f) { return f(p); }); }); }
	function split(D, frac, seed) { var r = rng(seed || 3), idx = D.X.map(function (_, i) { return i; }); for (var j = idx.length - 1; j > 0; j--) { var k = Math.floor(r() * (j + 1)), t = idx[j]; idx[j] = idx[k]; idx[k] = t; } var cut = Math.round(idx.length * frac); return { train: { X: idx.slice(0, cut).map(function (i) { return D.X[i]; }), y: idx.slice(0, cut).map(function (i) { return D.y[i]; }) }, test: { X: idx.slice(cut).map(function (i) { return D.X[i]; }), y: idx.slice(cut).map(function (i) { return D.y[i]; }) } }; }
	root.MESNN = { rng: rng, gauss: gauss, Net: Net, ACT: ACT, DATASETS: DATASETS, makeData: makeData, FEATS: FEATS, featurize: featurize, split: split };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESNN;
})(typeof window !== "undefined" ? window : globalThis);

/* MES letter / digit recognition helpers (no DOM): window.MESOCR. Turns a drawing (ink values 0..1 on a w x h grid) into the small, centred, size-normalised grid the network sees,
 * and scores results. The network itself is MESNN (neural-network-playground/lib.js). Node: require('./tool_apps_src/letter-recognition/lib.js'); tests: node tool_apps_src/letter-recognition-tests.js */
(function (root) {
	"use strict";
	var SETS = { digits: "0123456789".split(""), letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), both: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") };
	// ink (0..1) on a w x h grid -> N x N: crop to the ink, scale to fit (N - 2*margin), then move the centre of mass to the middle (the way MNIST digits were prepared)
	function normalise(ink, w, h, N, margin) {
		margin = margin == null ? 1.5 : margin; var x0 = w, y0 = h, x1 = -1, y1 = -1, i, j;
		for (j = 0; j < h; j++) for (i = 0; i < w; i++) if (ink[j * w + i] > 0.2) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
		var out = new Float32Array(N * N); if (x1 < 0) return out; var bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = (N - 2 * margin) / Math.max(bw, bh), tw = bw * s, th = bh * s, ox = (N - tw) / 2, oy = (N - th) / 2, cnt = new Float32Array(N * N);
		// area-weighted resampling: every source pixel spreads its ink over the destination cells it covers
		for (j = y0; j <= y1; j++) { var fy0 = oy + (j - y0) * s, fy1 = fy0 + s, cy0 = Math.max(0, Math.floor(fy0)), cy1 = Math.min(N - 1, Math.floor(fy1 - 1e-9));
			for (i = x0; i <= x1; i++) { var v = ink[j * w + i]; if (!v) continue; var fx0 = ox + (i - x0) * s, fx1 = fx0 + s, cx0 = Math.max(0, Math.floor(fx0)), cx1 = Math.min(N - 1, Math.floor(fx1 - 1e-9));
				for (var gy = cy0; gy <= cy1; gy++) { var oyl = Math.min(fy1, gy + 1) - Math.max(fy0, gy); if (oyl <= 0) continue; for (var gx = cx0; gx <= cx1; gx++) { var oxl = Math.min(fx1, gx + 1) - Math.max(fx0, gx); if (oxl > 0) out[gy * N + gx] += v * oxl * oyl; } } } }
		for (i = 0; i < out.length; i++) out[i] = Math.min(1, out[i]);
		var m = 0, cx = 0, cy = 0; for (j = 0; j < N; j++) for (i = 0; i < N; i++) { m += out[j * N + i]; cx += i * out[j * N + i]; cy += j * out[j * N + i]; }
		if (m > 0) { var dx = Math.round((N - 1) / 2 - cx / m), dy = Math.round((N - 1) / 2 - cy / m); if (dx || dy) { var sh = new Float32Array(N * N); for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var a = i - dx, b = j - dy; if (a >= 0 && a < N && b >= 0 && b < N) sh[j * N + i] = out[b * N + a]; } out = sh; } }
		return out;
	}
	function argmax(v) { var b = 0; for (var i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; }
	function topK(p, labels, k) { return Array.from(p).map(function (v, i) { return { l: labels[i], p: v, i: i }; }).sort(function (a, b) { return b.p - a.p; }).slice(0, k); }
	function confusion(truth, pred, k) { var C = []; for (var i = 0; i < k; i++) C.push(new Array(k).fill(0)); for (var j = 0; j < truth.length; j++) C[truth[j]][pred[j]]++; return C; }
	function accuracy(C) { var ok = 0, all = 0; C.forEach(function (r, i) { r.forEach(function (v, j) { all += v; if (i === j) ok += v; }); }); return all ? ok / all : 0; }
	function worstPairs(C, labels, n) { var out = []; C.forEach(function (r, i) { r.forEach(function (v, j) { if (i !== j && v) out.push({ t: labels[i], p: labels[j], n: v }); }); }); return out.sort(function (a, b) { return b.n - a.n; }).slice(0, n); }
	function cosine(a, b) { var ab = 0, aa = 0, bb = 0; for (var i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : 0; }
	root.MESOCR = { SETS: SETS, normalise: normalise, argmax: argmax, topK: topK, confusion: confusion, accuracy: accuracy, worstPairs: worstPairs, cosine: cosine };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESOCR;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Letter / Digit Recognition: pictures of characters in the visitor's fonts -> MESOCR.normalise -> a small MESNN network trained in the page. */
(function () {
	"use strict";
	var N = window.MESNN, O = window.MESOCR, $ = function (id) { return document.getElementById(id); }, root = $("lr"); if (!root || !N || !O) return;
	var KEY = "mes-letter-recognition:v1", GRID = 14, S = { set: "digits", hid: "64", ep: "14" }, mine = [];
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { Object.assign(S, sv.S || {}); mine = sv.mine || []; } } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ S: S, mine: mine.slice(-300) })); } catch (e) { /* ignore */ } }
	var toastT; function toast(m) { var t = $("lr-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
	/* ---------- fonts that exist here ---------- */
	var CAND = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Segoe UI", "Calibri", "Gill Sans", "Optima", "Futura", "Avenir", "Century Gothic", "Georgia", "Times New Roman", "Palatino", "Garamond", "Baskerville", "Cambria", "Constantia", "Rockwell", "Didot", "Courier New", "Monaco", "Menlo", "Consolas", "Lucida Console", "Impact", "Arial Black", "Comic Sans MS", "American Typewriter", "Copperplate", "Noto Sans", "DejaVu Sans", "Liberation Sans", "Liberation Serif", "Ubuntu", "Roboto", "Franklin Gothic Medium", "Candara", "Corbel", "Book Antiqua", "Hoefler Text", "Bookman Old Style", "Century Schoolbook", "Brush Script MT", "Noteworthy", "Chalkboard", "Marker Felt", "Bradley Hand", "Ink Free", "Segoe Print"];
	var mc = document.createElement("canvas").getContext("2d"), BASE = ["monospace", "sans-serif", "serif"];
	function wd(f) { mc.font = f; return mc.measureText("mmmmmmmmmmlli0Oo").width; } var bw = BASE.map(function (b) { return wd("72px " + b); });
	var fonts = CAND.filter(function (n) { return BASE.some(function (b, i) { return Math.abs(wd("72px '" + n + "', " + b) - bw[i]) > 0.01; }); }); if (fonts.length < 3) fonts = fonts.concat(["sans-serif", "serif", "monospace"]);
	/* ---------- training pictures ---------- */
	var gc = document.createElement("canvas"); gc.width = gc.height = 72; var gx = gc.getContext("2d", { willReadFrequently: true });
	function glyph(ch, font, r, plain) {
		gx.setTransform(1, 0, 0, 1, 0, 0); gx.fillStyle = "#fff"; gx.fillRect(0, 0, 72, 72); gx.fillStyle = "#000"; gx.textAlign = "center"; gx.textBaseline = "middle";
		var rot = plain ? 0 : (r() - 0.5) * 0.45, sh = plain ? 0 : (r() - 0.5) * 0.5, sc = plain ? 1 : 0.8 + r() * 0.4, tx = plain ? 0 : (r() - 0.5) * 8, ty = plain ? 0 : (r() - 0.5) * 8, wt = plain ? 400 : (r() < 0.4 ? 700 : 400), it = !plain && r() < 0.15 ? "italic " : "";
		gx.setTransform(sc, 0, sh * sc, sc, 36 + tx, 38 + ty); gx.rotate(rot); gx.font = it + wt + " 46px '" + font + "', " + (/Courier|Mono|Menlo|Consolas/.test(font) ? "monospace" : "sans-serif"); gx.fillText(ch, 0, 0);
		if (!plain && r() < 0.3) { gx.lineWidth = 1 + r() * 2; gx.strokeStyle = "#000"; gx.strokeText(ch, 0, 0); }
		var id = gx.getImageData(0, 0, 72, 72), ink = new Float32Array(72 * 72); for (var i = 0; i < ink.length; i++) ink[i] = 1 - id.data[i * 4] / 255; return O.normalise(ink, 72, 72, GRID);
	}
	var net = null, labels = O.SETS.digits, testSet = [], trainSet = [], busy = false;
	function build(cb) {
		labels = O.SETS[S.set]; var per = S.set === "digits" ? 160 : S.set === "letters" ? 70 : 50, r = N.rng(11), testFonts = fonts.length >= 8 ? fonts.filter(function (_, i) { return i % 5 === 2; }) : [], trainFonts = fonts.filter(function (f) { return testFonts.indexOf(f) < 0; });
		trainSet = []; testSet = []; var jobs = []; labels.forEach(function (ch, ci) { for (var k = 0; k < per; k++) jobs.push([ch, ci, trainFonts[Math.floor(r() * trainFonts.length)], 0]); if (testFonts.length) for (var q = 0; q < Math.max(6, per / 6); q++) jobs.push([ch, ci, testFonts[Math.floor(r() * testFonts.length)], 1]); else for (var q2 = 0; q2 < Math.max(6, per / 6); q2++) jobs.push([ch, ci, trainFonts[Math.floor(r() * trainFonts.length)], 1]); });
		var i = 0; (function step() { var t0 = performance.now(); while (i < jobs.length && performance.now() - t0 < 12) { var j = jobs[i++], g = glyph(j[0], j[2], r, false); (j[3] ? testSet : trainSet).push({ x: Array.from(g), y: j[1], f: j[2], c: j[0] }); } $("lr-bar").style.width = Math.round(i / jobs.length * 25) + "%"; $("lr-status").textContent = "Drawing practice pictures… " + i + " of " + jobs.length; if (i < jobs.length) setTimeout(step, 0); else cb(); })();
	}
	function minePairs() { return mine.filter(function (m) { return labels.indexOf(m.c) >= 0; }).map(function (m) { return { x: m.g, y: labels.indexOf(m.c), c: m.c }; }); }
	function train() {
		if (busy) return; busy = true; $("lr-go").disabled = true; $("lr-barw").hidden = false; $("lr-bar").style.width = "0%"; $("lr-shuffle").disabled = true;
		build(function () {
			var hid = +S.hid, eps = +S.ep, r = N.rng(5); net = new N.Net([GRID * GRID, hid, labels.length], { act: "relu", seed: 4, out: "softmax", l2: 0.00005 }); var data = trainSet.concat(minePairs()), e = 0;
			(function epoch() { var t0 = performance.now(); data = shuffle(data, r); var X = data.map(function (d) { return d.x; }), Y = data.map(function (d) { return d.y; }), tot = 0, nb = 0;
				for (var s = 0; s < X.length; s += 32) { var g = net.grads(X.slice(s, s + 32), Y.slice(s, s + 32)); net.step(g, 0.003, "adam"); tot += g.loss; nb++; if (performance.now() - t0 > 400) { /* long epoch: let the page breathe */ } }
				e++; var ta = net.accuracy(testSet.map(function (d) { return d.x; }), testSet.map(function (d) { return d.y; })); $("lr-bar").style.width = (25 + 75 * e / eps) + "%"; $("lr-status").textContent = "Pass " + e + " of " + eps + ": training loss " + (tot / nb).toFixed(3) + ", accuracy on unseen fonts " + Math.round(ta * 100) + "%";
				if (e < eps) setTimeout(epoch, 0); else { busy = false; $("lr-go").disabled = false; $("lr-shuffle").disabled = false; $("lr-status").textContent = "Trained on " + data.length + " pictures: " + Math.round(ta * 100) + "% right on " + testSet.length + " pictures in fonts it never saw. Now draw!"; $("lr-barw").hidden = true; fillRight(); showTest(); predict(); }
			})();
		});
	}
	function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
	/* ---------- the drawing pad ---------- */
	var pad = $("lr-pad"), px = pad.getContext("2d"), drawing = false, last = null, dirty = false, pt;
	function clearPad() { px.fillStyle = "#fff"; px.fillRect(0, 0, 280, 280); dirty = false; $("lr-teach").hidden = true; $("lr-guess").textContent = net ? "Draw a character on the pad." : "Train the network, then draw."; $("lr-top").innerHTML = ""; clearSee(); }
	function pos(e) { var r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * 280 / r.width, y: (e.clientY - r.top) * 280 / r.height }; }
	pad.addEventListener("pointerdown", function (e) { pad.setPointerCapture(e.pointerId); drawing = true; last = pos(e); dot(last); e.preventDefault(); });
	pad.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); px.strokeStyle = "#000"; px.lineCap = px.lineJoin = "round"; px.lineWidth = +$("lr-pen").value; px.beginPath(); px.moveTo(last.x, last.y); px.lineTo(p.x, p.y); px.stroke(); last = p; dirty = true; clearTimeout(pt); pt = setTimeout(predict, 120); });
	pad.addEventListener("pointerup", function () { drawing = false; predict(); }); pad.addEventListener("pointercancel", function () { drawing = false; });
	function dot(p) { px.fillStyle = "#000"; px.beginPath(); px.arc(p.x, p.y, +$("lr-pen").value / 2, 0, 6.2832); px.fill(); dirty = true; }
	function padGrid(canvas, transform) { var c = canvas || pad, id = c.getContext("2d").getImageData(0, 0, c.width, c.height), ink = new Float32Array(c.width * c.height); for (var i = 0; i < ink.length; i++) ink[i] = 1 - id.data[i * 4] / 255; return O.normalise(ink, c.width, c.height, GRID); }
	function clearSee() { ["lr-see", "lr-hidden"].forEach(function (id) { var c = $(id), x = c.getContext("2d"); x.fillStyle = "#f4f6f8"; x.fillRect(0, 0, c.width, c.height); }); }
	function predict() {
		if (!net || !dirty) return; var g = padGrid(), c = net.forward(Array.from(g), true), p = c.y, tk = O.topK(p, labels, 5); $("lr-guess").innerHTML = 'It thinks this is <b class="lr-big">' + esc(tk[0].l) + "</b> (" + Math.round(tk[0].p * 100) + "% sure)";
		$("lr-top").innerHTML = tk.map(function (t) { return '<div class="lr-p"><span class="lr-pl">' + esc(t.l) + '</span><span class="lr-pb"><i style="width:' + Math.round(t.p * 100) + '%"></i></span><span class="lr-pv">' + (t.p * 100).toFixed(1) + "%</span></div>"; }).join("");
		var sx = $("lr-see").getContext("2d"), cs = 140 / GRID; sx.fillStyle = "#fff"; sx.fillRect(0, 0, 140, 140); for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) { var v = g[j * GRID + i]; sx.fillStyle = "rgb(" + Math.round(255 - v * 255) + "," + Math.round(255 - v * 255) + "," + Math.round(255 - v * 200) + ")"; sx.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5); }
		var hx = $("lr-hidden").getContext("2d"), H = c.A[1], n = H.length, cols = Math.ceil(Math.sqrt(n * 200 / 140)), rows = Math.ceil(n / cols), cw = 200 / cols, ch = 140 / rows, mx = 0; for (var q = 0; q < n; q++) mx = Math.max(mx, H[q]); hx.fillStyle = "#f4f6f8"; hx.fillRect(0, 0, 200, 140); for (var q2 = 0; q2 < n; q2++) { var v2 = mx ? H[q2] / mx : 0; hx.fillStyle = "rgba(124,58,237," + (0.06 + 0.94 * v2).toFixed(2) + ")"; hx.fillRect((q2 % cols) * cw + 1, Math.floor(q2 / cols) * ch + 1, cw - 2, ch - 2); }
		$("lr-teach").hidden = false; $("lr-right").value = tk[0].l;
	}
	function fillRight() { $("lr-right").innerHTML = labels.map(function (l) { return "<option>" + esc(l) + "</option>"; }).join(""); $("lr-mine").textContent = mine.length ? " (" + mine.filter(function (m) { return labels.indexOf(m.c) >= 0; }).length + " of your drawings saved here)" : ""; }
	$("lr-clear").onclick = clearPad;
	/* teach it: jitter the drawing a few ways, add it to the training data and train a little more */
	$("lr-add").onclick = function () {
		if (!net || !dirty || busy) return; var ch = $("lr-right").value, base = document.createElement("canvas"); base.width = base.height = 280; base.getContext("2d").drawImage(pad, 0, 0); var r = N.rng(Date.now() % 100000), added = 0, tc = document.createElement("canvas"); tc.width = tc.height = 280; var tx = tc.getContext("2d");
		for (var k = 0; k < 12; k++) { tx.setTransform(1, 0, 0, 1, 0, 0); tx.fillStyle = "#fff"; tx.fillRect(0, 0, 280, 280); var sc = 0.85 + r() * 0.3, rot = (r() - 0.5) * 0.4, sh = (r() - 0.5) * 0.3; tx.setTransform(sc, 0, sh, sc, 140 * (1 - sc) + (r() - 0.5) * 30, 140 * (1 - sc) + (r() - 0.5) * 30); tx.translate(140, 140); tx.rotate(rot); tx.translate(-140, -140); tx.drawImage(base, 0, 0); mine.push({ c: ch, g: Array.from(padGrid(tc)) }); added++; }
		mine.push({ c: ch, g: Array.from(padGrid()) }); save(); busy = true; $("lr-status").textContent = "Learning from your drawing…"; var data = trainSet.concat(minePairs()), mineOnly = minePairs(), e = 0, rr = N.rng(9);
		(function epoch() { var D = shuffle(mineOnly.concat(mineOnly, mineOnly, data.filter(function () { return rr() < 0.12; })), rr), X = D.map(function (d) { return d.x; }), Y = D.map(function (d) { return d.y; }); for (var s = 0; s < X.length; s += 32) net.step(net.grads(X.slice(s, s + 32), Y.slice(s, s + 32)), 0.002, "adam"); e++; if (e < 6) setTimeout(epoch, 0); else { busy = false; $("lr-status").textContent = "Learned from " + mineOnly.length / 13 + " of your drawings. Draw the character again to see if it improved."; fillRight(); showTest(); predict(); } })();
	};
	/* ---------- test panel ---------- */
	function showTest() {
		if (!net || !testSet.length) return; var X = testSet.map(function (d) { return d.x; }), pr = X.map(function (x) { return net.classify(x); }), ys = testSet.map(function (d) { return d.y; }), C = O.confusion(ys, pr, labels.length), acc = O.accuracy(C);
		$("lr-acc").innerHTML = "Accuracy on " + testSet.length + " pictures in unseen fonts: <b>" + Math.round(acc * 1000) / 10 + "%</b>"; var h = '<table class="lr-ct"><tr><th></th>' + labels.map(function (l) { return "<th>" + esc(l) + "</th>"; }).join("") + "</tr>"; var mx = 1; C.forEach(function (r) { r.forEach(function (v) { mx = Math.max(mx, v); }); });
		C.forEach(function (r, i) { h += "<tr><th>" + esc(labels[i]) + "</th>" + r.map(function (v, j) { return '<td class="' + (i === j ? "ok" : v ? "bad" : "") + '" style="' + (v ? "opacity:" + (0.35 + 0.65 * v / mx).toFixed(2) : "") + '">' + (v || "") + "</td>"; }).join("") + "</tr>"; }); $("lr-conf").innerHTML = h + "</table>";
		var w = O.worstPairs(C, labels, 5); $("lr-worst").textContent = w.length ? "Most common mix-ups (true → guessed): " + w.map(function (q) { return q.t + " → " + q.p + " (" + q.n + ")"; }).join(", ") + "." : "No mistakes at all on this set.";
		samples();
	}
	function samples() {
		if (!net || !testSet.length) return; var r = N.rng(Date.now() % 9999), box = $("lr-samples"); box.innerHTML = ""; for (var k = 0; k < 24; k++) {
			var d = testSet[Math.floor(r() * testSet.length)], p = net.classify(d.x), ok = labels[p] === d.c, c = document.createElement("canvas"); c.width = c.height = 56; var x = c.getContext("2d"), cs = 56 / GRID; x.fillStyle = "#fff"; x.fillRect(0, 0, 56, 56); for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) { var v = d.x[j * GRID + i]; x.fillStyle = "rgb(" + Math.round(255 - v * 255) + "," + Math.round(255 - v * 255) + "," + Math.round(255 - v * 255) + ")"; x.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5); }
			var w = document.createElement("div"); w.className = "lr-s " + (ok ? "ok" : "bad"); w.appendChild(c); var l = document.createElement("span"); l.textContent = ok ? "✓ " + d.c : "✗ is " + d.c + ", said " + labels[p]; w.appendChild(l); w.title = "font: " + d.f; box.appendChild(w);
		}
	}
	$("lr-shuffle").onclick = samples;
	/* ---------- start ---------- */
	$("lr-set").value = S.set; $("lr-hid").value = S.hid; $("lr-ep").value = S.ep; ["set", "hid", "ep"].forEach(function (k) { $("lr-" + k).onchange = function () { S[k] = this.value; save(); if (k === "set") { net = null; labels = O.SETS[S.set]; $("lr-status").textContent = "Press Train for the new character set."; $("lr-samples").innerHTML = ""; $("lr-acc").textContent = ""; } }; });
	$("lr-go").onclick = train; $("lr-info").textContent += " Fonts found here: " + fonts.length + "."; labels = O.SETS[S.set]; fillRight(); clearPad();
	window.__lr = { train: train, net: function () { return net; }, labels: function () { return labels; }, pad: pad, predict: function () { dirty = true; predict(); } };
})();
