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
