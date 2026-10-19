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
