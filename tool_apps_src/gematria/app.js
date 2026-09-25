/* MES Gematria Calculator -- mes.fm/gematria
 * Ciphers over the 26 Latin letters (accents stripped; digits optional) plus Hebrew (Mispar Hechrachi) when Hebrew
 * letters are typed. State lives in ?q=... so a result can be shared.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var HEB = { "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40,
		"נ": 50, "ן": 50, "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400 };
	function std(i) { return i < 9 ? i + 1 : i < 18 ? (i - 8) * 10 : (i - 17) * 100; }
	var SYSTEMS = [
		{ id: "ordinal", name: "Ordinal", note: "A=1 … Z=26", f: function (i) { return i + 1; } },
		{ id: "reverse", name: "Reverse Ordinal", note: "A=26 … Z=1", f: function (i) { return 26 - i; } },
		{ id: "reduction", name: "Reduction", note: "Pythagorean, 1–9 cycle", f: function (i) { return i % 9 + 1; } },
		{ id: "rreduction", name: "Reverse Reduction", note: "1–9 cycle from Z", f: function (i) { return (25 - i) % 9 + 1; } },
		{ id: "standard", name: "Standard", note: "A–I 1–9, J–R 10–90, S–Z 100–800", f: std },
		{ id: "sumerian", name: "Sumerian", note: "Ordinal × 6", f: function (i) { return (i + 1) * 6; } },
		{ id: "rsumerian", name: "Reverse Sumerian", note: "Reverse ordinal × 6", f: function (i) { return (26 - i) * 6; } }
	];
	var HEBSYS = { id: "hebrew", name: "Hebrew", note: "Mispar Hechrachi", hebrew: true };
	var selected = "ordinal";

	function tokens(text, digits) {
		// -> [{ch, latinIndex|-1, hebrew value|0, digit|-1}] ; spaces kept as {space:true}
		var out = [];
		var s = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
		for (var i = 0; i < s.length; i++) {
			var c = s[i], lc = c.toLowerCase(), code = lc.charCodeAt(0);
			if (code >= 97 && code <= 122) out.push({ ch: c, li: code - 97 });
			else if (HEB[c]) out.push({ ch: c, heb: HEB[c] });
			else if (digits && c >= "0" && c <= "9") out.push({ ch: c, dig: +c });
			else if (/\s/.test(c)) { if (out.length && !out[out.length - 1].space) out.push({ space: true }); }
		}
		while (out.length && out[out.length - 1].space) out.pop();
		return out;
	}
	function valueOf(tok, sys) {
		if (tok.space) return 0;
		if (sys.hebrew) return tok.heb || 0;
		if (tok.li !== undefined) return sys.f(tok.li);
		if (tok.dig !== undefined) return tok.dig;
		return 0;
	}
	function total(toks, sys) { return toks.reduce(function (a, t) { return a + valueOf(t, sys); }, 0); }

	function factorize(n) {
		if (n < 2) return "";
		var f = [], x = n;
		for (var p = 2; p * p <= x; p++) { var c = 0; while (x % p === 0) { x /= p; c++; } if (c) f.push(c > 1 ? p + "<sup>" + c + "</sup>" : String(p)); }
		if (x > 1) f.push(String(x));
		return f.join(" × ");
	}
	function facts(n) {
		if (!n) return "";
		var bits = [], f = factorize(n);
		var prime = f && f.indexOf("×") === -1 && f.indexOf("<sup>") === -1;
		bits.push(n.toLocaleString("en-US") + (prime ? " is prime" : f ? " = " + f : ""));
		var dr = n % 9 === 0 ? 9 : n % 9; bits.push("digital root " + dr);
		bits.push(n % 2 ? "odd" : "even");
		var sq = Math.round(Math.sqrt(n)); if (sq * sq === n && n > 1) bits.push("perfect square (" + sq + "²)");
		var tr = Math.round((Math.sqrt(8 * n + 1) - 1) / 2); if (tr * (tr + 1) / 2 === n && n > 1) bits.push("triangular number (" + tr + "th)");
		return bits.join(" · ");
	}

	function render() {
		var text = $("gm-in").value, toks = tokens(text, $("gm-digits").checked);
		var hasHeb = toks.some(function (t) { return t.heb; });
		var systems = hasHeb ? [HEBSYS].concat(SYSTEMS) : SYSTEMS;
		if (!systems.some(function (s) { return s.id === selected; })) selected = systems[0].id;
		var letters = toks.filter(function (t) { return !t.space; });
		$("gm-cards").innerHTML = systems.map(function (s) {
			var v = total(toks, s);
			return '<button type="button" class="tu-stat gm-card" data-s="' + s.id + '" aria-pressed="' + (s.id === selected) + '"><div class="tu-stat__label">' + s.name +
				'</div><div class="tu-stat__value">' + v.toLocaleString("en-US") + '</div><div class="tu-stat__sub">' + s.note + "</div></button>";
		}).join("");
		var sys = systems.filter(function (s) { return s.id === selected; })[0];
		$("gm-break-title").textContent = "Breakdown — " + sys.name;
		var run = 0, parts = [];
		$("gm-break").innerHTML = toks.map(function (t) {
			if (t.space) return '<span class="gm-space"></span>';
			var v = valueOf(t, sys), other = !sys.hebrew ? t.heb : (t.li !== undefined || t.dig !== undefined);
			if (!other && v) { run += v; parts.push(v); }
			return '<div class="gm-letter' + (other ? " gm-letter--other" : "") + (t.heb ? " gm-hebrew" : "") + '"><b>' + t.ch.replace(/</g, "&lt;") + "</b><span>" + (other ? "–" : v) + "</span></div>";
		}).join("");
		var sum = total(toks, sys);
		$("gm-sum").innerHTML = letters.length ? (parts.length > 1 && parts.length <= 40 ? parts.join(" + ") + " = <strong>" + sum.toLocaleString("en-US") + "</strong>" : "Total: <strong>" + sum.toLocaleString("en-US") + "</strong>") + " &nbsp;(" + letters.length + " character" + (letters.length === 1 ? "" : "s") + ")" : "Type something above to see its gematria values.";
		$("gm-facts").innerHTML = facts(sum);
		// word by word
		var words = [], cur = [];
		toks.forEach(function (t) { if (t.space) { if (cur.length) words.push(cur); cur = []; } else cur.push(t); });
		if (cur.length) words.push(cur);
		if (words.length > 1) {
			var head = "<thead><tr><th>Word</th>" + systems.map(function (s) { return "<th>" + s.name + "</th>"; }).join("") + "</tr></thead>";
			var body = words.map(function (w) {
				return "<tr><td>" + w.map(function (t) { return t.ch; }).join("").replace(/</g, "&lt;") + "</td>" + systems.map(function (s) { return "<td>" + total(w, s).toLocaleString("en-US") + "</td>"; }).join("") + "</tr>";
			}).join("");
			var foot = '<tr class="is-active"><td>Total</td>' + systems.map(function (s) { return "<td>" + total(toks, s).toLocaleString("en-US") + "</td>"; }).join("") + "</tr>";
			$("gm-words").innerHTML = head + "<tbody>" + body + foot + "</tbody>";
			$("gm-words-wrap").style.display = "";
		} else $("gm-words-wrap").style.display = "none";
		try { var q = text ? "?q=" + encodeURIComponent(text) : location.pathname; history.replaceState(null, "", q); } catch (e) {}
		return systems;
	}

	function toast(msg) {
		var t = document.getElementById("gm-toast");
		if (!t) { t = document.createElement("div"); t.id = "gm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1400);
	}
	function copy(text, msg) {
		function done() { toast(msg); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta); }
	}

	function init() {
		try { var q = new URLSearchParams(location.search).get("q"); if (q) $("gm-in").value = q; } catch (e) {}
		$("gm-in").addEventListener("input", render);
		$("gm-digits").addEventListener("change", render);
		$("gm-cards").addEventListener("click", function (e) { var b = e.target.closest(".gm-card"); if (b) { selected = b.getAttribute("data-s"); render(); } });
		$("gm-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { $("gm-in").value = b.textContent; render(); } });
		$("gm-clear").addEventListener("click", function () { $("gm-in").value = ""; render(); $("gm-in").focus(); });
		$("gm-copy").addEventListener("click", function () {
			var text = $("gm-in").value, toks = tokens(text, $("gm-digits").checked), hasHeb = toks.some(function (t) { return t.heb; });
			var systems = hasHeb ? [HEBSYS].concat(SYSTEMS) : SYSTEMS;
			copy('"' + text + '"\n' + systems.map(function (s) { return s.name + ": " + total(toks, s); }).join("\n"), "Values copied");
		});
		$("gm-link").addEventListener("click", function () { copy(location.href, "Link copied"); });
		render();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
