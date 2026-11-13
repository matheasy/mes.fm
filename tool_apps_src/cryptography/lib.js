/* MES Cryptography Lab -- pure maths (global MESCrypto; node: require). Needs MESPrime (tool_apps_src/primes/lib.js) for RSA / Diffie-Hellman.
 * Classical ciphers + cracking (Caesar, Atbash, affine, Vigenere, Beaufort, keyword substitution, rail fence), letter statistics,
 * encoders (Base64, hex, binary, Morse, URL, XOR, ROT47), pure SHA-256 and MD5 (for the avalanche picture and node tests),
 * textbook RSA step by step, Diffie-Hellman, square-and-multiply, baby-step giant-step, and the MES1 AES-GCM text format. */
(function (root) {
	"use strict";
	var P = root.MESPrime || (typeof require === "function" ? require("../primes/lib.js") : null);
	var C = {};
	var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	function mod(a, m) { return ((a % m) + m) % m; }
	C.mod = mod;

	/* ---------- English letter statistics ---------- */
	// Letter frequencies in English text, per cent (classic Lewand table).
	C.EN = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074];
	C.letters = function (t) { return String(t).toUpperCase().replace(/[^A-Z]/g, ""); };
	C.counts = function (t) { var c = new Array(26).fill(0), s = C.letters(t); for (var i = 0; i < s.length; i++) c[s.charCodeAt(i) - 65]++; return c; };
	C.chi2 = function (c) { var n = c.reduce(function (a, b) { return a + b; }, 0); if (!n) return Infinity; var x = 0; for (var i = 0; i < 26; i++) { var e = n * C.EN[i] / 100; x += (c[i] - e) * (c[i] - e) / e; } return x; };
	C.ioc = function (c) { var n = c.reduce(function (a, b) { return a + b; }, 0); if (n < 2) return 0; var s = 0; for (var i = 0; i < 26; i++) s += c[i] * (c[i] - 1); return s / (n * (n - 1)); };
	C.IOC_EN = 0.0667; C.IOC_RANDOM = 1 / 26;
	var COMMON = ["THE", "AND", "THAT", "HAVE", "FOR", "NOT", "WITH", "YOU", "THIS", "BUT", "HIS", "FROM", "THEY", "SAY", "HER", "SHE", "WILL", "ONE", "ALL", "WOULD", "THERE", "THEIR", "WHAT", "ABOUT", "WHICH", "WHEN", "MAKE", "CAN", "LIKE", "TIME", "JUST", "KNOW", "PEOPLE", "INTO", "YEAR", "YOUR", "GOOD", "SOME", "COULD", "THEM", "SEE", "OTHER", "THAN", "THEN", "NOW", "LOOK", "ONLY", "COME", "ITS", "OVER", "THINK", "ALSO", "BACK", "AFTER", "USE", "TWO", "HOW", "OUR", "WORK", "FIRST", "WELL", "WAY", "EVEN", "NEW", "WANT", "BECAUSE", "ANY", "THESE", "GIVE", "DAY", "MOST", "ARE", "WAS", "IS", "IT", "OF", "TO", "IN", "BE", "ON", "AT", "BY", "WE", "HE", "OR", "AN", "AS", "DO", "IF", "MY", "SO", "UP", "NO", "ME", "GO", "SECRET", "MESSAGE", "ATTACK", "DAWN", "MEET", "HELLO", "WORLD"];
	var WSET = {}; COMMON.forEach(function (w) { WSET[w] = 1; });
	// Higher = more English-like: -chi2 per letter, plus a bonus for whole common words (works when spaces are kept).
	C.score = function (t) {
		var c = C.counts(t), n = c.reduce(function (a, b) { return a + b; }, 0); if (!n) return -Infinity;
		var s = -C.chi2(c) / n, words = String(t).toUpperCase().split(/[^A-Z]+/).filter(Boolean), hit = 0;
		words.forEach(function (w) { if (WSET[w]) hit += w.length; });
		return s + (words.length > 1 ? 3 * hit / n : 0);
	};

	/* ---------- letter-by-letter helper (keeps case, spacing and punctuation) ---------- */
	function mapLetters(t, f) {
		var out = "", i = 0; t = String(t);
		for (var j = 0; j < t.length; j++) {
			var ch = t[j], cc = ch.charCodeAt(0), up = cc >= 65 && cc <= 90, lo = cc >= 97 && cc <= 122;
			if (!up && !lo) { out += ch; continue; }
			var v = mod(f(cc - (up ? 65 : 97), i++), 26); out += String.fromCharCode(v + (up ? 65 : 97));
		}
		return out;
	}
	C.mapLetters = mapLetters;
	C.caesar = function (t, k, dec) { k = Math.round(+k || 0); return mapLetters(t, function (x) { return x + (dec ? -k : k); }); };
	C.rot13 = function (t) { return C.caesar(t, 13); };
	C.atbash = function (t) { return mapLetters(t, function (x) { return 25 - x; }); };
	C.AFFINE_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
	C.inv26 = function (a) { a = mod(a, 26); for (var x = 1; x < 26; x++) if (a * x % 26 === 1) return x; return null; };
	C.affine = function (t, a, b, dec) {
		a = Math.round(+a); b = Math.round(+b || 0); var ia = C.inv26(a); if (ia === null) return null;
		return mapLetters(t, function (x) { return dec ? ia * (x - b) : a * x + b; });
	};
	C.keyShifts = function (key) { return C.letters(key).split("").map(function (c) { return c.charCodeAt(0) - 65; }); };
	C.vigenere = function (t, key, dec) {
		var k = C.keyShifts(key); if (!k.length) return null;
		return mapLetters(t, function (x, i) { return x + (dec ? -k[i % k.length] : k[i % k.length]); });
	};
	C.beaufort = function (t, key) {   // c = k - p (its own inverse)
		var k = C.keyShifts(key); if (!k.length) return null;
		return mapLetters(t, function (x, i) { return k[i % k.length] - x; });
	};
	C.keywordAlphabet = function (kw) {
		var seen = {}, out = ""; (C.letters(kw) + A).split("").forEach(function (c) { if (!seen[c]) { seen[c] = 1; out += c; } }); return out;
	};
	C.substitute = function (t, alpha, dec) {   // alpha = 26-letter cipher alphabet for A..Z
		alpha = C.letters(alpha); if (alpha.length !== 26 || new Set(alpha).size !== 26) return null;
		var inv = new Array(26); for (var i = 0; i < 26; i++) inv[alpha.charCodeAt(i) - 65] = i;
		return mapLetters(t, function (x) { return dec ? inv[x] : alpha.charCodeAt(x) - 65; });
	};
	C.railPattern = function (len, rails) {   // rail index of every position (zig-zag)
		var r = [], row = 0, d = 1; if (rails < 2) { for (var i = 0; i < len; i++) r.push(0); return r; }
		for (var j = 0; j < len; j++) { r.push(row); if (row === 0) d = 1; else if (row === rails - 1) d = -1; row += d; }
		return r;
	};
	C.railFence = function (t, rails, dec) {
		t = String(t); rails = Math.max(2, Math.min(20, Math.round(+rails || 2))); var chars = Array.from(t), pat = C.railPattern(chars.length, rails);
		var order = []; for (var r = 0; r < rails; r++) for (var i = 0; i < chars.length; i++) if (pat[i] === r) order.push(i);
		if (!dec) return order.map(function (i) { return chars[i]; }).join("");
		var out = new Array(chars.length); order.forEach(function (pos, k) { out[pos] = chars[k]; }); return out.join("");
	};

	/* ---------- cracking ---------- */
	C.crackCaesar = function (t) {
		var r = []; for (var k = 0; k < 26; k++) { var p = C.caesar(t, k, true); r.push({ k: k, text: p, score: C.score(p) }); }
		return r.sort(function (a, b) { return b.score - a.score; });
	};
	C.crackAffine = function (t) {
		var r = []; C.AFFINE_A.forEach(function (a) { for (var b = 0; b < 26; b++) { var p = C.affine(t, a, b, true); r.push({ a: a, b: b, text: p, score: C.score(p) }); } });
		return r.sort(function (x, y) { return y.score - x.score; });
	};
	C.columns = function (s, len) { var cols = []; for (var i = 0; i < len; i++) cols.push(""); for (var j = 0; j < s.length; j++) cols[j % len] += s[j]; return cols; };
	// Friedman: average index of coincidence of the columns for each key length.
	C.keyLengths = function (t, max) {
		var s = C.letters(t), out = []; max = Math.min(max || 20, Math.floor(s.length / 2));
		for (var L = 1; L <= max; L++) { var cols = C.columns(s, L), v = 0; cols.forEach(function (c) { v += C.ioc(C.counts(c)); }); out.push({ len: L, ioc: v / L }); }
		return out;
	};
	// Kasiski: distances between repeated 3-letter groups.
	C.kasiski = function (t) {
		var s = C.letters(t), seen = {}, reps = [];
		for (var i = 0; i + 3 <= s.length; i++) { var g = s.substr(i, 3); if (seen[g] !== undefined) reps.push({ g: g, at: seen[g], to: i, d: i - seen[g] }); else seen[g] = i; }
		var fac = {}; reps.forEach(function (r) { for (var f = 2; f <= 20; f++) if (r.d % f === 0) fac[f] = (fac[f] || 0) + 1; });
		return { reps: reps, factors: fac };
	};
	C.bestShift = function (col) { var best = 0, bx = Infinity; for (var k = 0; k < 26; k++) { var x = C.chi2(C.counts(C.caesar(col, k, true))); if (x < bx) { bx = x; best = k; } } return best; };
	C.crackVigenereLen = function (t, len) {
		var s = C.letters(t), key = C.columns(s, len).map(function (c) { return A[C.bestShift(c)]; }).join(""), p = C.vigenere(t, key, true);
		return { key: key, text: p, score: C.score(p) };
	};
	C.crackVigenere = function (t, max) {
		var kl = C.keyLengths(t, max || 16); if (!kl.length) return null;
		var best = kl.reduce(function (a, b) { return b.ioc > a.ioc ? b : a; });
		// the shortest length that is nearly as good as the best (multiples of the true length score as well)
		var pick = kl.filter(function (x) { return x.ioc >= Math.max(0.055, best.ioc * 0.9); })[0] || best;
		var r = C.crackVigenereLen(t, pick.len); r.len = pick.len; r.lengths = kl; return r;
	};
	// Pick the cipher a text was most likely made with (for the "Crack it" button).
	C.autoCrack = function (t) {
		var s = C.letters(t); if (s.length < 8) return { err: "Paste at least a sentence of letters to crack." };
		var cz = C.crackCaesar(t)[0], af = C.crackAffine(t)[0], vg = s.length >= 40 ? C.crackVigenere(t, 16) : null, at = C.atbash(t);
		var cands = [{ type: "caesar", label: "Caesar shift " + cz.k, text: cz.text, score: cz.score, k: cz.k },
			{ type: "atbash", label: "Atbash", text: at, score: C.score(at) },
			{ type: "affine", label: "Affine a = " + af.a + ", b = " + af.b, text: af.text, score: af.score - 0.02, a: af.a, b: af.b }];
		if (vg && vg.len > 1) cands.push({ type: "vigenere", label: "Vigenère, key " + vg.key, text: vg.text, score: vg.score - 0.01 * vg.len, key: vg.key });
		cands.sort(function (a, b) { return b.score - a.score; });
		return { best: cands[0], all: cands, ioc: C.ioc(C.counts(t)), plain: C.score(t) };
	};

	/* ---------- bytes / encoders ---------- */
	C.utf8 = function (s) { if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s); return Uint8Array.from(Buffer.from(String(s), "utf8")); };
	C.fromUtf8 = function (b) { if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: true }).decode(b); return Buffer.from(b).toString("utf8"); };
	C.hex = function (b) { var s = ""; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; };
	C.fromHex = function (h) { h = String(h).replace(/[\s:,]|0x/gi, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) return null; var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; };
	var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	C.b64 = function (b, url) {
		var s = "", i; for (i = 0; i + 2 < b.length; i += 3) { var n = b[i] << 16 | b[i + 1] << 8 | b[i + 2]; s += B64[n >> 18] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]; }
		var r = b.length - i; if (r === 1) { var m = b[i] << 16; s += B64[m >> 18] + B64[m >> 12 & 63] + "=="; } else if (r === 2) { var o = b[i] << 16 | b[i + 1] << 8; s += B64[o >> 18] + B64[o >> 12 & 63] + B64[o >> 6 & 63] + "="; }
		return url ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : s;
	};
	C.fromB64 = function (s) {
		s = String(s).replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""); if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) return null;
		var out = [], buf = 0, bits = 0; for (var i = 0; i < s.length; i++) { buf = buf << 6 | B64.indexOf(s[i]); bits += 6; if (bits >= 8) { bits -= 8; out.push(buf >> bits & 255); } }
		return Uint8Array.from(out);
	};
	C.binary = function (b) { return Array.from(b, function (x) { return ("0000000" + x.toString(2)).slice(-8); }).join(" "); };
	C.fromBinary = function (s) { s = String(s).replace(/[^01]/g, ""); if (!s.length || s.length % 8) return null; var b = new Uint8Array(s.length / 8); for (var i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 8, 8), 2); return b; };
	C.MORSE = { A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
		"0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
		".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.", "$": "...-..-", "@": ".--.-." };
	var UNMORSE = {}; Object.keys(C.MORSE).forEach(function (k) { UNMORSE[C.MORSE[k]] = k; });
	C.morse = function (t) { return String(t).toUpperCase().trim().split(/\s+/).map(function (w) { return Array.from(w).map(function (c) { return C.MORSE[c] || ""; }).filter(Boolean).join(" "); }).filter(Boolean).join(" / "); };
	C.fromMorse = function (m) { return String(m).replace(/[•·]/g, ".").replace(/[–—_]/g, "-").trim().split(/\s*[\/|]\s*|\s{3,}/).map(function (w) { return w.split(/\s+/).map(function (c) { return UNMORSE[c] || (c ? "?" : ""); }).join(""); }).join(" "); };
	C.rot47 = function (t) { return Array.from(String(t), function (c) { var x = c.charCodeAt(0); return x >= 33 && x <= 126 ? String.fromCharCode(33 + (x + 14) % 94) : c; }).join(""); };
	C.xor = function (b, k) { var o = new Uint8Array(b.length); if (!k.length) return o; for (var i = 0; i < b.length; i++) o[i] = b[i] ^ k[i % k.length]; return o; };

	/* ---------- SHA-256 and MD5 (pure, byte arrays in, hex out) ---------- */
	var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
	function pad(b, little) {
		var n = b.length, total = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(total); m.set(b); m[n] = 0x80;
		var bits = n * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
		for (var i = 0; i < 4; i++) { if (little) { m[total - 8 + i] = lo >>> (8 * i) & 255; m[total - 4 + i] = hi >>> (8 * i) & 255; } else { m[total - 1 - i] = lo >>> (8 * i) & 255; m[total - 5 - i] = hi >>> (8 * i) & 255; } }
		return m;
	}
	C.sha256 = function (b) {
		if (typeof b === "string") b = C.utf8(b); var m = pad(b), H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
		function r(x, n) { return x >>> n | x << (32 - n); }
		for (var o = 0; o < m.length; o += 64) {
			for (var t = 0; t < 16; t++) W[t] = m[o + 4 * t] << 24 | m[o + 4 * t + 1] << 16 | m[o + 4 * t + 2] << 8 | m[o + 4 * t + 3];
			for (t = 16; t < 64; t++) { var s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ W[t - 15] >>> 3, s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ W[t - 2] >>> 10; W[t] = W[t - 16] + s0 + W[t - 7] + s1 | 0; }
			var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
			for (t = 0; t < 64; t++) {
				var t1 = h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + (e & f ^ ~e & g) + K256[t] + W[t] | 0, t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + (a & bb ^ a & c ^ bb & c) | 0;
				h = g; g = f; f = e; e = d + t1 | 0; d = c; c = bb; bb = a; a = t1 + t2 | 0;
			}
			H[0] = H[0] + a | 0; H[1] = H[1] + bb | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0; H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
		}
		return H.map(function (x) { return ("0000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
	};
	var MS = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
	var MK = []; for (var mi = 0; mi < 64; mi++) MK.push(Math.floor(Math.abs(Math.sin(mi + 1)) * 4294967296) | 0);
	C.md5 = function (b) {
		if (typeof b === "string") b = C.utf8(b); var m = pad(b, true), h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, M = new Array(16);
		for (var o = 0; o < m.length; o += 64) {
			for (var t = 0; t < 16; t++) M[t] = m[o + 4 * t] | m[o + 4 * t + 1] << 8 | m[o + 4 * t + 2] << 16 | m[o + 4 * t + 3] << 24;
			var a = h0, bb = h1, c = h2, d = h3;
			for (var i = 0; i < 64; i++) {
				var f, g;
				if (i < 16) { f = bb & c | ~bb & d; g = i; } else if (i < 32) { f = d & bb | ~d & c; g = (5 * i + 1) % 16; } else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (bb | ~d); g = 7 * i % 16; }
				var tmp = d; d = c; c = bb; var x = a + f + MK[i] + M[g] | 0; bb = bb + (x << MS[i] | x >>> (32 - MS[i])) | 0; a = tmp;
			}
			h0 = h0 + a | 0; h1 = h1 + bb | 0; h2 = h2 + c | 0; h3 = h3 + d | 0;
		}
		return [h0, h1, h2, h3].map(function (x) { var s = ""; for (var i = 0; i < 4; i++) { var y = x >>> (8 * i) & 255; s += (y < 16 ? "0" : "") + y.toString(16); } return s; }).join("");
	};
	C.bitsOf = function (hex) { var s = ""; for (var i = 0; i < hex.length; i++) s += ("000" + parseInt(hex[i], 16).toString(2)).slice(-4); return s; };
	C.bitDiff = function (h1, h2) { var a = C.bitsOf(h1), b = C.bitsOf(h2), n = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
	C.CRC_T = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; t.push(c >>> 0); } return t; })();
	C.crc32 = function (b) { if (typeof b === "string") b = C.utf8(b); var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = C.CRC_T[(c ^ b[i]) & 255] ^ c >>> 8; return ("0000000" + ((c ^ 0xffffffff) >>> 0).toString(16)).slice(-8); };

	/* ---------- number theory for RSA / DH ---------- */
	C.big = function (s) { s = String(s).replace(/[\s,_]/g, ""); if (!/^-?\d+$/.test(s) || s.length > 1300) return null; return BigInt(s); };
	C.bitLen = function (n) { return n <= 0n ? 0 : n.toString(2).length; };
	C.modpowSteps = function (a, e, m) {   // square-and-multiply, one row per bit of e (from the left)
		a = mod(BigInt(a), BigInt(m)); e = BigInt(e); m = BigInt(m); var bits = e.toString(2), r = 1n, rows = [];
		for (var i = 0; i < bits.length; i++) { var sq = r * r % m, mul = bits[i] === "1" ? sq * a % m : sq; rows.push({ bit: bits[i], sq: sq, r: mul }); r = mul; }
		return { result: m === 1n ? 0n : r, rows: rows, bits: bits };
	};
	C.egcdSteps = function (a, b) {   // extended Euclid table: rows {q, r, s, t} with s*a + t*b = r
		a = BigInt(a); b = BigInt(b); var rows = [{ q: null, r: a, s: 1n, t: 0n }, { q: null, r: b, s: 0n, t: 1n }];
		while (rows[rows.length - 1].r !== 0n && rows.length < 400) { var x = rows[rows.length - 2], y = rows[rows.length - 1], q = x.r / y.r; rows.push({ q: q, r: x.r - q * y.r, s: x.s - q * y.s, t: x.t - q * y.t }); }
		return rows;
	};
	// Random BigInt in [lo, hi) from a byte source (crypto.getRandomValues in the page, Math.random in tests).
	C.randBig = function (lo, hi, rnd) {
		var span = hi - lo, bytes = Math.ceil(C.bitLen(span) / 8) + 1, x = 0n, buf = new Uint8Array(bytes); rnd(buf);
		for (var i = 0; i < bytes; i++) x = x << 8n | BigInt(buf[i]); return lo + x % span;
	};
	C.randomPrime = function (bits, rnd) { var lo = 1n << BigInt(bits - 1), hi = 1n << BigInt(bits); for (var k = 0; k < 10000; k++) { var p = P.nextPrime(C.randBig(lo, hi, rnd) - 1n); if (p < hi) return p; } return null; };
	C.E_CHOICES = [3n, 5n, 17n, 257n, 65537n];
	C.rsaKey = function (p, q, e) {
		p = BigInt(p); q = BigInt(q); var why = [];
		if (p < 2n || !P.isPrime(p)) why.push("p = " + p + " is not prime."); if (q < 2n || !P.isPrime(q)) why.push("q = " + q + " is not prime."); if (p === q) why.push("p and q must be different primes.");
		if (why.length) return { err: why.join(" ") };
		var n = p * q, phi = (p - 1n) * (q - 1n), lam = phi / P.gcd(p - 1n, q - 1n);
		if (e === undefined || e === null) { e = C.E_CHOICES.filter(function (x) { return x < phi && P.gcd(x, phi) === 1n; }).pop(); if (!e) { e = 3n; while (e < phi && P.gcd(e, phi) !== 1n) e += 2n; } }
		e = BigInt(e); if (e <= 1n || e >= phi) return { err: "e must be between 1 and φ(n) = " + phi + "." };
		if (P.gcd(e, phi) !== 1n) return { err: "e = " + e + " shares a factor with φ(n) = " + phi + " (gcd " + P.gcd(e, phi) + "), so it has no inverse. Pick another e." };
		var d = P.modInverse(e, phi);
		return { p: p, q: q, n: n, phi: phi, lambda: lam, e: e, d: d, bits: C.bitLen(n), steps: C.egcdSteps(phi, e) };
	};
	C.blockBytes = function (n) { return Math.floor((C.bitLen(n) - 1) / 8); };
	C.textToBlocks = function (text, n) {   // UTF-8 bytes packed into numbers smaller than n
		var k = C.blockBytes(n); if (k < 1) return { err: "n must be at least 256 to hold one byte. Use bigger primes." };
		var b = C.utf8(text), out = []; for (var i = 0; i < b.length; i += k) { var x = 0n; for (var j = i; j < Math.min(i + k, b.length); j++) x = x << 8n | BigInt(b[j]); out.push({ m: x, len: Math.min(k, b.length - i) }); }
		return { blocks: out, k: k };
	};
	C.blocksToText = function (nums, k, lastLen) {
		var bytes = []; nums.forEach(function (x, idx) { var len = idx === nums.length - 1 && lastLen ? lastLen : k, part = []; for (var j = 0; j < len; j++) { part.unshift(Number(x & 255n)); x >>= 8n; } bytes.push.apply(bytes, part); });
		try { return C.fromUtf8(Uint8Array.from(bytes)); } catch (e) { return null; }
	};
	C.rsaCrack = function (n, e, ms) {
		var f = P.factor(BigInt(n), { ms: ms || 1500 }); if (f.rest || f.f.length !== 2 || f.f[0][1] !== 1 || f.f[1][1] !== 1) return { ok: false, f: f };
		var k = C.rsaKey(f.f[0][0], f.f[1][0], e); return { ok: !k.err, key: k, f: f };
	};
	C.isPrimitiveRoot = function (g, p) {
		g = BigInt(g); p = BigInt(p); if (!P.isPrime(p) || g <= 1n || g >= p) return false;
		var f = P.factor(p - 1n, { ms: 800 }); if (f.rest) return null;
		return f.f.every(function (x) { return P.modpow(g, (p - 1n) / x[0], p) !== 1n; });
	};
	C.smallestRoot = function (p) { for (var g = 2n; g < p && g < 2000n; g++) { var r = C.isPrimitiveRoot(g, p); if (r === null) return null; if (r) return g; } return null; };
	C.dh = function (p, g, a, b) { p = BigInt(p); g = BigInt(g); a = BigInt(a); b = BigInt(b); var A = P.modpow(g, a, p), B = P.modpow(g, b, p); return { A: A, B: B, sA: P.modpow(B, a, p), sB: P.modpow(A, b, p) }; };
	// Baby-step giant-step discrete log: x with g^x = h (mod p), or null. Limited to p up to about 1e12.
	C.dlog = function (g, h, p) {
		g = BigInt(g); h = BigInt(h); p = BigInt(p); if (p > 1000000000000n) return { err: "too big" };
		var m = BigInt(Math.ceil(Math.sqrt(Number(p)))), tbl = new Map(), e = 1n;
		for (var j = 0n; j < m; j++) { if (!tbl.has(e)) tbl.set(e, j); e = e * g % p; }
		var f = P.modpow(P.modInverse(g, p), m, p), y = mod(h, p), steps = Number(m);
		for (var i = 0n; i < m; i++) { if (tbl.has(y)) return { x: i * m + tbl.get(y), steps: steps + Number(i) }; y = y * f % p; }
		return { x: null, steps: steps * 2 };
	};

	/* ---------- MES1 text format for AES-GCM (salt 16 + iv 12 + ciphertext) ---------- */
	C.PBKDF2_ITER = 250000;
	C.pack = function (salt, iv, ct) { var b = new Uint8Array(28 + ct.length); b.set(salt, 0); b.set(iv, 16); b.set(ct, 28); return "MES1." + C.b64(b, true); };
	C.unpack = function (s) {
		s = String(s).trim(); var m = /^MES1\.([A-Za-z0-9_-]+)$/.exec(s.replace(/\s+/g, "")); if (!m) return null;
		var b = C.fromB64(m[1]); if (!b || b.length < 28 + 16) return null; return { salt: b.slice(0, 16), iv: b.slice(16, 28), ct: b.slice(28) };
	};
	// Rough time to brute-force a password (guesses per second as given).
	C.passwordSpace = function (pw) {
		var pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/[0-9]/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
		var len = Array.from(pw).length; return { pool: pool, len: len, bits: len && pool ? len * Math.log2(pool) : 0 };
	};

	if (typeof module === "object" && module.exports) module.exports = C; else root.MESCrypto = C;
})(typeof window !== "undefined" ? window : this);
