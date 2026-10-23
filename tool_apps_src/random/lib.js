/* MESRand: pure logic for the MES Random Number Generator / Dice Roller (tool_apps_src/random).
   Runs in the browser and in node (tests: node tool_apps_src/random-tests.js).
   Every random draw goes through an rng object {u32(): 0..2^32-1}; the default one uses crypto.getRandomValues,
   seeded(str) gives a reproducible one (sfc32), tests can inject their own. Integers are drawn by rejection sampling, so there is no modulo bias. */
(function (root) {
	"use strict";
	var TWO32 = 4294967296;

	/* ---------- random sources ---------- */
	function cryptoRng() {
		var c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : (typeof require === "function" ? require("crypto").webcrypto : null);
		var buf = new Uint32Array(256), pos = 256;
		return { kind: "crypto", u32: function () { if (pos >= 256) { c.getRandomValues(buf); pos = 0; } return buf[pos++]; } };
	}
	function hashSeed(str) { /* xmur3 */
		var h = 1779033703 ^ str.length;
		for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
		return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
	}
	function seeded(str) { /* sfc32 */
		var s = hashSeed(String(str)), a = s(), b = s(), c = s(), d = s();
		var r = { kind: "seeded", seed: String(str), u32: function () {
			var t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ (b >>> 9); b = c + (c << 3) | 0; c = (c << 21) | (c >>> 11); c = c + t | 0; return t >>> 0; } };
		for (var i = 0; i < 12; i++) r.u32();
		return r;
	}
	/* unbiased integer in [0, n) for 1 <= n <= 2^53 */
	function below(rng, n) {
		if (!(n >= 1) || n > 9007199254740992 || Math.floor(n) !== n) throw new Error("bad range");
		if (n === 1) return 0;
		if (n <= TWO32) {
			var lim = TWO32 - (TWO32 % n), x;
			do { x = rng.u32(); } while (x >= lim);
			return x % n;
		}
		var SPACE = 9007199254740992, lim2 = SPACE - (SPACE % n), y;
		do { y = (rng.u32() & 0x1fffff) * TWO32 + rng.u32(); } while (y >= lim2);
		return y % n;
	}
	function intIn(rng, lo, hi) { return lo + below(rng, hi - lo + 1); }
	function unit(rng) { return ((rng.u32() >>> 5) * 67108864 + (rng.u32() >>> 6)) / 9007199254740992; } /* [0,1), 53 bits */
	function shuffle(rng, arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = below(rng, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

	/* ---------- numbers ---------- */
	function parseNum(s) { if (s == null) return NaN; s = String(s).trim().replace(/\s+/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."); if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN; return parseFloat(s); }
	function parseList(text) { /* "3, 7 10-12" -> numbers, ranges expanded (max 100,000) */
		var out = [], bad = [];
		String(text || "").split(/[\s,;]+/).forEach(function (t) {
			if (!t) return;
			var m = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/.exec(t);
			if (m) { var a = +m[1], b = +m[2]; if (a > b) { var x = a; a = b; b = x; } if (b - a <= 100000 && a === Math.floor(a) && b === Math.floor(b)) { for (var i = a; i <= b; i++) out.push(i); return; } }
			var v = parseNum(t); if (isNaN(v)) bad.push(t); else out.push(v);
		});
		return { values: out, bad: bad };
	}
	/* opts: {min, max, count, places, unique, sort: ""|"asc"|"desc", exclude: [numbers]} -> {values, error} */
	function numbers(rng, o) {
		var places = Math.max(0, Math.min(10, o.places | 0)), k = Math.pow(10, places);
		var lo = Math.round(o.min * k), hi = Math.round(o.max * k), count = o.count == null ? 1 : o.count;
		if (!isFinite(lo) || !isFinite(hi)) return { error: "Type a lowest and a highest number." };
		if (lo > hi) { var t = lo; lo = hi; hi = t; }
		if (hi - lo + 1 > 9007199254740992 || Math.abs(lo) > 9007199254740991 || Math.abs(hi) > 9007199254740991) return { error: "That range is too large (keep it under about 9 quadrillion steps)." };
		if (!(count >= 1) || count !== Math.floor(count)) return { error: "How many must be a whole number, 1 or more." };
		if (count > 10000) return { error: "At most 10,000 numbers at a time." };
		var ex = new Set();
		(o.exclude || []).forEach(function (v) { var s = Math.round(v * k); if (s >= lo && s <= hi) ex.add(s); });
		var size = hi - lo + 1, avail = size - ex.size;
		if (avail <= 0) return { error: "Every number in that range is excluded." };
		if (o.unique && count > avail) return { error: "You asked for " + count + " different numbers but only " + avail + " are possible in that range" + (ex.size ? " (after the exclusions)" : "") + "." };
		var vals = [];
		if (size <= 200000 && (ex.size * 4 > size || (o.unique && count * 2 > avail))) {
			var pool = []; for (var i = lo; i <= hi; i++) if (!ex.has(i)) pool.push(i);
			if (o.unique) { for (var j = 0; j < count; j++) { var r = j + below(rng, pool.length - j), tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp; vals.push(pool[j]); } }
			else for (var q = 0; q < count; q++) vals.push(pool[below(rng, pool.length)]);
		} else {
			var seen = new Set(), guard = 0;
			while (vals.length < count) {
				if (++guard > count * 1000 + 100000) return { error: "Could not find enough numbers; try a wider range." };
				var v = lo + below(rng, size);
				if (ex.has(v)) continue;
				if (o.unique) { if (seen.has(v)) continue; seen.add(v); }
				vals.push(v);
			}
		}
		if (o.sort === "asc") vals.sort(function (a, b) { return a - b; });
		else if (o.sort === "desc") vals.sort(function (a, b) { return b - a; });
		return { values: vals.map(function (v) { return places ? v / k : v; }), places: places, possible: avail };
	}
	function fmtNum(v, places) { return places ? v.toFixed(places) : String(v); }
	var LOTTERY = [
		{ id: "649", name: "6/49", note: "6 numbers from 1 to 49 (Lotto 6/49, UK Lotto style 6/59 is close)", parts: [{ label: "Numbers", n: 6, max: 49 }] },
		{ id: "pb", name: "Powerball style", note: "5 from 1-69 plus 1 from 1-26", parts: [{ label: "Numbers", n: 5, max: 69 }, { label: "Power ball", n: 1, max: 26 }] },
		{ id: "mm", name: "Mega Millions style", note: "5 from 1-70 plus 1 from 1-24", parts: [{ label: "Numbers", n: 5, max: 70 }, { label: "Mega ball", n: 1, max: 24 }] },
		{ id: "em", name: "EuroMillions style", note: "5 from 1-50 plus 2 stars from 1-12", parts: [{ label: "Numbers", n: 5, max: 50 }, { label: "Lucky stars", n: 2, max: 12 }] },
		{ id: "lm", name: "Lotto Max style", note: "7 numbers from 1 to 50", parts: [{ label: "Numbers", n: 7, max: 50 }] }
	];
	function lottery(rng, id) {
		var p = LOTTERY.filter(function (x) { return x.id === id; })[0]; if (!p) return null;
		return { preset: p, parts: p.parts.map(function (part) { return { label: part.label, max: part.max, values: numbers(rng, { min: 1, max: part.max, count: part.n, unique: true, sort: "asc" }).values }; }) };
	}
	function comb(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
	function lotteryOdds(id) { var p = LOTTERY.filter(function (x) { return x.id === id; })[0]; return p.parts.reduce(function (a, part) { return a * comb(part.max, part.n); }, 1); }

	/* ---------- dice notation ---------- */
	var MAX_DICE = 1000, MAX_SIDES = 100000;
	/* "2d6+3", "4d6kh3", "4d6 drop lowest", "d20 adv", "3d6!", "d%", "4dF", "2d20kl1-1", "d6+d8" */
	function parseDice(input) {
		var s = String(input || "").toLowerCase().trim();
		if (!s) return { error: "Type some dice, for example 2d6+3." };
		s = s.replace(/[×x]\s*(?=\d)/g, "*");
		s = s.replace(/\bwith\b/g, " ").replace(/\b(advantage)\b/g, "adv").replace(/\b(disadvantage)\b/g, "dis");
		s = s.replace(/drop\s+(the\s+)?lowest(\s+(\d+))?/g, function (m, a, b, n) { return "dl" + (n || 1); })
			.replace(/drop\s+(the\s+)?highest(\s+(\d+))?/g, function (m, a, b, n) { return "dh" + (n || 1); })
			.replace(/keep\s+(the\s+)?highest(\s+(\d+))?/g, function (m, a, b, n) { return "kh" + (n || 1); })
			.replace(/keep\s+(the\s+)?lowest(\s+(\d+))?/g, function (m, a, b, n) { return "kl" + (n || 1); });
		if (/\d\s+\d/.test(s)) return { error: "Put + or - between parts (for example 2d6 + 3)." };
		s = s.replace(/\s+/g, "");
		if (!s) return { error: "Type some dice, for example 2d6+3." };
		var terms = [], i = 0, sign = 1, first = true, totalDice = 0;
		while (i < s.length) {
			var c = s[i];
			if (c === "+" || c === "-") { if (!first && (s[i - 1] === "+" || s[i - 1] === "-")) return { error: "Two signs in a row near \"" + s.slice(i - 1, i + 3) + "\"." }; sign = c === "-" ? -1 : 1; i++; if (i >= s.length) return { error: "Nothing after the last " + c + "." }; continue; }
			if (!first && terms.length && s[i - 1] !== "+" && s[i - 1] !== "-") return { error: "Put + or - between parts (near \"" + s.slice(i, i + 4) + "\")." };
			var m = /^(\d*)d(%|f|\d+)/.exec(s.slice(i));
			if (m) {
				var n = m[1] === "" ? 1 : parseInt(m[1], 10), sides, fudge = false;
				if (m[2] === "%") sides = 100; else if (m[2] === "f") { sides = 3; fudge = true; } else sides = parseInt(m[2], 10);
				if (n < 1) return { error: "Roll at least 1 die." };
				if (!fudge && sides < 2) return { error: "A die needs at least 2 sides." };
				if (n > MAX_DICE) return { error: "At most " + MAX_DICE + " dice." };
				if (sides > MAX_SIDES) return { error: "At most " + MAX_SIDES + " sides." };
				i += m[0].length;
				var t = { type: "dice", n: n, sides: sides, fudge: fudge, sign: sign, keep: null, explode: false, label: "" };
				var rest = s.slice(i), mm;
				for (;;) {
					rest = s.slice(i);
					if ((mm = /^(kh|kl|dh|dl|k)(\d*)/.exec(rest))) {
						var cnt = mm[2] === "" ? 1 : parseInt(mm[2], 10);
						if (t.keep) return { error: "Use only one keep or drop per dice group." };
						var kind = mm[1] === "k" ? "kh" : mm[1];
						var keepN = kind === "kh" || kind === "kl" ? cnt : n - cnt, high = kind === "kh" || kind === "dl";
						if (cnt < 1 || keepN < 1 || keepN > n) return { error: "Can't " + (kind[0] === "k" ? "keep " : "drop ") + cnt + " of " + n + " dice." };
						t.keep = { n: keepN, high: high };
						i += mm[0].length; continue;
					}
					if (rest[0] === "!") { if (t.fudge) return { error: "Fudge dice can't explode." }; t.explode = true; i++; continue; }
					if ((mm = /^(adv|dis)/.exec(rest))) {
						if (t.keep) return { error: "Use only one keep or drop per dice group." };
						if (n !== 1) return { error: "Advantage / disadvantage works on one die, like d20 adv." };
						t.n = 2; t.keep = { n: 1, high: mm[1] === "adv" }; t.label = mm[1] === "adv" ? "advantage" : "disadvantage"; i += 3; continue;
					}
					break;
				}
				if (t.keep && t.keep.n === t.n) t.keep = null;
				totalDice += t.n;
				if (totalDice > MAX_DICE) return { error: "At most " + MAX_DICE + " dice in total." };
				terms.push(t);
			} else {
				var k = /^\d+(\.\d+)?/.exec(s.slice(i));
				if (!k) return { error: "I don't understand \"" + s.slice(i, i + 6) + "\". Try something like 2d6+3, 4d6kh3, d20 adv, 3d6!, d% or 4dF." };
				var v = parseFloat(k[0]);
				if (v > 1e9) return { error: "That number is too large." };
				terms.push({ type: "const", v: v * sign });
				i += k[0].length;
			}
			first = false; sign = 1;
		}
		if (!terms.some(function (x) { return x.type === "dice"; })) return { error: "There are no dice in that. Add something like d6." };
		return { terms: terms, text: describe(terms) };
	}
	function termText(t) {
		if (t.type === "const") return String(Math.abs(t.v));
		var base = (t.label ? "1" : t.n) + "d" + (t.fudge ? "F" : t.sides);
		if (t.label) return "d" + t.sides + " with " + t.label;
		if (t.keep) base += (t.keep.high ? "kh" : "kl") + t.keep.n;
		if (t.explode) base += "!";
		return base;
	}
	function describe(terms) {
		return terms.map(function (t, i) { var neg = t.type === "const" ? t.v < 0 : t.sign < 0; return (i ? (neg ? " - " : " + ") : (neg ? "-" : "")) + termText(t); }).join("");
	}
	function faceValue(t, r) { return t.fudge ? r - 2 : r; }
	/* roll -> {total, groups:[{term, dice:[{v, kept, chain:[...]}], sum}]} */
	function rollDice(rng, parsed) {
		var total = 0, groups = [];
		parsed.terms.forEach(function (t) {
			if (t.type === "const") { total += t.v; groups.push({ term: t, sum: t.v }); return; }
			var dice = [];
			for (var i = 0; i < t.n; i++) {
				var r = intIn(rng, 1, t.sides), chain = [r], v = faceValue(t, r), guard = 0;
				if (t.explode) while (r === t.sides && guard++ < 100) { r = intIn(rng, 1, t.sides); chain.push(r); v += r; }
				dice.push({ v: v, chain: chain, kept: true, i: i });
			}
			if (t.keep) {
				var order = dice.slice().sort(function (a, b) { return t.keep.high ? b.v - a.v || a.i - b.i : a.v - b.v || a.i - b.i; });
				order.forEach(function (d, j) { d.kept = j < t.keep.n; });
			}
			var sum = dice.reduce(function (a, d) { return a + (d.kept ? d.v : 0); }, 0) * t.sign;
			total += sum; groups.push({ term: t, dice: dice, sum: sum });
		});
		return { total: Math.round(total * 1e9) / 1e9, groups: groups };
	}

	/* ---------- exact distributions ---------- */
	/* a distribution is {lo, p: Float64Array} meaning P(total = lo + i) = p[i] */
	function conv(a, b) {
		var p = new Float64Array(a.p.length + b.p.length - 1);
		for (var i = 0; i < a.p.length; i++) { var ai = a.p[i]; if (!ai) continue; for (var j = 0; j < b.p.length; j++) p[i + j] += ai * b.p[j]; }
		return { lo: a.lo + b.lo, p: p };
	}
	function trim(d) { var s = 0, e = d.p.length - 1; while (s < e && d.p[s] < 1e-300) s++; while (e > s && d.p[e] < 1e-300) e--; return { lo: d.lo + s, p: d.p.slice(s, e + 1) }; }
	function powDist(d, n) { var r = { lo: 0, p: new Float64Array([1]) }, b = d; while (n > 0) { if (n & 1) r = trim(conv(r, b)); n >>= 1; if (n) b = trim(conv(b, b)); } return r; }
	function dieDist(t) {
		var S = t.sides;
		if (!t.explode) { var p = new Float64Array(S); for (var i = 0; i < S; i++) p[i] = 1 / S; return { lo: t.fudge ? -1 : 1, p: p, exact: true }; }
		/* exploding die: value = k*S + r, r in 1..S-1, prob (1/S)^(k+1); truncated once the tail < 1e-12 */
		var depth = Math.max(1, Math.ceil(12 / Math.log10(S))), q = new Float64Array(depth * S);
		for (var k = 0; k < depth; k++) for (var r = 1; r < S; r++) q[k * S + r - 1] = Math.pow(1 / S, k + 1);
		return { lo: 1, p: q, exact: true, truncated: true };
	}
	var LNF = [0]; function lnFact(n) { for (var i = LNF.length; i <= n; i++) LNF[i] = LNF[i - 1] + Math.log(i); return LNF[n]; }
	function keepDist(t) { /* exact by walking every multiset of face counts */
		var S = t.sides, N = t.n, K = t.keep.n, high = t.keep.high, off = t.fudge ? -1 : 1;
		var lo = K * off, p = new Float64Array(K * (S - 1) + 1), counts = new Array(S), base = lnFact(N) - N * Math.log(S);
		function rec(face, left, lnDen) {
			if (face === S - 1) { counts[face] = left; finish(lnDen + lnFact(left)); return; }
			for (var c = 0; c <= left; c++) { counts[face] = c; rec(face + 1, left - c, lnDen + lnFact(c)); }
		}
		function finish(lnDen) {
			var need = K, sum = 0;
			if (high) { for (var f = S - 1; f >= 0 && need; f--) { var take = Math.min(need, counts[f]); sum += take * f; need -= take; } }
			else { for (var g = 0; g < S && need; g++) { var tk = Math.min(need, counts[g]); sum += tk * g; need -= tk; } }
			p[sum] += Math.exp(base - lnDen);
		}
		rec(0, N, 0);
		return { lo: lo, p: p };
	}
	function multisets(N, S) { return comb(N + S - 1, N); }
	/* distribution(parsed, opts) -> {lo, p, exact, method, note} ; opts.rng for Monte Carlo, opts.samples */
	function distribution(parsed, opts) {
		opts = opts || {};
		var total = { lo: 0, p: new Float64Array([1]) }, exact = true, notes = [], mc = false, cst = 0;
		var nonInt = parsed.terms.some(function (t) { return t.type === "const" && t.v !== Math.floor(t.v); });
		for (var i = 0; i < parsed.terms.length; i++) {
			var t = parsed.terms[i], d;
			if (t.type === "const") { cst += t.v; continue; }
			if (t.keep && t.explode) { mc = true; break; }
			if (t.keep) {
				if (multisets(t.n, t.sides) > 400000) { mc = true; break; }
				d = keepDist(t);
			} else {
				var one = dieDist(t);
				if (one.truncated) notes.push("Exploding dice can in theory roll forever; chances below one in a trillion are left out.");
				if (one.p.length * t.n > 400000) { mc = true; break; }
				d = powDist(one, t.n);
			}
			if (t.sign < 0) { var r = new Float64Array(d.p.length); for (var j = 0; j < d.p.length; j++) r[j] = d.p[d.p.length - 1 - j]; d = { lo: -(d.lo + d.p.length - 1), p: r }; }
			total = trim(conv(total, d));
			if (total.p.length > 400000) { mc = true; break; }
		}
		if (mc || nonInt) return monteCarlo(parsed, opts);
		total.lo += cst;
		return { lo: total.lo, p: total.p, exact: true, method: "exact", note: notes.join(" ") };
	}
	function monteCarlo(parsed, opts) {
		var dice = parsed.terms.reduce(function (a, t) { return a + (t.n || 0); }, 0);
		var rng = opts.rng || cryptoRng(), n = opts.samples || Math.max(20000, Math.min(200000, Math.round(3e6 / Math.max(1, dice)))), map = new Map(), lo = Infinity, hi = -Infinity;
		for (var i = 0; i < n; i++) { var v = rollDice(rng, parsed).total; map.set(v, (map.get(v) || 0) + 1); if (v < lo) lo = v; if (v > hi) hi = v; }
		var note = "Too many combinations to count exactly, so these chances come from " + n.toLocaleString("en") + " simulated rolls (good to about \u00b1" + (100 / Math.sqrt(n)).toFixed(1) + " percentage points).";
		var integer = true; map.forEach(function (c, v) { if (v !== Math.floor(v)) integer = false; });
		if (!integer || hi - lo > 200000) { /* keep a sparse form */
			var keys = Array.from(map.keys()).sort(function (a, b) { return a - b; });
			return { sparse: keys.map(function (k) { return [k, map.get(k) / n]; }), exact: false, method: "simulated", samples: n, note: note };
		}
		var p = new Float64Array(hi - lo + 1); map.forEach(function (c, v) { p[v - lo] = c / n; });
		return { lo: lo, p: p, exact: false, method: "simulated", samples: n, note: note };
	}
	function pairs(d) { if (d.sparse) return d.sparse; var out = []; for (var i = 0; i < d.p.length; i++) if (d.p[i] > 0) out.push([d.lo + i, d.p[i]]); return out; }
	function summary(d) {
		var ps = pairs(d), m = 0, m2 = 0, tot = 0;
		ps.forEach(function (x) { m += x[0] * x[1]; m2 += x[0] * x[0] * x[1]; tot += x[1]; });
		return { mean: m / tot, sd: Math.sqrt(Math.max(0, m2 / tot - (m / tot) * (m / tot))), min: ps[0][0], max: ps[ps.length - 1][0], total: tot };
	}
	function probAt(d, x, how) { /* how: "eq" | "ge" | "le" */
		var s = 0; pairs(d).forEach(function (pv) { if (how === "eq" ? pv[0] === x : how === "ge" ? pv[0] >= x - 1e-9 : pv[0] <= x + 1e-9) s += pv[1]; });
		return Math.min(1, s);
	}

	/* ---------- statistics ---------- */
	function lgamma(x) { /* Lanczos */
		var g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
		if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
		x -= 1; var a = c[0], t = x + g + 0.5; for (var i = 1; i < 9; i++) a += c[i] / (x + i);
		return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
	}
	function gammaQ(a, x) { /* regularized upper incomplete gamma */
		if (x <= 0) return 1;
		if (x < a + 1) { var sum = 1 / a, del = sum, ap = a; for (var n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a))); }
		var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
		for (var i = 1; i < 1000; i++) { var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var del2 = d * c; h *= del2; if (Math.abs(del2 - 1) < 1e-15) break; }
		return Math.min(1, Math.exp(-x + a * Math.log(x) - lgamma(a)) * h);
	}
	/* chi-square goodness of fit: observed counts vs expected probabilities (default: all equal) */
	function chiSquare(obs, probs) {
		var k = obs.length, n = obs.reduce(function (a, b) { return a + b; }, 0);
		if (k < 2 || n === 0) return null;
		probs = probs || obs.map(function () { return 1 / k; });
		var chi = 0, minExp = Infinity;
		for (var i = 0; i < k; i++) { var e = n * probs[i]; minExp = Math.min(minExp, e); chi += (obs[i] - e) * (obs[i] - e) / e; }
		var df = k - 1;
		return { chi2: chi, df: df, p: gammaQ(df / 2, chi / 2), n: n, minExpected: minExp, enough: minExp >= 5 };
	}
	function verdict(r) {
		if (!r) return "";
		if (!r.enough) return "Not enough rolls yet: each side should be expected at least 5 times (about " + Math.ceil(5 * r.df + 5) + " rolls) before the test means much.";
		if (r.p < 0.001) return "Very unlikely to be fair: a fair one would give results this uneven less than 1 time in 1,000.";
		if (r.p < 0.01) return "Probably not fair: a fair one would look this uneven only about " + (r.p * 100).toFixed(1) + "% of the time.";
		if (r.p < 0.05) return "Slightly suspicious: a fair one looks this uneven about " + (r.p * 100).toFixed(1) + "% of the time. Roll more to be sure.";
		return "Looks fair: results this uneven happen " + (r.p * 100).toFixed(0) + "% of the time even with a perfectly fair one.";
	}

	/* ---------- coins, cards, lists ---------- */
	function flips(rng, n) { var out = new Array(n); for (var i = 0; i < n; i++) out[i] = below(rng, 2); return out; }
	function streaks(arr) { var best = [0, 0], cur = 0, last = -1; arr.forEach(function (v) { cur = v === last ? cur + 1 : 1; last = v; if (cur > best[v]) best[v] = cur; }); return { heads: best[1], tails: best[0], current: cur, last: last }; }
	var SUITS = [{ s: "S", sym: "♠", name: "spades", hot: false }, { s: "H", sym: "♥", name: "hearts", hot: true }, { s: "D", sym: "♦", name: "diamonds", hot: true }, { s: "C", sym: "♣", name: "clubs", hot: false }];
	var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
	var RANK_NAMES = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };
	function deck(jokers) {
		var d = [];
		SUITS.forEach(function (su) { RANKS.forEach(function (r) { d.push(r + su.s); }); });
		if (jokers) { d.push("JK1"); d.push("JK2"); }
		return d;
	}
	function cardInfo(code) {
		if (code.indexOf("JK") === 0) return { joker: true, name: "Joker", hot: code === "JK1" };
		var su = SUITS.filter(function (x) { return x.s === code.slice(-1); })[0], r = code.slice(0, -1);
		return { rank: r, suit: su.s, sym: su.sym, hot: su.hot, name: (RANK_NAMES[r] || r) + " of " + su.name };
	}
	function deal(cards, players, each) { /* round-robin from the top */
		var hands = []; for (var p = 0; p < players; p++) hands.push([]);
		var i = 0; for (var c = 0; c < each; c++) for (var q = 0; q < players; q++) hands[q].push(cards[i++]);
		return { hands: hands, rest: cards.slice(i) };
	}
	function parseNames(text) { return String(text || "").split(/\r?\n|,|;|\t/).map(function (s) { return s.trim(); }).filter(Boolean); }
	function pickN(rng, items, n) { return shuffle(rng, items).slice(0, n); }
	function teams(rng, items, k, bySize) { /* k = number of teams, or size of each team when bySize */
		var sh = shuffle(rng, items), t = bySize ? Math.max(1, Math.ceil(items.length / Math.max(1, k))) : Math.max(1, Math.min(k, items.length)), out = [];
		for (var i = 0; i < t; i++) out.push([]);
		sh.forEach(function (x, i) { out[i % t].push(x); });
		return out;
	}

	var API = { cryptoRng: cryptoRng, seeded: seeded, below: below, intIn: intIn, unit: unit, shuffle: shuffle,
		parseNum: parseNum, parseList: parseList, numbers: numbers, fmtNum: fmtNum, LOTTERY: LOTTERY, lottery: lottery, lotteryOdds: lotteryOdds, comb: comb,
		parseDice: parseDice, describe: describe, rollDice: rollDice, distribution: distribution, pairs: pairs, summary: summary, probAt: probAt,
		lgamma: lgamma, gammaQ: gammaQ, chiSquare: chiSquare, verdict: verdict,
		flips: flips, streaks: streaks, SUITS: SUITS, RANKS: RANKS, deck: deck, cardInfo: cardInfo, deal: deal, parseNames: parseNames, pickN: pickN, teams: teams };
	root.MESRand = API;
	if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
