/* MES Toy Language Model simulator: UI over MESLM (lib.js). */
(function () {
	"use strict";
	var L = window.MESLM, $ = function (id) { return document.getElementById(id); }, root = $("lm"); if (!root || !L) return;
	var KEY = "mes-llm-simulator:v1", S = { c: "stories", own: "", ord: "3", prompt: "the fox walked along the", tmode: "words", tin: "The fox walked along the river, unbelievably quietly!", asent: "the fox walked along the river", aw: "random" };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) Object.assign(S, sv); } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	var toastT; function toast(m) { var t = $("lm-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	var text, toks, model, emb, merges, rand = L.rng(12), cur = [];
	function corpus() { text = S.c === "mine" ? S.own : L.CORPORA[S.c]; toks = L.words(text); merges = L.bpeTrain(text, 120); model = new L.Model(toks, +S.ord); emb = toks.length > 40 ? L.embed(toks, 160, 8) : { vocab: [], emb: {}, dim: 8 }; $("lm-cinfo").textContent = toks.length + " words, " + model.vocab.length + " different ones." + (toks.length < 60 ? " That is very little text: paste more for better results." : ""); }
	/* ---------- tabs ---------- */
	function tab(t) { ["tok", "gen", "emb", "att"].forEach(function (k) { $("lm-p-" + k).hidden = k !== t; }); Array.prototype.forEach.call(document.querySelectorAll(".lm-tabs [data-t]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === t)); }); if (t === "emb") drawMap(); if (t === "att") att(); if (t === "gen") gen(); if (t === "tok") tokens(); }
	document.querySelector(".lm-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) tab(b.dataset.t); });
	/* ---------- 1 tokens ---------- */
	var COL = ["#dbeafe", "#fde68a", "#bbf7d0", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fecaca"];
	function tokens() {
		var t = $("lm-tin").value, arr = S.tmode === "chars" ? L.chars(t) : S.tmode === "bpe" ? L.bpeEncode(t, merges) : L.words(t), ids = {}, nxt = 0;
		$("lm-toks").innerHTML = arr.map(function (x, i) { var show = x.replace("</w>", "·"); if (ids[x] == null) ids[x] = (S.tmode === "words" && model.idx[x] != null) ? model.idx[x] : 1000 + nxt++; return '<span class="lm-tk" style="background:' + COL[i % COL.length] + '" title="token number ' + ids[x] + '">' + esc(show === " " ? "␣" : show) + "<sub>" + ids[x] + "</sub></span>"; }).join("");
		$("lm-tokinfo").textContent = arr.length + " tokens for " + t.length + " characters. " + (S.tmode === "bpe" ? "Pieces ending in · finish a word. The pieces were learned from the practice text, so common words are one piece and rare words are split." : S.tmode === "chars" ? "Every character is its own token: never an unknown word, but long." : "Numbers under each token are its ID in the model's vocabulary (1000+ = a word the practice text never saw).");
	}
	$("lm-tin").addEventListener("input", function () { S.tin = this.value; save(); tokens(); });
	$("lm-p-tok").addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (!b) return; S.tmode = b.dataset.m; Array.prototype.forEach.call($("lm-p-tok").querySelectorAll("[data-m]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); save(); tokens(); });
	/* ---------- 2 predict + generate ---------- */
	function opts() { var k = +$("lm-k").value, p = +$("lm-p").value; $("lm-tv").textContent = (+$("lm-temp").value).toFixed(2); $("lm-kv").textContent = k ? k : "off"; $("lm-pv").textContent = p ? p.toFixed(2) : "off"; return { temp: +$("lm-temp").value, topK: k, topP: p }; }
	function ctxTokens() { return L.words($("lm-prompt").value).concat(cur); }
	function gen() {
		S.prompt = $("lm-prompt").value; save(); var o = opts(), c = ctxTokens(), r = model.probs(c.slice(-(model.order - 1))), q = L.shape(r.p, o), tp = L.top(model, q, 10).filter(function (x) { return x.p > 0; }), raw = L.top(model, r.p, 1)[0];
		$("lm-used").textContent = r.used === 0 ? "(no match for these words in the practice text: using plain word frequency)" : "(matched the last " + r.used + " word" + (r.used > 1 ? "s" : "") + ": “" + c.slice(-r.used).join(" ") + "”)";
		var mx = tp.length ? tp[0].p : 1; $("lm-bars").innerHTML = tp.map(function (x) { return '<div class="lm-bar"><span class="lm-bl">' + esc(x.t) + '</span><span class="lm-bt"><i style="width:' + Math.round(x.p / mx * 100) + '%"></i></span><span class="lm-bv">' + (x.p * 100).toFixed(1) + "%</span></div>"; }).join("") || "<p class='tu-note'>No word is allowed with these settings.</p>";
		$("lm-out").innerHTML = '<span class="lm-p0">' + esc(L.words($("lm-prompt").value).join(" ")) + "</span> <b>" + esc(cur.join(" ")) + "</b>";
		var X = model.tokens.slice(Math.floor(model.tokens.length * 0.85)); $("lm-facts").textContent = "This model knows " + model.vocab.length + " words from " + model.tokens.length + ". Perplexity on its last 15% of text: " + (function () { var m2 = new L.Model(model.tokens.slice(0, Math.floor(model.tokens.length * 0.85)), model.order); var pp = m2.perplexity(X); return isFinite(pp) ? pp.toFixed(0) + " (it is on average as unsure as choosing between " + pp.toFixed(0) + " equally likely words; lower is better)" : "n/a"; })() + ".";
	}
	function pick() { var o = opts(), c = ctxTokens(), r = model.probs(c.slice(-(model.order - 1))), id = L.sample(L.shape(r.p, o), rand); cur.push(model.vocab[id]); gen(); }
	$("lm-pick").onclick = pick; $("lm-gen").onclick = function () { var o = opts(), g = L.generate(model, ctxTokens(), 30, o, rand); cur = g.tokens.slice(L.words($("lm-prompt").value).length); gen(); }; $("lm-reset").onclick = function () { cur = []; gen(); };
	["lm-temp", "lm-k", "lm-p"].forEach(function (id) { $(id).addEventListener("input", gen); }); $("lm-prompt").addEventListener("input", function () { cur = []; gen(); });
	$("lm-ord").addEventListener("change", function () { S.ord = this.value; save(); model = new L.Model(toks, +S.ord); gen(); });
	/* ---------- 3 embeddings map ---------- */
	var mapPts = [];
	function drawMap() {
		var cv = $("lm-map"), x = cv.getContext("2d"), dark = document.body.classList.contains("dark-mode"), W = cv.width, H = cv.height; x.clearRect(0, 0, W, H); x.fillStyle = dark ? "#262a2e" : "#fff"; x.fillRect(0, 0, W, H); mapPts = [];
		if (!emb.vocab.length) { x.fillStyle = "#888"; x.font = "14px sans-serif"; x.fillText("Not enough text for word vectors.", 20, 30); return; }
		var xs = emb.vocab.map(function (w) { return emb.emb[w][0]; }), ys = emb.vocab.map(function (w) { return emb.emb[w][1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), sx = (W - 60) / ((x1 - x0) || 1), sy = (H - 40) / ((y1 - y0) || 1);
		x.font = "12px sans-serif"; var placed = []; emb.vocab.forEach(function (w, i) { var px = 30 + (xs[i] - x0) * sx, py = 20 + (ys[i] - y0) * sy; mapPts.push({ w: w, x: px, y: py }); x.fillStyle = w === sel ? "#c2410c" : (nbs && nbs.indexOf(w) >= 0 ? "#2563eb" : (dark ? "#7c8591" : "#94a3b8")); x.beginPath(); x.arc(px, py, w === sel ? 5 : 3, 0, 6.2832); x.fill(); var tw = x.measureText(w).width, hit = placed.some(function (p) { return Math.abs(p.x - px) < (p.w + tw) / 2 + 3 && Math.abs(p.y - py) < 13; }); if (!hit || w === sel || (nbs && nbs.indexOf(w) >= 0) || i < 18) { x.fillStyle = dark ? "#e5e7eb" : "#1e293b"; x.fillText(w, px + 5, py + 4); placed.push({ x: px + 5 + tw / 2, y: py, w: tw }); } });
	}
	var sel = "", nbs = null;
	$("lm-map").addEventListener("pointerdown", function (e) { var r = this.getBoundingClientRect(), mx = (e.clientX - r.left) * this.width / r.width, my = (e.clientY - r.top) * this.height / r.height, best = null, bd = 400; mapPts.forEach(function (p) { var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bd) { bd = d; best = p; } }); if (!best) return; sel = best.w; var nb = L.neighbours(emb, sel, 6); nbs = nb.map(function (q) { return q.t; }); $("lm-nb").innerHTML = "<b>" + esc(sel) + "</b> is closest to: " + nb.map(function (q) { return esc(q.t) + " (" + q.s.toFixed(2) + ")"; }).join(", ") + ". (Numbers are cosine similarity: 1 = same direction.) Words that appear in the same places in the text end up near each other; this is the idea behind all word and sentence embeddings."; drawMap(); });
	/* ---------- 4 attention ---------- */
	function att() {
		S.asent = $("lm-asent").value; save(); var tk = L.words(S.asent).slice(0, 12); if (tk.length < 2) { $("lm-att").innerHTML = "<p class='tu-note'>Type at least two words.</p>"; return; }
		var a = L.attention(tk, emb, { dim: 8, mode: S.aw, causal: $("lm-causal").checked }), h = '<div class="lm-scroll"><table class="lm-at"><tr><th></th>' + tk.map(function (t) { return "<th>" + esc(t) + "</th>"; }).join("") + "</tr>";
		a.weights.forEach(function (r, i) { h += "<tr><th>" + esc(tk[i]) + "</th>" + r.map(function (v) { return '<td style="background:rgba(124,58,237,' + (0.05 + 0.85 * v).toFixed(2) + ");color:" + (v > 0.45 ? "#fff" : "inherit") + '">' + Math.round(v * 100) + "%</td>"; }).join("") + "</tr>"; }); h += "</table></div>";
		var best = a.weights.map(function (r, i) { var b = 0; r.forEach(function (v, j) { if (v > r[b]) b = j; }); return tk[i] + " → " + tk[b]; }); $("lm-att").innerHTML = h; $("lm-attnote").textContent = "Where each word looks most: " + best.join(", ") + ". Each row adds to 100%. " + (S.aw === "random" ? "These weights are random and untrained, so the pattern is not meaningful: it only shows the mechanism." : "Here Q and K are the plain word vectors, so words attend to words with similar vectors (and, a little, to nearby positions).");
	}
	$("lm-asent").addEventListener("input", att); $("lm-causal").addEventListener("change", att); $("lm-p-att").addEventListener("click", function (e) { var b = e.target.closest("[data-w]"); if (!b) return; S.aw = b.dataset.w; Array.prototype.forEach.call($("lm-p-att").querySelectorAll("[data-w]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); att(); });
	/* ---------- practice text ---------- */
	$("lm-c").value = S.c; $("lm-ownt").value = S.own; $("lm-tin").value = S.tin; $("lm-prompt").value = S.prompt; $("lm-ord").value = S.ord; $("lm-asent").value = S.asent;
	$("lm-c").addEventListener("change", function () { S.c = this.value; if (S.c === "mine") $("lm-own").open = true; save(); corpus(); cur = []; sel = ""; nbs = null; tab(currentTab()); });
	$("lm-ownt").addEventListener("input", function () { S.own = this.value; S.c = "mine"; $("lm-c").value = "mine"; save(); corpus(); cur = []; tab(currentTab()); });
	function currentTab() { var b = document.querySelector('.lm-tabs [aria-pressed="true"]'); return b ? b.dataset.t : "tok"; }
	corpus(); tab("tok");
	window.__lm = { model: function () { return model; }, tab: tab };
})();
