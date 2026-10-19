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
