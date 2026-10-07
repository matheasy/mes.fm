/* MES Enigma -- pure machine maths (no DOM). Browser global `EN`; node: require('./tool_apps_src/enigma/lib.js'); tests: node tool_apps_src/enigma-tests.js
 * Models: Enigma I (Army / Luftwaffe, 3 rotors), M3 (Army / Navy, 3 of 8 rotors), M4 (Navy "Shark": + Beta / Gamma and a thin reflector).
 * A machine is a plain object { model, rotors:[left..right] (names), rings:[0-25...], pos:[0-25...], refl, plugs:"AB CD ..." }; every function is pure.
 */
(function (root) {
	"use strict";
	var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	// wiring (what each contact A..Z of the entry side comes out as) and the window letter(s) at which the rotor carries the one on its left along
	var ROTORS = {
		I: ["EKMFLGDQVZNTOWYHXUSPAIBRCJ", "Q"], II: ["AJDKSIRUXBLHWTMCQGZNPYFVOE", "E"], III: ["BDFHJLCPRTXVZNYEIWGAKMUSQO", "V"],
		IV: ["ESOVPZJAYQUIRHXLNFTGKDCMWB", "J"], V: ["VZBRGITYUPSDNHLXAWMJQOFECK", "Z"],
		VI: ["JPGVOUMFYQBENHZRDKASXLICTW", "ZM"], VII: ["NZJHGRCXMYSWBOUFAIVLPEKQDT", "ZM"], VIII: ["FKQHTLXOCBJSPDZRAMEWNIUYGV", "ZM"],
		Beta: ["LEYJVCNIXWPBQMDRTAKZGFUHOS", ""], Gamma: ["FSOKANUERHMBTIYCWLQPZXVGJD", ""]
	};
	var REFLECTORS = {
		A: "EJMZALYXVBWFCRQUONTSPIKHGD", B: "YRUHQSLDPXNGOKMIEBFZCWVJAT", C: "FVPJIAOYEDRZXWGCTKUQSBNMHL",
		"B-thin": "ENKQAUYWJICOPBLMDXZVFTHRGS", "C-thin": "RDOBJNTKVEHMLFCWZAXGYIPSUQ"
	};
	var MODELS = {
		I: { name: "Enigma I (Army, Luftwaffe)", rotors: ["I", "II", "III", "IV", "V"], refl: ["A", "B", "C"], slots: 3, def: { rotors: ["I", "II", "III"], refl: "B" } },
		M3: { name: "M3 (Army, Navy)", rotors: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"], refl: ["B", "C"], slots: 3, def: { rotors: ["I", "II", "III"], refl: "B" } },
		M4: { name: "M4 (Navy, four rotors)", rotors: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"], greek: ["Beta", "Gamma"], refl: ["B-thin", "C-thin"], slots: 4, def: { rotors: ["Beta", "I", "II", "III"], refl: "B-thin" } }
	};
	function ix(ch) { return ch.charCodeAt(0) - 65; }
	var FWD = {}, BACK = {}, REF = {};
	Object.keys(ROTORS).forEach(function (n) {
		var w = ROTORS[n][0], f = [], b = [], i; for (i = 0; i < 26; i++) { f[i] = ix(w.charAt(i)); b[f[i]] = i; }
		FWD[n] = f; BACK[n] = b;
	});
	Object.keys(REFLECTORS).forEach(function (n) { REF[n] = REFLECTORS[n].split("").map(ix); });
	function notches(n) { return ROTORS[n][1].split("").map(ix); }
	function mod(n) { return ((n % 26) + 26) % 26; }

	// "AB CD" / "ab, cd" -> { map: swap table, pairs: ["AB", ...], error }. Each letter may be used once; a pair needs two different letters.
	function parsePlugs(text) {
		var map = [], i, pairs = [], err = "", used = {};
		for (i = 0; i < 26; i++) map[i] = i;
		var toks = String(text || "").toUpperCase().replace(/[^A-Z]+/g, " ").trim().split(" ").filter(Boolean);
		toks.forEach(function (t) {
			if (err) return;
			if (t.length !== 2) { err = "Each plug is a pair of two letters, like AB."; return; }
			if (t.charAt(0) === t.charAt(1)) { err = "A plug joins two different letters (not " + t + ")."; return; }
			if (used[t.charAt(0)] || used[t.charAt(1)]) { err = "Each letter can have only one plug (" + (used[t.charAt(0)] ? t.charAt(0) : t.charAt(1)) + " is used twice)."; return; }
			used[t.charAt(0)] = used[t.charAt(1)] = 1; map[ix(t.charAt(0))] = ix(t.charAt(1)); map[ix(t.charAt(1))] = ix(t.charAt(0)); pairs.push(t);
		});
		if (!err && pairs.length > 10) err = "The real machine shipped with 10 plug cables; you have " + pairs.length + ".";
		return { map: map, pairs: pairs, error: err };
	}

	// step the rotors once, exactly as the machine does before every key press (including the middle rotor's double step)
	function step(pos, names) {
		var n = pos.length, p = pos.slice(), r = n - 1, m = n - 2, l = n - 3;
		var atR = notches(names[r]).indexOf(pos[r]) >= 0, atM = notches(names[m]).indexOf(pos[m]) >= 0;
		if (atM) { p[l] = mod(p[l] + 1); p[m] = mod(p[m] + 1); } else if (atR) { p[m] = mod(p[m] + 1); }
		p[r] = mod(p[r] + 1);
		return p;
	}
	// one rotor, forward (right to left) or back, with ring and position: contact c -> contact
	function through(name, pos, ring, c, back) {
		var s = pos - ring, t = mod(c + s), o = back ? BACK[name][t] : FWD[name][t];
		return mod(o - s);
	}
	// press one key from state `pos`: returns the lit lamp, the new positions and the signal path (for the tracer)
	function press(cfg, plug, pos, ch) {
		var names = cfg.rotors, n = names.length, p = step(pos, names), path = [], c = ix(ch), i;
		path.push(["Key", c]);
		c = plug[c]; path.push(["Plugboard", c]);
		path.push(["Entry wheel", c]);
		for (i = n - 1; i >= 0; i--) { c = through(names[i], p[i], cfg.rings[i], c, false); path.push([names[i] + " (" + (n - i === 1 ? "right" : i === 0 ? "left" : "middle") + ")", c]); }
		c = REF[cfg.refl][c]; path.push(["Reflector " + cfg.refl, c]);
		for (i = 0; i < n; i++) { c = through(names[i], p[i], cfg.rings[i], c, true); path.push([names[i] + " back", c]); }
		path.push(["Entry wheel", c]);
		c = plug[c]; path.push(["Plugboard", c]);
		path.push(["Lamp", c]);
		return { out: c, pos: p, path: path };
	}
	// encipher a whole text from the machine's start position. `letters` = only A-Z are processed (the rest are dropped or passed through).
	function run(cfg, text, opt) {
		opt = opt || {};
		var pl = parsePlugs(cfg.plugs), pos = cfg.pos.slice(), out = "", n = 0, last = null, letters = 0, i, ch, r;
		var src = String(text || "").toUpperCase();
		for (i = 0; i < src.length; i++) {
			ch = src.charAt(i);
			if (ch >= "A" && ch <= "Z") { r = press(cfg, pl.map, pos, ch); pos = r.pos; out += A.charAt(r.out); last = { ch: ch, out: A.charAt(r.out), path: r.path }; letters++; }
			else if (opt.keep) out += src.charAt(i);
		}
		return { text: out, pos: pos, last: last, letters: letters };
	}
	function group(text, size) {
		if (!size) return text;
		var s = String(text).replace(/[^A-Z]/g, ""), o = [], i; for (i = 0; i < s.length; i += size) o.push(s.substr(i, size));
		return o.join(" ");
	}
	// "AAA" <-> [0,0,0]
	function posText(pos) { return pos.map(function (p) { return A.charAt(p); }).join(""); }
	function posParse(text, n) { var t = String(text || "").toUpperCase().replace(/[^A-Z]/g, ""), o = [], i; for (i = 0; i < n; i++) o.push(i < t.length ? ix(t.charAt(i)) : 0); return o; }

	function defaults(model) {
		var m = MODELS[model] || MODELS.M3, n = m.slots;
		return { model: MODELS[model] ? model : "M3", rotors: m.def.rotors.slice(), refl: m.def.refl, rings: new Array(n).fill(0), pos: new Array(n).fill(0), plugs: "" };
	}
	// make a stored / linked machine safe to use: fix the model's rotor count, drop unknown names, no repeated rotor
	function normalize(c) {
		var d = defaults(c && c.model), m = MODELS[d.model], n = m.slots, i, o = d, used = {};
		if (!c) return o;
		var pool = m.rotors.concat(m.greek || []);
		if (Array.isArray(c.rotors) && c.rotors.length === n && c.rotors.every(function (r) { return pool.indexOf(r) >= 0; })) {
			var ok = c.rotors.every(function (r) { if (used[r]) return false; used[r] = 1; return true; });
			var greekOk = n === 3 || (m.greek || []).indexOf(c.rotors[0]) >= 0;
			var restOk = c.rotors.slice(n === 4 ? 1 : 0).every(function (r) { return m.rotors.indexOf(r) >= 0; });
			if (ok && greekOk && restOk) o.rotors = c.rotors.slice();
		}
		if (m.refl.indexOf(c.refl) >= 0) o.refl = c.refl;
		for (i = 0; i < n; i++) {
			if (Array.isArray(c.rings) && +c.rings[i] >= 0 && +c.rings[i] < 26) o.rings[i] = Math.floor(+c.rings[i]);
			if (Array.isArray(c.pos) && +c.pos[i] >= 0 && +c.pos[i] < 26) o.pos[i] = Math.floor(+c.pos[i]);
		}
		var pl = parsePlugs(c.plugs); o.plugs = pl.error ? "" : pl.pairs.join(" ");
		return o;
	}
	function randomInt(n, rnd) { return Math.floor((rnd || Math.random)() * n); }
	function random(model, rnd) {
		var d = defaults(model), m = MODELS[d.model], pool = m.rotors.slice(), i, n = m.slots;
		var set = [], first = n === 4 ? 1 : 0;
		if (n === 4) set.push(m.greek[randomInt(2, rnd)]);
		for (i = first; i < n; i++) set.push(pool.splice(randomInt(pool.length, rnd), 1)[0]);
		d.rotors = set; d.refl = m.refl[randomInt(m.refl.length, rnd)];
		// the Greek rotor of the M4 is set like the others
		for (i = 0; i < n; i++) { d.rings[i] = randomInt(26, rnd); d.pos[i] = randomInt(26, rnd); }
		var letters = A.split(""), pairs = [];
		for (i = 0; i < 10; i++) { var a = letters.splice(randomInt(letters.length, rnd), 1)[0], b = letters.splice(randomInt(letters.length, rnd), 1)[0]; pairs.push(a + b); }
		d.plugs = pairs.join(" ");
		return d;
	}

	// Crib search. Which machine states (rotor order x start positions) turn `cipher` into something that contains `crib` at ... offset k?
	// With the plugboard, rings and reflector fixed as in `cfg`. Yields results through `found`; cooperative: call next() repeatedly (returns progress 0..1, done = true).
	function permutations(list, k) {
		var out = [];
		(function rec(cur, rest) { if (cur.length === k) { out.push(cur.slice()); return; } rest.forEach(function (x, i) { cur.push(x); rec(cur, rest.slice(0, i).concat(rest.slice(i + 1))); cur.pop(); }); })([], list);
		return out;
	}
	// Positions in the ciphertext where the crib could be (Enigma never turns a letter into itself): returns the list of offsets
	function cribOffsets(cipher, crib) {
		var c = String(cipher).toUpperCase().replace(/[^A-Z]/g, ""), k = String(crib).toUpperCase().replace(/[^A-Z]/g, ""), o = [], i, j, ok;
		for (i = 0; i + k.length <= c.length; i++) { ok = true; for (j = 0; j < k.length; j++) if (c.charAt(i + j) === k.charAt(j)) { ok = false; break; } if (ok) o.push(i); }
		return o;
	}
	function cribSearch(cfg, cipher, crib, opt) {
		opt = opt || {};
		var m = MODELS[cfg.model], n = m.slots, c = String(cipher).toUpperCase().replace(/[^A-Z]/g, ""), k = String(crib).toUpperCase().replace(/[^A-Z]/g, "");
		var pl = parsePlugs(cfg.plugs).map, offs = opt.offsets || [0];
		var pool = m.rotors;
		var orders = opt.orders ? permutations(pool, 3).map(function (o) { return n === 4 ? [cfg.rotors[0]].concat(o) : o; }) : [cfg.rotors.slice()];
		var total = orders.length * 17576, done = 0, oi = 0, pi = 0, hits = [], limit = opt.limit || 200;
		var cc = c.split("").map(ix), kk = k.split("").map(ix);
		var plugArr = Uint8Array.from(pl), refArr = Uint8Array.from(REF[cfg.refl]), span = offs[offs.length - 1] + k.length, buf = new Uint8Array(span);
		var NOTCH = {}; Object.keys(ROTORS).forEach(function (r) { NOTCH[r] = notches(r); });
		function tryState(order, p0) {
			var base = n === 4 ? [cfg.pos[0], p0[0], p0[1], p0[2]] : p0, st = base.slice(), fw = [], bw = [], nt = [], j, i, o, good, c0, t, s0;
			for (i = 0; i < n; i++) { fw[i] = FWD[order[i]]; bw[i] = BACK[order[i]]; nt[i] = NOTCH[order[i]]; }
			// run the machine across the whole span once; every candidate offset is then a window of that output
			for (j = 0; j < span; j++) {
				var atR = nt[n - 1].indexOf(st[n - 1]) >= 0, atM = nt[n - 2].indexOf(st[n - 2]) >= 0;
				if (atM) { st[n - 3] = (st[n - 3] + 1) % 26; st[n - 2] = (st[n - 2] + 1) % 26; } else if (atR) st[n - 2] = (st[n - 2] + 1) % 26;
				st[n - 1] = (st[n - 1] + 1) % 26;
				c0 = plugArr[j < cc.length ? cc[j] : 0];
				for (i = n - 1; i >= 0; i--) { s0 = st[i] - cfg.rings[i]; t = (c0 + s0 + 52) % 26; c0 = (fw[i][t] - s0 + 52) % 26; }
				c0 = refArr[c0];
				for (i = 0; i < n; i++) { s0 = st[i] - cfg.rings[i]; t = (c0 + s0 + 52) % 26; c0 = (bw[i][t] - s0 + 52) % 26; }
				buf[j] = plugArr[c0];
			}
			for (var oi2 = 0; oi2 < offs.length; oi2++) {
				o = offs[oi2]; good = true;
				for (j = 0; j < k.length; j++) if (buf[o + j] !== kk[j]) { good = false; break; }
				if (good) hits.push({ rotors: order.slice(), pos: base.slice(), offset: o });
			}
		}
		function next(budget) {
			var t0 = Date.now();
			while (oi < orders.length && Date.now() - t0 < (budget || 25) && hits.length < limit) {
				var p = [Math.floor(pi / 676), Math.floor(pi / 26) % 26, pi % 26];
				tryState(orders[oi], p); pi++; done++;
				if (pi >= 17576) { pi = 0; oi++; }
			}
			return { progress: done / total, done: oi >= orders.length || hits.length >= limit, hits: hits, total: total, tested: done };
		}
		return { next: next };
	}
	var EN = { A: A, ROTORS: ROTORS, REFLECTORS: REFLECTORS, MODELS: MODELS, parsePlugs: parsePlugs, step: step, press: press, run: run, group: group, posText: posText, posParse: posParse, defaults: defaults, normalize: normalize, random: random, cribOffsets: cribOffsets, cribSearch: cribSearch, notches: notches };
	if (typeof module !== "undefined" && module.exports) module.exports = EN; else root.EN = EN;
})(typeof window !== "undefined" ? window : globalThis);
