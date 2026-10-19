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

/* MES Neural Network Playground: UI over MESNN (lib.js). */
(function () {
	"use strict";
	var N = window.MESNN, $ = function (id) { return document.getElementById(id); }, root = $("nn"); if (!root || !N) return;
	var KEY = "mes-nn-playground:v1", S = { ds: "circle", noise: 0.15, n: 200, feats: ["x", "y"], hidden: [6, 4], act: "tanh", opt: "adam", lr: "0.01", l2: "0", batch: "16", speed: "4", seed: 1 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search); if (qp.get("s")) { try { Object.assign(S, JSON.parse(atob(qp.get("s")))); } catch (e) { /* ignore */ } }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var toastT; function toast(m) { var t = $("nn-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	var D, tr, te, trF, teF, net, hist, epoch, rand, playing = false, probe = null, GN = 40;
	function newData() { D = N.makeData(S.ds, S.n, S.noise, S.seed); var sp = N.split(D, 0.7, S.seed + 11); tr = sp.train; te = sp.test; refeat(); }
	function refeat() { trF = N.featurize(tr.X, S.feats); teF = N.featurize(te.X, S.feats); }
	function build() { net = new N.Net([S.feats.length].concat(S.hidden, [1]), { act: S.act, l2: +S.l2, seed: S.seed + 3 }); hist = []; epoch = 0; rand = N.rng(S.seed + 5); stats(); }
	/* ---------- controls ---------- */
	$("nn-ds").innerHTML = N.DATASETS.map(function (d) { return '<option value="' + d[0] + '">' + d[1] + "</option>"; }).join("");
	$("nn-feats").innerHTML = N.FEATS.map(function (f) { return '<label class="nn-fk"><input type="checkbox" data-f="' + f[0] + '"> ' + f[1] + "</label>"; }).join("");
	function sizesUI() { $("nn-lcount").textContent = S.hidden.length; $("nn-sizes").innerHTML = S.hidden.length ? S.hidden.map(function (h, i) { return '<span class="nn-sz">layer ' + (i + 1) + ' <button type="button" class="tu-btn tu-btn--ghost" data-i="' + i + '" data-d="-1" aria-label="Fewer neurons in layer ' + (i + 1) + '">−</button><b>' + h + '</b><button type="button" class="tu-btn tu-btn--ghost" data-i="' + i + '" data-d="1" aria-label="More neurons in layer ' + (i + 1) + '">+</button></span>'; }).join("") : '<span class="tu-note">No hidden layers: the network is a single straight-line cut.</span>'; }
	function controls() { $("nn-ds").value = S.ds; $("nn-noise").value = S.noise; $("nn-noisev").textContent = Math.round(S.noise * 100) + "%"; $("nn-n").value = S.n; $("nn-nv").textContent = S.n; $("nn-act").value = S.act; $("nn-opt").value = S.opt; $("nn-lr").value = S.lr; $("nn-l2").value = S.l2; $("nn-batch").value = S.batch; $("nn-speed").value = S.speed; Array.prototype.forEach.call($("nn-feats").querySelectorAll("input"), function (c) { c.checked = S.feats.indexOf(c.dataset.f) >= 0; }); sizesUI(); }
	function reset(data) { stop(); if (data) newData(); else refeat(); build(); save(); draw(); }
	$("nn-ds").onchange = function () { S.ds = this.value; reset(true); }; $("nn-noise").oninput = function () { S.noise = +this.value; $("nn-noisev").textContent = Math.round(S.noise * 100) + "%"; reset(true); }; $("nn-n").oninput = function () { S.n = +this.value; $("nn-nv").textContent = S.n; reset(true); };
	$("nn-regen").onclick = function () { S.seed = (S.seed % 1000) + 1; reset(true); };
	$("nn-feats").onchange = function (e) { var c = e.target; var f = c.dataset.f, i = S.feats.indexOf(f); if (c.checked && i < 0) S.feats.push(f); else if (!c.checked && i >= 0) { if (S.feats.length === 1) { c.checked = true; toast("Keep at least one input"); return; } S.feats.splice(i, 1); } S.feats = N.FEATS.map(function (x) { return x[0]; }).filter(function (x) { return S.feats.indexOf(x) >= 0; }); reset(false); };
	$("nn-ladd").onclick = function () { if (S.hidden.length >= 5) return toast("Up to five hidden layers"); S.hidden.push(4); sizesUI(); reset(false); }; $("nn-ldel").onclick = function () { if (!S.hidden.length) return; S.hidden.pop(); sizesUI(); reset(false); };
	$("nn-sizes").onclick = function (e) { var b = e.target.closest("button[data-i]"); if (!b) return; var i = +b.dataset.i, v = S.hidden[i] + +b.dataset.d; if (v < 1 || v > 8) return toast("Between 1 and 8 neurons per layer"); S.hidden[i] = v; sizesUI(); reset(false); };
	["act", "opt", "lr", "l2", "batch", "speed"].forEach(function (k) { $("nn-" + k).onchange = function () { S[k] = this.value; if (k === "act" || k === "l2") reset(false); else save(); }; });
	$("nn-reset").onclick = function () { build(); draw(); }; $("nn-step").onclick = function () { stop(); trainEpochs(1); draw(); };
	$("nn-play").onclick = function () { if (playing) stop(); else start(); };
	$("nn-share").onclick = function () { var u = location.origin + location.pathname + "?s=" + btoa(JSON.stringify(S)); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { toast("Could not copy the link"); }); };
	var TRY = [["Circle needs a hidden layer", { ds: "circle", feats: ["x", "y"], hidden: [] }, "Press Train with no hidden layers: a straight line cannot separate a ring. Then press + to add a layer."], ["Circle with x² and y²", { ds: "circle", feats: ["x2", "y2"], hidden: [] }, "With x² and y² as inputs the ring becomes a straight cut."], ["XOR", { ds: "xor", feats: ["x", "y"], hidden: [4] }, "Four neurons are enough for XOR."], ["Spiral (hard)", { ds: "spiral", feats: ["x", "y", "sinx", "siny"], hidden: [8, 6, 4], noise: 0.05 }, "Give it a minute: this needs depth."], ["Overfit it", { ds: "moons", noise: 0.9, n: 60, feats: ["x", "y"], hidden: [8, 8, 8] }, "Few noisy points and a big network: the test loss climbs while the training loss falls."]];
	TRY.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = t[0]; b.onclick = function () { Object.assign(S, { noise: 0.15, n: 200, act: "tanh" }, JSON.parse(JSON.stringify(t[1]))); controls(); reset(true); toast(t[2]); }; $("nn-try").appendChild(b); });
	/* ---------- training loop ---------- */
	function trainEpochs(k) { for (var i = 0; i < k; i++) { net.train(trF, tr.y, { lr: +S.lr, optim: S.opt, batch: +S.batch, rand: rand, momentum: 0 }); epoch++; if (epoch % Math.max(1, Math.round(+S.speed / 4)) === 0 || epoch < 30) hist.push({ e: epoch, tr: net.loss(trF, tr.y), te: net.loss(teF, te.y) }); } stats(); }
	function start() { playing = true; $("nn-play").textContent = "⏸ Pause"; loop(); } function stop() { playing = false; $("nn-play").textContent = "▶ Train"; }
	function loop() { if (!playing) return; if (!document.hidden) { var t0 = performance.now(), per = Math.max(1, Math.round(+S.speed / 4)); do { trainEpochs(per); } while (performance.now() - t0 < 10 && +S.speed >= 20); draw(); } requestAnimationFrame(loop); }
	function stats() {
		if (!net) return; var tl = net.loss(trF, tr.y), tel = net.loss(teF, te.y), ta = net.accuracy(trF, tr.y), tea = net.accuracy(teF, te.y);
		$("nn-stats").innerHTML = '<div><b>' + epoch + '</b><span>passes over the data</span></div><div><b>' + tl.toFixed(3) + '</b><span>training loss (' + Math.round(ta * 100) + '% right)</span></div><div><b>' + tel.toFixed(3) + '</b><span>test loss (' + Math.round(tea * 100) + '% right)</span></div><div><b>' + net.paramCount() + '</b><span>weights and biases</span></div>';
	}
	/* ---------- drawing ---------- */
	var cv = $("nn-cv"), cx = cv.getContext("2d"), off = document.createElement("canvas"); off.width = off.height = 56; var ox = off.getContext("2d");
	function col(v) { v = Math.max(0, Math.min(1, v)); var r = Math.round(60 + v * (250 - 60)), g = Math.round(130 + v * (145 - 130)), b = Math.round(235 + v * (40 - 235)); return [r, g, b]; }   // 0 blue -> 1 orange
	function feat(p) { return N.featurize([p], S.feats)[0]; }
	function heat(fn, ctx, cvs, size) {   // fn(x, y) -> 0..1 on the [-1,1] square (y up)
		var id = ctx.createImageData(size, size); for (var j = 0; j < size; j++) for (var i = 0; i < size; i++) { var c = col(fn(-1 + 2 * (i + 0.5) / size, 1 - 2 * (j + 0.5) / size)), q = (j * size + i) * 4; id.data[q] = c[0]; id.data[q + 1] = c[1]; id.data[q + 2] = c[2]; id.data[q + 3] = 255; } ctx.putImageData(id, 0, 0);
	}
	function px(x) { return (x + 1) / 2 * cv.width; } function py(y) { return (1 - y) / 2 * cv.height; }
	function drawMain() {
		heat(function (x, y) { return net.forward(feat([x, y]))[0]; }, ox, off, 56); cx.imageSmoothingEnabled = true; cx.drawImage(off, 0, 0, cv.width, cv.height);
		cx.strokeStyle = "rgba(0,0,0,0.12)"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(cv.width / 2, 0); cx.lineTo(cv.width / 2, cv.height); cx.moveTo(0, cv.height / 2); cx.lineTo(cv.width, cv.height / 2); cx.stroke();
		function dots(set, ring) { set.X.forEach(function (p, i) { cx.beginPath(); cx.arc(px(p[0]), py(p[1]), ring ? 5 : 4.5, 0, 6.2832); cx.fillStyle = set.y[i] ? "#f59e0b" : "#2563eb"; if (!ring) cx.fill(); cx.lineWidth = ring ? 2.5 : 1.5; cx.strokeStyle = ring ? (set.y[i] ? "#b45309" : "#1e3a8a") : "#fff"; cx.stroke(); }); }
		dots(tr, false); dots(te, true);
		if (probe) { cx.beginPath(); cx.arc(px(probe[0]), py(probe[1]), 8, 0, 6.2832); cx.lineWidth = 3; cx.strokeStyle = "#111"; cx.stroke(); cx.beginPath(); cx.arc(px(probe[0]), py(probe[1]), 8, 0, 6.2832); cx.lineWidth = 1.2; cx.strokeStyle = "#fff"; cx.stroke(); }
	}
	var lc = $("nn-loss"), lx = lc.getContext("2d");
	function drawLoss() {
		var w = lc.width, h = lc.height, dark = document.body.classList.contains("dark-mode"); lx.clearRect(0, 0, w, h); lx.fillStyle = dark ? "#262a2e" : "#fff"; lx.fillRect(0, 0, w, h); if (hist.length < 2) { lx.fillStyle = dark ? "#b8bec7" : "#667"; lx.font = "14px sans-serif"; lx.fillText("Press Train to see the loss curve", 14, 30); return; }
		var maxE = hist[hist.length - 1].e, maxL = 0; hist.forEach(function (p) { maxL = Math.max(maxL, p.tr, p.te); }); maxL = Math.min(maxL, 2.5) * 1.05 || 1; var padL = 38, padB = 22;
		lx.strokeStyle = dark ? "#3a3f45" : "#e3e7ec"; lx.fillStyle = dark ? "#b8bec7" : "#667"; lx.font = "11px sans-serif"; for (var g = 0; g <= 4; g++) { var yy = 8 + (h - padB - 8) * g / 4; lx.beginPath(); lx.moveTo(padL, yy); lx.lineTo(w - 6, yy); lx.stroke(); lx.fillText((maxL * (1 - g / 4)).toFixed(2), 2, yy + 4); }
		lx.fillText("passes: " + maxE, w - 90, h - 6);
		function line(key, color) { lx.beginPath(); hist.forEach(function (p, i) { var x = padL + (w - padL - 6) * p.e / maxE, y = 8 + (h - padB - 8) * (1 - Math.min(p[key], maxL) / maxL); if (i) lx.lineTo(x, y); else lx.moveTo(x, y); }); lx.strokeStyle = color; lx.lineWidth = 2; lx.stroke(); }
		line("te", "#2563eb"); line("tr", "#f59e0b");
	}
	var nc = $("nn-net"), nx = nc.getContext("2d"), NG = 22, tmpc = document.createElement("canvas"); tmpc.width = tmpc.height = NG; var tx = tmpc.getContext("2d");
	function drawNet() {
		var dark = document.body.classList.contains("dark-mode"), W = nc.width, H = nc.height; nx.clearRect(0, 0, W, H); nx.fillStyle = dark ? "#262a2e" : "#fff"; nx.fillRect(0, 0, W, H);
		var sizes = net.sizes, L = sizes.length, box = 34, colX = function (l) { return 30 + (W - 60 - box) * l / (L - 1); }, pos = [];
		for (var l = 0; l < L; l++) { var nn = sizes[l], gap = Math.min(box + 12, (H - 20) / nn), top = (H - nn * gap) / 2 + (gap - box) / 2; pos.push(Array.apply(null, Array(nn)).map(function (_, i) { return { x: colX(l), y: top + i * gap }; })); }
		for (var l2 = 1; l2 < L; l2++) { var Wm = net.W[l2 - 1], fin = sizes[l2 - 1]; for (var j = 0; j < sizes[l2]; j++) for (var i = 0; i < fin; i++) { var wv = Wm[j * fin + i]; nx.strokeStyle = wv >= 0 ? "rgba(37,99,235," + Math.min(0.85, 0.12 + Math.abs(wv) * 0.35) + ")" : "rgba(245,158,11," + Math.min(0.85, 0.12 + Math.abs(wv) * 0.35) + ")"; nx.lineWidth = 0.4 + Math.min(4, Math.abs(wv) * 1.4); nx.beginPath(); nx.moveTo(pos[l2 - 1][i].x + box, pos[l2 - 1][i].y + box / 2); nx.lineTo(pos[l2][j].x, pos[l2][j].y + box / 2); nx.stroke(); } }
		// each neuron as the picture of its response over the input square
		var grid = []; for (var j2 = 0; j2 < NG; j2++) for (var i2 = 0; i2 < NG; i2++) grid.push(feat([-1 + 2 * (i2 + 0.5) / NG, 1 - 2 * (j2 + 0.5) / NG]));
		var acts = grid.map(function (g) { return net.forward(g, true).A; });
		for (var l3 = 0; l3 < L; l3++) for (var n2 = 0; n2 < sizes[l3]; n2++) {
			var id = tx.createImageData(NG, NG), lo = 1e9, hi = -1e9, vals = acts.map(function (A) { return A[l3][n2]; }); vals.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); var isOut = l3 === L - 1, isIn = l3 === 0, span = hi - lo || 1;
			vals.forEach(function (v, q) { var t = isOut ? v : (isIn ? (v - lo) / span : (net.act === "tanh" ? (v + 1) / 2 : (v - lo) / span)); var c = col(1 - t); if (isOut) c = col(v); id.data[q * 4] = c[0]; id.data[q * 4 + 1] = c[1]; id.data[q * 4 + 2] = c[2]; id.data[q * 4 + 3] = 255; });
			tx.putImageData(id, 0, 0); nx.imageSmoothingEnabled = true; nx.drawImage(tmpc, pos[l3][n2].x, pos[l3][n2].y, box, box); nx.strokeStyle = dark ? "#cfd6df" : "#334"; nx.lineWidth = 1; nx.strokeRect(pos[l3][n2].x + 0.5, pos[l3][n2].y + 0.5, box - 1, box - 1);
			if (isIn) { nx.fillStyle = dark ? "#cfd6df" : "#334"; nx.font = "10px sans-serif"; nx.textAlign = "right"; nx.fillText(N.FEATS.filter(function (f) { return f[0] === S.feats[n2]; })[0][1], pos[l3][n2].x - 3, pos[l3][n2].y + box / 2 + 3); nx.textAlign = "left"; }
		}
		nx.fillStyle = dark ? "#b8bec7" : "#667"; nx.font = "11px sans-serif"; nx.fillText("inputs", 4, 12); nx.textAlign = "right"; nx.fillText("output", W - 4, 12); nx.textAlign = "left";
	}
	cv.addEventListener("pointerdown", function (e) { var r = cv.getBoundingClientRect(); probe = [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2]; showMath(); draw(); });
	function showMath() {
		if (!probe) return; var f = feat(probe), c = net.forward(f, true), sizes = net.sizes, h = "", L = sizes.length - 1; $("nn-mathnote").textContent = "Following the point (x = " + probe[0].toFixed(2) + ", y = " + probe[1].toFixed(2) + ") through the network.";
		h += '<p><b>Inputs:</b> ' + S.feats.map(function (k, i) { return N.FEATS.filter(function (x) { return x[0] === k; })[0][1] + " = " + f[i].toFixed(3); }).join(", ") + "</p>";
		for (var l = 1; l <= L; l++) {
			var last = l === L, fin = sizes[l - 1], j = 0, terms = [], z = net.b[l - 1][j]; for (var i = 0; i < fin; i++) { var w = net.W[l - 1][j * fin + i]; terms.push(w.toFixed(2) + " × " + c.A[l - 1][i].toFixed(2)); }
			h += '<p><b>' + (last ? "Output layer" : "Layer " + l) + "</b> (" + sizes[l] + ' neuron' + (sizes[l] > 1 ? "s" : "") + "), first neuron: <code>z = " + terms.join(" + ") + " + " + net.b[l - 1][j].toFixed(2) + " = " + c.Z[l][j].toFixed(3) + "</code> then <code>" + (last ? "sigmoid" : net.act) + "(z) = " + c.A[l][j].toFixed(3) + "</code>" + (sizes[l] > 1 ? ". All of layer " + l + ": " + Array.from(c.A[l]).map(function (v) { return v.toFixed(2); }).join(", ") : "") + "</p>";
		}
		h += '<p>The output <b>' + c.y[0].toFixed(3) + "</b> is the network's probability that this point is orange (class 1): " + (c.y[0] >= 0.5 ? "it says orange." : "it says blue.") + "</p>"; $("nn-mathbody").innerHTML = h;
	}
	function draw() { drawMain(); drawLoss(); drawNet(); if (probe) showMath(); }
	window.addEventListener("resize", function () { draw(); });
	controls(); newData(); build(); draw();
	window.__nn = { S: S, step: function (k) { trainEpochs(k || 1); draw(); }, net: function () { return net; }, acc: function () { return [net.accuracy(trF, tr.y), net.accuracy(teF, te.y)]; } };
})();
