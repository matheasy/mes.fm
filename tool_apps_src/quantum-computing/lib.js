/* MESQComp: the maths behind the MES Quantum Computer Simulator (mes.fm/quantum-computing). Pure functions, no DOM; runs in node too:
 *   node tool_apps_src/quantum-computing-tests.js
 * State vector of n qubits (n <= 10) = two Float64Arrays (re, im) of length 2^n. Qubit 0 is the LOWEST bit of the basis index
 * (the Qiskit convention), so the basis state |q2 q1 q0> has index q0 + 2 q1 + 4 q2 and is written with the highest qubit first.
 * A circuit = { n, cols: [[op, ...], ...] }; an op = { g: gate id, q: [targets], c: [controls], p: angle in radians (rotation gates) }.
 * Ops in one column never share a wire between their lowest and highest qubit (the drawing joins them with a vertical line). */
(function (root) {
	"use strict";
	var PI = Math.PI, SQ = Math.SQRT1_2;
	var M = {};
	M.MAXQ = 10;

	/* ---------------------------------------------------------------- gates */
	// 2x2 complex matrix as [re00, im00, re01, im01, re10, im10, re11, im11]
	function cis(a) { return [Math.cos(a), Math.sin(a)]; }
	M.GATES = {
		H: { name: "Hadamard", label: "H", qasm: "h", m: function () { return [SQ, 0, SQ, 0, SQ, 0, -SQ, 0]; } },
		X: { name: "Pauli X (NOT)", label: "X", qasm: "x", m: function () { return [0, 0, 1, 0, 1, 0, 0, 0]; } },
		Y: { name: "Pauli Y", label: "Y", qasm: "y", m: function () { return [0, 0, 0, -1, 0, 1, 0, 0]; } },
		Z: { name: "Pauli Z", label: "Z", qasm: "z", m: function () { return [1, 0, 0, 0, 0, 0, -1, 0]; } },
		S: { name: "S (quarter turn, √Z)", label: "S", qasm: "s", m: function () { return [1, 0, 0, 0, 0, 0, 0, 1]; } },
		SDG: { name: "S† (S inverse)", label: "S†", qasm: "sdg", m: function () { return [1, 0, 0, 0, 0, 0, 0, -1]; } },
		T: { name: "T (eighth turn, √S)", label: "T", qasm: "t", m: function () { var e = cis(PI / 4); return [1, 0, 0, 0, 0, 0, e[0], e[1]]; } },
		TDG: { name: "T† (T inverse)", label: "T†", qasm: "tdg", m: function () { var e = cis(-PI / 4); return [1, 0, 0, 0, 0, 0, e[0], e[1]]; } },
		SX: { name: "√X", label: "√X", qasm: "sx", m: function () { return [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5]; } },
		RX: { name: "Rx: turn about the x axis", label: "Rx", qasm: "rx", par: 1, m: function (t) { var c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, 0, -s, 0, -s, c, 0]; } },
		RY: { name: "Ry: turn about the y axis", label: "Ry", qasm: "ry", par: 1, m: function (t) { var c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, -s, 0, s, 0, c, 0]; } },
		RZ: { name: "Rz: turn about the z axis", label: "Rz", qasm: "rz", par: 1, m: function (t) { var a = cis(-t / 2), b = cis(t / 2); return [a[0], a[1], 0, 0, 0, 0, b[0], b[1]]; } },
		P: { name: "Phase P(φ)", label: "P", qasm: "u1", par: 1, m: function (t) { var e = cis(t); return [1, 0, 0, 0, 0, 0, e[0], e[1]]; } },
		SWAP: { name: "Swap", label: "×", qasm: "swap", two: 1 },
		M: { name: "Measure", label: "M", qasm: "measure" }
	};
	M.matrix = function (g, p) { var G = M.GATES[g]; return G && G.m ? G.m(p || 0) : null; };
	M.isUnitary = function (m) {
		// columns orthonormal: M† M = I
		function dot(a, b) { // conj(col a) . col b
			var re = m[a * 2] * m[b * 2] + m[a * 2 + 1] * m[b * 2 + 1] + m[4 + a * 2] * m[4 + b * 2] + m[4 + a * 2 + 1] * m[4 + b * 2 + 1];
			var im = m[a * 2] * m[b * 2 + 1] - m[a * 2 + 1] * m[b * 2] + m[4 + a * 2] * m[4 + b * 2 + 1] - m[4 + a * 2 + 1] * m[4 + b * 2];
			return [re, im];
		}
		var d00 = dot(0, 0), d11 = dot(1, 1), d01 = dot(0, 1);
		return Math.abs(d00[0] - 1) < 1e-12 && Math.abs(d11[0] - 1) < 1e-12 && Math.abs(d01[0]) < 1e-12 && Math.abs(d01[1]) < 1e-12 && Math.abs(d00[1]) < 1e-12;
	};

	/* ---------------------------------------------------------------- state vector */
	M.state = function (n) { var N = 1 << n, s = { n: n, re: new Float64Array(N), im: new Float64Array(N) }; s.re[0] = 1; return s; };
	M.copy = function (s) { return { n: s.n, re: new Float64Array(s.re), im: new Float64Array(s.im) }; };
	function cmask(c) { var m = 0; for (var i = 0; i < (c || []).length; i++) m |= 1 << c[i]; return m; }
	M.apply1 = function (s, m, t, cm) {
		var N = s.re.length, bit = 1 << t, re = s.re, im = s.im; cm = cm || 0;
		for (var i = 0; i < N; i++) {
			if (i & bit || (i & cm) !== cm) continue;
			var j = i | bit, ar = re[i], ai = im[i], br = re[j], bi = im[j];
			re[i] = m[0] * ar - m[1] * ai + m[2] * br - m[3] * bi; im[i] = m[0] * ai + m[1] * ar + m[2] * bi + m[3] * br;
			re[j] = m[4] * ar - m[5] * ai + m[6] * br - m[7] * bi; im[j] = m[4] * ai + m[5] * ar + m[6] * bi + m[7] * br;
		}
	};
	M.swap = function (s, a, b, cm) {
		var N = s.re.length, ba = 1 << a, bb = 1 << b; cm = cm || 0;
		for (var i = 0; i < N; i++) {
			if (!(i & ba) || (i & bb) || (i & cm) !== cm) continue;
			var j = i ^ ba ^ bb, r = s.re[i], m = s.im[i]; s.re[i] = s.re[j]; s.im[i] = s.im[j]; s.re[j] = r; s.im[j] = m;
		}
	};
	// measure qubit q in the Z basis: r = a random number in [0,1); collapses the state; returns {v: 0|1, p1}
	M.measure = function (s, q, r) {
		var N = s.re.length, bit = 1 << q, p1 = 0, i;
		for (i = 0; i < N; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
		var v = r < p1 ? 1 : 0, keep = v ? p1 : 1 - p1, k = keep > 1e-300 ? 1 / Math.sqrt(keep) : 0;
		for (i = 0; i < N; i++) { if (((i & bit) ? 1 : 0) === v) { s.re[i] *= k; s.im[i] *= k; } else { s.re[i] = 0; s.im[i] = 0; } }
		return { v: v, p1: p1 };
	};
	M.applyOp = function (s, op) {
		if (op.g === "M") return;
		var cm = cmask(op.c);
		if (op.g === "SWAP") return M.swap(s, op.q[0], op.q[1], cm);
		var m = M.matrix(op.g, op.p);
		for (var k = 0; k < op.q.length; k++) M.apply1(s, m, op.q[k], cm);
	};
	M.norm = function (s) { var t = 0; for (var i = 0; i < s.re.length; i++) t += s.re[i] * s.re[i] + s.im[i] * s.im[i]; return t; };
	M.probs = function (s) { var N = s.re.length, p = new Float64Array(N); for (var i = 0; i < N; i++) p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i]; return p; };
	// probability that each qubit reads 1
	M.ones = function (s) { var out = [], p = M.probs(s); for (var q = 0; q < s.n; q++) { var t = 0; for (var i = 0; i < p.length; i++) if (i & (1 << q)) t += p[i]; out.push(t); } return out; };
	// marginal distribution over the listed qubits (key bit k = qs[k]); returns Float64Array of length 2^qs.length
	M.marginal = function (p, qs) {
		var out = new Float64Array(1 << qs.length);
		for (var i = 0; i < p.length; i++) { if (!p[i]) continue; var k = 0; for (var j = 0; j < qs.length; j++) if (i & (1 << qs[j])) k |= 1 << j; out[k] += p[i]; }
		return out;
	};
	// Bloch vector of one qubit from its reduced density matrix: rho01 = (x − i y)/2, z = rho00 − rho11. Length r < 1 = entangled (or mixed).
	M.bloch = function (s, q) {
		var N = s.re.length, bit = 1 << q, r00 = 0, r11 = 0, xr = 0, xi = 0;
		for (var i = 0; i < N; i++) {
			if (i & bit) continue;
			var j = i | bit, ar = s.re[i], ai = s.im[i], br = s.re[j], bi = s.im[j];
			r00 += ar * ar + ai * ai; r11 += br * br + bi * bi;
			xr += ar * br + ai * bi; xi += ai * br - ar * bi; // a · conj(b)
		}
		var x = 2 * xr, y = -2 * xi, z = r00 - r11;
		return { x: x, y: y, z: z, r: Math.sqrt(x * x + y * y + z * z), p0: r00, p1: r11 };
	};
	// angles of a Bloch vector: theta from |0> (z), phi from +x towards +y
	M.blochAngles = function (b) { var th = Math.acos(Math.max(-1, Math.min(1, b.r > 1e-12 ? b.z / b.r : 1))), ph = Math.atan2(b.y, b.x); return { theta: th, phi: ph }; };

	/* ---------------------------------------------------------------- circuits */
	M.span = function (op) { var w = op.q.concat(op.c || []); return [Math.min.apply(null, w), Math.max.apply(null, w)]; };
	M.wires = function (op) { return op.q.concat(op.c || []); };
	M.overlaps = function (a, b) { var x = M.span(a), y = M.span(b); return x[0] <= y[1] && y[0] <= x[1]; };
	M.colFree = function (col, op, skip) { for (var i = 0; i < col.length; i++) if (col[i] !== skip && M.overlaps(col[i], op)) return false; return true; };
	// lay a list of ops out in columns as early as possible (an op waits for every wire between its lowest and highest qubit)
	M.layout = function (n, ops) {
		var cols = [], last = []; for (var w = 0; w < n; w++) last.push(-1);
		ops.forEach(function (op) {
			var sp = M.span(op), c = -1, w;
			for (w = sp[0]; w <= sp[1]; w++) c = Math.max(c, last[w]);
			c++; while (cols.length <= c) cols.push([]);
			cols[c].push(M.clean(op)); for (w = sp[0]; w <= sp[1]; w++) last[w] = c;
		});
		return { n: n, cols: cols };
	};
	M.clean = function (op) { var o = { g: op.g, q: op.q.slice(), c: (op.c || []).slice() }; if (M.GATES[op.g] && M.GATES[op.g].par) o.p = +op.p || 0; return o; };
	M.ops = function (circ) { var out = []; circ.cols.forEach(function (col) { col.slice().sort(function (a, b) { return M.span(a)[0] - M.span(b)[0]; }).forEach(function (op) { out.push(op); }); }); return out; };
	M.prune = function (circ) { return { n: circ.n, cols: circ.cols.filter(function (c) { return c.length; }) }; };
	// valid op for n qubits?
	M.validOp = function (op, n) {
		if (!op || !M.GATES[op.g] || !Array.isArray(op.q) || !op.q.length) return false;
		var w = M.wires(op), seen = {};
		for (var i = 0; i < w.length; i++) { if (!(w[i] >= 0 && w[i] < n) || w[i] !== (w[i] | 0) || seen[w[i]]) return false; seen[w[i]] = 1; }
		if (op.g === "SWAP" && op.q.length !== 2) return false;
		if (op.g === "M" && (op.c || []).length) return false;
		if (op.g !== "SWAP" && op.q.length !== 1) return false;
		if (M.GATES[op.g].par && !isFinite(op.p)) return false;
		return true;
	};
	// which qubits are measured, and is any measurement followed by a gate that touches the measured qubit ("mid-circuit")?
	M.measureInfo = function (circ) {
		var measured = {}, mid = false;
		M.ops(circ).forEach(function (op) {
			if (op.g === "M") { measured[op.q[0]] = 1; return; }
			M.wires(op).forEach(function (w) { if (measured[w]) mid = true; });
		});
		var qs = Object.keys(measured).map(Number).sort(function (a, b) { return a - b; });
		return { qs: qs, mid: mid };
	};
	// seeded random numbers (mulberry32)
	M.rng = function (seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
	// run the first `upto` columns (default all). Measurements at the end of the circuit are only read out (state not collapsed) unless
	// opts.collapse; mid-circuit measurements always collapse, using opts.rng (or a fixed seed). Returns {state, meas: [{col, q, v, p1}], info}
	M.run = function (circ, opts) {
		opts = opts || {};
		var s = M.state(circ.n), info = M.measureInfo(circ), upto = opts.upto == null ? circ.cols.length : Math.min(opts.upto, circ.cols.length);
		var rnd = opts.rng || M.rng(opts.seed || 12345), meas = [], collapse = opts.collapse || info.mid;
		for (var c = 0; c < upto; c++) {
			var col = circ.cols[c];
			for (var k = 0; k < col.length; k++) {
				var op = col[k];
				if (op.g === "M") { if (collapse) { var r = M.measure(s, op.q[0], rnd()); meas.push({ col: c, q: op.q[0], v: r.v, p1: r.p1 }); } continue; }
				M.applyOp(s, op);
			}
		}
		return { state: s, meas: meas, info: info };
	};
	// bit string key of an index over qubits qs (highest qubit first)
	M.key = function (k, len) { var s = ""; for (var j = len - 1; j >= 0; j--) s += (k >> j) & 1; return s; };
	// run `count` shots; returns {qs, counts: {bitstring: n}} over the measured qubits (all qubits when nothing is measured)
	M.shots = function (circ, count, seed) {
		var info = M.measureInfo(circ), qs = info.qs.length ? info.qs : range(circ.n), counts = {}, rnd = M.rng(seed || 7), i;
		if (!info.mid) {
			var p = M.marginal(M.probs(M.run(circ).state), qs), cum = new Float64Array(p.length), t = 0;
			for (i = 0; i < p.length; i++) { t += p[i]; cum[i] = t; }
			for (i = 0; i < count; i++) {
				var r = rnd() * t, lo = 0, hi = p.length - 1;
				while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
				var k = M.key(lo, qs.length); counts[k] = (counts[k] || 0) + 1;
			}
		} else {
			for (i = 0; i < count; i++) {
				var res = M.run(circ, { rng: rnd, collapse: true }), last = {};
				res.meas.forEach(function (m) { last[m.q] = m.v; });
				var key = ""; for (var j = qs.length - 1; j >= 0; j--) key += last[qs[j]] || 0;
				counts[key] = (counts[key] || 0) + 1;
			}
		}
		return { qs: qs, counts: counts };
	};
	function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

	/* ---------------------------------------------------------------- angles */
	// small safe expression parser: numbers, pi / π, + - * / ^, parentheses
	M.parseAngle = function (str) {
		var s = String(str == null ? "" : str).replace(/π/g, "pi").replace(/\s+/g, "").toLowerCase(), i = 0;
		if (!s) throw new Error("Empty angle");
		function peek() { return s[i]; }
		function num() {
			if (s.substr(i, 2) === "pi") { i += 2; return PI; }
			var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error("Can't read the angle “" + str + "”");
			i += m[0].length; return parseFloat(m[0]);
		}
		function atom() {
			if (peek() === "(") { i++; var v = expr(); if (peek() !== ")") throw new Error("Missing )"); i++; return v; }
			if (peek() === "-") { i++; return -atom(); }
			if (peek() === "+") { i++; return atom(); }
			var v2 = num();
			if (peek() === "p" || /\d|\(/.test(peek() || "")) { if (peek() !== undefined && /p|\(/.test(peek())) v2 *= atom(); } // 2pi, 3(pi)
			return v2;
		}
		function pow() { var v = atom(); if (peek() === "^") { i++; v = Math.pow(v, pow()); } return v; }
		function term() { var v = pow(); while (peek() === "*" || peek() === "/") { var o = s[i++], r = pow(); v = o === "*" ? v * r : v / r; } return v; }
		function expr() { var v = term(); while (peek() === "+" || peek() === "-") { var o = s[i++], r = term(); v = o === "+" ? v + r : v - r; } return v; }
		var v = expr(); if (i < s.length) throw new Error("Can't read the angle “" + str + "”");
		if (!isFinite(v)) throw new Error("The angle is not a number");
		return v;
	};
	// angle as a nice multiple of π when it is one (denominators up to 16), else 4 decimals
	M.fmtAngle = function (a, ascii, digits) {
		var p = ascii ? "pi" : "π", f = a / PI;
		for (var d = 1; d <= 16; d++) {
			var n = Math.round(f * d);
			if (Math.abs(f * d - n) < 1e-9) {
				if (n === 0) return "0";
				var g = gcd(Math.abs(n), d); n /= g; var dd = d / g;
				var top = (n < 0 ? "-" : "") + (Math.abs(n) === 1 ? "" : Math.abs(n) + (ascii ? "*" : "")) + p;
				return dd === 1 ? top : top + "/" + dd;
			}
		}
		return String(digits ? +a.toPrecision(digits) : +a.toFixed(4));
	};
	function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
	M.gcd = gcd;
	// continued-fraction approximations of x with denominators <= maxDen: [[num, den], ...]
	M.convergents = function (x, maxDen) {
		var out = [], h0 = 1, h1 = 0, k0 = 0, k1 = 1, v = x;
		for (var i = 0; i < 20; i++) {
			var a = Math.floor(v), h = a * h0 + h1, k = a * k0 + k1;
			if (k > maxDen) break; out.push([h, k]); h1 = h0; h0 = h; k1 = k0; k0 = k;
			var fr = v - a; if (fr < 1e-9) break; v = 1 / fr;
		}
		return out;
	};

	/* ---------------------------------------------------------------- building blocks */
	M.qftOps = function (qs, inverse) {
		var ops = [], n = qs.length, j, k;
		for (j = n - 1; j >= 0; j--) {
			ops.push({ g: "H", q: [qs[j]], c: [] });
			for (k = j - 1; k >= 0; k--) ops.push({ g: "P", q: [qs[j]], c: [qs[k]], p: PI / Math.pow(2, j - k) });
		}
		for (j = 0; j < Math.floor(n / 2); j++) ops.push({ g: "SWAP", q: [qs[j], qs[n - 1 - j]], c: [] });
		if (!inverse) return ops;
		return ops.reverse().map(function (op) { var o = M.clean(op); if (o.g === "P") o.p = -o.p; return o; });
	};
	function op(g, q, c, p) { var o = { g: g, q: [].concat(q), c: c == null ? [] : [].concat(c) }; if (p != null) o.p = p; return o; }
	M.op = op;
	function meas(qs) { return qs.map(function (q) { return op("M", q); }); }

	/* ---------------------------------------------------------------- example circuits */
	M.PRESETS = [
		{ id: "coin", name: "Quantum coin", n: 1, ops: [op("H", 0), op("M", 0)],
			note: "One Hadamard puts the qubit in an equal superposition of |0⟩ and |1⟩. Measuring it gives 0 or 1 with 50% each: run the shots and watch the two bars even out." },
		{ id: "bell", name: "Bell state", n: 2, ops: [op("H", 0), op("X", 1, 0), op("M", 0), op("M", 1)],
			note: "H then CNOT makes (|00⟩ + |11⟩)/√2. The two qubits always give the same answer, 00 or 11, never 01 or 10. Each one alone is a perfect coin: its Bloch arrow has length 0 because it is fully entangled." },
		{ id: "ghz", name: "GHZ state (3 qubits)", n: 3, ops: [op("H", 0), op("X", 1, 0), op("X", 2, 1)].concat(meas([0, 1, 2])),
			note: "(|000⟩ + |111⟩)/√2: three qubits that all agree. Add more qubits and more CNOTs to make a bigger cat state." },
		{ id: "teleport", name: "Teleportation", n: 3,
			ops: [op("RY", 0, null, 1.1), op("RZ", 0, null, 0.7), op("H", 1), op("X", 2, 1), op("X", 1, 0), op("H", 0), op("X", 2, 1), op("Z", 2, 0), op("M", 0), op("M", 1)],
			note: "q0 holds a random-looking state (Ry, Rz). q1 and q2 share a Bell pair. After the CNOT and H on Alice's side, the corrections are done with CNOT and CZ (the principle of deferred measurement replaces the phone call). Pick q2 on the Bloch sphere: its arrow now points exactly where q0's did at step 2." },
		{ id: "superdense", name: "Superdense coding", n: 2, ops: [op("H", 0), op("X", 1, 0), op("X", 0), op("Z", 0), op("X", 1, 0), op("H", 0), op("M", 0), op("M", 1)],
			note: "Two classical bits sent with one qubit. Alice and Bob share a Bell pair; Alice applies X and Z (the message 11) to her qubit only and sends it. Bob's CNOT and H turn it back into the two bits: the shots always read 11. Delete the X or Z gate to send 01, 10 or 00." },
		{ id: "dj", name: "Deutsch–Jozsa", n: 4, ops: [op("X", 3), op("H", 0), op("H", 1), op("H", 2), op("H", 3), op("X", 3, 0), op("X", 3, 1), op("X", 3, 2), op("H", 0), op("H", 1), op("H", 2)].concat(meas([0, 1, 2])),
			note: "Is f(x) constant or balanced? Here the oracle is f(x) = x0 ⊕ x1 ⊕ x2 (three CNOTs into the helper qubit q3). One run is enough: all zeros = constant, anything else = balanced. Delete the three CNOTs (a constant oracle) and the answer becomes 000." },
		{ id: "bv", name: "Bernstein–Vazirani", n: 4, ops: [op("X", 3), op("H", 0), op("H", 1), op("H", 2), op("H", 3), op("X", 3, 0), op("X", 3, 2), op("H", 0), op("H", 1), op("H", 2)].concat(meas([0, 1, 2])),
			note: "The oracle hides a secret bit string s and computes s · x. A classical computer needs one question per bit; the quantum circuit reads all of s in one run. The CNOTs from q0 and q2 encode s = 101, and the shots read 101." },
		{ id: "grover2", name: "Grover search (2 qubits)", n: 2,
			ops: [op("H", 0), op("H", 1), op("Z", 1, 0), op("H", 0), op("H", 1), op("X", 0), op("X", 1), op("Z", 1, 0), op("X", 0), op("X", 1), op("H", 0), op("H", 1), op("M", 0), op("M", 1)],
			note: "Find the marked item among 4. The CZ oracle flips the sign of |11⟩, the diffuser (H, X, CZ, X, H) turns that sign into extra probability. With 4 items one round finds it with certainty: step through and watch the amplitude of |11⟩ grow." },
		{ id: "grover3", name: "Grover search (3 qubits)", n: 3,
			ops: (function () {
				var o = [op("H", 0), op("H", 1), op("H", 2)];
				for (var r = 0; r < 2; r++) {
					o.push(op("X", 1), op("Z", 2, [0, 1]), op("X", 1));
					o.push(op("H", 0), op("H", 1), op("H", 2), op("X", 0), op("X", 1), op("X", 2), op("Z", 2, [0, 1]), op("X", 0), op("X", 1), op("X", 2), op("H", 0), op("H", 1), op("H", 2));
				}
				return o.concat(meas([0, 1, 2]));
			})(),
			note: "Find |101⟩ among 8. The oracle (X on q1, a doubly controlled Z, X) flips the sign of 101 only; each diffuser pushes probability towards it. After the best number of rounds, about π/4 √8 ≈ 2, the answer comes up 94.5% of the time. A third round would overshoot." },
		{ id: "qft", name: "Quantum Fourier transform", n: 3, ops: [op("X", 0), op("X", 2)].concat(M.qftOps([0, 1, 2])),
			note: "The input |101⟩ = 5 goes through the QFT (H, controlled phase turns and a swap). Every amplitude ends up the same size, 1/√8, with a phase that turns by 5 × 45° from one basis state to the next: the colours of the bars go round the colour wheel." },
		{ id: "shor", name: "Shor: period of 7ˣ mod 15", n: 7,
			ops: [op("H", 0), op("H", 1), op("H", 2), op("X", 3),
				op("SWAP", [3, 4], 0), op("SWAP", [4, 5], 0), op("SWAP", [5, 6], 0), op("X", 3, 0), op("X", 4, 0), op("X", 5, 0), op("X", 6, 0),
				op("SWAP", [3, 5], 1), op("SWAP", [4, 6], 1)].concat(M.qftOps([0, 1, 2], true)).concat(meas([0, 1, 2])),
			note: "The heart of Shor's algorithm for N = 15, a = 7. q0–q2 count, q3–q6 hold 7ˣ mod 15 (starting at 1). Controlled swaps and NOTs multiply by 7 (controlled by q0) and by 7² = 4 mod 15 (q1); 7⁴ ≡ 1 needs no gates. The inverse QFT reads the period: only 0, 2, 4 and 6 come up, i.e. phases 0, 1/4, 1/2, 3/4, so the period is r = 4, and gcd(7² ± 1, 15) = 3 and 5." }
	];
	M.preset = function (id) { for (var i = 0; i < M.PRESETS.length; i++) if (M.PRESETS[i].id === id) { var p = M.PRESETS[i]; return M.layout(p.n, p.ops); } return null; };

	/* ---------------------------------------------------------------- share links */
	var CODE = { H: "H", X: "X", Y: "Y", Z: "Z", S: "S", SDG: "s", T: "T", TDG: "t", SX: "V", RX: "x", RY: "y", RZ: "z", P: "P", SWAP: "W", M: "M" }, DECODE = {};
	Object.keys(CODE).forEach(function (k) { DECODE[CODE[k]] = k; });
	function numStr(v) { return M.fmtAngle(v, true, 10).replace(/\*/g, "").replace(/\./g, "_"); }
	M.encode = function (circ) {
		return circ.n + "~" + circ.cols.map(function (col) {
			return col.map(function (op) {
				var s = CODE[op.g] + op.q.join("-");
				if (op.c && op.c.length) s += "c" + op.c.join("-");
				if (M.GATES[op.g].par) s += "p" + numStr(op.p);
				return s;
			}).join(",");
		}).join(".");
	};
	M.decode = function (str) {
		var m = /^(\d{1,2})~(.*)$/.exec(String(str || "").trim()); if (!m) throw new Error("Not a circuit link");
		var n = +m[1]; if (n < 1 || n > M.MAXQ) throw new Error("1 to " + M.MAXQ + " qubits");
		var cols = !m[2] ? [] : m[2].split(".").map(function (cs) {
			return !cs ? [] : cs.split(",").map(function (t) {
				var r = /^([A-Za-z])([\d-]+)(?:c([\d-]+))?(?:p(.+))?$/.exec(t); if (!r || !DECODE[r[1]]) throw new Error("Bad gate “" + t + "”");
				var o = { g: DECODE[r[1]], q: r[2].split("-").map(Number), c: r[3] ? r[3].split("-").map(Number) : [] };
				if (M.GATES[o.g].par) o.p = M.parseAngle((r[4] || "0").replace(/_/g, "."));
				if (!M.validOp(o, n)) throw new Error("Bad gate “" + t + "”");
				return o;
			});
		});
		cols.forEach(function (col) { for (var a = 0; a < col.length; a++) for (var b = a + 1; b < col.length; b++) if (M.overlaps(col[a], col[b])) throw new Error("Two gates overlap in one column"); });
		return { n: n, cols: cols };
	};

	/* ---------------------------------------------------------------- OpenQASM 2 */
	var CTRL1 = { X: "cx", Y: "cy", Z: "cz", H: "ch", RX: "crx", RY: "cry", RZ: "crz", P: "cu1", SWAP: "cswap" };
	var PHASE_OF = { S: PI / 2, SDG: -PI / 2, T: PI / 4, TDG: -PI / 4 };
	M.toQASM = function (circ) {
		var L = ["OPENQASM 2.0;", 'include "qelib1.inc";', "qreg q[" + circ.n + "];"], info = M.measureInfo(circ);
		if (info.qs.length) L.push("creg c[" + circ.n + "];");
		function Q(i) { return "q[" + i + "]"; }
		function ang(p) { return "(" + M.fmtAngle(p, true, 15) + ")"; }
		M.ops(circ).forEach(function (op) {
			var G = M.GATES[op.g], c = op.c || [];
			if (op.g === "M") { L.push("measure " + Q(op.q[0]) + " -> c[" + op.q[0] + "];"); return; }
			if (!c.length) { L.push(G.qasm + (G.par ? ang(op.p) : "") + " " + op.q.map(Q).join(",") + ";"); return; }
			if (c.length === 1) {
				if (CTRL1[op.g]) { L.push(CTRL1[op.g] + (G.par ? ang(op.p) : "") + " " + c.map(Q).concat(op.q.map(Q)).join(",") + ";"); return; }
				if (PHASE_OF[op.g] != null) { L.push("cu1" + ang(PHASE_OF[op.g]) + " " + Q(c[0]) + "," + Q(op.q[0]) + ";"); return; }
			}
			if (c.length === 2 && op.g === "X") { L.push("ccx " + Q(c[0]) + "," + Q(c[1]) + "," + Q(op.q[0]) + ";"); return; }
			if (c.length === 2 && op.g === "Z") { var t = Q(op.q[0]); L.push("h " + t + ";", "ccx " + Q(c[0]) + "," + Q(c[1]) + "," + t + ";", "h " + t + ";"); return; }
			L.push("// not in qelib1: " + G.name + " on " + op.q.map(Q).join(",") + " with controls " + c.map(Q).join(","));
		});
		return L.join("\n") + "\n";
	};
	var QIN = { h: ["H", 0, 0], x: ["X", 0, 0], y: ["Y", 0, 0], z: ["Z", 0, 0], s: ["S", 0, 0], sdg: ["SDG", 0, 0], t: ["T", 0, 0], tdg: ["TDG", 0, 0], sx: ["SX", 0, 0],
		rx: ["RX", 0, 1], ry: ["RY", 0, 1], rz: ["RZ", 0, 1], u1: ["P", 0, 1], p: ["P", 0, 1], cx: ["X", 1, 0], CX: ["X", 1, 0], cy: ["Y", 1, 0], cz: ["Z", 1, 0], ch: ["H", 1, 0],
		crx: ["RX", 1, 1], cry: ["RY", 1, 1], crz: ["RZ", 1, 1], cu1: ["P", 1, 1], cp: ["P", 1, 1], ccx: ["X", 2, 0], ccz: ["Z", 2, 0], swap: ["SWAP", 0, 0], cswap: ["SWAP", 1, 0], id: null, barrier: null, reset: null };
	M.fromQASM = function (text) {
		var src = String(text || "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""), stm = src.split(";"), regs = {}, n = 0, ops = [], ln = 0;
		function err(msg, s) { throw new Error(msg + (s ? ": “" + s.trim().slice(0, 60) + "”" : "")); }
		function args(list) { // "q[0], q" -> array of arrays of qubit indices (whole registers broadcast)
			return list.split(",").map(function (a) {
				a = a.trim(); var m = /^([A-Za-z_]\w*)(?:\[(\d+)\])?$/.exec(a); if (!m || !regs[m[1]]) err("Unknown qubit", a);
				var R = regs[m[1]]; if (m[2] != null) { if (+m[2] >= R.size) err("Qubit out of range", a); return [R.off + +m[2]]; }
				var out = []; for (var i = 0; i < R.size; i++) out.push(R.off + i); return out;
			});
		}
		stm.forEach(function (s0) {
			var s = s0.trim(); ln++; if (!s) return;
			if (/^OPENQASM\b/i.test(s) || /^include\b/.test(s) || /^creg\b/.test(s)) return;
			var m;
			if ((m = /^qreg\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]$/.exec(s))) { regs[m[1]] = { off: n, size: +m[2] }; n += +m[2]; if (n > M.MAXQ) err("This simulator handles up to " + M.MAXQ + " qubits"); return; }
			if ((m = /^measure\s+(.+?)\s*->\s*(.+)$/.exec(s))) { args(m[1])[0].forEach(function (q) { ops.push(op("M", q)); }); return; }
			if ((m = /^gate\b/.exec(s))) err("Custom gate definitions are not supported", s);
			m = /^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s+(.+)$/.exec(s); if (!m) err("Can't read", s);
			var name = m[1], par = m[2] != null ? m[2].split(",").map(function (x) { return M.parseAngle(x.replace(/\bpi\b/g, "pi")); }) : [], A = args(m[3]);
			if (name === "barrier" || name === "id" || name === "reset") return;
			if (name === "u3" || name === "u" || name === "U" || name === "u2") {
				var th = name === "u2" ? PI / 2 : par[0], ph = name === "u2" ? par[0] : par[1], la = name === "u2" ? par[1] : par[2];
				A[0].forEach(function (q) { ops.push(op("RZ", q, null, la), op("RY", q, null, th), op("RZ", q, null, ph)); });
				return;
			}
			var T = QIN[name]; if (!T) err("Gate “" + name + "” is not supported", s);
			var g = T[0], nc = T[1], np = T[2], nt = g === "SWAP" ? 2 : 1;
			if (A.length !== nc + nt) err("Wrong number of qubits", s);
			if (np && par.length !== 1) err("Missing angle", s);
			var len = Math.max.apply(null, A.map(function (a) { return a.length; }));
			for (var i = 0; i < len; i++) {
				var w = A.map(function (a) { return a.length === 1 ? a[0] : a[i]; });
				var o = op(g, w.slice(nc), w.slice(0, nc), np ? par[0] : null);
				if (!M.validOp(o, n)) err("Bad qubits", s);
				ops.push(o);
			}
		});
		if (!n) throw new Error("No qreg found");
		return M.layout(n, ops);
	};

	/* ---------------------------------------------------------------- display helpers */
	// amplitude as "a + bi"
	M.fmtC = function (re, im, d) {
		d = d == null ? 3 : d; var r = +re.toFixed(d), i = +im.toFixed(d); if (r === 0) r = 0; if (i === 0) i = 0;
		if (!i) return String(r); if (!r) return (i === 1 ? "" : i === -1 ? "−" : String(i).replace("-", "−")) + "i";
		return r + (i < 0 ? " − " : " + ") + (Math.abs(i) === 1 ? "" : Math.abs(i)) + "i";
	};
	// colour of a phase (radians): hue wheel, 0 = red, 90° = yellow-green, 180° = cyan, 270° = purple
	M.phaseHue = function (ph) { var h = ph * 180 / PI; return ((h % 360) + 360) % 360; };

	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESQComp = M;
})(typeof window !== "undefined" ? window : this);
