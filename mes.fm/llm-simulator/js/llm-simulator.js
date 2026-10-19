/* MES toy language model engine (no DOM): window.MESLM. Tokenisers (words, characters, byte-pair encoding), an n-gram language model with Witten-Bell smoothing, sampling with
 * temperature / top-k / top-p, perplexity, PPMI + SVD word vectors, and one self-attention head. A teaching toy, not a chatbot. Node: require('./tool_apps_src/llm-simulator/lib.js'); tests: node tool_apps_src/llm-simulator-tests.js */
(function (root) {
	"use strict";
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	/* ---------- tokenisers ---------- */
	function words(text) { return (String(text).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?|[.,!?;:]/g) || []); }
	function chars(text) { return Array.from(String(text)); }
	function bpeTrain(text, merges) {   // word-internal byte-pair encoding: returns the ordered merge list
		var wc = {}; (String(text).toLowerCase().match(/[a-z0-9']+|[.,!?;:]/g) || []).forEach(function (w) { wc[w] = (wc[w] || 0) + 1; });
		var vocab = Object.keys(wc).map(function (w) { return { sym: w.split("").concat(["</w>"]), n: wc[w] }; }), out = [];
		for (var m = 0; m < merges; m++) {
			var pc = {}; vocab.forEach(function (v) { for (var i = 0; i < v.sym.length - 1; i++) { var k = v.sym[i] + "\u0001" + v.sym[i + 1]; pc[k] = (pc[k] || 0) + v.n; } });
			var best = null, bn = 1; Object.keys(pc).forEach(function (k) { if (pc[k] > bn || (pc[k] === bn && best && k < best)) { best = k; bn = pc[k]; } }); if (!best) break;
			var p = best.split("\u0001"); out.push(p); vocab.forEach(function (v) { var s = []; for (var i = 0; i < v.sym.length; i++) { if (i < v.sym.length - 1 && v.sym[i] === p[0] && v.sym[i + 1] === p[1]) { s.push(p[0] + p[1]); i++; } else s.push(v.sym[i]); } v.sym = s; });
		}
		return out;
	}
	function bpeEncode(text, merges) {
		var toks = []; (String(text).toLowerCase().match(/[a-z0-9']+|[.,!?;:]|\s+|[^\sa-z0-9']/g) || []).forEach(function (w) {
			if (/^\s+$/.test(w)) return; var sym = w.split("").concat(["</w>"]);
			merges.forEach(function (p) { var s = []; for (var i = 0; i < sym.length; i++) { if (i < sym.length - 1 && sym[i] === p[0] && sym[i + 1] === p[1]) { s.push(p[0] + p[1]); i++; } else s.push(sym[i]); } sym = s; });
			sym.forEach(function (x) { toks.push(x); });
		}); return toks;
	}
	/* ---------- n-gram language model (Witten-Bell interpolation) ---------- */
	function Model(tokens, order) {
		this.order = Math.max(1, order | 0); this.tokens = tokens; this.vocab = []; var idx = {}, i; tokens.forEach(function (t) { if (idx[t] == null) { idx[t] = 0; } }); this.vocab = Object.keys(idx).sort(); this.vocab.forEach(function (t, j) { idx[t] = j; }); this.idx = idx;
		this.ctx = {};   // context string (tokens joined by \u0001, "" = unigram) -> { n: total, d: { next: count } }
		for (i = 0; i < tokens.length; i++) for (var k = 0; k < this.order; k++) { if (i - k < 0) break; var c = tokens.slice(i - k, i).join("\u0001"), e = this.ctx[c] || (this.ctx[c] = { n: 0, d: {}, t: 0 }); if (!e.d[tokens[i]]) { e.d[tokens[i]] = 0; e.t++; } e.d[tokens[i]]++; e.n++; }
	}
	Model.prototype.probs = function (context) {   // array of probabilities, aligned with this.vocab; also returns which context lengths were seen
		var V = this.vocab.length, p = new Float64Array(V).fill(1 / V), seen = [], hist = context.slice(-(this.order - 1));
		for (var k = 0; k <= hist.length; k++) {   // shortest context first, each level interpolated with the one below it
			var c = hist.slice(hist.length - k).join("\u0001"), e = this.ctx[c]; if (!e) break; var lam = e.n / (e.n + e.t), np = new Float64Array(V), j;
			for (j = 0; j < V; j++) np[j] = (1 - lam) * p[j]; Object.keys(e.d).forEach(function (t) { np[this.idx[t]] += lam * e.d[t] / e.n; }, this); p = np; seen.push(k);
		}
		return { p: p, used: seen.length ? seen[seen.length - 1] : 0 };
	};
	Model.prototype.perplexity = function (tokens) { var lp = 0, n = 0; for (var i = 1; i < tokens.length; i++) { if (this.idx[tokens[i]] == null) continue; var r = this.probs(tokens.slice(Math.max(0, i - this.order + 1), i)); lp += Math.log(r.p[this.idx[tokens[i]]]); n++; } return n ? Math.exp(-lp / n) : Infinity; };
	function shape(p, o) {   // temperature, top-k, top-p -> a renormalised distribution (array aligned with p), zeros for removed tokens
		o = o || {}; var T = o.temp == null ? 1 : o.temp, n = p.length, q = new Float64Array(n), i;
		if (T <= 1e-6) { var b = 0; for (i = 1; i < n; i++) if (p[i] > p[b]) b = i; q[b] = 1; return q; }
		var s = 0; for (i = 0; i < n; i++) { q[i] = p[i] > 0 ? Math.pow(p[i], 1 / T) : 0; s += q[i]; } for (i = 0; i < n; i++) q[i] /= s;
		var order = Array.from(q.keys()).sort(function (a, b) { return q[b] - q[a]; }), keep = new Uint8Array(n), cum = 0, cnt = 0;
		for (var r = 0; r < n; r++) { var id = order[r]; if (o.topK > 0 && cnt >= o.topK) break; if (o.topP > 0 && o.topP < 1 && cum >= o.topP) break; keep[id] = 1; cum += q[id]; cnt++; }
		var t = 0; for (i = 0; i < n; i++) { if (!keep[i]) q[i] = 0; t += q[i]; } for (i = 0; i < n; i++) q[i] /= t; return q;
	}
	function sample(q, r) { var u = r(), c = 0; for (var i = 0; i < q.length; i++) { c += q[i]; if (u < c) return i; } for (var j = q.length - 1; j >= 0; j--) if (q[j] > 0) return j; return 0; }
	function generate(model, prompt, n, o, r) { var out = prompt.slice(), steps = []; for (var i = 0; i < n; i++) { var pr = model.probs(out.slice(-(model.order - 1))), q = shape(pr.p, o), id = sample(q, r); out.push(model.vocab[id]); steps.push({ token: model.vocab[id], p: q[id], used: pr.used }); } return { tokens: out, steps: steps }; }
	function top(model, probs, k) { return Array.from(probs.keys()).sort(function (a, b) { return probs[b] - probs[a]; }).slice(0, k).map(function (i) { return { t: model.vocab[i], p: probs[i] }; }); }
	/* ---------- word vectors: positive PMI over a +-2 window, top eigenvectors by power iteration ---------- */
	function embed(tokens, maxWords, dim, window) {
		window = window || 2; var cnt = {}; tokens.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; }); var vocab = Object.keys(cnt).filter(function (t) { return /[a-z]/.test(t); }).sort(function (a, b) { return cnt[b] - cnt[a] || (a < b ? -1 : 1); }).slice(0, maxWords), id = {}; vocab.forEach(function (t, i) { id[t] = i; });
		var V = vocab.length, C = []; for (var i = 0; i < V; i++) C.push(new Float64Array(V)); var tot = 0;
		for (var p = 0; p < tokens.length; p++) { var a = id[tokens[p]]; if (a == null) continue; for (var d = 1; d <= window; d++) { var b = id[tokens[p + d]]; if (b != null) { C[a][b] += 1; C[b][a] += 1; tot += 2; } } }
		var rs = C.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); }), M = C.map(function (r, a) { return r.map(function (v, b) { return v > 0 ? Math.max(0, Math.log(v * tot / (rs[a] * rs[b]))) : 0; }); });
		var vecs = [], eig = [], rand = rng(5), q;
		for (var k = 0; k < Math.min(dim, V); k++) {
			var x = new Float64Array(V); for (q = 0; q < V; q++) x[q] = rand() - 0.5; var lam = 0;
			for (var it = 0; it < 120; it++) { var y = new Float64Array(V); for (var r = 0; r < V; r++) { var s = 0, row = M[r]; for (var c = 0; c < V; c++) s += row[c] * x[c]; y[r] = s; } for (var e = 0; e < vecs.length; e++) { var dp = 0; for (q = 0; q < V; q++) dp += y[q] * vecs[e][q]; for (q = 0; q < V; q++) y[q] -= dp * vecs[e][q]; } var nr = 0; for (q = 0; q < V; q++) nr += y[q] * y[q]; nr = Math.sqrt(nr) || 1; for (q = 0; q < V; q++) x[q] = y[q] / nr; lam = nr; }
			vecs.push(x); eig.push(lam);
		}
		var emb = {}; vocab.forEach(function (t, i) { emb[t] = vecs.map(function (v, k) { return v[i] * Math.sqrt(Math.abs(eig[k])); }); }); return { vocab: vocab, emb: emb, dim: vecs.length };
	}
	function cosine(a, b) { var ab = 0, aa = 0, bb = 0; for (var i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : 0; }
	function neighbours(E, w, k) { var v = E.emb[w]; if (!v) return []; return E.vocab.filter(function (t) { return t !== w; }).map(function (t) { return { t: t, s: cosine(v, E.emb[t]) }; }).sort(function (a, b) { return b.s - a.s; }).slice(0, k); }
	/* ---------- one self-attention head ---------- */
	function hashVec(word, dim) { var h = 2166136261; for (var i = 0; i < word.length; i++) { h ^= word.charCodeAt(i); h = Math.imul(h, 16777619); } var r = rng(h >>> 0); return Array.apply(null, Array(dim)).map(function () { return (r() - 0.5) * 0.6; }); }
	function posEnc(pos, dim) { var v = []; for (var i = 0; i < dim; i++) { var f = pos / Math.pow(10000, 2 * Math.floor(i / 2) / dim); v.push(i % 2 ? Math.cos(f) : Math.sin(f)); } return v; }
	function matmul(A, B) { var C = A.map(function () { return new Array(B[0].length).fill(0); }); for (var i = 0; i < A.length; i++) for (var k = 0; k < B.length; k++) { var a = A[i][k]; for (var j = 0; j < B[0].length; j++) C[i][j] += a * B[k][j]; } return C; }
	function softmaxRow(r) { var m = Math.max.apply(null, r), e = r.map(function (x) { return Math.exp(x - m); }), s = e.reduce(function (a, b) { return a + b; }, 0); return e.map(function (x) { return x / s; }); }
	function randMat(n, m, seed, scale) { var r = rng(seed), A = []; for (var i = 0; i < n; i++) { var row = []; for (var j = 0; j < m; j++) row.push((r() - 0.5) * 2 * scale); A.push(row); } return A; }
	function attention(tokens, E, o) {   // o: { dim, mode: "random"|"identity", posScale, causal }
		o = o || {}; var d = o.dim || (E ? E.dim : 8), X = tokens.map(function (t, i) { var base = E && E.emb[t] ? E.emb[t].slice(0, d) : hashVec(t, d); while (base.length < d) base.push(0); var nrm = Math.sqrt(base.reduce(function (s, v) { return s + v * v; }, 0)) || 1; base = base.map(function (v) { return v / nrm * 1.5; }); var pe = posEnc(i, d); return base.map(function (v, j) { return v + (o.posScale == null ? 0.3 : o.posScale) * pe[j]; }); });
		var I = []; for (var i = 0; i < d; i++) { I.push(new Array(d).fill(0)); I[i][i] = 1; } var Wq = o.mode === "identity" ? I : randMat(d, d, 11, 1 / Math.sqrt(d) * 1.6), Wk = o.mode === "identity" ? I : randMat(d, d, 12, 1 / Math.sqrt(d) * 1.6), Wv = o.mode === "identity" ? I : randMat(d, d, 13, 1 / Math.sqrt(d));
		var Q = matmul(X, Wq), K = matmul(X, Wk), V = matmul(X, Wv), S = matmul(Q, K[0].map(function (_, j) { return K.map(function (r) { return r[j]; }); })).map(function (r) { return r.map(function (v) { return v / Math.sqrt(d); }); });
		var P = S.map(function (r, i) { return softmaxRow(r.map(function (v, j) { return o.causal && j > i ? -1e9 : v; })); }); return { X: X, Q: Q, K: K, V: V, scores: S, weights: P, out: matmul(P, V), dim: d };
	}
	/* ---------- built-in practice texts (written for this page) ---------- */
	var CORPORA = {
		stories: "Once upon a time there was a small fox who lived by a quiet river. Every morning the fox walked along the river to the old village. In the village there was a baker, a lamp maker and a girl named Mira. Mira loved to listen to the fox, and the fox loved to listen to the river. One evening the lamp maker lit a lantern and said, \"This lantern will guide you home.\" The fox thanked the lamp maker and walked back along the river with the lantern in the dark. The river sang a quiet song, and the stars came out above the old village. The next morning Mira came to the river and found the lantern still glowing. She carried the lantern to the baker, and the baker gave her a warm loaf of bread. Mira shared the bread with the fox, and they sat by the river together. The fox said, \"A good friend is like a lantern in the dark.\" Mira smiled and said, \"A good river is like a quiet song.\" Then the fox walked back along the river to its home, and Mira walked back to the village. The lamp maker lit a new lantern every evening, and every morning the fox walked along the river to the old village. And so the fox, the river, the lantern and the village stayed good friends for a long, long time. The baker baked bread, the lamp maker made lanterns, and Mira listened to the river and the fox. When winter came the river grew quiet and the village grew warm. The fox stayed by the fire, and Mira told stories about the lantern, the river and the stars. When spring came the fox walked along the river again, and the old village woke up.",
		science: "The Sun is a star, and the Earth is a planet that travels around the Sun. Gravity is the force that pulls objects toward each other, and gravity keeps the Earth in its orbit around the Sun. The Moon is a smaller body that travels around the Earth, and the Moon also feels the pull of gravity. Light travels very fast, and light from the Sun takes about eight minutes to reach the Earth. Light carries energy, and plants use the energy of light to make food. Water moves around the Earth in a cycle. The Sun heats the water in the oceans, and the water rises into the air as vapor. The vapor cools and forms clouds, and the clouds drop rain. The rain flows into rivers, and the rivers flow back to the oceans. Energy cannot be created or destroyed, it can only change from one form to another. A moving object has energy of motion, and a hot object has energy of heat. An atom is a very small piece of matter, and every atom has a nucleus and electrons. Electrons move around the nucleus, and electrons carry a negative charge. A magnet has a magnetic field, and a magnetic field can push and pull on other magnets. An electric current can also make a magnetic field, and a changing magnetic field can make an electric current. The planets travel around the Sun in orbits, and the planets that are closer to the Sun travel faster. Scientists make careful measurements, and scientists test their ideas with experiments. A good experiment can be repeated, and a good measurement has a small error. The universe is very large, and the light from distant stars takes many years to reach the Earth.",
		math: "A number is a way to describe how many, and a fraction is a way to describe a part of a whole. The fraction one half means one part of two equal parts. To add fractions with the same bottom number we add the top numbers. A triangle is a shape with three sides and three angles, and the angles of a triangle always add up to one hundred and eighty degrees. A right triangle has one right angle, and in a right triangle the square of the longest side equals the sum of the squares of the other two sides. This is called the Pythagorean theorem. A circle is a shape where every point is the same distance from the center, and the distance around a circle is called the circumference. The area of a circle is pi times the radius squared. An equation is a statement that two things are equal, and to solve an equation we do the same thing to both sides. If we add three to one side we must add three to the other side. A pattern is something that repeats, and a sequence is a list of numbers that follows a pattern. In the sequence two, four, six, eight the pattern is to add two each time. A function takes a number and gives back another number, and the graph of a function shows how the output changes when the input changes. The slope of a line tells us how steep the line is, and a derivative tells us the slope of a curve at one point. An integral adds up many small pieces to find an area. A probability is a number between zero and one that tells us how likely something is, and the probabilities of all the possible outcomes add up to one. A prime number can only be divided by one and itself, and every number can be written as a product of prime numbers."
	};
	root.MESLM = { rng: rng, words: words, chars: chars, bpeTrain: bpeTrain, bpeEncode: bpeEncode, Model: Model, shape: shape, sample: sample, generate: generate, top: top, embed: embed, cosine: cosine, neighbours: neighbours, attention: attention, posEnc: posEnc, hashVec: hashVec, CORPORA: CORPORA };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESLM;
})(typeof window !== "undefined" ? window : globalThis);

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
