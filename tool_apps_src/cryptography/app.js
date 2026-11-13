/* MES Cryptography Lab -- UI (maths in lib.js = MESCrypto, primes in MESPrime). Tabs: cipher, crack, rsa, dh, hash, aes, enc, mod.
 * State: localStorage "mes-cryptography:v1" (settings + texts; never the AES password). Links: ?tab=  (?c=&k=&t= for the cipher tab). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cg"); if (!root || !window.MESCrypto || !window.MESPrime) return;
	var C = window.MESCrypto, P = window.MESPrime, KEY = "mes-cryptography:v1", AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = Object.assign({ tab: "cipher", c: "caesar", dir: "enc", shift: 3, aa: 5, ab: 8, key: "LEMON", kw: "ZEBRAS", rails: 3, rmode: "text", ef: "b64", edir: "enc" }, sget());
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var q = new URLSearchParams(location.search);
	if (q.get("tab")) S.tab = q.get("tab");
	if (q.get("c")) { S.c = q.get("c"); S.tab = "cipher"; } if (q.get("k")) { var kk = q.get("k").slice(0, 60); if (S.c === "caesar") S.shift = +kk || 0; else if (S.c === "rail") S.rails = +kk || 3; else if (S.c === "keyword") S.kw = kk; else if (S.c === "affine") { var ab = kk.split(","); S.aa = +ab[0] || 5; S.ab = +ab[1] || 0; } else S.key = kk; }
	if (q.get("d") === "1") S.dir = "dec";
	var linkText = q.get("t"); if (linkText !== null) history.replaceState(null, "", location.pathname + (S.tab !== "cipher" ? "?tab=" + S.tab : ""));
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 1900); }
	function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) {} ta.remove(); }); }
	function seg(id, val, cb, attr) {
		attr = attr || "v"; var el = $(id);
		function paint(v) { el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset[attr] === String(v)); }); }
		paint(val); el.addEventListener("click", function (e) { var b = e.target.closest("button[data-" + attr + "]"); if (!b) return; paint(b.dataset[attr]); cb(b.dataset[attr]); });
		return paint;
	}
	function grp(s) { return P.group ? P.group(String(s)) : String(s); }
	function short(s, n) { s = String(s); n = n || 60; return s.length > n ? s.slice(0, n / 2) + "…" + s.slice(-n / 2 + 1) + " (" + s.length + " digits)" : s; }
	function rnd(buf) { crypto.getRandomValues(buf); }
	function err(id, msg) { var e = $(id); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }
	function sci(x) { var m = x.toExponential(1).split("e+"); return m[0] + " × 10" + String(+m[1]).replace(/\d/g, function (d) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]; }); }
	function dark() { return document.body.classList.contains("dark-mode"); }

	/* ---------- tabs ---------- */
	var TABS = ["cipher", "crack", "rsa", "dh", "hash", "aes", "enc", "mod"], inited = {};
	var INIT = { crack: initCrack, rsa: initRsa, dh: initDh, hash: initHash, aes: initAes, enc: initEnc, mod: initMod };
	function showTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "cipher"; S.tab = t; save();
		root.querySelectorAll("#cg-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
		root.querySelectorAll(".cg-pane").forEach(function (p) { p.hidden = p.dataset.pane !== t; });
		if (!inited[t] && INIT[t]) { inited[t] = 1; INIT[t](); }
		if (push) history.replaceState(null, "", location.pathname + (t === "cipher" ? "" : "?tab=" + t) + location.hash);
	}
	$("cg-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) showTab(b.dataset.t, true); });
	$("cg-tabs").addEventListener("keydown", function (e) {
		var i = TABS.indexOf(S.tab), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -9;
		if (j === -9) return; e.preventDefault(); j = (j + TABS.length) % TABS.length; showTab(TABS[j], true); root.querySelector('#cg-tabs [data-t="' + TABS[j] + '"]').focus();
	});

	/* =================== Ciphers =================== */
	$("cg-aa").innerHTML = C.AFFINE_A.map(function (a) { return "<option>" + a + "</option>"; }).join("");
	$("cg-c").value = S.c; $("cg-shift").value = S.shift; $("cg-aa").value = S.aa; $("cg-ab").value = S.ab; $("cg-key").value = S.key; $("cg-kw").value = S.kw; $("cg-rails").value = S.rails;
	if (linkText !== null) $("cg-in").value = linkText.slice(0, 5000); else if (S.cin) $("cg-in").value = S.cin;
	var paintDir = seg("cg-dir", S.dir, function (v) { S.dir = v; runCipher(); });
	["cg-c", "cg-shift", "cg-aa", "cg-ab", "cg-key", "cg-kw", "cg-rails", "cg-in"].forEach(function (id) { $(id).addEventListener("input", runCipher); });
	function cipherOut(t) {
		var dec = S.dir === "dec";
		switch (S.c) {
			case "caesar": return C.caesar(t, S.shift, dec);
			case "rot13": return C.rot13(t);
			case "atbash": return C.atbash(t);
			case "affine": return C.affine(t, S.aa, S.ab, dec);
			case "vigenere": return C.vigenere(t, S.key, dec);
			case "beaufort": return C.beaufort(t, S.key);
			case "keyword": return C.substitute(t, C.keywordAlphabet(S.kw), dec);
			case "rail": return C.railFence(t, S.rails, dec);
		}
	}
	function runCipher() {
		S.c = $("cg-c").value; S.shift = +$("cg-shift").value; S.aa = +$("cg-aa").value; S.ab = +$("cg-ab").value; S.key = $("cg-key").value; S.kw = $("cg-kw").value; S.rails = +$("cg-rails").value;
		S.cin = $("cg-in").value.slice(0, 20000); save();
		$("cg-shiftv").textContent = S.shift; $("cg-abv").textContent = S.ab; $("cg-railsv").textContent = S.rails;
		$("cg-keys").querySelectorAll("[data-for]").forEach(function (l) { l.hidden = l.dataset.for.split(" ").indexOf(S.c) < 0; });
		$("cg-keys").hidden = ["rot13", "atbash"].indexOf(S.c) >= 0;
		var selfInv = ["rot13", "atbash", "beaufort"].indexOf(S.c) >= 0; $("cg-dir").hidden = selfInv;
		var dec = S.dir === "dec" && !selfInv;
		$("cg-inlab").textContent = dec ? "Secret message" : "Your message"; $("cg-outlab").textContent = dec ? "Decrypted" : "Encrypted";
		var out = cipherOut(S.cin);
		if (out === null) { $("cg-out").value = ""; $("cg-out").placeholder = S.c === "vigenere" || S.c === "beaufort" ? "Type a key word (letters)." : "Pick a key."; } else $("cg-out").value = out;
		drawViz(out || "");
	}
	$("cg-swap").onclick = function () { $("cg-in").value = $("cg-out").value; S.dir = S.dir === "enc" ? "dec" : "enc"; paintDir(S.dir); runCipher(); };
	$("cg-copy").onclick = function () { copy($("cg-out").value, "Result copied"); };
	$("cg-tocrack").onclick = function () { $("cg-ct").value = $("cg-out").value; showTab("crack", true); if (!inited.crack) initCrack(); doCrack(); };
	$("cg-link").onclick = function () {
		var k = S.c === "caesar" ? S.shift : S.c === "rail" ? S.rails : S.c === "keyword" ? S.kw : S.c === "affine" ? S.aa + "," + S.ab : S.key;
		var u = location.origin + location.pathname + "?c=" + S.c + (["rot13", "atbash"].indexOf(S.c) < 0 ? "&k=" + encodeURIComponent(k) : "") + "&d=1&t=" + encodeURIComponent($("cg-out").value.slice(0, 1500));
		copy(u, "Link copied: it opens the secret message ready to decrypt");
	};

	function mappingRow(f, used) {   // plain A-Z over cipher letters
		var h = '<div class="cg-map" role="table" aria-label="Letter mapping"><div class="cg-maprow"><span class="cg-maph">Plain</span>';
		for (var i = 0; i < 26; i++) h += '<span class="cg-l' + (used[i] ? " is-used" : "") + '">' + AZ[i] + "</span>";
		h += '</div><div class="cg-maprow"><span class="cg-maph">Cipher</span>';
		for (i = 0; i < 26; i++) h += '<span class="cg-l cg-l--c' + (used[i] ? " is-used" : "") + '">' + AZ[C.mod(f(i), 26)] + "</span>";
		return h + "</div></div>";
	}
	function usedPlain(t) { var u = new Array(26).fill(false), s = C.letters(t); for (var i = 0; i < s.length; i++) u[s.charCodeAt(i) - 65] = true; return u; }
	function drawViz(out) {
		var v = $("cg-viz"), n = $("cg-vizn"), dec = S.dir === "dec", plain = dec ? out : S.cin, used = usedPlain(plain);
		var h = "", note = "";
		if (S.c === "caesar" || S.c === "rot13") {
			var k = S.c === "rot13" ? 13 : S.shift;
			h = wheelSvg(k) + mappingRow(function (i) { return i + k; }, used);
			note = S.c === "caesar" ? "Drag the inner wheel to change the shift. Each letter moves " + k + " places along the alphabet; Z wraps round to A. Only 25 shifts exist, so the Crack tab tries them all." : "ROT13 is a Caesar shift of 13: doing it twice gets you back where you started, so the same button encrypts and decrypts.";
		} else if (S.c === "atbash") { h = mappingRow(function (i) { return 25 - i; }, used); note = "Atbash flips the alphabet: A ↔ Z, B ↔ Y … It was first used with the Hebrew alphabet and has no key at all."; }
		else if (S.c === "affine") { var ia = C.inv26(S.aa); h = mappingRow(function (i) { return S.aa * i + S.ab; }, used) + '<p class="cg-formula">Encrypt: E(x) = (' + S.aa + "x + " + S.ab + ") mod 26 &nbsp;·&nbsp; Decrypt: D(y) = " + ia + "(y − " + S.ab + ") mod 26</p>"; note = "Letters are numbers (A = 0 … Z = 25). a must share no factor with 26, so only 12 values work; " + ia + " is the inverse of " + S.aa + " mod 26 (" + S.aa + " × " + ia + " = " + S.aa * ia + " = " + Math.floor(S.aa * ia / 26) + " × 26 + 1)."; }
		else if (S.c === "keyword") { var al = C.keywordAlphabet(S.kw); h = mappingRow(function (i) { return al.charCodeAt(i) - 65; }, used); note = "The cipher alphabet starts with the keyword (repeated letters dropped), then the rest of the alphabet in order. There are 26! ≈ 4 × 10²⁶ possible alphabets, but letter frequencies still give it away."; }
		else if (S.c === "vigenere" || S.c === "beaufort") {
			var ks = C.keyShifts(S.key), src = S.cin, rows = { p: [], k: [], c: [] }, i = 0;
			if (ks.length) for (var j = 0; j < src.length && rows.p.length < 36; j++) { var ch = src[j]; if (!/[A-Za-z]/.test(ch)) continue; var o = out[j]; rows.p.push(ch.toUpperCase()); rows.k.push(AZ[ks[i % ks.length]]); rows.c.push((o || "").toUpperCase()); i++; }
			h = '<div class="cg-map cg-map--v"><div class="cg-maprow"><span class="cg-maph">' + (dec ? "Secret" : "Plain") + "</span>" + rows.p.map(function (x) { return '<span class="cg-l">' + x + "</span>"; }).join("") + '</div><div class="cg-maprow"><span class="cg-maph">Key</span>' + rows.k.map(function (x) { return '<span class="cg-l cg-l--k">' + x + "</span>"; }).join("") + '</div><div class="cg-maprow"><span class="cg-maph">' + (dec ? "Plain" : "Cipher") + "</span>" + rows.c.map(function (x) { return '<span class="cg-l cg-l--c">' + x + "</span>"; }).join("") + "</div></div>";
			note = S.c === "vigenere" ? "The key word repeats under the message and each key letter is a different Caesar shift (A = 0, B = 1 …). The same letter can encrypt to different letters, which beat simple frequency counting for 300 years, until Kasiski found the repeats (see the Crack tab)." : "Beaufort uses cipher = key − plain (mod 26), so encrypting twice with the same key gives the message back.";
		} else if (S.c === "rail") {
			var chars = Array.from(S.cin.slice(0, 60)), pat = C.railPattern(chars.length, S.rails), g = '<div class="cg-rail" style="--cols:' + Math.max(chars.length, 1) + '">';
			for (var r = 0; r < S.rails; r++) for (var c = 0; c < chars.length; c++) g += '<span class="' + (pat[c] === r ? "is-on" : "") + '">' + (pat[c] === r ? esc(chars[c] === " " ? "␣" : chars[c]) : "") + "</span>";
			h = g + "</div>"; note = dec ? "Decrypting refills the zig-zag row by row, then reads it diagonally." : "Write the message in a zig-zag over " + S.rails + " rails, then read each rail from left to right. The letters stay the same, only their order changes (a transposition cipher)" + (S.cin.length > 60 ? "; the picture shows the first 60 characters." : ".");
		}
		v.innerHTML = h; n.textContent = note;
	}
	function wheelSvg(k) {
		var s = '<svg class="cg-wheel" viewBox="-160 -160 320 320" role="img" aria-label="Caesar wheel, shift ' + k + '"><circle r="152" class="cg-w1"/><circle r="112" class="cg-w2"/><circle r="70" class="cg-w3"/>';
		for (var i = 0; i < 26; i++) { var a = (i / 26) * 2 * Math.PI - Math.PI / 2, x = Math.cos(a), y = Math.sin(a); s += '<text x="' + (x * 132).toFixed(1) + '" y="' + (y * 132 + 6).toFixed(1) + '" class="cg-wt">' + AZ[i] + "</text>"; }
		s += '<g class="cg-inner" transform="rotate(' + (-k * 360 / 26) + ')">';
		for (i = 0; i < 26; i++) { var b = (i / 26) * 2 * Math.PI - Math.PI / 2; s += '<text x="' + (Math.cos(b) * 91).toFixed(1) + '" y="' + (Math.sin(b) * 91 + 5).toFixed(1) + '" class="cg-wt cg-wt--in" transform="rotate(' + (k * 360 / 26) + " " + (Math.cos(b) * 91).toFixed(1) + " " + (Math.sin(b) * 91).toFixed(1) + ')">' + AZ[i] + "</text>"; }
		s += '</g><text y="-6" class="cg-wk">' + k + '</text><text y="16" class="cg-wks">shift</text><path d="M0 -158 L-7 -170 L7 -170 Z" class="cg-wp"/></svg>';
		return s;
	}
	// keep dragging after the wheel is redrawn: delegate to the viz container instead
	(function () {
		var v = $("cg-viz"), drag = null;
		function ang(e, svg) { var r = svg.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); }
		v.addEventListener("pointerdown", function (e) { var svg = e.target.closest(".cg-wheel"); if (!svg || S.c !== "caesar") return; drag = { a: ang(e, svg), k: S.shift }; v.setPointerCapture(e.pointerId); e.preventDefault(); });
		v.addEventListener("pointermove", function (e) { if (!drag) return; var svg = v.querySelector(".cg-wheel"); if (!svg) return; var k = C.mod(Math.round(drag.k - (ang(e, svg) - drag.a) * 26 / (2 * Math.PI)), 26); if (k !== S.shift) { $("cg-shift").value = k; runCipher(); } });
		function end() { drag = null; } v.addEventListener("pointerup", end); v.addEventListener("pointercancel", end);
	})();
	runCipher();

	/* =================== Crack =================== */
	var CT_PLAIN = [
		"The secret on the maps is that the treasure is buried under the old oak tree near the river, twenty paces north of the broken stone wall.",
		"We have found the missing documents and they prove everything. Meet me at the north gate of the station at nine tonight and bring the copies with you. Tell nobody else about this plan until it is done.",
		"The quick brown fox jumps over the lazy dog, and then runs back home before dark.",
		"The message is hidden in plain sight where nobody thinks to look for it. The key is under the mat."
	];
	var CT_EX = [["Caesar", C.caesar(CT_PLAIN[0], 3)], ["Vigenère", C.vigenere(CT_PLAIN[1], "SECRET")], ["Atbash", C.atbash(CT_PLAIN[2])], ["Affine", C.affine(CT_PLAIN[3], 7, 10)], ["Rail fence (not crackable here)", C.railFence("Rail fence keeps every letter, it only changes their order, so the letter counts look like English.", 3)]];
	function initCrack() {
		$("cg-ctex").insertAdjacentHTML("beforeend", CT_EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + x[0] + "</button>"; }).join(""));
		$("cg-ctex").addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) { $("cg-ct").value = CT_EX[+b.dataset.i][1]; doCrack(); } });
		if (!$("cg-ct").value) $("cg-ct").value = S.ct || CT_EX[0][1];
		$("cg-crack").onclick = doCrack; $("cg-ct").addEventListener("input", function () { S.ct = $("cg-ct").value.slice(0, 20000); save(); drawFreq($("cg-ct").value); });
		drawFreq($("cg-ct").value);
	}
	function drawFreq(t) {
		var c = C.counts(t), n = c.reduce(function (a, b) { return a + b; }, 0), W = 620, H = 200, L = 30, B = 22, bw = (W - L - 6) / 26, max = 13;
		for (var i = 0; i < 26; i++) if (n && c[i] / n * 100 > max) max = c[i] / n * 100;
		var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Letter frequency chart">';
		for (var y = 0; y <= max; y += 5) { var yy = H - B - y / max * (H - B - 10); s += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" class="cg-grid"/><text x="' + (L - 4) + '" y="' + (yy + 4) + '" class="cg-axis" text-anchor="end">' + y + "%</text>"; }
		var line = "";
		for (i = 0; i < 26; i++) {
			var x = L + i * bw, pct = n ? c[i] / n * 100 : 0, h = pct / max * (H - B - 10);
			s += '<rect x="' + (x + 2).toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h.toFixed(1) + '" class="cg-bar"><title>' + AZ[i] + ": " + c[i] + " (" + pct.toFixed(1) + "%)</title></rect>";
			s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" class="cg-axis" text-anchor="middle">' + AZ[i] + "</text>";
			line += (i ? "L" : "M") + (x + bw / 2).toFixed(1) + " " + (H - B - C.EN[i] / max * (H - B - 10)).toFixed(1);
		}
		s += '<path d="' + line + '" class="cg-enline"/></svg>';
		$("cg-freq").innerHTML = s;
		var io = C.ioc(c);
		$("cg-fstats").innerHTML = stat("Letters", grp(n)) + stat("Index of coincidence", n > 1 ? io.toFixed(4) : "–", "English ≈ 0.067 · random ≈ 0.038") +
			stat("Looks like", n < 20 ? "too short" : io > 0.058 ? "one alphabet" : io > 0.045 ? "a few alphabets" : "many alphabets", io > 0.058 ? "Caesar, Atbash, affine or substitution" : "Vigenère-type (key word)");
	}
	function stat(l, v, sub) { return '<div class="tu-stat"><span class="tu-stat__label">' + esc(l) + '</span><span class="tu-stat__value">' + esc(v) + "</span>" + (sub ? '<span class="tu-stat__sub">' + esc(sub) + "</span>" : "") + "</div>"; }
	function doCrack() {
		var t = $("cg-ct").value, out = $("cg-crout"); drawFreq(t); var r = C.autoCrack(t);
		if (r.err) { out.innerHTML = '<div class="tu-card"><p class="cg-err">' + esc(r.err) + "</p></div>"; return; }
		var b = r.best, h = '<div class="tu-card cg-hero"><span class="cg-badge">Best guess</span><h2 class="cg-verdict">' + esc(b.label) + '</h2><p class="cg-plain">' + esc(b.text.slice(0, 1500)) + '</p><div class="cg-acts"><button type="button" class="tu-btn tu-btn--primary" data-use="1">Open in the Ciphers tab</button><button type="button" class="tu-btn tu-btn--ghost" data-cp="1">Copy</button></div>';
		if (r.plain > b.score - 0.05) h += '<p class="cg-note">The message already looks like plain English, so it may not be encrypted at all.</p>';
		h += '<details class="cg-more"><summary>Other candidates</summary><ol class="cg-cands">' + r.all.slice(1).map(function (x) { return "<li><b>" + esc(x.label) + "</b>: " + esc(x.text.slice(0, 140)) + "</li>"; }).join("") + "</ol></details></div>";
		var cz = C.crackCaesar(t);
		h += '<div class="tu-card"><h2 class="cg-h">All 26 Caesar shifts, most English-like first</h2><ol class="cg-shifts">' + cz.map(function (x, i) { return '<li class="' + (i === 0 ? "is-best" : "") + '"><span class="cg-sk">' + x.k + "</span> " + esc(x.text.slice(0, 90)) + "</li>"; }).join("") + "</ol></div>";
		if (C.letters(t).length >= 40) {
			var kl = C.keyLengths(t, 16), vg = C.crackVigenere(t, 16), ks = C.kasiski(t), W = 620, H = 170, bw = (W - 40) / kl.length, mx = Math.max(0.075, Math.max.apply(null, kl.map(function (x) { return x.ioc; })));
			var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Index of coincidence by key length">';
			var yE = H - 22 - C.IOC_EN / mx * (H - 36); s += '<line x1="34" x2="' + W + '" y1="' + yE + '" y2="' + yE + '" class="cg-enline"/><text x="' + (W - 4) + '" y="' + (yE - 4) + '" class="cg-axis" text-anchor="end">English 0.067</text>';
			kl.forEach(function (x, i) { var hh = x.ioc / mx * (H - 36), xx = 36 + i * bw; s += '<rect x="' + (xx + 3) + '" y="' + (H - 22 - hh) + '" width="' + (bw - 6) + '" height="' + hh + '" class="cg-bar' + (x.len === vg.len ? " is-pick" : "") + '"><title>Key length ' + x.len + ": " + x.ioc.toFixed(4) + "</title></rect><text x=\"" + (xx + bw / 2) + '" y="' + (H - 6) + '" class="cg-axis" text-anchor="middle">' + x.len + "</text>"; });
			s += "</svg>";
			var facs = Object.keys(ks.factors).sort(function (a, b) { return ks.factors[b] - ks.factors[a]; }).slice(0, 5);
			h += '<div class="tu-card"><h2 class="cg-h">If it is a Vigenère cipher</h2><p class="cg-note">Split the letters into columns for each possible key length. When the length is right, every column is a plain Caesar shift and looks like English (high bar). Best length: <b>' + vg.len + "</b>, key <b>" + esc(vg.key) + "</b>.</p>" + s +
				'<p class="cg-note"><b>Kasiski test:</b> ' + (ks.reps.length ? ks.reps.length + " repeated 3-letter groups; their distances are most often divisible by " + facs.map(function (f) { return f + " (" + ks.factors[f] + "×)"; }).join(", ") + ". The key length is usually one of those." : "no repeated 3-letter groups found (the message may be too short).") + "</p></div>";
		}
		out.innerHTML = h;
		out.querySelector("[data-cp]").onclick = function () { copy(b.text); };
		out.querySelector("[data-use]").onclick = function () {
			$("cg-c").value = b.type; S.dir = "dec"; paintDir("dec");
			if (b.type === "caesar") $("cg-shift").value = b.k; if (b.type === "affine") { $("cg-aa").value = b.a; $("cg-ab").value = b.b; } if (b.type === "vigenere") $("cg-key").value = b.key;
			$("cg-in").value = t; runCipher(); showTab("cipher", true); root.scrollIntoView({ behavior: "smooth" });
		};
	}

	/* =================== RSA =================== */
	var KEYOBJ = null;
	function initRsa() {
		if (S.rp) { $("cg-p").value = S.rp; $("cg-q").value = S.rq; $("cg-e").value = S.re || ""; }
		if (S.rmsg) $("cg-rmsg").value = S.rmsg;
		$("cg-rsago").onclick = makeKeys; ["cg-p", "cg-q", "cg-e"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") makeKeys(); }); });
		seg("cg-bits", "", function (b) { randomKeys(+b); }, "b");
		seg("cg-rmode", S.rmode, function (v) { S.rmode = v; save(); if (v === "num" && !/^\d+$/.test($("cg-rmsg").value)) $("cg-rmsg").value = "65"; if (v === "text" && /^\d+$/.test($("cg-rmsg").value)) $("cg-rmsg").value = "Hi MES!"; rsaMsg(); });
		$("cg-rmsg").addEventListener("input", rsaMsg);
		$("cg-rsacrack").onclick = rsaCrack;
		makeKeys();
	}
	function randomKeys(bits) {
		$("cg-rsakey").innerHTML = '<p class="cg-wait">Finding two random ' + bits + "-bit primes…</p>"; err("cg-rsaerr");
		setTimeout(function () {
			var t0 = performance.now(), p = C.randomPrime(bits, rnd), qq; do { qq = C.randomPrime(bits, rnd); } while (qq === p);
			$("cg-p").value = p.toString(); $("cg-q").value = qq.toString(); $("cg-e").value = bits >= 32 ? "65537" : ""; makeKeys(performance.now() - t0);
		}, 30);
	}
	function makeKeys(ms) {
		var p = C.big($("cg-p").value), qq = C.big($("cg-q").value), e = $("cg-e").value.trim() ? C.big($("cg-e").value) : null;
		if (p === null || qq === null || ($("cg-e").value.trim() && e === null)) { err("cg-rsaerr", "p, q and e must be whole numbers."); return; }
		var k = C.rsaKey(p, qq, e); if (k.err) { err("cg-rsaerr", k.err); KEYOBJ = null; $("cg-rsakey").innerHTML = ""; $("cg-rsamsg").innerHTML = ""; return; }
		err("cg-rsaerr"); KEYOBJ = k; S.rp = $("cg-p").value; S.rq = $("cg-q").value; S.re = $("cg-e").value; save();
		var big = k.bits > 80;
		var h = '<div class="tu-stats cg-keys">' +
			kv("n = p × q", k.n, k.bits + "-bit modulus · public") + kv("φ(n) = (p − 1)(q − 1)", k.phi, "secret") + kv("e (public exponent)", k.e, "gcd(e, φ) = 1") + kv("d = e⁻¹ mod φ(n)", k.d, "private key") + "</div>";
		h += '<div class="cg-keypair"><div class="cg-kp cg-kp--pub"><b>Public key</b> (share it): e = ' + esc(short(k.e)) + ", n = " + esc(short(k.n)) + '</div><div class="cg-kp cg-kp--priv"><b>Private key</b> (keep it): d = ' + esc(short(k.d)) + "</div></div>";
		h += '<p class="cg-note">Check: e × d = ' + esc(short(k.e * k.d)) + " = " + esc(short(k.e * k.d / k.phi)) + " × φ(n) + 1 ✓" + (ms ? " · primes found in " + Math.round(ms) + " ms" : "") + ' · <a href="/primes?n=' + p + '">Check p in Prime Numbers ›</a></p>';
		var st = k.steps;
		if (st.length <= 60) h += '<details class="cg-more"><summary>How d was found (extended Euclidean algorithm)</summary><div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>q</th><th>remainder r</th><th>s</th><th>t</th></tr></thead><tbody>' +
			st.map(function (r) { return "<tr><td>" + (r.q === null ? "" : esc(short(r.q, 30))) + "</td><td>" + esc(short(r.r, 30)) + "</td><td>" + esc(short(r.s, 30)) + "</td><td>" + esc(short(r.t, 30)) + "</td></tr>"; }).join("") + '</tbody></table></div><p class="cg-note">Each row: r = s·φ(n) + t·e. When r reaches 1, t is the inverse of e (taken mod φ(n)): d = ' + esc(short(k.d)) + ".</p></details>";
		$("cg-rsakey").innerHTML = h; $("cg-rsacrout").innerHTML = ""; rsaMsg();
	}
	function kv(l, v, sub) { return '<div class="tu-stat"><span class="tu-stat__label">' + esc(l) + '</span><span class="tu-stat__value cg-num-v">' + esc(short(v, 44)) + '</span><span class="tu-stat__sub">' + esc(sub) + "</span></div>"; }
	function rsaMsg() {
		var out = $("cg-rsamsg"), k = KEYOBJ; S.rmsg = $("cg-rmsg").value.slice(0, 400); save();
		$("cg-rmsglab").textContent = S.rmode === "num" ? "A number smaller than n" : "Message (encrypted with the public key e, n)";
		if (!k) { out.innerHTML = ""; return; }
		if (S.rmode === "num") {
			var m = C.big(S.rmsg); if (m === null || m < 0n) { out.innerHTML = '<p class="cg-err">Type a whole number.</p>'; return; }
			if (m >= k.n) { out.innerHTML = '<p class="cg-err">The number must be smaller than n = ' + esc(short(k.n)) + ".</p>"; return; }
			var enc = C.modpowSteps(m, k.e, k.n), dec = C.modpowSteps(enc.result, k.d, k.n);
			out.innerHTML = '<div class="cg-flow"><div><span class="cg-fl">Message m</span><b>' + esc(short(m)) + '</b></div><div class="cg-arr">→ m<sup>e</sup> mod n →</div><div><span class="cg-fl">Encrypted c</span><b>' + esc(short(enc.result)) + '</b></div><div class="cg-arr">→ c<sup>d</sup> mod n →</div><div><span class="cg-fl">Decrypted</span><b>' + esc(short(dec.result)) + (dec.result === m ? " ✓" : "") + "</b></div></div>" + stepsTable(enc, "m", k.e);
			return;
		}
		var tb = C.textToBlocks(S.rmsg, k.n); if (tb.err) { out.innerHTML = '<p class="cg-err">' + esc(tb.err) + "</p>"; return; }
		var rows = tb.blocks.map(function (b) { var c = C.modpowSteps(b.m, k.e, k.n).result; return { m: b.m, c: c, d: C.modpowSteps(c, k.d, k.n).result }; });
		var back = C.blocksToText(rows.map(function (r) { return r.d; }), tb.k, tb.blocks[tb.blocks.length - 1].len);
		var h = '<p class="cg-note">The text becomes bytes (UTF-8), packed ' + tb.k + " byte" + (tb.k > 1 ? "s" : "") + " at a time into numbers smaller than n. Each number is encrypted on its own.</p>";
		h += '<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>Block</th><th>Number m</th><th>Encrypted c = m<sup>e</sup> mod n</th><th>Decrypted c<sup>d</sup> mod n</th></tr></thead><tbody>' +
			rows.slice(0, 40).map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(short(r.m, 34)) + "</td><td>" + esc(short(r.c, 34)) + "</td><td>" + esc(short(r.d, 34)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
		var ctext = rows.map(function (r) { return r.c.toString(); }).join(" ");
		h += '<p class="cg-status"><b>Back to text:</b> ' + esc(back === null ? "(could not decode)" : back) + (back === S.rmsg ? " ✓" : "") + '</p><div class="cg-acts"><button type="button" class="tu-btn tu-btn--ghost" id="cg-rcopy">Copy the encrypted numbers</button></div>';
		h += '<p class="cg-note">This is “textbook RSA”: the same block always encrypts the same way, so it leaks patterns. Real RSA adds random padding (OAEP) and mostly encrypts a short AES key, not the message itself.</p>';
		out.innerHTML = h; $("cg-rcopy").onclick = function () { copy(ctext); };
	}
	function stepsTable(st, base, e) {
		var rows = st.rows, show = rows.length <= 70 ? rows : rows.slice(0, 30).concat([null]).concat(rows.slice(-20));
		return '<details class="cg-more"' + (rows.length <= 20 ? " open" : "") + '><summary>Square and multiply: ' + rows.length + " steps instead of " + esc(short(e)) + ' multiplications</summary><p class="cg-note">e in binary is ' + esc(short(st.bits, 70)) + ". Go through the bits from the left: square the running result every time, and also multiply by " + base + " when the bit is 1.</p><div class=\"tu-table-wrap\"><table class=\"tu-table cg-tab\"><thead><tr><th>Bit</th><th>Square</th><th>Result</th></tr></thead><tbody>" +
			show.map(function (r) { return r ? "<tr><td>" + r.bit + "</td><td>" + esc(short(r.sq, 32)) + "</td><td>" + esc(short(r.r, 32)) + "</td></tr>" : '<tr><td colspan="3">…</td></tr>'; }).join("") + "</tbody></table></div></details>";
	}
	function rsaCrack() {
		var k = KEYOBJ, out = $("cg-rsacrout"); if (!k) return;
		out.innerHTML = '<p class="cg-wait">Trying to factor n = ' + esc(short(k.n)) + " …</p>";
		setTimeout(function () {
			var t0 = performance.now(), r = C.rsaCrack(k.n, k.e, 4000), ms = performance.now() - t0;
			if (r.ok) out.innerHTML = '<div class="cg-hero cg-bad"><span class="cg-badge">Broken in ' + (ms < 1000 ? Math.max(1, Math.round(ms)) + " ms" : (ms / 1000).toFixed(1) + " s") + '</span><p>n = ' + esc(short(r.key.p)) + " × " + esc(short(r.key.q)) + ", so the attacker computes φ(n) and the private key d = " + esc(short(r.key.d)) + ". Every message can now be read.</p></div>";
			else out.innerHTML = '<div class="cg-hero cg-good"><span class="cg-badge">Not broken</span><p>No factor found in ' + (ms / 1000).toFixed(1) + " s. A " + k.bits + "-bit n made of two equal-size primes is out of reach for a browser" + (k.bits >= 1024 ? "; the best known methods would need enormous computing power for 2048 bits." : ". Bigger computers with the number field sieve break up to about 830 bits.") + "</p></div>";
		}, 30);
	}

	/* =================== Diffie-Hellman =================== */
	function initDh() {
		["cg-dp", "cg-dg", "cg-da", "cg-db"].forEach(function (id) { $(id).addEventListener("input", runDh); });
		seg("cg-dbits", "", function (b) { randomDh(+b); }, "b");
		drawPaint(); runDh();
	}
	function randomDh(bits) {
		var p = bits <= 8 ? P.nextPrime(BigInt(40 + Math.floor(Math.random() * 200))) : null;
		if (!p) { var qq; for (var i = 0; i < 400; i++) { qq = C.randomPrime(bits - 1, rnd); p = 2n * qq + 1n; if (P.isPrime(p)) break; } }   // safe prime: g = 2 or small works
		var g = C.smallestRoot(p) || 2n;
		$("cg-dp").value = p.toString(); $("cg-dg").value = g.toString();
		$("cg-da").value = C.randBig(2n, p - 1n, rnd).toString(); $("cg-db").value = C.randBig(2n, p - 1n, rnd).toString(); runDh();
	}
	function runDh() {
		var p = C.big($("cg-dp").value), g = C.big($("cg-dg").value), a = C.big($("cg-da").value), b = C.big($("cg-db").value), out = $("cg-dhout");
		if ([p, g, a, b].some(function (x) { return x === null || x < 1n; })) { err("cg-dherr", "Type whole numbers above 0."); out.innerHTML = ""; return; }
		if (!P.isPrime(p)) { err("cg-dherr", "p must be a prime. Next prime: " + P.nextPrime(p) + "."); out.innerHTML = ""; return; }
		err("cg-dherr");
		var r = C.dh(p, g, a, b), root = C.isPrimitiveRoot(g, p);
		var h = '<div class="cg-dh"><div class="cg-dhcol"><h3>Alice</h3><p>secret a = <b>' + esc(short(a, 30)) + "</b></p><p>sends A = g<sup>a</sup> mod p</p><p class=\"cg-big\">" + esc(short(r.A, 30)) + "</p><p>secret = B<sup>a</sup> mod p</p><p class=\"cg-big cg-sec\">" + esc(short(r.sA, 30)) + '</p></div>' +
			'<div class="cg-dhcol cg-dhcol--eve"><h3>Eve hears</h3><p>p = ' + esc(short(p, 30)) + "</p><p>g = " + esc(short(g, 30)) + "</p><p>A = " + esc(short(r.A, 30)) + "</p><p>B = " + esc(short(r.B, 30)) + '</p></div>' +
			'<div class="cg-dhcol"><h3>Bob</h3><p>secret b = <b>' + esc(short(b, 30)) + "</b></p><p>sends B = g<sup>b</sup> mod p</p><p class=\"cg-big\">" + esc(short(r.B, 30)) + "</p><p>secret = A<sup>b</sup> mod p</p><p class=\"cg-big cg-sec\">" + esc(short(r.sB, 30)) + "</p></div></div>";
		h += '<p class="cg-status">' + (r.sA === r.sB ? "✓ Both get the same secret, because (g<sup>b</sup>)<sup>a</sup> = (g<sup>a</sup>)<sup>b</sup> = g<sup>ab</sup>." : "") + (root === false ? " Note: g is not a primitive root of p, so it only reaches some of the numbers (a smaller, weaker group)." : root ? " g is a primitive root of p: its powers reach every number 1 … p − 1." : "") + "</p>";
		if (p <= 1000000000000n) {
			var t0 = performance.now(), dl = C.dlog(g, r.A, p), ms = performance.now() - t0;
			h += '<div class="cg-hero cg-bad"><span class="cg-badge">Eve wins (p is small)</span><p>Eve solves g<sup>x</sup> ≡ A (mod p) with baby-step giant-step in ' + grp(dl.steps) + " steps (" + Math.max(1, Math.round(ms)) + " ms): x = " + esc(dl.x) + ", then the secret = B<sup>x</sup> mod p = " + esc(short(P.modpow(r.B, dl.x, p))) + ".</p></div>";
		} else {
			var bits = C.bitLen(p), steps = Math.pow(2, bits / 2);
			h += '<div class="cg-hero cg-good"><span class="cg-badge">Eve is stuck</span><p>Working back from A to a is the <b>discrete logarithm</b> problem. Baby-step giant-step would need about 2<sup>' + Math.round(bits / 2) + "</sup> ≈ " + sci(steps) + " steps for this " + bits + "-bit p. Real systems use 2048-bit primes or elliptic curves.</p></div>";
		}
		out.innerHTML = h;
	}
	function mix(a, b) { return [Math.round((a[0] + b[0]) / 2 * 0.95), Math.round((a[1] + b[1]) / 2 * 0.95), Math.round((a[2] + b[2]) / 2 * 0.95)]; }
	function drawPaint() {
		var Y = [240, 200, 40], R = [210, 50, 60], Bl = [40, 90, 220], AY = mix(Y, R), BY = mix(Y, Bl), Sk = mix(AY, Bl);
		function rgb(c) { return "rgb(" + c.join(",") + ")"; }
		function pot(x, y, c, lab, sub) { return '<g transform="translate(' + x + " " + y + ')"><path d="M-26 -18 L26 -18 L22 22 Q0 30 -22 22 Z" fill="' + rgb(c) + '" class="cg-pot"/><text y="44" class="cg-pl">' + lab + "</text>" + (sub ? '<text y="60" class="cg-ps">' + sub + "</text>" : "") + "</g>"; }
		var s = '<svg viewBox="0 0 640 420" class="cg-svg cg-paintsvg" role="img" aria-label="Diffie-Hellman paint mixing">' +
			'<text x="110" y="24" class="cg-ph">Alice</text><text x="320" y="24" class="cg-ph">Public</text><text x="530" y="24" class="cg-ph">Bob</text>' +
			'<line x1="215" y1="34" x2="215" y2="410" class="cg-dash"/><line x1="425" y1="34" x2="425" y2="410" class="cg-dash"/>' +
			pot(320, 70, Y, "common paint", "everyone sees it") + pot(110, 70, R, "Alice's secret", "never sent") + pot(530, 70, Bl, "Bob's secret", "never sent") +
			pot(110, 190, AY, "mix", "secret + common") + pot(530, 190, BY, "mix", "secret + common") +
			pot(270, 190, AY, "sent →", "") + pot(370, 190, BY, "← sent", "") +
			pot(110, 330, Sk, "shared secret", "+ her secret") + pot(530, 330, Sk, "shared secret", "+ his secret") +
			'<text x="320" y="300" class="cg-ps">Eve sees the common paint and both mixes,</text><text x="320" y="318" class="cg-ps">but can\'t un-mix them to get either secret.</text>' +
			'<path d="M110 102 L110 160 M530 102 L530 160 M140 190 L238 190 M500 190 L402 190 M370 222 Q250 280 140 318 M270 222 Q390 280 500 318" class="cg-arrowp"/></svg>';
		$("cg-paint").innerHTML = s;
	}

	/* =================== Hashes =================== */
	var subtle = window.crypto && crypto.subtle;
	function initHash() {
		if (S.hin) $("cg-hin").value = S.hin;
		$("cg-hin").addEventListener("input", runHash); ["cg-av1", "cg-av2"].forEach(function (id) { $(id).addEventListener("input", runAv); });
		var drop = $("cg-hdrop"), f = $("cg-hfile");
		drop.onclick = function () { f.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.click(); } };
		f.onchange = function () { if (f.files[0]) hashFile(f.files[0]); f.value = ""; };
		dropZone(drop, hashFile);
		runHash(); runAv();
	}
	function dropZone(el, fn) {
		el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("is-over"); });
		el.addEventListener("dragleave", function () { el.classList.remove("is-over"); });
		el.addEventListener("drop", function (e) { e.preventDefault(); el.classList.remove("is-over"); var file = e.dataTransfer.files && e.dataTransfer.files[0]; if (file) fn(file); });
	}
	function hrow(name, hex, note) { return '<div class="cg-hrow"><span class="cg-hn">' + name + (note ? ' <small>' + note + "</small>" : "") + '</span><code class="cg-hv">' + hex + '</code><button type="button" class="tu-btn tu-btn--ghost cg-hc" data-h="' + hex + '" aria-label="Copy ' + name + '">Copy</button></div>'; }
	function hexOf(buf) { return C.hex(new Uint8Array(buf)); }
	var hashSeq = 0;
	function runHash() {
		var t = $("cg-hin").value; S.hin = t.slice(0, 5000); save(); var b = C.utf8(t), seq = ++hashSeq;
		var base = hrow("MD5", C.md5(b), "broken, don't use for security") + hrow("SHA-256", C.sha256(b)) + hrow("CRC32", C.crc32(b), "error check, not security");
		$("cg-hout").innerHTML = base;
		if (!subtle) return;
		Promise.all(["SHA-1", "SHA-384", "SHA-512"].map(function (n) { return subtle.digest(n, b); })).then(function (r) {
			if (seq !== hashSeq) return;
			$("cg-hout").innerHTML = hrow("MD5", C.md5(b), "broken, don't use for security") + hrow("SHA-1", hexOf(r[0]), "weak since 2017") + hrow("SHA-256", C.sha256(b)) + hrow("SHA-384", hexOf(r[1])) + hrow("SHA-512", hexOf(r[2])) + hrow("CRC32", C.crc32(b), "error check, not security");
		});
	}
	root.addEventListener("click", function (e) { var c = e.target.closest("[data-h]"); if (c) copy(c.dataset.h, "Hash copied"); });
	function hashFile(file) {
		var out = $("cg-hfout"); out.innerHTML = '<p class="cg-wait">Reading ' + esc(file.name) + "…</p>";
		file.arrayBuffer().then(function (ab) {
			var b = new Uint8Array(ab), jobs = subtle ? ["SHA-1", "SHA-256", "SHA-512"].map(function (n) { return subtle.digest(n, ab); }) : [];
			return Promise.all(jobs).then(function (r) {
				var h = '<p class="cg-status"><b>' + esc(file.name) + "</b> · " + grp(file.size) + " bytes</p>";
				if (b.length <= 128 * 1024 * 1024) h += hrow("MD5", C.md5(b));
				if (r.length) h += hrow("SHA-1", hexOf(r[0])) + hrow("SHA-256", hexOf(r[1])) + hrow("SHA-512", hexOf(r[2])); else h += hrow("SHA-256", C.sha256(b));
				h += hrow("CRC32", C.crc32(b)) + '<p class="cg-note">Compare the SHA-256 with the one the download site lists: if even one character differs, the file is not the same.</p>';
				out.innerHTML = h;
			});
		}).catch(function () { out.innerHTML = '<p class="cg-err">Could not read that file (too big for the browser?).</p>'; });
	}
	function runAv() {
		var a = C.sha256($("cg-av1").value), b = C.sha256($("cg-av2").value), A = C.bitsOf(a), B = C.bitsOf(b), d = 0, h = "";
		for (var i = 0; i < 256; i++) { var diff = A[i] !== B[i]; if (diff) d++; h += '<span class="' + (diff ? "is-diff " : "") + (A[i] === "1" ? "b1" : "b0") + '"></span>'; }
		$("cg-avbits").innerHTML = h;
		$("cg-avstat").innerHTML = "<b>" + d + " of 256 bits differ</b> (" + Math.round(d / 2.56) + "%)" + (d === 0 ? " — the two texts are the same." : ". Random would be about 128.") + '<br><code class="cg-hv cg-hv--sm">A: ' + a + '</code><br><code class="cg-hv cg-hv--sm">B: ' + b + "</code>";
	}

	/* =================== AES =================== */
	function initAes() {
		$("cg-pwshow").onclick = function () { var p = $("cg-pw"); p.type = p.type === "password" ? "text" : "password"; $("cg-pwshow").textContent = p.type === "password" ? "Show" : "Hide"; };
		$("cg-pw").addEventListener("input", pwStrength); pwStrength();
		if (!subtle) { err("cg-aerr", "Your browser has no Web Crypto here (it needs a secure https page)."); return; }
		$("cg-aenc").onclick = function () { aesText(true); }; $("cg-adec").onclick = function () { aesText(false); };
		$("cg-acopy").onclick = function () { copy($("cg-aout").value); };
		var drop = $("cg-afdrop"), f = $("cg-afile");
		drop.onclick = function () { f.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.click(); } };
		f.onchange = function () { if (f.files[0]) aesFile(f.files[0]); f.value = ""; }; dropZone(drop, aesFile);
	}
	function fmtTime(sec) {
		if (sec < 1) return "less than a second"; var u = [["years", 31557600], ["days", 86400], ["hours", 3600], ["minutes", 60], ["seconds", 1]];
		for (var i = 0; i < u.length; i++) if (sec >= u[i][1]) { var v = sec / u[i][1]; if (u[i][0] === "years" && v > 1e6) return "about " + sci(v) + " years"; return "about " + (v < 10 ? v.toFixed(1) : grp(Math.round(v))) + " " + u[i][0]; }
	}
	function pwStrength() {
		var pw = $("cg-pw").value, s = C.passwordSpace(pw), st = $("cg-pwst");
		if (!pw) { st.textContent = "Use a long passphrase: four or five random words beat a short password with symbols."; st.className = "cg-status"; return; }
		var sec = Math.pow(2, s.bits) / 2 / 1e5;
		st.innerHTML = "About <b>" + Math.round(s.bits) + " bits</b> if it were random. A guessing attack with a strong graphics card (~100,000 guesses a second against 250,000 PBKDF2 rounds) would need " + fmtTime(sec) + ". Dictionary words and names fall much faster.";
		st.className = "cg-status " + (s.bits < 40 ? "cg-weak" : s.bits < 64 ? "cg-medium" : "cg-strong");
	}
	function deriveKey(pw, salt) {
		return subtle.importKey("raw", C.utf8(pw), "PBKDF2", false, ["deriveKey"]).then(function (k) { return subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: C.PBKDF2_ITER, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); });
	}
	function aesText(enc) {
		var pw = $("cg-pw").value, t = $("cg-ain").value; err("cg-aerr");
		if (!pw) { err("cg-aerr", "Type a password first."); $("cg-pw").focus(); return; }
		if (enc) {
			if (!t) { err("cg-aerr", "Type a message to encrypt."); return; }
			var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
			deriveKey(pw, salt).then(function (k) { return subtle.encrypt({ name: "AES-GCM", iv: iv }, k, C.utf8(t)); }).then(function (ct) { $("cg-aout").value = C.pack(salt, iv, new Uint8Array(ct)); toast("Encrypted"); });
		} else {
			var u = C.unpack(t); if (!u) { err("cg-aerr", "That is not an MES1… text. Paste the whole thing, starting with MES1."); return; }
			deriveKey(pw, u.salt).then(function (k) { return subtle.decrypt({ name: "AES-GCM", iv: u.iv }, k, u.ct); }).then(function (pt) { $("cg-aout").value = C.fromUtf8(new Uint8Array(pt)); toast("Decrypted"); }, function () { err("cg-aerr", "Wrong password, or the text was changed (AES-GCM notices any change)."); });
		}
	}
	var MAGIC = C.utf8("MESENC1");
	function aesFile(file) {
		var pw = $("cg-pw").value, st = $("cg-afst"); if (!pw) { st.innerHTML = '<span class="cg-err">Type a password above first.</span>'; $("cg-pw").focus(); return; }
		st.textContent = "Working on " + file.name + "…";
		file.arrayBuffer().then(function (ab) {
			var b = new Uint8Array(ab), isEnc = b.length > 7 + 28 && MAGIC.every(function (x, i) { return b[i] === x; });
			if (isEnc) {
				var salt = b.slice(7, 23), iv = b.slice(23, 35), ct = b.slice(35);
				return deriveKey(pw, salt).then(function (k) { return subtle.decrypt({ name: "AES-GCM", iv: iv }, k, ct); }).then(function (pt) {
					var p = new Uint8Array(pt), nl = p[0] << 8 | p[1], name = C.fromUtf8(p.slice(2, 2 + nl)) || "decrypted";
					download(p.slice(2 + nl), name); st.textContent = "Decrypted: " + name + " (" + grp(p.length - 2 - nl) + " bytes) saved to your downloads.";
				}, function () { st.innerHTML = '<span class="cg-err">Wrong password, or the file was changed.</span>'; });
			}
			var nm = C.utf8(file.name).slice(0, 1000), payload = new Uint8Array(2 + nm.length + b.length); payload[0] = nm.length >> 8; payload[1] = nm.length & 255; payload.set(nm, 2); payload.set(b, 2 + nm.length);
			var s2 = crypto.getRandomValues(new Uint8Array(16)), iv2 = crypto.getRandomValues(new Uint8Array(12));
			return deriveKey(pw, s2).then(function (k) { return subtle.encrypt({ name: "AES-GCM", iv: iv2 }, k, payload); }).then(function (ct2) {
				var c = new Uint8Array(ct2), outb = new Uint8Array(7 + 28 + c.length); outb.set(MAGIC); outb.set(s2, 7); outb.set(iv2, 23); outb.set(c, 35);
				download(outb, file.name.replace(/\.[^.]*$/, "") + ".mesenc"); st.textContent = "Encrypted to " + file.name.replace(/\.[^.]*$/, "") + ".mesenc (the real name is hidden inside). Drop it here with the same password to get the file back.";
			});
		}).catch(function () { st.innerHTML = '<span class="cg-err">Could not read that file.</span>'; });
	}
	function download(bytes, name) { var u = URL.createObjectURL(new Blob([bytes])), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

	/* =================== Encoders =================== */
	function initEnc() {
		$("cg-ef").value = S.ef; if (S.ein) $("cg-ein").value = S.ein;
		var paint = seg("cg-edir", S.edir, function (v) { S.edir = v; runEnc(); });
		["cg-ef", "cg-ein", "cg-exk"].forEach(function (id) { $(id).addEventListener("input", runEnc); });
		$("cg-eswap").onclick = function () { $("cg-ein").value = $("cg-eout").value; S.edir = S.edir === "enc" ? "dec" : "enc"; paint(S.edir); runEnc(); };
		$("cg-ecopy").onclick = function () { copy($("cg-eout").value); };
		$("cg-eplay").onclick = playMorse; runEnc();
	}
	function runEnc() {
		S.ef = $("cg-ef").value; S.ein = $("cg-ein").value.slice(0, 20000); save();
		var f = S.ef, t = S.ein, dec = S.edir === "dec", r = null, msg = "";
		$("cg-exkw").hidden = f !== "xor"; $("cg-eplay").hidden = f !== "morse";
		try {
			if (f === "b64" || f === "b64u") { if (dec) { var b = C.fromB64(t); r = b ? C.fromUtf8(b) : null; } else r = C.b64(C.utf8(t), f === "b64u"); }
			else if (f === "hex") { if (dec) { var h = C.fromHex(t); r = h ? C.fromUtf8(h) : null; } else r = C.hex(C.utf8(t)).replace(/(..)/g, "$1 ").trim(); }
			else if (f === "bin") { if (dec) { var bb = C.fromBinary(t); r = bb ? C.fromUtf8(bb) : null; } else r = C.binary(C.utf8(t)); }
			else if (f === "morse") r = dec ? C.fromMorse(t) : C.morse(t);
			else if (f === "url") r = dec ? decodeURIComponent(t.replace(/\+/g, " ")) : encodeURIComponent(t);
			else if (f === "rot47") r = C.rot47(t);
			else if (f === "xor") { var k = C.utf8($("cg-exk").value); if (dec) { var x = C.fromHex(t); r = x ? C.fromUtf8(C.xor(x, k)) : null; } else r = C.hex(C.xor(C.utf8(t), k)); }
		} catch (e) { r = null; }
		if (r === null && t) msg = dec ? "That doesn't decode as " + $("cg-ef").selectedOptions[0].textContent + " (or it isn't text)." : "";
		err("cg-eerr", msg); $("cg-eout").value = r || "";
	}
	var actx = null;
	function playMorse() {
		var m = S.edir === "dec" ? $("cg-ein").value : $("cg-eout").value; if (!m.trim()) return;
		actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var t = actx.currentTime + 0.05, u = 0.08;
		var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 650; g.gain.value = 0; o.connect(g); g.connect(actx.destination);
		Array.from(m).forEach(function (ch) {
			if (ch === "." || ch === "-") { var d = ch === "." ? u : 3 * u; g.gain.setValueAtTime(0.25, t); g.gain.setValueAtTime(0, t + d); t += d + u; }
			else if (ch === " ") t += 2 * u; else if (ch === "/") t += 4 * u;
		});
		o.start(); o.stop(t + 0.1);
	}

	/* =================== Modular maths =================== */
	function initMod() {
		["cg-ma", "cg-me", "cg-mm"].forEach(function (id) { $(id).addEventListener("input", runModpow); });
		["cg-ia", "cg-im"].forEach(function (id) { $(id).addEventListener("input", runInv); });
		["cg-clm", "cg-cls", "cg-cla"].forEach(function (id) { $(id).addEventListener("input", drawClock); });
		runModpow(); runInv(); drawClock();
	}
	function runModpow() {
		var a = C.big($("cg-ma").value), e = C.big($("cg-me").value), m = C.big($("cg-mm").value), out = $("cg-mout");
		if (a === null || e === null || m === null || e < 0n || m < 1n) { err("cg-merr", "Whole numbers please, with e ≥ 0 and m ≥ 1."); out.innerHTML = ""; return; }
		err("cg-merr"); var st = C.modpowSteps(a, e, m);
		out.innerHTML = '<p class="cg-big-ans">' + esc(short(a, 30)) + "<sup>" + esc(short(e, 24)) + "</sup> mod " + esc(short(m, 30)) + " = <b>" + esc(short(st.result)) + "</b></p>" + stepsTable(st, "a", e) + '<p class="cg-note">This is the one operation RSA and Diffie–Hellman are built on: easy forwards even for 600-digit numbers, but very hard to undo.</p>';
	}
	function runInv() {
		var a = C.big($("cg-ia").value), m = C.big($("cg-im").value), out = $("cg-iout");
		if (a === null || m === null || m < 2n) { out.innerHTML = '<p class="cg-err">Whole numbers, with mod at least 2.</p>'; return; }
		var g = P.gcd(C.mod(a, m), m), inv = P.modInverse(a, m), st = C.egcdSteps(m, C.mod(a, m));
		var h = inv === null ? '<p class="cg-err">' + esc(a) + " has no inverse mod " + esc(m) + ": they share the factor " + esc(g) + ' (gcd ≠ 1). <a href="/primes?g=' + a + "," + m + '">See why in Prime Numbers ›</a></p>' : '<p class="cg-big-ans">' + esc(short(a, 30)) + "<sup>−1</sup> mod " + esc(short(m, 30)) + " = <b>" + esc(short(inv)) + '</b></p><p class="cg-note">Check: ' + esc(short(a, 30)) + " × " + esc(short(inv, 30)) + " = " + esc(short(a * inv, 40)) + " ≡ 1 (mod " + esc(short(m, 30)) + ")</p>";
		if (st.length <= 60) h += '<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>q</th><th>r</th><th>s</th><th>t</th></tr></thead><tbody>' + st.map(function (r) { return "<tr><td>" + (r.q === null ? "" : esc(short(r.q, 26))) + "</td><td>" + esc(short(r.r, 26)) + "</td><td>" + esc(short(r.s, 26)) + "</td><td>" + esc(short(r.t, 26)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
		out.innerHTML = h;
	}
	function drawClock() {
		var m = +$("cg-clm").value, s0 = +$("cg-cls").value, add = +$("cg-cla").value; $("cg-cls").max = m - 1; if (s0 > m - 1) { s0 = m - 1; $("cg-cls").value = s0; }
		$("cg-clmv").textContent = m; $("cg-clsv").textContent = s0; $("cg-clav").textContent = add;
		var end = (s0 + add) % m, s = '<svg viewBox="-150 -150 300 300" class="cg-svg cg-clocksvg" role="img" aria-label="Clock arithmetic"><circle r="120" class="cg-w1"/>';
		for (var i = 0; i < m; i++) { var a = i / m * 2 * Math.PI - Math.PI / 2; s += '<circle cx="' + (Math.cos(a) * 120).toFixed(1) + '" cy="' + (Math.sin(a) * 120).toFixed(1) + '" r="' + (i === end ? 15 : i === s0 ? 12 : 4) + '" class="' + (i === end ? "cg-cend" : i === s0 ? "cg-cstart" : "cg-cdot") + '"/><text x="' + (Math.cos(a) * 98).toFixed(1) + '" y="' + (Math.sin(a) * 98 + 5).toFixed(1) + '" class="cg-wt">' + i + "</text>"; }
		var a0 = s0 / m * 2 * Math.PI - Math.PI / 2, a1 = (s0 + add) / m * 2 * Math.PI - Math.PI / 2, r = 70, laps = Math.floor((s0 + add) / m);
		if (add) { var pts = []; for (var k = 0; k <= 80; k++) { var aa = a0 + (a1 - a0) * k / 80, rr = r - 30 * k / 80 * (laps > 0 ? 1 : 0.3); pts.push((Math.cos(aa) * rr).toFixed(1) + " " + (Math.sin(aa) * rr).toFixed(1)); } s += '<path d="M' + pts.join(" L") + '" class="cg-carc"/>'; }
		s += '<text y="6" class="cg-wk">' + end + "</text></svg>";
		$("cg-clock").innerHTML = s + '<p class="cg-status">(' + s0 + " + " + add + ") mod " + m + " = " + (s0 + add) + " mod " + m + " = <b>" + end + "</b>" + (laps ? " (" + laps + " full lap" + (laps > 1 ? "s" : "") + ")" : "") + ". The Caesar cipher is exactly this with m = 26.</p>";
	}

	showTab(S.tab);
	window.MESCryptoDebug = { S: S, showTab: showTab, runCipher: runCipher, doCrack: function () { if (!inited.crack) { inited.crack = 1; initCrack(); } doCrack(); } };
})();
