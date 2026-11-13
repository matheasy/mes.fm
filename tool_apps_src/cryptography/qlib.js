/* MES Quantum Cryptography -- pure maths (global MESQC; node: require). Used by quantum.js on mes.fm/quantum-cryptography.
 * BB84 key distribution with an intercept-resend eavesdropper and channel noise; Shor's algorithm (exact simulation of the
 * measurement after the quantum Fourier transform, continued fractions, factors); Grover's search (exact amplitudes);
 * the quantum-safe table and Mosca's inequality. */
(function (root) {
	"use strict";
	var Q = {};
	Q.rng = function (seed) { var a = seed >>> 0 || 1; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
	Q.h2 = function (p) { return p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p); };
	function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
	function modpow(a, e, m) { var r = 1, b = a % m; while (e > 0) { if (e & 1) r = r * b % m; b = b * b % m; e = Math.floor(e / 2); } return r; }   // m < 2^26 so products stay exact
	Q.gcd = gcd; Q.modpow = modpow;

	/* ---------- BB84 ---------- */
	// basis 0 = "+" (0 deg / 90 deg), 1 = "x" (45 deg / 135 deg); polarisation angle = 90*bit + 45*basis
	Q.angle = function (bit, basis) { return 90 * bit + 45 * basis; };
	Q.QBER_LIMIT = 0.11;   // above about 11% no secret key can be distilled (Shor-Preskill)
	Q.bb84 = function (n, o) {
		o = o || {}; var r = Q.rng(o.seed || 1), eve = o.eve || 0, noise = o.noise || 0, sampleFrac = o.sample === undefined ? 0.5 : o.sample, ph = [];
		for (var i = 0; i < n; i++) {
			var a = r() < 0.5 ? 1 : 0, ab = r() < 0.5 ? 1 : 0, p = { i: i, a: a, ab: ab, eb: -1, ebit: -1 }, sendBit = a, sendBasis = ab;
			if (r() < eve) { p.eb = r() < 0.5 ? 1 : 0; p.ebit = p.eb === ab ? a : (r() < 0.5 ? 1 : 0); sendBit = p.ebit; sendBasis = p.eb; }   // Eve measures, then resends what she saw
			p.bb = r() < 0.5 ? 1 : 0;
			p.b = p.bb === sendBasis ? sendBit : (r() < 0.5 ? 1 : 0);
			if (r() < noise) { p.b ^= 1; p.flip = true; }
			p.keep = p.ab === p.bb; p.err = p.keep && p.a !== p.b; ph.push(p);
		}
		var kept = ph.filter(function (x) { return x.keep; }), sample = [], rest = [];
		kept.forEach(function (x) { (r() < sampleFrac ? sample : rest).push(x); x.sample = sample[sample.length - 1] === x; });
		var errAll = kept.filter(function (x) { return x.err; }).length, errS = sample.filter(function (x) { return x.err; }).length;
		var qest = sample.length ? errS / sample.length : 0, abort = qest > Q.QBER_LIMIT, keyRate = Math.max(0, 1 - 2 * Q.h2(qest));
		return { photons: ph, sifted: kept.length, errors: errAll, qber: kept.length ? errAll / kept.length : 0, sample: sample.length, sampleErrors: errS, qest: qest, abort: abort, rest: rest.length,
			final: abort ? 0 : Math.floor(rest.length * keyRate), keyRate: keyRate, aliceKey: rest.map(function (x) { return x.a; }).join(""), bobKey: rest.map(function (x) { return x.b; }).join(""),
			eveKnows: rest.filter(function (x) { return x.eb >= 0 && x.ebit === x.a; }).length };
	};
	// Expected error rate on the sifted key: Eve intercepting a fraction f gives f/4, plus noise.
	Q.expectedQber = function (eve, noise) { var e = eve / 4; return e + noise - 2 * e * noise; };

	/* ---------- Shor ---------- */
	Q.order = function (a, N) { if (gcd(a, N) !== 1) return null; var x = a % N, r = 1; while (x !== 1 && r <= N) { x = x * a % N; r++; } return x === 1 ? r : null; };
	Q.qubitsFor = function (N) { return Math.ceil(Math.log2(N * N)); };   // register size Q = 2^q with N^2 <= Q
	Q.SHOR_MAX = 255;   // exact distribution for N <= 255 (Q <= 2^16)
	// Probability of each measured value y after the QFT, for f(x) = a^x mod N on x = 0..Q-1.
	Q.shorDist = function (a, N) {
		var r = Q.order(a, N); if (!r) return null; var q = Q.qubitsFor(N), Qn = Math.pow(2, q), P = new Float64Array(Qn);
		for (var y = 0; y < Qn; y++) {
			var ang = 2 * Math.PI * r * y / Qn, s = 0;
			for (var x0 = 0; x0 < r; x0++) {
				var m = Math.ceil((Qn - x0) / r), mag2;   // number of x with x = x0 (mod r)
				var sh = Math.sin(ang / 2); if (Math.abs(sh) < 1e-12) mag2 = m * m; else { var sm = Math.sin(m * ang / 2); mag2 = sm * sm / (sh * sh); }
				s += mag2;
			}
			P[y] = s / (Qn * Qn);
		}
		return { r: r, q: q, Q: Qn, P: P };
	};
	// Continued-fraction convergents of y/Q; the first denominator d <= N with a^d = 1 (mod N) is the period (or a factor of it).
	Q.convergents = function (y, Qn) { var out = [], h0 = 0, h1 = 1, k0 = 1, k1 = 0, a = y, b = Qn; while (b) { var t = Math.floor(a / b), h = t * h1 + h0, k = t * k1 + k0; out.push([h, k]); h0 = h1; h1 = h; k0 = k1; k1 = k; var rr = a - t * b; a = b; b = rr; } return out; };
	Q.periodFrom = function (y, Qn, a, N) { var c = Q.convergents(y, Qn); for (var i = 0; i < c.length; i++) { var d = c[i][1]; if (d > 0 && d <= N && modpow(a, d, N) === 1) return { r: d, conv: c.slice(0, i + 1) }; } return { r: null, conv: c }; };
	Q.sample = function (P, rnd) { var u = rnd(), c = 0; for (var i = 0; i < P.length; i++) { c += P[i]; if (u < c) return i; } return P.length - 1; };
	Q.shorFactor = function (N, a) {
		var steps = [];
		if (N % 2 === 0) return { ok: true, p: 2, q: N / 2, steps: ["N is even, so 2 is a factor."], trivial: true };
		var g = gcd(a, N); if (g !== 1) return { ok: true, p: g, q: N / g, steps: ["Lucky guess: gcd(" + a + ", " + N + ") = " + g + " is already a factor."], trivial: true };
		var r = Q.order(a, N); steps.push("The period of " + a + "^x mod " + N + " is r = " + r + ".");
		if (r % 2) return { ok: false, r: r, steps: steps.concat(["r is odd, so this a doesn't work. Try another a."]) };
		var h = modpow(a, r / 2, N); if (h === N - 1) return { ok: false, r: r, steps: steps.concat([a + "^(r/2) = " + h + " ≡ −1 (mod " + N + "), so this a doesn't work. Try another a."]) };
		var p = gcd(h - 1, N), qq = gcd(h + 1, N);
		steps.push(a + "^(r/2) mod " + N + " = " + h + "; gcd(" + (h - 1) + ", " + N + ") = " + p + " and gcd(" + (h + 1) + ", " + N + ") = " + qq + ".");
		return { ok: p > 1 && p < N, p: p, q: N / p, r: r, h: h, steps: steps };
	};
	Q.isPrimeSmall = function (n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
	Q.isPrimePower = function (n) { for (var b = 2; b * b <= n; b++) { var x = b; while (x < n) x *= b; if (x === n) return true; } return false; };

	/* ---------- Grover ---------- */
	Q.groverIters = function (Nn, M) { return Math.max(0, Math.floor(Math.PI / 4 * Math.sqrt(Nn / Math.max(1, M)))); };
	Q.groverSuccess = function (Nn, M, k) { var th = Math.asin(Math.sqrt(M / Nn)); var s = Math.sin((2 * k + 1) * th); return s * s; };
	Q.groverState = function (nq, marked, k) {
		var Nn = 1 << nq, amp = new Float64Array(Nn).fill(1 / Math.sqrt(Nn)), mk = {}; marked.forEach(function (m) { mk[m] = 1; });
		for (var it = 0; it < k; it++) {
			for (var i = 0; i < Nn; i++) if (mk[i]) amp[i] = -amp[i];               // oracle: flip the sign of the answer
			var mean = 0; for (i = 0; i < Nn; i++) mean += amp[i]; mean /= Nn;
			for (i = 0; i < Nn; i++) amp[i] = 2 * mean - amp[i];                   // diffusion: reflect about the average
		}
		return amp;
	};

	/* ---------- quantum-safe table ---------- */
	// classical / quantum security in bits; pk / out = public key and ciphertext-or-signature bytes. Standards: FIPS 203/204/205 (Aug 2024).
	Q.ALGOS = [
		{ id: "rsa2048", name: "RSA-2048", use: "Key exchange and signatures", cls: 112, qs: 0, st: "broken", why: "Shor's algorithm factors n", pk: 256, out: 256, where: "Most HTTPS certificates, PGP, SSH keys" },
		{ id: "rsa4096", name: "RSA-4096", use: "Key exchange and signatures", cls: 140, qs: 0, st: "broken", why: "Shor's algorithm (only needs a bigger machine)", pk: 512, out: 512, where: "Long-term PGP keys" },
		{ id: "p256", name: "ECDSA / ECDH P-256", use: "Key exchange and signatures", cls: 128, qs: 0, st: "broken", why: "Shor's algorithm solves the elliptic-curve discrete log", pk: 64, out: 64, where: "HTTPS, Apple / Google passkeys, bank cards" },
		{ id: "x25519", name: "X25519 / Ed25519", use: "Key exchange and signatures", cls: 128, qs: 0, st: "broken", why: "Shor's algorithm", pk: 32, out: 64, where: "Signal, WhatsApp, SSH, TLS 1.3" },
		{ id: "secp256k1", name: "secp256k1 (Bitcoin, Hive)", use: "Signatures", cls: 128, qs: 0, st: "broken", why: "Shor's algorithm finds the private key from a public key", pk: 33, out: 64, where: "Bitcoin, Ethereum, Hive wallets" },
		{ id: "dh2048", name: "Diffie–Hellman 2048", use: "Key exchange", cls: 112, qs: 0, st: "broken", why: "Shor's algorithm solves the discrete log", pk: 256, out: 256, where: "Older VPNs and TLS" },
		{ id: "aes128", name: "AES-128", use: "Encryption", cls: 128, qs: 64, st: "weakened", why: "Grover's search halves the key length", pk: 16, out: 16, where: "TLS, disk encryption" },
		{ id: "aes256", name: "AES-256", use: "Encryption", cls: 256, qs: 128, st: "safe", why: "Grover leaves 128 bits: still out of reach", pk: 32, out: 16, where: "TLS, VPNs, this site's password tab" },
		{ id: "sha256", name: "SHA-256", use: "Hashing", cls: 128, qs: 128, st: "safe", why: "Grover / collision attacks give little speed-up in practice", pk: 0, out: 32, where: "Bitcoin mining, file checks, signatures" },
		{ id: "mlkem768", name: "ML-KEM-768 (Kyber)", use: "Key exchange", cls: 192, qs: 192, st: "pq", why: "Lattice problem (Module-LWE); FIPS 203", pk: 1184, out: 1088, where: "Chrome, Firefox, Cloudflare, Signal (hybrid with X25519)" },
		{ id: "mldsa65", name: "ML-DSA-65 (Dilithium)", use: "Signatures", cls: 192, qs: 192, st: "pq", why: "Lattice problem (Module-LWE / SIS); FIPS 204", pk: 1952, out: 3309, where: "New certificates and code signing" },
		{ id: "slhdsa", name: "SLH-DSA-128s (SPHINCS+)", use: "Signatures", cls: 128, qs: 128, st: "pq", why: "Only needs a hash function to be secure; FIPS 205", pk: 32, out: 7856, where: "Firmware and long-term signatures" },
		{ id: "falcon", name: "FN-DSA-512 (Falcon)", use: "Signatures", cls: 128, qs: 128, st: "pq", why: "Lattice problem (NTRU); FIPS 206 in progress", pk: 897, out: 666, where: "Where small signatures matter" },
		{ id: "hqc", name: "HQC", use: "Key exchange", cls: 128, qs: 128, st: "pq", why: "Error-correcting codes; picked by NIST in March 2025 as a backup to ML-KEM", pk: 2249, out: 4433, where: "Backup standard (draft)" }
	];
	// Published estimates of what Shor's algorithm needs (cited on the page).
	Q.SHOR_COST = [
		{ what: "RSA-2048, ideal error-free qubits", qubits: "about 4,100 logical qubits", time: "", src: "Beauregard 2003 (2n + 3 qubits)" },
		{ what: "RSA-2048, real noisy qubits (2019)", qubits: "about 20 million physical qubits", time: "about 8 hours", src: "Gidney & Ekerå 2019" },
		{ what: "RSA-2048, real noisy qubits (2025)", qubits: "under 1 million physical qubits", time: "under a week", src: "Gidney 2025" },
		{ what: "Elliptic curve P-256", qubits: "about 2,330 logical qubits", time: "", src: "Roetteler, Naehrig, Svore & Lauter 2017" }
	];
	// Mosca's inequality: data that must stay secret x years, migration takes y years, a big quantum computer arrives in z years.
	Q.mosca = function (x, y, z) { return { risk: x + y > z, margin: z - (x + y) }; };
	Q.bytesLabel = function (n) { return n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + " KB" : n + " bytes"; };

	if (typeof module === "object" && module.exports) module.exports = Q; else root.MESQC = Q;
})(typeof window !== "undefined" ? window : this);
