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
