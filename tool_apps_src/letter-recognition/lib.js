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
