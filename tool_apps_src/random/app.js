/* MES Random Number Generator / Dice Roller UI (tool_apps_src/random/app.js). One script for /random-number-generator and /dice-roller;
   <div id="rn" data-mode="numbers|dice"> picks the first tab. Maths and randomness live in lib.js (MESRand). */
(function () {
	"use strict";
	var R = window.MESRand, root = document.getElementById("rn");
	if (!R || !root) return;
	var MODE = root.getAttribute("data-mode") || "numbers";
	var KEY = "mes-random-number-generator:v1";
	var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function fmt(n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 10 }); }
	function pct(p) { if (p === 0) return "0%"; if (p === 1) return "100%"; var v = p * 100; if (v < 0.01) return "under 0.01%"; if (v > 99.99) return "over 99.99%"; return (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(2) : v.toFixed(1)) + "%"; }
	function oneIn(p) { if (!(p > 0)) return ""; if (p >= 0.5) return ""; var n = 1 / p; return " (about 1 in " + (n < 100 ? n.toFixed(1).replace(/\.0$/, "") : fmt(Math.round(n))) + ")"; }

	/* ---------- state ---------- */
	var st = {};
	try { st = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { st = {}; }
	st.h = st.h || {}; st.log = st.log || []; st.coinRun = st.coinRun || []; st.tabs = st.tabs || {};
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
	var Q = new URLSearchParams(location.search);

	/* ---------- random source ---------- */
	var rng, seed = Q.get("seed");
	function setRng(s) {
		seed = s || null;
		rng = seed ? R.seeded(seed) : R.cryptoRng();
		var bar = $("rn-seedbar");
		if (seed) { bar.hidden = false; bar.innerHTML = "<b>Seeded mode:</b> seed <code>" + esc(seed) + "</code>. Results repeat exactly from page load, so they are reproducible but not secure. <button type=\"button\" class=\"tu-btn tu-btn--ghost\" id=\"rn-seedx\">Use secure random</button>"; $("rn-seedx").onclick = function () { useSeed(""); }; }
		else bar.hidden = true;
		$("rn-seed").value = seed || "";
	}
	function useSeed(s) {
		s = String(s || "").trim().slice(0, 80);
		var u = new URL(location.href); if (s) u.searchParams.set("seed", s); else u.searchParams.delete("seed");
		try { history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { }
		setRng(s); toast(s ? "Seeded mode on" : "Secure random on");
	}
	setRng(seed);
	$("rn-seedgo").onclick = function () { useSeed($("rn-seed").value); };
	$("rn-seedoff").onclick = function () { useSeed(""); };
	if (seed) $("rn-seedbox").open = true;

	/* ---------- helpers ---------- */
	var toastT;
	function toast(msg) { var t = $("rn-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, label) {
		function done() { toast((label || "Copied") + "!"); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); } ta.remove(); }
	}
	function showErr(id, msg) { var e = $(id); e.hidden = !msg; e.textContent = msg || ""; }
	function intVal(id, def, lo, hi) { var v = Math.round(R.parseNum($(id).value)); if (!isFinite(v)) v = def; return Math.max(lo, Math.min(hi, v)); }
	function logLine(s) { st.log.unshift({ t: Date.now(), s: s }); if (st.log.length > 40) st.log.length = 40; }
	function record(key, sides, values) { /* values 1-based faces */
		var arr = st.h[key]; if (!arr || arr.length !== sides) arr = st.h[key] = new Array(sides).fill(0);
		values.forEach(function (v) { if (v >= 1 && v <= sides) arr[v - 1]++; });
	}
	function linkTo(params) { var u = new URL(location.href); u.search = ""; Object.keys(params).forEach(function (k) { if (params[k] !== "" && params[k] != null) u.searchParams.set(k, params[k]); }); if (seed) u.searchParams.set("seed", seed); return u.toString(); }
	function spin(el) { if (REDUCED) return; el.classList.remove("rn-anim"); void el.offsetWidth; el.classList.add("rn-anim"); }

	/* ---------- tabs ---------- */
	var TABS = ["num", "dice", "coin", "cards", "list", "stats"], cur = null;
	function showTab(id, focus) {
		if (TABS.indexOf(id) < 0) id = "num";
		cur = id;
		TABS.forEach(function (t) { var b = $("rn-t-" + t), on = t === id; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; $("rn-p-" + t).hidden = !on; });
		if (focus) $("rn-t-" + id).focus();
		st.tabs[MODE] = id; save();
		if (id === "stats") drawStats();
		if (id === "coin") drawCoinStats();
		if (id === "dice") refreshOdds();
	}
	TABS.forEach(function (t) {
		var b = $("rn-t-" + t);
		b.addEventListener("click", function () { showTab(t); });
		b.addEventListener("keydown", function (e) {
			var i = TABS.indexOf(t);
			if (e.key === "ArrowRight") { e.preventDefault(); showTab(TABS[(i + 1) % TABS.length], true); }
			else if (e.key === "ArrowLeft") { e.preventDefault(); showTab(TABS[(i + TABS.length - 1) % TABS.length], true); }
			else if (e.key === "Home") { e.preventDefault(); showTab(TABS[0], true); }
			else if (e.key === "End") { e.preventDefault(); showTab(TABS[TABS.length - 1], true); }
		});
	});

	/* ================= NUMBERS ================= */
	var lastNums = "";
	(function restoreNum() {
		var n = st.num || {};
		if (Q.has("min") || Q.has("max")) n = { min: Q.get("min"), max: Q.get("max"), count: Q.get("n") || "1", places: Q.get("p") || "0", uniq: Q.get("u") === "1", sort: Q.get("s") || "", ex: Q.get("x") || "" };
		if (n.min != null) $("rn-min").value = n.min;
		if (n.max != null) $("rn-max").value = n.max;
		if (n.count != null) $("rn-count").value = n.count;
		if (n.places != null) $("rn-places").value = String(n.places);
		$("rn-uniq").checked = !!n.uniq; $("rn-sort").value = n.sort || ""; $("rn-ex").value = n.ex || "";
	})();
	function numOpts() {
		return { min: $("rn-min").value, max: $("rn-max").value, count: $("rn-count").value, places: $("rn-places").value, uniq: $("rn-uniq").checked, sort: $("rn-sort").value, ex: $("rn-ex").value };
	}
	["rn-min", "rn-max", "rn-count", "rn-places", "rn-uniq", "rn-sort", "rn-ex"].forEach(function (id) { $(id).addEventListener("change", function () { st.num = numOpts(); save(); }); });
	function genNumbers() {
		var o = numOpts(); st.num = o; save();
		var min = R.parseNum(o.min), max = R.parseNum(o.max), count = R.parseNum(o.count === "" ? "1" : o.count);
		if (isNaN(min) || isNaN(max)) return showErr("rn-num-err", "Type a number in both From and To.");
		var exl = R.parseList(o.ex);
		if (exl.bad.length) return showErr("rn-num-err", "I can't read \"" + exl.bad[0] + "\" in Leave out. Use numbers like 7, 13, 20-25.");
		var places = +o.places;
		var r = R.numbers(rng, { min: min, max: max, count: count, places: places, unique: o.uniq, sort: o.sort, exclude: exl.values });
		if (r.error) return showErr("rn-num-err", r.error);
		showErr("rn-num-err", "");
		var out = $("rn-num-out"), vals = r.values.map(function (v) { return R.fmtNum(v, places); });
		lastNums = vals.join(", ");
		var lo = Math.min(min, max), hi = Math.max(min, max);
		var big = vals.length === 1;
		out.innerHTML = (big ? "<div class=\"rn-big\">" + esc(fmtBig(vals[0])) + "</div>" : "<div class=\"rn-nums" + (vals.length > 60 ? " rn-nums--sm" : "") + "\">" + vals.map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + "</div>") +
			"<p class=\"tu-note\">" + (big ? "" : vals.length + " numbers, ") + "from " + fmt(lo) + " to " + fmt(hi) + (places ? " in steps of " + Math.pow(10, -places).toFixed(places) : "") + (o.uniq ? ", no repeats" : "") + (exl.values.length ? ", some left out" : "") + ". Each possible number had a 1 in " + fmt(r.possible) + " chance" + (o.uniq && vals.length > 1 ? " for the first pick" : "") + ".</p>";
		spin(out);
		if (!places && hi - lo + 1 <= 100 && !o.uniq && !exl.values.length && lo === Math.floor(lo)) record("n:" + lo + "-" + hi, hi - lo + 1, r.values.map(function (v) { return v - lo + 1; }));
		logLine("Numbers " + fmt(lo) + "-" + fmt(hi) + ": " + (lastNums.length > 80 ? lastNums.slice(0, 80) + "..." : lastNums));
		save();
	}
	function fmtBig(v) { return /^-?\d{5,}$/.test(v) ? Number(v).toLocaleString("en-US") : v; }
	$("rn-num-go").onclick = genNumbers;
	["rn-min", "rn-max", "rn-count", "rn-ex"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") genNumbers(); }); });
	$("rn-num-copy").onclick = function () { if (!lastNums) genNumbers(); if (lastNums) copy(lastNums, "Numbers copied"); };
	$("rn-num-link").onclick = function () { var o = numOpts(); copy(linkTo({ tab: "num", min: o.min, max: o.max, n: o.count, p: o.places === "0" ? "" : o.places, u: o.uniq ? "1" : "", s: o.sort, x: o.ex }), "Link copied"); };
	$("rn-num-quick").addEventListener("click", function (e) {
		var b = e.target.closest("[data-q]"); if (!b) return;
		var q = b.getAttribute("data-q").split(",");
		$("rn-min").value = q[0]; $("rn-max").value = q[1]; $("rn-places").value = q[2] || "0"; $("rn-count").value = q[3] || "1"; $("rn-uniq").checked = q[4] === "1";
		if (!q[4]) $("rn-uniq").checked = false;
		$("rn-ex").value = ""; genNumbers();
	});
	/* lottery */
	$("rn-lotto").innerHTML = R.LOTTERY.map(function (p) { return "<button type=\"button\" class=\"tu-chip\" data-l=\"" + p.id + "\" title=\"" + esc(p.note) + "\">" + esc(p.name) + "</button>"; }).join("");
	$("rn-lotto").addEventListener("click", function (e) {
		var b = e.target.closest("[data-l]"); if (!b) return;
		var id = b.getAttribute("data-l"), r = R.lottery(rng, id), odds = R.lotteryOdds(id);
		$("rn-lotto-out").innerHTML = "<div class=\"rn-lot\">" + r.parts.map(function (part, i) {
			return "<div class=\"rn-lotrow\"><span class=\"rn-lotlab\">" + esc(part.label) + "</span>" + part.values.map(function (v) { return "<span class=\"rn-ball" + (i ? " rn-ball--x" : "") + "\">" + v + "</span>"; }).join("") + "</div>";
		}).join("") + "</div><p class=\"tu-note\">" + esc(r.preset.note) + ". The chance that one ticket matches everything is 1 in " + fmt(odds) + ". Check the real game's current rules before you play.</p>";
		spin($("rn-lotto-out"));
		logLine(r.preset.name + ": " + r.parts.map(function (p) { return p.values.join(" "); }).join(" + ")); save();
	});

	/* ================= DICE ================= */
	var dn = $("rn-dn"), oddsCache = { text: null }, lastRoll = null, xhow = "ge", flick = null;
	if (Q.get("d")) dn.value = Q.get("d").slice(0, 120); else if (st.dice) dn.value = st.dice;
	function parsed() { return R.parseDice(dn.value); }
	function addDie(sides) {
		var v = dn.value.trim(), p = R.parseDice(v), re = new RegExp("(^|[+\\-\\s])(\\d*)d" + sides + "(?![\\d%f])", "i");
		if (!v || p.error) { dn.value = "d" + sides; }
		else {
			var m = re.exec(v);
			if (m && !/^(kh|kl|dh|dl|k|!|\s*adv|\s*dis)/i.test(v.slice(m.index + m[0].length))) {
				var n = (m[2] ? parseInt(m[2], 10) : 1) + 1;
				dn.value = v.slice(0, m.index) + m[1] + n + "d" + sides + v.slice(m.index + m[0].length);
			} else dn.value = v + "+d" + sides;
		}
		onDn();
	}
	$("rn-dicebtns").addEventListener("click", function (e) { var b = e.target.closest("[data-d]"); if (b) addDie(+b.getAttribute("data-d")); });
	$("rn-dex").addEventListener("click", function (e) { var b = e.target.closest("[data-n]"); if (!b) return; dn.value = b.getAttribute("data-n"); onDn(); roll(); });
	$("rn-dclear").onclick = function () { dn.value = ""; onDn(); dn.focus(); };
	var dnT;
	function onDn() {
		st.dice = dn.value; save();
		var p = parsed(), msg = $("rn-dn-msg");
		dn.classList.toggle("rn-bad", !!(p.error && dn.value.trim()));
		msg.textContent = p.error ? (dn.value.trim() ? p.error : "") : "Rolling " + p.text + ".";
		clearTimeout(dnT); dnT = setTimeout(refreshOdds, 220);
	}
	dn.addEventListener("input", onDn);
	dn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); roll(); } });
	$("rn-roll").onclick = roll;
	$("rn-roll2").onclick = roll;
	$("rn-tray").addEventListener("click", function () { if ($("rn-tray").children.length) roll(); });
	$("rn-tray").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); roll(); } });

	function dieShape(sides, fudge) {
		if (fudge) return "<rect x='6' y='6' width='88' height='88' rx='16' class='rn-dbody'/>";
		switch (sides) {
			case 4: return "<polygon points='50,6 94,88 6,88' class='rn-dbody'/><polyline points='50,6 50,88' class='rn-dedge'/>";
			case 6: return "<rect x='6' y='6' width='88' height='88' rx='16' class='rn-dbody'/>";
			case 8: return "<polygon points='50,4 94,50 50,96 6,50' class='rn-dbody'/><polyline points='6,50 94,50' class='rn-dedge'/>";
			case 10: case 100: return "<polygon points='50,4 94,42 50,96 6,42' class='rn-dbody'/><polyline points='6,42 50,58 94,42 M50,58 50,96' class='rn-dedge'/>";
			case 12: return "<polygon points='50,4 95,37 78,92 22,92 5,37' class='rn-dbody'/><polygon points='50,22 75,42 66,72 34,72 25,42' class='rn-dedge'/>";
			case 20: return "<polygon points='50,3 93,27 93,73 50,97 7,73 7,27' class='rn-dbody'/><polygon points='50,20 80,70 20,70' class='rn-dedge'/>";
			case 2: return "<circle cx='50' cy='50' r='45' class='rn-dbody'/>";
			default: return "<rect x='6' y='6' width='88' height='88' rx='30' class='rn-dbody'/>";
		}
	}
	var PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
	function dieSvg(t, d, show) {
		var sides = t.sides, face = show, txt;
		var inner = "";
		if (sides === 6 && !t.fudge && face >= 1 && face <= 6) inner = PIPS[face].map(function (p) { return "<circle cx='" + p[0] + "' cy='" + p[1] + "' r='8.5' class='rn-pip'/>"; }).join("");
		else {
			txt = t.fudge ? (face > 0 ? "+" : face < 0 ? "−" : " ") : String(face);
			var y = sides === 4 ? 70 : sides === 10 || sides === 100 ? 46 : sides === 12 ? 52 : sides === 20 ? 60 : 52;
			var fs = txt.length >= 3 ? 26 : txt.length === 2 ? 34 : sides === 4 || sides === 20 ? 34 : 44;
			inner = "<text x='50' y='" + y + "' class='rn-dnum' font-size='" + fs + "' text-anchor='middle' dominant-baseline='middle'>" + txt + "</text>";
		}
		return "<svg viewBox='0 0 100 100' class='rn-die" + (d && !d.kept ? " rn-drop" : "") + "'>" + dieShape(sides, t.fudge) + inner + "</svg>";
	}
	function renderTray(res, flickerOnly) {
		var html = [], shown = 0, more = 0;
		res.groups.forEach(function (g) {
			if (!g.dice) return;
			g.dice.forEach(function (d) {
				if (shown >= 60) { more++; return; }
				shown++;
				var face = flickerOnly ? (g.term.fudge ? Math.floor(Math.random() * 3) - 1 : 1 + Math.floor(Math.random() * g.term.sides)) : (g.term.fudge ? d.v : d.chain[0]);
				var sub = "";
				if (!flickerOnly && d.chain.length > 1) sub = "<span class='rn-chain'>" + d.chain.join("+") + "=" + d.v + "</span>";
				if (!flickerOnly && !d.kept) sub = "<span class='rn-chain'>dropped</span>";
				html.push("<span class='rn-dw" + (g.term.sign < 0 ? " rn-neg" : "") + "' title='d" + (g.term.fudge ? "F" : g.term.sides) + "'>" + dieSvg(g.term, flickerOnly ? null : d, face) + sub + "</span>");
			});
		});
		if (more) html.push("<span class='rn-more'>+" + more + " more dice</span>");
		$("rn-tray").innerHTML = html.join("");
	}
	function roll() {
		var p = parsed();
		if (p.error) { $("rn-dn-msg").textContent = p.error; dn.classList.add("rn-bad"); dn.focus(); return; }
		var res = R.rollDice(rng, p);
		lastRoll = { text: p.text, total: res.total };
		var tray = $("rn-tray");
		clearInterval(flick);
		if (!REDUCED) {
			var k = 0; tray.classList.add("rn-rolling"); renderTray(res, true);
			flick = setInterval(function () { if (++k >= 6) { clearInterval(flick); tray.classList.remove("rn-rolling"); finish(); } else renderTray(res, true); }, 65);
		} else finish();
		function finish() {
			renderTray(res, false);
			$("rn-again").hidden = false;
			var parts = res.groups.map(function (g) {
				if (!g.dice) return (g.sum < 0 ? "− " : "+ ") + Math.abs(g.sum);
				var list = g.dice.length > 40 ? "" : " [" + g.dice.map(function (d) { var s = g.term.fudge ? (d.v > 0 ? "+" : d.v < 0 ? "−" : "0") : String(d.v); return d.kept ? s : "<s>" + s + "</s>"; }).join(", ") + "]";
				return (g.term.sign < 0 ? "− " : "+ ") + esc(R.describe([Object.assign({}, g.term, { sign: 1 })])) + list + " = " + Math.abs(g.sum);
			}).join(" ").replace(/^\+ /, "");
			$("rn-dice-out").innerHTML = "<div class='rn-big'>" + fmt(res.total) + "</div><p class='rn-break'>" + parts + "</p>";
			spin($("rn-dice-out"));
			res.groups.forEach(function (g) {
				if (!g.dice || g.term.sides > 100) return;
				var key = g.term.fudge ? "dF" : "d" + g.term.sides, faces = [];
				g.dice.forEach(function (d) { d.chain.forEach(function (c) { faces.push(c); }); });
				record(key, g.term.sides, faces);
			});
			logLine(p.text + " → " + fmt(res.total)); save();
			$("rn-x").value = res.total; refreshOdds(true);
		}
	}

	/* odds */
	function getDist(p) {
		if (oddsCache.text === p.text) return oddsCache.d;
		var d = R.distribution(p, { rng: R.seeded("odds:" + p.text) });
		oddsCache = { text: p.text, d: d, s: R.summary(d) };
		return d;
	}
	$("rn-xhow").addEventListener("click", function (e) { var b = e.target.closest("[data-h]"); if (!b) return; xhow = b.getAttribute("data-h"); Array.prototype.forEach.call(this.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); }); refreshOdds(true); });
	$("rn-x").addEventListener("input", function () { refreshOdds(true); });
	function refreshOdds(keepX) {
		if (cur !== "dice") return;
		var p = parsed(), card = $("rn-odds-card");
		if (p.error) { card.hidden = true; return; }
		card.hidden = false;
		$("rn-odds-name").textContent = p.text;
		var d = getDist(p), s = oddsCache.s, pv = R.pairs(d);
		var xin = $("rn-x"), x = R.parseNum(xin.value);
		if (!keepX || isNaN(x)) { if (!(lastRoll && lastRoll.text === p.text)) { x = Math.round(s.mean); xin.value = x; } else if (isNaN(x)) { x = lastRoll.total; xin.value = x; } }
		var ans = R.probAt(d, x, xhow);
		$("rn-xans").textContent = "= " + pct(ans) + oneIn(ans);
		var mode = pv.reduce(function (a, b) { return b[1] > a[1] ? b : a; });
		$("rn-odds-stats").innerHTML = stat("Average", fmtDec(s.mean), "the long-run mean total") + stat("Range", fmt(s.min) + " to " + (d.p && !d.sparse && p.terms.some(function (t) { return t.explode; }) ? "no limit" : fmt(s.max)), "lowest and highest total") + stat("Most likely", fmt(mode[0]), pct(mode[1]) + " of rolls") + stat("Spread", fmtDec(s.sd), "standard deviation");
		$("rn-odds-note").textContent = (d.exact ? "These chances are exact: every combination of faces was counted. " : "") + (d.note || "") + (lastRoll && lastRoll.text === p.text ? " Your last roll (" + fmt(lastRoll.total) + ") is highlighted." : "");
		drawDist(pv, x, lastRoll && lastRoll.text === p.text ? lastRoll.total : null);
		var tbl = $("rn-odds-tbl");
		if (pv.length <= 400) {
			var cum = 0, rows = pv.map(function (q) { var ge = 1 - cum; cum += q[1]; return "<tr><td>" + fmt(q[0]) + "</td><td>" + pct(q[1]) + "</td><td>" + pct(Math.max(0, ge)) + "</td><td>" + pct(Math.min(1, cum)) + "</td></tr>"; });
			tbl.innerHTML = "<thead><tr><th scope='col'>Total</th><th scope='col'>Exactly</th><th scope='col'>This or more</th><th scope='col'>This or less</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
		} else tbl.innerHTML = "<tbody><tr><td>Too many totals (" + fmt(pv.length) + ") to list.</td></tr></tbody>";
	}
	function fmtDec(v) { return (Math.round(v * 10000) / 10000).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
	function stat(label, value, sub) { return "<div class='tu-stat'><div class='tu-stat__label'>" + esc(label) + "</div><div class='tu-stat__value'>" + esc(value) + "</div><div class='tu-stat__sub'>" + esc(sub) + "</div></div>"; }
	function drawDist(pv, x, hit) {
		var svg = $("rn-chart"), W = 640, H = 240, L = 46, B = 30, T = 12, Rr = 10;
		/* hide the long far tail of exploding / huge rolls */
		var lo = 0, hi = pv.length - 1, tail = 0;
		while (hi > lo && tail + pv[hi][1] < 0.0005) { tail += pv[hi][1]; hi--; }
		tail = 0; while (lo < hi && tail + pv[lo][1] < 0.0005) { tail += pv[lo][1]; lo++; }
		var pts = pv.slice(lo, hi + 1);
		var bins = pts;
		if (pts.length > 160) { /* group neighbouring totals */
			var g = Math.ceil(pts.length / 160); bins = [];
			for (var i = 0; i < pts.length; i += g) { var sl = pts.slice(i, i + g); bins.push([sl[0][0], sl.reduce(function (a, b) { return a + b[1]; }, 0), sl[sl.length - 1][0]]); }
		}
		var maxP = bins.reduce(function (a, b) { return Math.max(a, b[1]); }, 0) || 1;
		var n = bins.length, bw = (W - L - Rr) / n, out = [];
		var ticks = niceTicks(maxP);
		ticks.forEach(function (tv) { var y = H - B - (tv / maxP) * (H - B - T); out.push("<line x1='" + L + "' x2='" + (W - Rr) + "' y1='" + y + "' y2='" + y + "' class='rn-grid'/><text x='" + (L - 6) + "' y='" + (y + 4) + "' class='rn-axt' text-anchor='end'>" + (tv * 100).toFixed(tv * 100 < 1 ? 2 : tv * 100 < 10 ? 1 : 0).replace(/\.0+$/, "") + "%</text>"); });
		var step = Math.max(1, Math.ceil(n / 12));
		bins.forEach(function (b, i) {
			var h = (b[1] / maxP) * (H - B - T), xx = L + i * bw, top = b.length > 2 ? b[2] : b[0];
			var inX = xhow === "ge" ? top >= x : xhow === "le" ? b[0] <= x : (b[0] <= x && top >= x);
			var isHit = hit != null && b[0] <= hit && top >= hit;
			out.push("<rect x='" + (xx + Math.min(1, bw * 0.12)).toFixed(2) + "' y='" + (H - B - h).toFixed(2) + "' width='" + Math.max(0.6, bw - Math.min(2, bw * 0.24)).toFixed(2) + "' height='" + Math.max(0, h).toFixed(2) + "' class='" + (isHit ? "rn-bar rn-bar--hit" : inX ? "rn-bar rn-bar--in" : "rn-bar") + "'><title>" + (b.length > 2 ? fmt(b[0]) + "-" + fmt(b[2]) : fmt(b[0])) + ": " + pct(b[1]) + "</title></rect>");
			if (i % step === 0 || i === n - 1 && (n - 1) % step > step / 2) out.push("<text x='" + (xx + bw / 2).toFixed(1) + "' y='" + (H - B + 16) + "' class='rn-axt' text-anchor='middle'>" + fmt(b[0]) + "</text>");
		});
		out.push("<line x1='" + L + "' x2='" + (W - Rr) + "' y1='" + (H - B) + "' y2='" + (H - B) + "' class='rn-axis'/>");
		svg.innerHTML = out.join("");
		svg.setAttribute("aria-label", "Chance of each total from " + fmt(pts[0][0]) + " to " + fmt(pts[pts.length - 1][0]) + "; the most likely is " + fmt(pts.reduce(function (a, b) { return b[1] > a[1] ? b : a; })[0]));
	}
	function niceTicks(max) { var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), st2 = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (v) { return v >= raw; })[0]; var t = []; for (var v = st2; v <= max * 1.0001; v += st2) t.push(v); return t; }

	/* ================= COIN ================= */
	$("rn-coinq").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; $("rn-coins").value = b.getAttribute("data-c"); flip(); });
	$("rn-coins").addEventListener("keydown", function (e) { if (e.key === "Enter") flip(); });
	$("rn-flip").onclick = flip;
	if (st.coins) $("rn-coins").value = st.coins;
	function coinSvg(h) { return "<svg viewBox='0 0 100 100' class='rn-coin" + (h ? "" : " rn-coin--t") + "'><circle cx='50' cy='50' r='46' fill='url(#" + (h ? "rn-cg" : "rn-cg2") + ")' class='rn-crim'/><circle cx='50' cy='50' r='36' class='rn-cring'/><text x='50' y='52' text-anchor='middle' dominant-baseline='middle' class='rn-ctxt' font-size='" + (h ? 22 : 24) + "'>" + (h ? "HEADS" : "TAILS") + "</text></svg>"; }
	function flip() {
		var n = intVal("rn-coins", 1, 1, 1000); $("rn-coins").value = n; st.coins = n;
		var f = R.flips(rng, n), heads = f.filter(Boolean).length, s = R.streaks(f);
		var tray = $("rn-coin-tray"), shown = f.slice(0, n <= 100 ? n : 40);
		tray.className = "rn-coins" + (n > 12 ? " rn-coins--sm" : "") + (n === 1 ? " rn-coins--one" : "");
		tray.innerHTML = shown.map(function (v) { return "<span class='rn-cw'>" + coinSvg(v) + "</span>"; }).join("") + (n > shown.length ? "<span class='rn-more'>+" + (n - shown.length) + " more</span>" : "");
		if (!REDUCED) { tray.classList.remove("rn-flipping"); void tray.offsetWidth; tray.classList.add("rn-flipping"); }
		var out = $("rn-coin-out");
		if (n === 1) out.innerHTML = "<div class='rn-big'>" + (f[0] ? "Heads" : "Tails") + "</div>";
		else out.innerHTML = "<div class='rn-big'>" + heads + " heads, " + (n - heads) + " tails</div><p class='rn-break'>" + (heads / n * 100).toFixed(1) + "% heads. Longest run: " + s.heads + " heads in a row, " + s.tails + " tails in a row.</p>";
		var seqEl = $("rn-coin-seq");
		seqEl.hidden = n < 2; seqEl.textContent = f.map(function (v) { return v ? "H" : "T"; }).join("");
		record("coin", 2, f.map(function (v) { return v ? 2 : 1; }));
		var last = st.coinRun.length ? st.coinRun[st.coinRun.length - 1] : [0, 0];
		st.coinRun.push([last[0] + n, last[1] + heads]); if (st.coinRun.length > 400) st.coinRun.splice(0, st.coinRun.length - 400);
		logLine(n === 1 ? "Coin: " + (f[0] ? "heads" : "tails") : n + " coins: " + heads + " heads"); save();
		drawCoinStats();
	}
	function drawCoinStats() {
		var c = st.h.coin || [0, 0], tot = c[0] + c[1];
		$("rn-coin-stats").innerHTML = stat("Flips", fmt(tot), "since you last cleared the history") + stat("Heads", tot ? (c[1] / tot * 100).toFixed(1) + "%" : "-", fmt(c[1]) + " heads, " + fmt(c[0]) + " tails") + (tot >= 10 ? stat("Fair coin?", (function () { var r = R.chiSquare([c[0], c[1]]); return r.p < 0.05 ? "Unusual" : "Looks fair"; })(), "p = " + R.chiSquare([c[0], c[1]]).p.toFixed(3) + " (see Statistics)") : "");
		var svg = $("rn-coin-chart"), W = 640, H = 200, L = 46, B = 26, T = 10, run = st.coinRun;
		var out = [];
		[0, 25, 50, 75, 100].forEach(function (v) { var y = H - B - v / 100 * (H - B - T); out.push("<line x1='" + L + "' x2='630' y1='" + y + "' y2='" + y + "' class='" + (v === 50 ? "rn-mid" : "rn-grid") + "'/><text x='" + (L - 6) + "' y='" + (y + 4) + "' class='rn-axt' text-anchor='end'>" + v + "%</text>"); });
		if (run.length) {
			var maxN = run[run.length - 1][0], minN = run[0][0] - (run.length > 1 ? 0 : 1);
			var pts = [[run[0][0] - (run.length === 1 ? 1 : 0), run[0][1] / run[0][0]]].concat(run.map(function (r) { return [r[0], r[1] / r[0]]; }));
			var span = Math.max(1, maxN - minN);
			var d = pts.map(function (p, i) { var x = L + (p[0] - minN) / span * (630 - L), y = H - B - p[1] * (H - B - T); return (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); }).join("");
			out.push("<path d='" + d + "' class='rn-line'/>");
			out.push("<text x='" + L + "' y='" + (H - 6) + "' class='rn-axt'>" + fmt(minN) + " flips</text><text x='630' y='" + (H - 6) + "' class='rn-axt' text-anchor='end'>" + fmt(maxN) + " flips</text>");
		} else out.push("<text x='338' y='100' class='rn-axt' text-anchor='middle'>Flip some coins to draw the line.</text>");
		svg.innerHTML = out.join("");
	}

	/* ================= CARDS ================= */
	var cs = st.cards || {};
	if (!Array.isArray(cs.deck)) cs = { jk: false, deck: R.shuffle(rng, R.deck(false)), out: [] };
	$("rn-jk").checked = !!cs.jk;
	function newDeck() { cs.jk = $("rn-jk").checked; cs.deck = R.shuffle(rng, R.deck(cs.jk)); cs.out = []; st.cards = cs; save(); updLeft(); $("rn-card-out").innerHTML = "<p class='tu-note'>Shuffled a fresh deck of " + cs.deck.length + " cards.</p>"; showErr("rn-card-err", ""); }
	$("rn-shuf").onclick = function () { newDeck(); toast("Deck shuffled"); };
	$("rn-jk").onchange = newDeck;
	function updLeft() { $("rn-left").textContent = cs.deck.length + " card" + (cs.deck.length === 1 ? "" : "s") + " left in the deck"; }
	function cardHtml(code) {
		var c = R.cardInfo(code);
		if (c.joker) return "<span class='rn-card rn-card--jk" + (c.hot ? " rn-hot" : "") + "' role='img' aria-label='Joker'><span class='rn-cc'>JOKER</span><span class='rn-cmid'>★</span><span class='rn-cc rn-cc--b'>JOKER</span></span>";
		var face = /[JQK]/.test(c.rank), mid = face ? "<span class='rn-cface'>" + c.rank + "</span><span class='rn-cfsuit'>" + c.sym + "</span>" : c.rank === "A" ? "<span class='rn-cace'>" + c.sym + "</span>" : "<span class='rn-cmid'>" + c.sym + "</span>";
		return "<span class='rn-card" + (c.hot ? " rn-hot" : "") + "' role='img' aria-label='" + esc(c.name) + "'><span class='rn-cc'>" + c.rank + "<br>" + c.sym + "</span>" + mid + "<span class='rn-cc rn-cc--b'>" + c.rank + "<br>" + c.sym + "</span></span>";
	}
	function cardNames(list) { return list.map(function (c) { return R.cardInfo(c).name; }).join(", "); }
	$("rn-draw").onclick = function () {
		var n = intVal("rn-drawn", 1, 1, 54); $("rn-drawn").value = n;
		if (n > cs.deck.length) return showErr("rn-card-err", "Only " + cs.deck.length + " cards are left. Shuffle a new deck to start again.");
		showErr("rn-card-err", "");
		var got = cs.deck.splice(0, n); cs.out = cs.out.concat(got); st.cards = cs;
		$("rn-card-out").innerHTML = "<div class='rn-hand'>" + got.map(cardHtml).join("") + "</div><p class='tu-note'>" + esc(cardNames(got)) + "</p>";
		spin($("rn-card-out"));
		logLine("Drew " + cardNames(got).slice(0, 90)); save(); updLeft();
	};
	$("rn-deal").onclick = function () {
		var pl = intVal("rn-players", 4, 1, 20), each = intVal("rn-each", 5, 1, 52); $("rn-players").value = pl; $("rn-each").value = each;
		if (pl * each > cs.deck.length) return showErr("rn-card-err", pl + " players x " + each + " cards needs " + pl * each + " cards but only " + cs.deck.length + " are left. Shuffle a new deck or deal fewer.");
		showErr("rn-card-err", "");
		var d = R.deal(cs.deck, pl, each); cs.deck = d.rest; d.hands.forEach(function (h) { cs.out = cs.out.concat(h); }); st.cards = cs;
		$("rn-card-out").innerHTML = d.hands.map(function (h, i) { return "<div class='rn-handrow'><div class='rn-handlab'>Player " + (i + 1) + "</div><div class='rn-hand rn-hand--sm'>" + h.map(cardHtml).join("") + "</div></div>"; }).join("") + "<p class='tu-note'>Dealt one card at a time round the table, like a real dealer.</p>";
		spin($("rn-card-out"));
		logLine("Dealt " + pl + " hands of " + each); save(); updLeft();
	};
	updLeft();

	/* ================= LIST ================= */
	var lst = st.list || {}, tby = lst.by || "n", lastList = "";
	$("rn-names").value = lst.text || ""; $("rn-rm").checked = !!lst.rm;
	function names() { return R.parseNames($("rn-names").value); }
	function updCount() { var n = names().length; $("rn-ncount").textContent = n ? n + " item" + (n === 1 ? "" : "s") + " in the list." : "Add at least two items."; }
	function saveList() { st.list = { text: $("rn-names").value, rm: $("rn-rm").checked, by: tby }; save(); updCount(); }
	$("rn-names").addEventListener("input", saveList); $("rn-rm").onchange = saveList;
	$("rn-tby").addEventListener("click", function (e) { var b = e.target.closest("[data-b]"); if (!b) return; tby = b.getAttribute("data-b"); Array.prototype.forEach.call(this.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); }); saveList(); });
	Array.prototype.forEach.call($("rn-tby").children, function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-b") === tby ? "true" : "false"); });
	function needList(min) { var n = names(); if (n.length < min) { showErr("rn-list-err", "Add at least " + min + " items first."); return null; } showErr("rn-list-err", ""); return n; }
	function removePicked(picked) {
		if (!$("rn-rm").checked) return;
		var left = names(), drop = picked.slice();
		left = left.filter(function (x) { var i = drop.indexOf(x); if (i >= 0) { drop.splice(i, 1); return false; } return true; });
		$("rn-names").value = left.join("\n"); saveList();
	}
	$("rn-pick1").onclick = function () {
		var n = needList(1); if (!n) return;
		var w = n[R.below(rng, n.length)], out = $("rn-list-out");
		lastList = w;
		function show() { out.innerHTML = "<div class='rn-big rn-win'>🎉 " + esc(w) + "</div><p class='tu-note'>Picked from " + n.length + " (each had a 1 in " + n.length + " chance).</p>"; removePicked([w]); logLine("Winner: " + w); save(); }
		if (REDUCED || n.length < 2) return show();
		var k = 0, t = setInterval(function () { out.innerHTML = "<div class='rn-big rn-win rn-shuffling'>" + esc(n[Math.floor(Math.random() * n.length)]) + "</div>"; if (++k > 10) { clearInterval(t); show(); } }, 70);
	};
	$("rn-pickn").onclick = function () {
		var n = needList(1); if (!n) return;
		var k = intVal("rn-pn", 3, 1, n.length); $("rn-pn").value = k;
		var p = R.pickN(rng, n, k); lastList = p.join("\n");
		$("rn-list-out").innerHTML = "<ol class='rn-ol'>" + p.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>";
		spin($("rn-list-out")); removePicked(p); logLine("Picked " + k + ": " + p.join(", ").slice(0, 80)); save();
	};
	$("rn-lshuf").onclick = function () {
		var n = needList(2); if (!n) return;
		var p = R.shuffle(rng, n); lastList = p.join("\n");
		$("rn-list-out").innerHTML = "<ol class='rn-ol'>" + p.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>";
		spin($("rn-list-out")); logLine("Shuffled a list of " + n.length); save();
	};
	$("rn-teams").onclick = function () {
		var n = needList(2); if (!n) return;
		var k = intVal("rn-tk", 2, 1, n.length); $("rn-tk").value = k;
		var t = R.teams(rng, n, k, tby === "s");
		lastList = t.map(function (g, i) { return "Team " + (i + 1) + ": " + g.join(", "); }).join("\n");
		$("rn-list-out").innerHTML = "<div class='rn-teams'>" + t.map(function (g, i) { return "<div class='rn-team'><b>Team " + (i + 1) + "</b> <span class='rn-tn'>(" + g.length + ")</span><ul>" + g.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div>";
		spin($("rn-list-out")); logLine("Made " + t.length + " teams from " + n.length); save();
	};
	$("rn-lcopy").onclick = function () { if (lastList) copy(lastList, "Copied"); else toast("Pick something first"); };
	updCount();

	/* ================= STATISTICS ================= */
	var srcSel = $("rn-src");
	function srcLabel(k) {
		if (k === "coin") return "Coin flips";
		if (k === "dF") return "Fudge dice (-, blank, +)";
		if (k[0] === "d") return k + " faces";
		if (k.indexOf("n:") === 0) return "Numbers " + k.slice(2).replace(/(\d)-/, "$1 to ");
		return k;
	}
	function fillSrc() {
		var keep = srcSel.value, keys = Object.keys(st.h).filter(function (k) { return st.h[k].reduce(function (a, b) { return a + b; }, 0) > 0; });
		keys.sort(function (a, b) { return (st.h[b].reduce(function (x, y) { return x + y; }, 0)) - (st.h[a].reduce(function (x, y) { return x + y; }, 0)); });
		srcSel.innerHTML = keys.map(function (k) { return "<option value='" + esc(k) + "'>" + esc(srcLabel(k)) + " (" + fmt(st.h[k].reduce(function (a, b) { return a + b; }, 0)) + ")</option>"; }).join("") + "<option value='own'>Test my own die: type the counts</option>";
		if (keep && Array.prototype.some.call(srcSel.options, function (o) { return o.value === keep; })) srcSel.value = keep;
	}
	srcSel.onchange = drawStats;
	$("rn-owntxt").addEventListener("input", drawStats);
	$("rn-hclear").onclick = function () { if (!confirm("Clear the saved history of rolls, flips and picks?")) return; st.h = {}; st.log = []; st.coinRun = []; save(); drawStats(); toast("History cleared"); };
	function faceLabels(k, n) {
		if (k === "coin") return ["T", "H"];
		if (k === "dF") return ["−", "0", "+"];
		var off = 1; if (k.indexOf("n:") === 0) off = parseInt(k.slice(2), 10);
		var out = []; for (var i = 0; i < n; i++) out.push(String(off + i)); return out;
	}
	function drawStats() {
		fillSrc();
		var k = srcSel.value, own = k === "own";
		$("rn-own").hidden = !own;
		var counts, labels;
		if (own) { counts = ($("rn-owntxt").value.match(/\d+/g) || []).map(Number); labels = counts.map(function (_, i) { return String(i + 1); }); }
		else { counts = (st.h[k] || []).slice(); labels = faceLabels(k, counts.length); }
		var tot = counts.reduce(function (a, b) { return a + b; }, 0), box = $("rn-st-stats"), verd = $("rn-verdict");
		if (counts.length < 2 || !tot) {
			box.innerHTML = ""; $("rn-hist").innerHTML = "<text x='320' y='120' class='rn-axt' text-anchor='middle'>" + (own ? "Type how many times each side came up." : "Roll some dice or flip some coins first.") + "</text>";
			verd.textContent = ""; drawLog(); return;
		}
		var vals = labels.map(function (l) { return l === "+" ? 1 : l === "−" ? -1 : l === "0" && k === "dF" ? 0 : l === "H" ? 1 : l === "T" ? 0 : +l; });
		var mean = counts.reduce(function (a, c, i) { return a + c * vals[i]; }, 0) / tot, exp = vals.reduce(function (a, v) { return a + v; }, 0) / vals.length;
		var r = R.chiSquare(counts);
		box.innerHTML = stat("Results", fmt(tot), counts.length + " possible outcomes") + stat("Average", fmtDec(mean), "a fair one averages " + fmtDec(exp)) + stat("Chi-square", fmtDec(r.chi2), r.df + " degrees of freedom") + stat("p-value", r.p < 0.0001 ? "< 0.0001" : r.p.toFixed(4), "chance a fair one looks this uneven");
		verd.textContent = R.verdict(r);
		verd.className = "rn-verdict" + (r.enough && r.p < 0.01 ? " rn-v-bad" : r.enough && r.p < 0.05 ? " rn-v-mid" : r.enough ? " rn-v-ok" : "");
		/* histogram */
		var svg = $("rn-hist"), W = 640, H = 240, L = 46, B = 30, T = 12, n = counts.length, maxC = Math.max.apply(null, counts.concat([tot / n * 1.15])), bw = (W - L - 10) / n, out = [];
		niceTicks(maxC).forEach(function (tv) { var y = H - B - tv / maxC * (H - B - T); out.push("<line x1='" + L + "' x2='630' y1='" + y + "' y2='" + y + "' class='rn-grid'/><text x='" + (L - 6) + "' y='" + (y + 4) + "' class='rn-axt' text-anchor='end'>" + fmt(Math.round(tv * 100) / 100) + "</text>"); });
		var step = Math.max(1, Math.ceil(n / 20));
		counts.forEach(function (c, i) {
			var h = c / maxC * (H - B - T), x = L + i * bw;
			out.push("<rect x='" + (x + bw * 0.12).toFixed(1) + "' y='" + (H - B - h).toFixed(1) + "' width='" + (bw * 0.76).toFixed(1) + "' height='" + h.toFixed(1) + "' class='rn-bar rn-bar--in'><title>" + esc(labels[i]) + ": " + fmt(c) + " times (" + (c / tot * 100).toFixed(1) + "%)</title></rect>");
			if (i % step === 0) out.push("<text x='" + (x + bw / 2).toFixed(1) + "' y='" + (H - B + 16) + "' class='rn-axt' text-anchor='middle'>" + esc(labels[i]) + "</text>");
		});
		var ey = H - B - (tot / n) / maxC * (H - B - T);
		out.push("<line x1='" + L + "' x2='630' y1='" + ey.toFixed(1) + "' y2='" + ey.toFixed(1) + "' class='rn-exp'/><text x='628' y='" + (ey - 5).toFixed(1) + "' class='rn-axt rn-expt' text-anchor='end'>fair: " + fmtDec(tot / n) + " each</text>");
		out.push("<line x1='" + L + "' x2='630' y1='" + (H - B) + "' y2='" + (H - B) + "' class='rn-axis'/>");
		svg.innerHTML = out.join("");
		drawLog();
	}
	function drawLog() {
		$("rn-log").innerHTML = st.log.length ? st.log.map(function (l) { var d = new Date(l.t); return "<li><time>" + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</time> " + esc(l.s) + "</li>"; }).join("") : "<li>Nothing yet.</li>";
	}

	/* ---------- start ---------- */
	var start = Q.get("tab") || st.tabs[MODE] || (MODE === "dice" ? "dice" : "num");
	if (Q.get("d") && !Q.get("tab")) start = "dice";
	showTab(start);
	onDn();
	if (cur === "dice" && Q.get("d")) roll();
	document.addEventListener("keydown", function (e) {
		if (e.key !== " " && e.key !== "r" && e.key !== "R") return;
		var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		var go = { num: genNumbers, dice: roll, coin: flip, cards: function () { $("rn-draw").click(); }, list: function () { $("rn-pick1").click(); } }[cur];
		if (go && root.getBoundingClientRect().bottom > 0) { e.preventDefault(); go(); }
	});
})();
