/* MES Enigma -- mes.fm/enigma (UI; machine maths in lib.js, global EN). State: localStorage "mes-enigma:v1".
 * Links: ?m=M3&r=I,II,III&rg=AAA&p=AAA&u=B&pl=AB.CD&t=TEXT&f=5|4|0|keep
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("en");
	if (!root || !window.EN) return;
	var KEY = "mes-enigma:v1", A = EN.A, QW = ["QWERTZUIO", "ASDFGHJK", "PYXCVBNML"];
	var PAIRCOL = ["#f4b6b6", "#f4d19b", "#f2ec9b", "#bfe3a0", "#9fdcc8", "#9fd0ee", "#b6b8f2", "#d9b2ee", "#f0aed2", "#d0c4b0"];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function pad2(n) { return (n < 10 ? "0" : "") + n; }

	var S = { cfg: EN.defaults("M3"), text: "", fmt: "5" };
	var memOnly = false, picked = -1;
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); memOnly = false; } catch (e) { memOnly = true; } }
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (!s) return;
			S.cfg = EN.normalize(s.cfg);
			if (typeof s.text === "string") S.text = s.text.slice(0, 20000);
			if (/^(5|4|0|keep)$/.test(s.fmt)) S.fmt = s.fmt;
		} catch (e) { memOnly = true; }
	}
	function fromQuery() {
		var q = new URLSearchParams(location.search); if (![].slice.call(q.keys()).length) return false;
		var m = q.get("m"); if (!EN.MODELS[m]) m = S.cfg.model;
		var c = EN.defaults(m), n = EN.MODELS[m].slots;
		if (q.get("r")) c.rotors = q.get("r").split(",");
		if (q.get("rg")) c.rings = EN.posParse(q.get("rg"), n);
		if (q.get("p")) c.pos = EN.posParse(q.get("p"), n);
		if (q.get("u")) c.refl = q.get("u");
		if (q.get("pl")) c.plugs = q.get("pl").replace(/[.,]/g, " ");
		S.cfg = EN.normalize(c);
		if (q.get("t") != null) S.text = q.get("t").slice(0, 20000);
		if (/^(5|4|0|keep)$/.test(q.get("f") || "")) S.fmt = q.get("f");
		try { history.replaceState(null, "", location.pathname); } catch (e) {}
		return true;
	}
	function link() {
		var c = S.cfg, q = new URLSearchParams();
		q.set("m", c.model); q.set("r", c.rotors.join(",")); q.set("rg", EN.posText(c.rings)); q.set("p", EN.posText(c.pos)); q.set("u", c.refl);
		if (c.plugs) q.set("pl", c.plugs.replace(/ /g, "."));
		if (S.text && S.text.length <= 600) q.set("t", S.text);
		if (S.fmt !== "5") q.set("f", S.fmt);
		return location.origin + location.pathname + "?" + q.toString();
	}

	/* ---------- machine panel ---------- */
	function slotNames(n) { return n === 4 ? ["Greek", "Left", "Middle", "Right"] : ["Left", "Middle", "Right"]; }
	function rotorOptions(i) {
		var m = EN.MODELS[S.cfg.model], list = (S.cfg.model === "M4" && i === 0) ? m.greek : m.rotors;
		return list.map(function (r) { return '<option value="' + r + '"' + (S.cfg.rotors[i] === r ? " selected" : "") + ">" + r + "</option>"; }).join("");
	}
	function ringOptions(i) { var o = "", k; for (k = 0; k < 26; k++) o += '<option value="' + k + '"' + (S.cfg.rings[i] === k ? " selected" : "") + ">" + pad2(k + 1) + " · " + A.charAt(k) + "</option>"; return o; }
	function drawModel() {
		$("en-model").innerHTML = Object.keys(EN.MODELS).map(function (k) { return '<option value="' + k + '"' + (S.cfg.model === k ? " selected" : "") + ">" + esc(EN.MODELS[k].name) + "</option>"; }).join("");
		$("en-refl").innerHTML = EN.MODELS[S.cfg.model].refl.map(function (r) { return '<option value="' + r + '"' + (S.cfg.refl === r ? " selected" : "") + ">" + r.replace("-thin", " (thin)") + "</option>"; }).join("");
	}
	function drawRotors() {
		var n = S.cfg.rotors.length, names = slotNames(n);
		$("en-rotors").innerHTML = S.cfg.rotors.map(function (r, i) {
			return '<div class="en-rotor" data-i="' + i + '"><div class="en-rotor__name">' + names[i] + " rotor</div>" +
				'<select data-k="rotor" aria-label="' + names[i] + ' rotor">' + rotorOptions(i) + "</select>" +
				'<div class="en-win"><button type="button" data-k="up" aria-label="' + names[i] + ' start position up">▲</button>' +
				'<input type="text" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" data-k="pos" aria-label="' + names[i] + ' start position" value="' + A.charAt(S.cfg.pos[i]) + '">' +
				'<button type="button" data-k="down" aria-label="' + names[i] + ' start position down">▼</button></div>' +
				'<label class="en-rotor__ring">Ring<select data-k="ring" aria-label="' + names[i] + ' ring setting">' + ringOptions(i) + "</select></label></div>";
		}).join("");
	}
	function plugMap() { return EN.parsePlugs(S.cfg.plugs); }
	function drawPlugboard() {
		var pl = plugMap(), colorOf = {}, html = "", rows = QW;
		pl.pairs.forEach(function (p, i) { colorOf[p.charAt(0)] = colorOf[p.charAt(1)] = i % PAIRCOL.length; });
		rows.forEach(function (row) {
			html += '<div class="en-plugrow">' + row.split("").map(function (ch) {
				var c = colorOf[ch], partner = pl.map[A.indexOf(ch)] !== A.indexOf(ch) ? A.charAt(pl.map[A.indexOf(ch)]) : "";
				return '<button type="button" class="en-sock' + (picked === A.indexOf(ch) ? " is-pick" : "") + '" data-l="' + ch + '"' + (c !== undefined ? ' data-c="' + c + '" style="background:' + PAIRCOL[c] + '"' : "") + ' aria-label="' + ch + (partner ? " plugged to " + partner : " unplugged") + '">' + ch + (partner ? "<small>" + partner + "</small>" : "") + "</button>";
			}).join("") + "</div>";
		});
		$("en-plugboard").innerHTML = html;
		$("en-plugcount").textContent = "(" + pl.pairs.length + " of 10 cables)";
		$("en-plugerr").textContent = "";
	}
	function setPlugs(pairs) { S.cfg.plugs = pairs.join(" "); $("en-plugs").value = S.cfg.plugs; drawPlugboard(); changed(); }
	function clickSocket(ch) {
		var pl = plugMap(), i = A.indexOf(ch), pairs = pl.pairs.slice();
		function partnerOf(l) { var p = pairs.filter(function (x) { return x.indexOf(l) >= 0; })[0]; return p; }
		if (picked < 0) {
			var p0 = partnerOf(ch);
			if (p0) { pairs.splice(pairs.indexOf(p0), 1); setPlugs(pairs); return; }   // click a plugged letter: pull the cable
			picked = i; drawPlugboard(); return;
		}
		if (picked === i) { picked = -1; drawPlugboard(); return; }
		var a = A.charAt(picked), b = ch;
		[a, b].forEach(function (l) { var p = partnerOf(l); if (p) pairs.splice(pairs.indexOf(p), 1); });
		if (pairs.length >= 10) { picked = -1; toast("The machine has 10 cables: pull one out first"); drawPlugboard(); return; }
		pairs.push(a + b); picked = -1; setPlugs(pairs);
	}

	/* ---------- lampboard ---------- */
	function drawBoards() {
		function rows(cls) { return QW.map(function (r) { return '<div class="en-brow">' + r.split("").map(function (ch) { return cls === "lamp" ? '<div class="en-lamp" data-l="' + ch + '">' + ch + "</div>" : '<button type="button" class="en-key" data-l="' + ch + '" aria-label="Key ' + ch + '">' + ch + "</button>"; }).join("") + "</div>"; }).join(""); }
		$("en-lamps").innerHTML = rows("lamp"); $("en-keys").innerHTML = rows("key");
	}
	function lamp(ch) {
		var l = $("en-lamps").querySelector(".is-lit"); if (l) l.classList.remove("is-lit");
		if (ch) { var t = $("en-lamps").querySelector('[data-l="' + ch + '"]'); if (t) t.classList.add("is-lit"); }
	}

	/* ---------- compute ---------- */
	function outputText(r) { return S.fmt === "keep" ? r.text : EN.group(r.text, S.fmt === "0" ? 0 : +S.fmt); }
	function compute() {
		var r = EN.run(S.cfg, S.text, { keep: S.fmt === "keep" });
		$("en-out").value = outputText(r);
		$("en-now").innerHTML = "Rotors now: " + r.pos.map(function (p) { return "<b>" + A.charAt(p) + "</b>"; }).join("") + (r.letters ? " &nbsp;after " + r.letters + " letter" + (r.letters === 1 ? "" : "s") : " &nbsp;(start position)");
		lamp(r.last ? r.last.out : "");
		$("en-stats").textContent = r.letters ? r.letters + " letter" + (r.letters === 1 ? "" : "s") + " enciphered." + (S.text.replace(/[A-Za-z]/g, "").replace(/\s/g, "").length && S.fmt !== "keep" ? " Digits and punctuation are skipped, as on the real machine." : "") : "";
		drawPath(r.last);
		cribInfo();
		return r;
	}
	function drawPath(last) {
		var t = $("en-path");
		if (!last) { t.innerHTML = '<tr><td style="text-align:left;color:#6a7280;">Type a letter to see its trip through the machine.</td></tr>'; $("en-pathnote").textContent = ""; return; }
		$("en-pathnote").textContent = "— the last letter, " + last.ch + " → " + last.out;
		var p = last.path, rows = p.map(function (s, i) { return '<tr' + (s[0].indexOf("Reflector") === 0 ? ' class="is-turn"' : "") + "><td>" + esc(s[0]) + "</td><td>" + A.charAt(s[1]) + "</td></tr>"; }).join("");
		t.innerHTML = '<thead><tr><th>Stage</th><th>Letter</th></tr></thead><tbody>' + rows + "</tbody>";
	}
	var tmr = 0;
	function changed(now) { save(); if (now) compute(); else { clearTimeout(tmr); tmr = setTimeout(compute, 0); } }

	/* ---------- events ---------- */
	$("en-model").addEventListener("change", function () { var keep = S.cfg.plugs; S.cfg = EN.defaults(this.value); S.cfg.plugs = keep; picked = -1; $("en-plugs").value = S.cfg.plugs; drawModel(); drawRotors(); changed(); });
	$("en-refl").addEventListener("change", function () { S.cfg.refl = this.value; changed(); });
	$("en-rotors").addEventListener("change", function (e) {
		var el = e.target, box = el.closest(".en-rotor"); if (!box) return; var i = +box.getAttribute("data-i"), k = el.getAttribute("data-k");
		if (k === "rotor") {
			var prev = S.cfg.rotors[i], j = S.cfg.rotors.indexOf(el.value);
			if (j >= 0 && j !== i) S.cfg.rotors[j] = prev;   // the same rotor cannot sit in two places: swap
			S.cfg.rotors[i] = el.value; drawRotors();
		} else if (k === "ring") S.cfg.rings[i] = +el.value;
		changed();
	});
	$("en-rotors").addEventListener("click", function (e) {
		var el = e.target.closest("button"); if (!el) return; var box = el.closest(".en-rotor"), i = +box.getAttribute("data-i"), k = el.getAttribute("data-k");
		if (k === "up") S.cfg.pos[i] = (S.cfg.pos[i] + 1) % 26; else if (k === "down") S.cfg.pos[i] = (S.cfg.pos[i] + 25) % 26; else return;
		box.querySelector('[data-k="pos"]').value = A.charAt(S.cfg.pos[i]); changed();
	});
	$("en-rotors").addEventListener("input", function (e) {
		var el = e.target; if (el.getAttribute("data-k") !== "pos") return; var i = +el.closest(".en-rotor").getAttribute("data-i"), ch = el.value.toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
		if (ch) { S.cfg.pos[i] = A.indexOf(ch); el.value = ch; changed(); } else el.value = "";
	});
	$("en-rotors").addEventListener("focusin", function (e) { if (e.target.getAttribute("data-k") === "pos") e.target.select(); });
	$("en-rotors").addEventListener("focusout", function (e) { var el = e.target; if (el.getAttribute("data-k") === "pos") el.value = A.charAt(S.cfg.pos[+el.closest(".en-rotor").getAttribute("data-i")]); });
	$("en-plugs").addEventListener("input", function () {
		var pl = EN.parsePlugs(this.value), partial = /[A-Za-z]$/.test(this.value) && /(^|[^A-Za-z])[A-Za-z]$/.test(this.value);
		if (pl.error && !partial) { $("en-plugerr").textContent = pl.error; return; }
		if (partial) { $("en-plugerr").textContent = ""; return; }
		S.cfg.plugs = pl.pairs.join(" "); picked = -1; drawPlugboard(); $("en-plugerr").textContent = ""; changed();
	});
	$("en-plugs").addEventListener("blur", function () { this.value = S.cfg.plugs; $("en-plugerr").textContent = ""; });
	$("en-plugboard").addEventListener("click", function (e) { var b = e.target.closest(".en-sock"); if (b) clickSocket(b.getAttribute("data-l")); });
	$("en-in").addEventListener("input", function () { S.text = this.value; changed(true); });
	$("en-fmt").addEventListener("change", function () { S.fmt = this.value; changed(true); });
	function typeLetter(ch) {
		var ta = $("en-in"); ta.value += ch; S.text = ta.value; changed(true);
	}
	$("en-keys").addEventListener("pointerdown", function (e) { var b = e.target.closest(".en-key"); if (!b) return; e.preventDefault(); b.classList.add("is-down"); typeLetter(b.getAttribute("data-l")); setTimeout(function () { b.classList.remove("is-down"); }, 120); });
	$("en-keys").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("en-key")) { e.preventDefault(); typeLetter(e.target.getAttribute("data-l")); } });
	$("en-key-space").addEventListener("click", function () { typeLetter(" "); });
	$("en-key-back").addEventListener("click", function () { var ta = $("en-in"); ta.value = ta.value.slice(0, -1); S.text = ta.value; changed(true); });
	$("en-clear").addEventListener("click", function () { $("en-in").value = ""; S.text = ""; changed(true); $("en-in").focus(); });
	$("en-swap").addEventListener("click", function () { var o = $("en-out").value; if (!o) { toast("Nothing to move yet"); return; } $("en-in").value = o; S.text = o; changed(true); toast("Moved. Put the rotors back to the start and it decodes."); });
	$("en-copy").addEventListener("click", function () { var o = $("en-out").value; if (!o) { toast("Nothing to copy yet"); return; } copy(o, "Output copied"); });
	$("en-link").addEventListener("click", function () { copy(link(), "Link to these settings copied"); });
	$("en-reset").addEventListener("click", function () { S.cfg = EN.defaults(S.cfg.model); picked = -1; refresh(); changed(true); });
	$("en-random").addEventListener("click", function () { S.cfg = EN.random(S.cfg.model); picked = -1; refresh(); changed(true); toast("Random key: write it down before you encode"); });
	// physical keyboard: type anywhere on the page body (outside inputs) to feed the machine
	document.addEventListener("keydown", function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return;
		if (/^[a-zA-Z]$/.test(e.key)) { typeLetter(e.key.toUpperCase()); var k = $("en-keys").querySelector('[data-l="' + e.key.toUpperCase() + '"]'); if (k) { k.classList.add("is-down"); setTimeout(function () { k.classList.remove("is-down"); }, 120); } }
	});

	/* ---------- examples ---------- */
	var WEATHER = "WETTER FUER DIE NACHT KEINE BESONDEREN EREIGNISSE";
	function setExample(id) {
		var m = S.cfg.model;
		if (id === "test") { S.cfg = EN.defaults("M3"); S.text = "AAAAA"; }
		else if (id === "hello") { S.cfg = EN.defaults("M3"); S.text = "HELLO WORLD"; }
		else if (id === "secret") { S.cfg = EN.normalize({ model: "M3", rotors: ["V", "II", "IV"], rings: [1, 4, 11], pos: [16, 23, 4], refl: "B", plugs: "AB CD EF GH" }); S.text = WEATHER; }
		else if (id === "break") {
			var c = EN.normalize({ model: "M3", rotors: ["V", "II", "IV"], rings: [0, 0, 0], pos: [16, 23, 4], refl: "B", plugs: "" });
			S.text = EN.group(EN.run(c, "XX" + WEATHER).text, 5); c.pos = [0, 0, 0]; S.cfg = c; $("en-cribtext").value = "KEINEBESONDEREN"; $("en-cribwhere").value = "any"; $("en-cribord").checked = false; cribWhereUI();
		}
		picked = -1; $("en-in").value = S.text; refresh(); changed(true);
		if (id === "break") { setTimeout(function () { $("en-crib").scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); toast("A coded message is in the Input box. Press Search to find its start position."); }
	}
	$("en-examples").addEventListener("click", function (e) { var b = e.target.closest("[data-ex]"); if (b) setExample(b.getAttribute("data-ex")); });

	/* ---------- crib search ---------- */
	var job = null;
	function cleanLetters(t) { return String(t || "").toUpperCase().replace(/[^A-Z]/g, ""); }
	function cribWhereUI() { $("en-cribatwrap").hidden = $("en-cribwhere").value !== "at"; }
	function cribOffsets() {
		var ct = cleanLetters(S.text), crib = cleanLetters($("en-cribtext").value), w = $("en-cribwhere").value;
		if (!crib || crib.length > ct.length) return [];
		if (w === "start") return EN.cribOffsets(ct, crib).filter(function (o) { return o === 0; });
		if (w === "at") { var at = Math.max(1, Math.floor(+$("en-cribat").value || 1)) - 1; return EN.cribOffsets(ct, crib).filter(function (o) { return o === at; }); }
		return EN.cribOffsets(ct, crib).slice(0, 60);
	}
	function cribInfo() {
		if (job) return;
		var ct = cleanLetters(S.text), crib = cleanLetters($("en-cribtext").value), info = $("en-cribinfo");
		if (!crib) { info.textContent = ""; return; }
		if (!ct) { info.textContent = "Put the coded message in the Input box first."; return; }
		if (crib.length > ct.length) { info.textContent = "The crib is longer than the message."; return; }
		var all = EN.cribOffsets(ct, crib), total = ct.length - crib.length + 1, w = $("en-cribwhere").value;
		info.textContent = "A letter never becomes itself, so the crib can sit at " + all.length + " of " + total + " places in the message" + (w === "start" ? (all[0] === 0 ? " (including the start)." : " (but not the start: no match is possible there).") : ".");
	}
	function stopJob() { if (job) { clearTimeout(job.t); job = null; } $("en-cribstop").hidden = true; $("en-cribgo").disabled = false; $("en-cribprog").hidden = true; }
	function startSearch() {
		var crib = cleanLetters($("en-cribtext").value), ct = cleanLetters(S.text);
		if (!ct) { toast("Put the coded message in the Input box first"); return; }
		if (crib.length < 4) { toast("Type a crib of at least 4 letters"); return; }
		var offs = cribOffsets(); if (!offs.length) { $("en-cribinfo").textContent = "That crib cannot fit there: some letter would have to stay itself. Try another position."; $("en-cribres").hidden = true; return; }
		stopJob();
		var s = EN.cribSearch(S.cfg, ct, crib, { offsets: offs, orders: $("en-cribord").checked, limit: 200 }), res = $("en-cribres"), t0 = Date.now();
		$("en-cribgo").disabled = true; $("en-cribstop").hidden = false; $("en-cribprog").hidden = false; $("en-cribprog").value = 0; res.hidden = true;
		job = { t: 0, s: s };
		(function tick() {
			var r = s.next(30); $("en-cribprog").value = r.progress;
			$("en-cribinfo").textContent = "Searching… " + Math.round(r.progress * 100) + "% (" + r.tested.toLocaleString() + " of " + r.total.toLocaleString() + " settings), " + r.hits.length + " match" + (r.hits.length === 1 ? "" : "es") + " so far";
			if (!r.done) { job.t = setTimeout(tick, 0); return; }
			stopJob(); showHits(r.hits, r.total, (Date.now() - t0) / 1000, r.hits.length >= 200);
		})();
	}
	function showHits(hits, total, secs, capped) {
		var res = $("en-cribres"), n = S.cfg.rotors.length, nm = slotNames(n);
		$("en-cribinfo").textContent = (hits.length ? hits.length + (capped ? "+" : "") + " setting" + (hits.length === 1 ? "" : "s") + " produce the crib" : "No setting produces the crib") + " (" + total.toLocaleString() + " tried in " + secs.toFixed(1) + " s)." + (hits.length ? " Check which one reads like real text." : " Check the ring settings, reflector, plugboard and the crib's position, or tick the rotor-order box.");
		if (!hits.length) { res.hidden = true; return; }
		res.hidden = false;
		res.innerHTML = '<thead><tr><th>Rotors</th><th>Start</th><th>Crib at letter</th><th>Deciphered start of the message</th><th></th></tr></thead><tbody>' + hits.slice(0, 50).map(function (h, i) {
			var c = Object.assign({}, S.cfg, { rotors: h.rotors, pos: h.pos }), prev = EN.run(c, S.text).text.slice(0, 48);
			return "<tr><td>" + esc(h.rotors.join(" ")) + "</td><td><code>" + EN.posText(h.pos) + "</code></td><td>" + (h.offset + 1) + '</td><td class="en-prev">' + esc(prev) + '</td><td><button type="button" class="tu-btn" data-use="' + i + '">Use</button></td></tr>';
		}).join("") + "</tbody>";
		res._hits = hits;
	}
	$("en-cribres").addEventListener("click", function (e) {
		var b = e.target.closest("[data-use]"); if (!b) return; var h = this._hits[+b.getAttribute("data-use")];
		S.cfg.rotors = h.rotors.slice(); S.cfg.pos = h.pos.slice(); refresh(); changed(true); toast("Settings loaded: read the Output box");
		$("en-in").scrollIntoView({ behavior: "smooth", block: "center" });
	});
	$("en-cribgo").addEventListener("click", startSearch);
	$("en-cribstop").addEventListener("click", function () { stopJob(); $("en-cribinfo").textContent = "Search stopped."; });
	$("en-cribwhere").addEventListener("change", function () { cribWhereUI(); cribInfo(); });
	$("en-cribtext").addEventListener("input", function () { this.value = this.value.toUpperCase(); cribInfo(); });
	$("en-cribat").addEventListener("input", cribInfo);

	/* ---------- helpers ---------- */
	function toast(msg) { var t = $("en-toast"); if (!t) { t = document.createElement("div"); t.id = "en-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function copy(text, msg) {
		function done() { toast(msg); }
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
	}
	function refresh() { drawModel(); drawRotors(); $("en-plugs").value = S.cfg.plugs; drawPlugboard(); $("en-fmt").value = S.fmt; $("en-in").value = S.text; }

	load(); fromQuery();
	drawBoards(); refresh(); cribWhereUI(); compute();
})();
