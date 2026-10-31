/* MES Jump-Start a Car -- pure logic (global MESJump; also require()-able in node for the tests).
 * - Connection rules of the jump-start simulator (cables and jump pack): place() / remove() return a code the page explains.
 * - Battery maths: resting / running voltage -> state of charge, cold-weather power vs engine need, freezing point, drain days.
 * - Battery date-code decoder: a typed code -> every likely reading (format-based; makers differ, so it lists them all).
 * All numbers are the usual rule-of-thumb figures from battery makers and auto clubs (sources on the page), not lab data. */
(function (root) {
	"use strict";
	var J = {};

	/* ---------------- simulator: targets and clamps ---------------- */
	// polarity of each target: "+" positive, "-" negative post, "g" bare-metal ground, "p" painted metal (bad contact)
	J.TARGETS = {
		dPos: { car: "dead", pol: "+", name: "dead battery +" },
		dNeg: { car: "dead", pol: "-", name: "dead battery −" },
		dGnd: { car: "dead", pol: "g", name: "unpainted metal on the dead car's engine" },
		dPaint: { car: "dead", pol: "p", name: "painted body panel" },
		gPos: { car: "good", pol: "+", name: "good battery +" },
		gNeg: { car: "good", pol: "-", name: "good battery −" }
	};
	J.CABLE_CLAMPS = ["r1", "r2", "b1", "b2"];
	J.PACK_CLAMPS = ["pr", "pb"];
	J.colourOf = function (c) { return c.charAt(0) === "r" || c === "pr" ? "red" : "black"; };
	J.partner = function (c) { return { r1: "r2", r2: "r1", b1: "b2", b2: "b1" }[c] || null; };
	function placed(conn, colour) { return Object.keys(conn).filter(function (k) { return conn[k] && J.colourOf(k) === colour; }); }
	function where(conn, t) { for (var k in conn) if (conn[k] === t) return k; return null; }

	/* cables: returns {ok, code, step}. ok=false means the clamp goes back (the page explains why). */
	J.placeCable = function (conn, clamp, target) {
		var T = J.TARGETS[target]; if (!T) return { ok: false, code: "nowhere" };
		if (where(conn, target)) return { ok: false, code: "occupied" };
		var col = J.colourOf(clamp), reds = placed(conn, "red"), blacks = placed(conn, "black");
		if (col === "red") {
			if (T.pol !== "+") return { ok: false, code: reds.length ? "red-neg-live" : "red-neg" };
			if (reds.length === 0) return target === "dPos" ? { ok: true, code: "step1", step: 1 } : { ok: false, code: "red-good-first" };
			if (blacks.length) return { ok: false, code: "black-early" };
			return target === "gPos" ? { ok: true, code: "step2", step: 2 } : { ok: false, code: "occupied" };
		}
		if (T.pol === "+") return { ok: false, code: reds.length === 2 ? "short" : "black-pos" };
		if (reds.length < 2) return { ok: false, code: "black-early" };
		if (blacks.length === 0) {
			if (target === "gNeg") return { ok: true, code: "step3", step: 3 };
			return { ok: false, code: "black-dead-first" };
		}
		if (target === "dGnd") return { ok: true, code: "step4", step: 4 };
		if (target === "dNeg") return { ok: false, code: "black-dead-neg" };
		if (target === "dPaint") return { ok: false, code: "paint" };
		return { ok: false, code: "nowhere" };
	};
	/* removal order = the reverse of connecting */
	J.REMOVE_ORDER = ["dGnd", "gNeg", "gPos", "dPos"];
	J.removeCable = function (conn, clamp) {
		var t = conn[clamp]; if (!t) return { ok: false, code: "not-on" };
		for (var i = 0; i < J.REMOVE_ORDER.length; i++) {
			var want = J.REMOVE_ORDER[i];
			if (where(conn, want)) return want === t ? { ok: true, code: "off" + (i + 1), step: i + 1 } : { ok: false, code: "remove-order", want: want };
		}
		return { ok: false, code: "not-on" };
	};
	/* two clamps touching: a short circuit (sparks) when a red end sits at + and a black end at − (or bare metal) of the same battery.
	   A free clamp carries the potential of wherever its partner is clamped; once both reds are on, the two + posts are one node. */
	J.touchRisk = function (conn, a, b) {
		if (J.colourOf(a) === J.colourOf(b)) return false;
		function pot(c) {
			var t = conn[c] || (J.partner(c) ? conn[J.partner(c)] : null);
			return t ? J.TARGETS[t] : null;
		}
		var red = J.colourOf(a) === "red" ? a : b, blk = red === a ? b : a, pr = pot(red), pb = pot(blk);
		if (!pr || !pb || pr.pol !== "+" || pb.pol === "+" || pb.pol === "p") return false;
		var linked = conn.r1 && conn.r2;          // both + posts joined by the red cable
		return pr.car === pb.car || !!linked;
	};

	/* jump pack: red to +, black to ground (best) or −, pack switched OFF while connecting */
	J.placePack = function (conn, clamp, target, packOn) {
		var T = J.TARGETS[target]; if (!T || T.car !== "dead") return { ok: false, code: "nowhere" };
		if (where(conn, target)) return { ok: false, code: "occupied" };
		if (packOn) return { ok: false, code: "pack-on" };
		var col = J.colourOf(clamp);
		if (col === "red") return T.pol === "+" ? { ok: true, code: "pstep1", step: 1 } : { ok: false, code: "pack-reverse" };
		if (T.pol === "+") return { ok: false, code: "pack-reverse" };
		if (!conn.pr) return { ok: false, code: "pack-black-first" };
		if (T.pol === "p") return { ok: false, code: "paint" };
		return { ok: true, code: target === "dGnd" ? "pstep2" : "pstep2neg", step: 2 };
	};
	J.removePack = function (conn, clamp, packOn) {
		if (!conn[clamp]) return { ok: false, code: "not-on" };
		if (packOn) return { ok: false, code: "pack-still-on" };
		if (clamp === "pr" && conn.pb) return { ok: false, code: "remove-order", want: conn.pb };
		return { ok: true, code: clamp === "pb" ? "poff1" : "poff2" };
	};

	/* dead battery voltage while the donor charges it through the cables (minutes of running, rough): 11.4 V -> ~12.4 V */
	J.chargeVolts = function (min, start) { var s = start == null ? 11.4 : start; return s + (12.45 - s) * (1 - Math.exp(-min / 2.2)); };
	J.WAIT_NEEDED = 2;   // minutes of donor running before a first crank usually works (guides: 2-5 minutes)

	/* ---------------- voltage -> state of charge ---------------- */
	// resting voltage (engine off for a few hours, no load), at about 25 °C. Flooded: BCI / auto-club figures; AGM runs ~0.1-0.2 V higher.
	J.SOC_TABLE = {
		flooded: [[11.9, 0], [12.0, 25], [12.2, 50], [12.4, 75], [12.6, 100]],
		agm: [[11.8, 0], [12.0, 20], [12.3, 50], [12.6, 75], [12.8, 100]]
	};
	function interp(tab, x) {
		if (x <= tab[0][0]) return tab[0][1];
		for (var i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
			var a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
		}
		return tab[tab.length - 1][1];
	}
	J.interp = interp;
	J.soc = function (v, type) { return Math.round(interp(J.SOC_TABLE[type === "agm" ? "agm" : "flooded"], v)); };
	J.restVerdict = function (v, type) {
		var s = J.soc(v, type);
		if (v > 13.0) return { k: "surface", soc: 100 };
		if (s >= 95) return { k: "full", soc: s };
		if (s >= 70) return { k: "good", soc: s };
		if (s >= 45) return { k: "half", soc: s };
		if (s > 5) return { k: "low", soc: s };
		return { k: "flat", soc: 0 };
	};
	J.runVerdict = function (v) {
		if (v < 12.8) return "not-charging";
		if (v < 13.5) return "low-charge";
		if (v <= 14.8) return "normal";
		if (v <= 15.0) return "high";
		return "over";
	};

	/* ---------------- cold: what the battery can give vs what the engine needs ---------------- */
	// Classic battery-maker chart: at 27 °C (80 °F) 100 % / 100 %; 0 °C (32 °F) 65 % / 155 %; -18 °C (0 °F) 40 % / 210 %.
	J.POWER = [[-18, 40], [0, 65], [27, 100]];
	J.NEED = [[-18, 210], [0, 155], [27, 100]];
	function lin(tab, t) {          // linear between the three points, extended with the end slopes (rough outside -18..27 °C)
		var a, b;
		if (t < tab[0][0]) { a = tab[0]; b = tab[1]; }
		else if (t > tab[tab.length - 1][0]) { a = tab[tab.length - 2]; b = tab[tab.length - 1]; }
		else return interp(tab, t);
		return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
	}
	J.powerAt = function (t) { var p = t > 27 ? 100 : lin(J.POWER, t); return Math.max(5, Math.min(100, p)); };
	J.needAt = function (t) { var n = t > 27 ? 100 : lin(J.NEED, t); return Math.max(100, Math.min(400, n)); };
	J.margin = function (t) { return J.powerAt(t) / J.needAt(t); };   // 1 at 27 °C, ~0.19 at -18 °C
	J.cToF = function (c) { return c * 9 / 5 + 32; };
	J.fToC = function (f) { return (f - 32) * 5 / 9; };
	// electrolyte freezing point vs charge (°C, approximate, flooded lead-acid)
	J.FREEZE = [[0, -8], [25, -16], [50, -24], [75, -38], [100, -58]];
	J.freezeAt = function (soc) { return Math.round(interp(J.FREEZE, soc)); };

	/* ---------------- parasitic drain ---------------- */
	// days until the battery falls from startSoc % to stopSoc % (about where a car stops cranking) at a constant drain in mA
	J.drainDays = function (ah, ma, startSoc, stopSoc) {
		if (!(ah > 0) || !(ma > 0)) return Infinity;
		var use = ah * Math.max(0, startSoc - (stopSoc == null ? 50 : stopSoc)) / 100;
		return use / (ma / 1000) / 24;
	};

	/* ---------------- battery life by climate ---------------- */
	J.LIFE = { hot: [2, 4], mild: [3, 5], cold: [4, 6] };
	J.ageMonths = function (y, m, now) { now = now || new Date(); return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m); };

	/* ---------------- date codes ---------------- */
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	J.MONTHS = MONTHS;
	var ALL12 = "ABCDEFGHIJKL", SKIPI = "ABCDEFGHJKLM";
	J.normCode = function (s) { return String(s || "").toUpperCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim(); };
	// one-digit year: the most recent year ending in that digit that is not in the future (and not more than ~1 year ahead of now)
	J.yearFromDigit = function (d, now) {
		var y = now.getFullYear(), c = y - (y % 10) + d;
		return c > y ? c - 10 : c;
	};
	J.yearFromTwo = function (dd, now) { var y = 2000 + dd; return y > now.getFullYear() ? y - 100 : y; };
	function reading(list, y, m, label, note, conf, now) {
		if (!(m >= 1 && m <= 12) || !(y >= 1990)) return;
		if (y * 12 + m > now.getFullYear() * 12 + now.getMonth() + 2) return;     // not in the future
		for (var i = 0; i < list.length; i++) if (list[i].y === y && list[i].m === m && list[i].label === label) return;
		list.push({ y: y, m: m, label: label, note: note || "", conf: conf || "likely", text: MONTHS[m - 1] + " " + y, age: J.ageMonths(y, m, now) });
	}
	J.decode = function (raw, now) {
		now = now || new Date();
		var s = J.normCode(raw), out = [], m, c = s.replace(/[\s.\-\/]/g, "");
		if (!c) return out;
		// 1) month letter + year digit(s): F-15, F15, F5, C3 (stickers, many heat stamps: Interstate stickers, Crown, Deka, Trojan, Duralast, EverStart, NorthStar...)
		if ((m = /^([A-M])(\d{1,2})$/.exec(c))) {
			var L = m[1], yd = m[2], y = yd.length === 2 ? J.yearFromTwo(+yd, now) : J.yearFromDigit(+yd, now);
			var a = ALL12.indexOf(L) + 1, b = SKIPI.indexOf(L) + 1;
			if (a && b && a === b) reading(out, y, a, "Letter = month, number = year", "A = January, B = February … (both letter systems agree up to H)", "likely", now);
			else {
				if (a) reading(out, y, a, "Letter = month (A–L, I used)", "Used by Trojan, Crown and many shop stickers", "likely", now);
				if (b) reading(out, y, b, "Letter = month (A–M, I skipped)", "Used by Deka / East Penn and others: I is skipped so it is not read as 1", "likely", now);
			}
			if (yd.length === 1) reading(out, y - 10, a || b, "Same code, ten years earlier", "A one-digit year repeats every 10 years; a battery this old would be very unusual", "unlikely", now);
			// older Exide-style: letter = year, digit = month (reported; A = 2010 ... J = 2019)
			if (yd.length <= 2 && +yd >= 1 && +yd <= 12 && ALL12.indexOf(L) >= 0) reading(out, 2010 + ALL12.indexOf(L), +yd, "Letter = year, number = month (older Exide style)", "Reported for some Exide batteries made before 2020 (A = 2010)", "possible", now);
		}
		// 2) year digit(s) + month letter: 5F, 15F, 3A (Continental and others print it this way round)
		if ((m = /^(\d{1,2})([A-M])$/.exec(c))) {
			var L2 = m[2], y2 = m[1].length === 2 ? J.yearFromTwo(+m[1], now) : J.yearFromDigit(+m[1], now);
			var a2 = ALL12.indexOf(L2) + 1, b2 = SKIPI.indexOf(L2) + 1;
			if (a2) reading(out, y2, a2, "Number = year, letter = month", "Same letters as above, written the other way round", "likely", now);
			if (b2 && b2 !== a2) reading(out, y2, b2, "Number = year, letter = month (I skipped)", "", "likely", now);
		}
		// 3) month / year: 06/15, 06-15, 0615 (shop "sold" stickers, Duralast, Duracell, Odyssey top label)
		if ((m = /^(\d{1,2})[\/\-. ](\d{2}|\d{4})$/.exec(s)) || (m = /^(0[1-9]|1[0-2])(\d{2})$/.exec(c))) {
			var mm = +m[1], yy = m[2].length === 4 ? +m[2] : J.yearFromTwo(+m[2], now);
			reading(out, yy, mm, "Month / year", "Typical of shop stickers and labels such as Duralast and Duracell", "likely", now);
		}
		// 4) four digits as a Julian date YDDD (Optima: year digit + day of the year)
		if ((m = /^(\d)(\d{3})$/.exec(c)) && +m[2] >= 1 && +m[2] <= 366) {
			var yj = J.yearFromDigit(+m[1], now), d = new Date(Date.UTC(yj, 0, +m[2]));
			reading(out, yj, d.getUTCMonth() + 1, "Year digit + day of the year (Julian)", "Optima prints it this way: day " + (+m[2]) + " = " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()], "possible", now);
		}
		// 5) three digits: year digit + two-digit month (reported for ACDelco and Bosch)
		if ((m = /^(\d)(0[1-9]|1[0-2])$/.exec(c))) reading(out, J.yearFromDigit(+m[1], now), +m[2], "Year digit + two-digit month", "Reported for ACDelco and some Bosch batteries", "possible", now);
		// 6) longer stamped codes: look for a month letter followed by a year digit at the end (Interstate-style cover codes: E4JC = October 2012)
		if (out.length === 0 && /^[A-Z0-9]{4,12}$/.test(c)) {
			var t = /([A-M])(\d)$/.exec(c) || /([A-M])[A-Z0-9](\d)$/.exec(c);
			if (t) {
				var yt = J.yearFromDigit(+t[2], now), at = ALL12.indexOf(t[1]) + 1;
				reading(out, yt, at, "Month letter near the end, last digit = year", "Some long stamped codes (Interstate covers, for example) hide the date here; check the maker", "possible", now);
			}
		}
		var rank = { likely: 0, possible: 1, unlikely: 2 };
		out.sort(function (p, q) { return rank[p.conf] - rank[q.conf] || q.y * 12 + q.m - (p.y * 12 + p.m); });
		return out;
	};
	J.ageText = function (months) {
		if (months < 0) return "not made yet";
		var y = Math.floor(months / 12), m = months % 12;
		return (y ? y + (y === 1 ? " year" : " years") : "") + (y && m ? ", " : "") + (m || !y ? m + (m === 1 ? " month" : " months") : "");
	};

	if (typeof module !== "undefined" && module.exports) module.exports = J;
	else root.MESJump = J;
})(this);

/* MES Jump-Start a Car -- mes.fm/jump-start (UI; rules and maths in lib.js, global MESJump).
 * Simulator: SVG engine bays; clamps are dragged with pointer events (mouse / touch / pen) or tapped then placed (also keyboard: Enter on a clamp,
 * then Enter on a spot). Modes: jumper cables, jump pack, push start (info). Fill window / Full screen come from /main_js/panel-view.js.
 * Settings: localStorage "mes-jump-start:v1" = {unit, clim, vm, bt}. Links: ?mode=cables|pack|push&code=F-15 */
(function () {
	"use strict";
	var J = window.MESJump, $ = function (id) { return document.getElementById(id); };
	var root = $("jp"); if (!root || !J) return;
	var NS = "http://www.w3.org/2000/svg", KEY = "mes-jump-start:v1";
	function el(tag, attrs, parent, text) {
		var e = document.createElementNS(NS, tag);
		if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
		if (text != null) e.textContent = text;
		if (parent) parent.appendChild(e);
		return e;
	}
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
	var Q = new URLSearchParams(location.search);

	/* =============================== simulator =============================== */
	var svg = $("jp-svg");
	var PT = {      // target spots (clamp tip goes here)
		normal: { dPos: [350, 150], dNeg: [430, 150], dGnd: [112, 330], dPaint: [300, 404], gPos: [580, 150], gNeg: [660, 150] },
		remote: { dPos: [360, 196], dGnd: [440, 196], dPaint: [300, 404], gPos: [580, 150], gNeg: [660, 150] }
	};
	// landscape layout (dead car left, helper right); on narrow screens a portrait layout stacks the helper half under the dead one
	// A jumper cable set = a red and a black cable bonded side by side; each END has one red + one black clamp (r1 + b1 = end 1, r2 + b2 = end 2).
	var PARK_L = { r1: [345, 578], b1: [397, 578], r2: [643, 578], b2: [695, 578], pr: [625, 560], pb: [705, 560] };
	var PARK_P = { r1: [80, 1026], b1: [132, 1026], r2: [368, 1026], b2: [420, 1026], pr: [180, 1000], pb: [320, 1000] };
	var MATE = { r1: "b1", b1: "r1", r2: "b2", b2: "r2" };      // the other clamp at the same end of the set
	var BAG_L = { x: 300, y: 456, w: 440, h: 136 }, BAG_P = { x: 30, y: 892, w: 440, h: 146 };
	var portrait = false, PARK = PARK_L, BAG = BAG_L;
	function M(p) { return portrait && p[0] >= 500 ? [p[0] - 490, p[1] + 430] : p; }
	var LABEL = { r1: "Red clamp (end 1)", r2: "Red clamp (end 2)", b1: "Black clamp (end 1)", b2: "Black clamp (end 2)", pr: "Red clamp of the jump pack", pb: "Black clamp of the jump pack" };
	function carOf(t) { return t ? J.TARGETS[t].car : null; }
	// which car an end of the set is at (its red or black clamp is on that car), or null while the end is in the bag
	function endCar(c) { var m = MATE[c]; return carOf(S.conn[c]) || (m ? carOf(S.conn[m]) : null); }
	function endName(c) { var car = endCar(c); return car === "dead" ? "dead-car end" : car === "good" ? "helper end" : (c.charAt(1) === "1" ? "end 1" : "end 2"); }
	function labelOf(c) { if (S.mode === "pack" || !MATE[c]) return LABEL[c]; return (J.colourOf(c) === "red" ? "Red" : "Black") + " clamp at " + (endCar(c) ? "the " : "") + endName(c); }
	var S = { mode: "cables", remote: false, conn: {}, phase: "connect", donorOn: false, deadOn: false, mins: 0, fails: 0, packOn: false, sel: null };
	var G = {};       // svg layers
	var MSG = {
		step1: ["ok", "Step 1 done", "This end of the set is now the <b>dead-car end</b>: its red clamp is on the dead battery's <b>+</b> post (make sure it bites bare metal, not the plastic cover) and its black clamp hangs free. Carry the other end, the <b>helper end</b>, to the helper car."],
		step2: ["ok", "Step 2 done", "The red clamp at the helper end is on the good battery's <b>+</b>. The two + posts are now joined, so from now on keep the two free black clamps away from the red ones and from any metal."],
		step3: ["ok", "Step 3 done", "The black clamp at the helper end is on the good battery's <b>−</b> post. The black clamp still hanging at the dead-car end is live now: don't let it touch anything until it goes on."],
		step4: ["ok", "All four clamps on", "The black clamp at the dead-car end is on bare, unpainted metal of the dead car's engine, well away from its battery. This last connection can make a small spark; here it is far from the hydrogen gas a battery can give off. Now start the helper car."],
		"red-good-first": ["warn", "Start at the dead battery", "Guides connect the <b>dead</b> battery's + first. If you clamp the good battery first, the red clamp at the other end of the set is live: if it touches metal on either car it sparks, and can melt or weld itself on."],
		"red-neg": ["bad", "Red never goes on − or on metal", "That would be <b>reversed polarity</b>. When the circuit closes, a big current flows the wrong way: sparks, hot or melted cables, blown fuses or fusible links, and possible damage to the alternator and the car's computers (ECU). In the worst case a battery can burst. Red goes on <b>+</b>."],
		"red-neg-live": ["bad", "Red goes on +, not −", "The red clamp at the other end of the set is already on the dead battery's +, so this red clamp is live. On − (or on metal) it would join the two batteries the wrong way round: when the circuit closes, a huge current flows, with sparks, melted cables, blown fuses and damaged electronics. The second red clamp goes on the <b>good battery's +</b>."],
		"black-early": ["warn", "Both red clamps first", "Put both red clamps on before any black one. With a black clamp already on, a red clamp you are still moving can touch it or the car and short the battery."],
		"black-pos": ["bad", "Black on + is reversed", "The black clamp belongs on − (or bare metal). Black on + reverses the polarity as soon as the circuit closes, with the same risks as a red clamp on −: sparks, blown fuses, damaged electronics."],
		short: ["bad", "Dead short!", "With the red cable in place, black on + joins + straight to −. Expect a big spark, a red-hot or welded clamp, a hot cable and a real risk of a battery explosion. Black goes on the <b>good battery's −</b>."],
		"wrong-end-good": ["warn", "Use the black clamp at the helper end", "Each end of the set has one red and one black clamp tied together. This black clamp is at the <b>dead-car end</b> (its red clamp is on the dead battery), so it can't reach the good battery: the cable would cross back over itself. Use the black clamp hanging at the <b>helper end</b>, next to the red clamp on the good battery."],
		"wrong-end-dead": ["warn", "Use the black clamp at the dead-car end", "Each end of the set has one red and one black clamp tied together. This black clamp is at the <b>helper end</b> (its red clamp is on the good battery). The last clamp is the black one hanging at the <b>dead-car end</b>, next to the red clamp on the dead battery."],
		"black-dead-first": ["warn", "Black goes on the good battery first", "Clamp the black clamp at the <b>helper end</b> to the <b>good battery's −</b> first. The final connection belongs on the dead car, away from its battery, because that is where the spark happens."],
		"black-dead-neg": ["warn", "Not on the dead battery's − post", "It would usually work, but the last connection makes a small spark, and on the dead battery's − post that spark is right next to the vents where hydrogen gas can collect. Many cars also have a battery sensor on that post. Use the bare metal bolt on the engine (or the ground stud) instead. A few owner's manuals do say − to −: follow yours."],
		paint: ["warn", "Paint doesn't conduct", "Paint and plastic insulate: the clamp may not make contact at all, or it arcs and gets hot. Pick a clean, unpainted bolt or bracket on the engine block."],
		occupied: ["warn", "Already taken", "Something is already clamped there."],
		touch: ["bad", "Clamps touching!", "A red and a black clamp touching while the cables are connected is a <b>short circuit</b>: sparks, melted jaws and a hot battery. Hold the free clamps apart and never let them touch each other or the cars."],
		"remove-order": ["warn", "Take them off in reverse order", "First the black clamp on the dead car's metal, then black from the good battery, then red from the good battery, and red from the dead battery last. Pulling a red clamp while the blacks are on leaves a live clamp in your hand next to metal."],
		off1: ["ok", "Black off the engine metal", "First clamp off, the one that went on last. Keep both engines running."],
		off2: ["ok", "Black off the good battery", "Now the red ones."],
		off3: ["ok", "Red off the good battery", "One more. Don't let it touch the car on the way."],
		off4: ["ok", "All clamps off", "Leave the car running. Drive for at least 30 minutes so the alternator can recharge the battery, then have it tested: a jump-start doesn't fix an old battery."],
		"pack-on": ["warn", "Switch the pack off first", "Most jump packs say: connect with the pack <b>off</b>, then switch it on. A live clamp can spark if it touches metal while you place it."],
		"pack-reverse": ["bad", "Reversed!", "Most modern packs have reverse-polarity protection: you'd hear a beep or see a warning light and no power would flow. Older or cheap packs may spark and damage the car. Red goes on <b>+</b>, black on bare metal or <b>−</b>."],
		"pack-black-first": ["warn", "Red first", "Connect the red clamp to + first, then black."],
		pstep1: ["ok", "Red on +", "Now the black clamp: bare engine metal is best, the − post is fine with most packs."],
		pstep2: ["ok", "Black on bare metal", "The method most pack makers prefer. Now switch the pack on."],
		pstep2neg: ["ok", "Black on −", "Most jump-pack manuals allow the − post. Bare engine metal away from the battery is still the safer habit. Now switch the pack on."],
		"pack-still-on": ["warn", "Switch the pack off first", "Turn the pack off before you take the clamps off, so nothing sparks."],
		poff1: ["ok", "Black off", "Now the red clamp."],
		poff2: ["ok", "Done", "Recharge the jump pack soon, and drive the car for at least 30 minutes. If it needed a jump for no clear reason, have the battery tested."]
	};
	var STEPS = {
		cables: ["Dead-car end: red → dead battery +", "Helper end: red → good battery +", "Helper end: black → good battery −", "Dead-car end: black → bare metal on the dead car's engine", "Start the helper car, let it run 2–5 min", "Start the dead car (5–10 s cranks at most)", "Clamps off in reverse order", "Drive 30+ min, get the battery tested"],
		pack: ["Pack off. Red → +", "Black → bare metal (or −)", "Switch the pack on", "Crank (up to 5 s; rest 2–3 min between tries)", "Car running: switch the pack off", "Black off, then red", "Recharge the pack"]
	};

	function targets() { var T = S.remote ? PT.remote : PT.normal, o = {}; Object.keys(T).forEach(function (k) { o[k] = M(T[k]); }); return o; }
	function setLayout() {
		var w = svg.parentNode.clientWidth || 800, p = w > 0 && w < 620;
		portrait = p; PARK = p ? PARK_P : PARK_L; BAG = p ? BAG_P : BAG_L;
		svg.setAttribute("viewBox", p ? "0 0 500 1046" : "0 0 1000 600");
		svg.classList.toggle("portrait", p);
	}
	function tipOf(c) {
		var t = S.conn[c]; if (t) { var p = targets()[t]; return [p[0], p[1] + 4]; }
		var m = MATE[c];
		if (S.mode === "cables" && m && S.conn[m]) { var q = targets()[S.conn[m]]; return [q[0] - 42, Math.min(q[1] + 156, portrait ? 1040 : 596)]; }
		return PARK[c];
	}
	function attached() { return Object.keys(S.conn).filter(function (k) { return S.conn[k]; }); }
	function clamps() { return S.mode === "pack" ? J.PACK_CLAMPS : J.CABLE_CLAMPS; }

	/* ---------- static scene ---------- */
	function bay(x, title, paintCls, g) {
		el("rect", { x: x, y: 30, width: 470, height: 392, rx: 18, "class": "jp-bay" }, g);
		el("text", { x: x + 235, y: 22, "class": "jp-baytitle", "text-anchor": "middle" }, g, title);
		el("rect", { x: x + 20, y: 392, width: 430, height: 24, rx: 6, "class": paintCls }, g);
	}
	function engine(x, id, g) {
		var e = el("g", { id: id, "class": "jp-engine" }, g);
		el("rect", { x: x, y: 150, width: 220, height: 200, rx: 14, "class": "jp-eng" }, e);
		el("rect", { x: x + 18, y: 120, width: 184, height: 46, rx: 10, "class": "jp-engd" }, e);
		for (var i = 0; i < 4; i++) el("circle", { cx: x + 48 + i * 42, cy: 143, r: 9, "class": "jp-plug" }, e);
		el("text", { x: x + 110, y: 240, "class": "jp-engtxt", "text-anchor": "middle" }, e, "ENGINE");
		var puff = el("g", { "class": "jp-puff" }, e);
		el("circle", { cx: x + 30, cy: 110, r: 9 }, puff); el("circle", { cx: x + 52, cy: 96, r: 12 }, puff); el("circle", { cx: x + 80, cy: 86, r: 8 }, puff);
		return e;
	}
	function battery(x, label, g) {
		el("rect", { x: x, y: 158, width: 150, height: 104, rx: 8, "class": "jp-bat" }, g);
		el("rect", { x: x, y: 158, width: 150, height: 22, rx: 6, "class": "jp-batlid" }, g);
		for (var i = 0; i < 6; i++) el("rect", { x: x + 14 + i * 21, y: 186, width: 12, height: 6, rx: 2, "class": "jp-vent" }, g);
		el("text", { x: x + 75, y: 232, "text-anchor": "middle", "class": "jp-battxt" }, g, label);
		el("text", { x: x + 75, y: 252, "text-anchor": "middle", "class": "jp-batsub" }, g, "12 V");
		el("rect", { x: x + 25, y: 140, width: 20, height: 20, rx: 4, "class": "jp-postp" }, g);
		el("rect", { x: x + 105, y: 140, width: 20, height: 20, rx: 4, "class": "jp-postn" }, g);
		el("text", { x: x + 35, y: 134, "text-anchor": "middle", "class": "jp-poslbl" }, g, "+");
		el("text", { x: x + 115, y: 134, "text-anchor": "middle", "class": "jp-neglbl" }, g, "−");
	}
	function scene() {
		setLayout(); svg.textContent = "";
		var defs = el("defs", null, svg);
		var f = el("filter", { id: "jp-glowf", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
		el("feGaussianBlur", { stdDeviation: 4 }, f);
		G.scene = el("g", null, svg);
		var g = G.scene;
		bay(20, S.deadOn ? "Dead car (running now)" : "Dead car (won't start)", "jp-paint1", g);
		G.deadEng = engine(48, "jp-deadeng", g);
		// ground bracket on the dead engine
		el("rect", { x: 86, y: 318, width: 52, height: 24, rx: 4, "class": "jp-bracket" }, g);
		el("circle", { cx: 112, cy: 330, r: 8, "class": "jp-bolt" }, g);
		el("text", { x: 112, y: 372, "text-anchor": "middle", "class": "jp-small" }, g, "bare metal");
		el("text", { x: 190, y: 409, "text-anchor": "middle", "class": "jp-small" }, g, "painted body panel");
		if (S.remote) {
			el("rect", { x: 315, y: 158, width: 150, height: 104, rx: 10, "class": "jp-remotebox" }, g);
			el("text", { x: 390, y: 236, "text-anchor": "middle", "class": "jp-small" }, g, "battery is in the trunk");
			el("text", { x: 390, y: 252, "text-anchor": "middle", "class": "jp-small" }, g, "jump posts under the hood");
			el("rect", { x: 348, y: 180, width: 24, height: 22, rx: 5, "class": "jp-postp" }, g);
			el("text", { x: 360, y: 174, "text-anchor": "middle", "class": "jp-poslbl" }, g, "+");
			el("rect", { x: 428, y: 180, width: 24, height: 22, rx: 5, "class": "jp-bracket" }, g);
			el("text", { x: 440, y: 174, "text-anchor": "middle", "class": "jp-gndlbl" }, g, "GND");
		} else battery(315, "DEAD", g);
		g = el("g", portrait ? { transform: "translate(-490 430)" } : null, G.scene);
		if (S.mode === "pack") {
			el("rect", { x: 510, y: 30, width: 470, height: 392, rx: 18, "class": "jp-packarea" }, g);
			el("text", { x: 745, y: 22, "class": "jp-baytitle", "text-anchor": "middle" }, g, "Jump pack (booster)");
			el("rect", { x: 600, y: 170, width: 230, height: 150, rx: 22, "class": "jp-pack" }, g);
			el("rect", { x: 630, y: 196, width: 110, height: 52, rx: 6, "class": "jp-packscr" }, g);
			G.packTxt = el("text", { x: 685, y: 230, "text-anchor": "middle", "class": "jp-packnum" }, g, S.packOn ? "ON 85%" : "OFF");
			G.packBtn = el("circle", { cx: 785, cy: 222, r: 20, "class": "jp-packpwr" + (S.packOn ? " on" : ""), tabindex: 0, role: "button", "aria-label": "Jump pack power button" }, g);
			el("text", { x: 785, y: 229, "text-anchor": "middle", "class": "jp-packpwrt" }, g, "⏻");
			el("circle", { cx: 650, cy: 312, r: 7, "class": "jp-postp" }, g); el("circle", { cx: 780, cy: 312, r: 7, "class": "jp-postn" }, g);
			G.packBtn.addEventListener("click", togglePack);
			G.packBtn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePack(); } });
		} else {
			bay(510, S.donorOn ? "Helper car (running)" : "Helper car (good battery)", "jp-paint2", g);
			battery(545, "GOOD", g);
			G.donorEng = engine(730, "jp-donoreng", g);
		}
		// bag
		G.bag = el("g", { "class": "jp-baggrp", tabindex: 0, role: "button", "aria-label": S.mode === "pack" ? "Pack clamps: put a clamp here to take it off" : "Cable bag: one jumper cable set, a red and a black cable joined side by side, with a red and a black clamp at each end. Put a clamp here to take it off" }, svg);
		el("rect", { x: BAG.x, y: BAG.y, width: BAG.w, height: BAG.h, rx: 14, "class": "jp-bag" }, G.bag);
		el("text", { x: BAG.x + BAG.w / 2, y: BAG.y + 22, "text-anchor": "middle", "class": "jp-bagtxt" }, G.bag, S.mode === "pack" ? "Pack clamps (drop here to take a clamp off)" : (portrait ? "Cable set: red + black clamp at each end" : "Cable set: a red + black clamp at each end (drop one here to take it off)"));
		G.bag.addEventListener("click", function () { if (S.sel && S.conn[S.sel]) doRemove(S.sel); });
		G.bag.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && S.sel && S.conn[S.sel]) { e.preventDefault(); doRemove(S.sel); } });
		// targets
		G.tg = el("g", null, svg); G.tgs = {};
		var T = targets();
		Object.keys(T).forEach(function (k) {
			if (S.mode === "pack" && J.TARGETS[k].car !== "dead") return;
			var nm = S.remote && k === "dPos" ? "dead car's remote + jump post" : S.remote && k === "dGnd" ? "dead car's ground stud" : J.TARGETS[k].name;
			var c = el("circle", { cx: T[k][0], cy: T[k][1], r: 24, "class": "jp-tg", tabindex: 0, role: "button", "aria-label": nm }, G.tg);
			c.addEventListener("click", function () { if (S.sel) drop(S.sel, k, T[k]); });
			c.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && S.sel) { e.preventDefault(); drop(S.sel, k, T[k]); } });
			G.tgs[k] = c;
		});
		G.cab = el("g", { "class": "jp-cables" }, svg);
		G.cl = el("g", null, svg); G.cls = {};
		clamps().forEach(function (c) {
			var red = J.colourOf(c) === "red";
			var g2 = el("g", { "class": "jp-clamp " + (red ? "jp-cr" : "jp-cb"), tabindex: 0, role: "button", "aria-label": LABEL[c] }, G.cl);
			el("rect", { x: -26, y: -84, width: 52, height: 90, fill: "transparent", "class": "jp-hit" }, g2);
			el("path", { d: "M-15 -22 L-5 0 L5 0 L15 -22 Z", "class": "jp-jaw" }, g2);
			el("rect", { x: -16, y: -76, width: 32, height: 56, rx: 9, "class": "jp-grip" }, g2);
			el("path", { d: "M-9 -60 H9 M-9 -52 H9 M-9 -44 H9", "class": "jp-gripl" }, g2);
			el("text", { x: 0, y: -27, "text-anchor": "middle", "class": "jp-cltxt" }, g2, red ? "+" : "−");
			g2.addEventListener("pointerdown", function (e) { grab(e, c); });
			g2.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(S.sel === c ? null : c); } else if (e.key === "Escape") select(null); });
			G.cls[c] = g2;
		});
		G.fx = el("g", null, svg);
		draw();
	}
	// ---- the bonded cable set: two leads at each end merge into one red + black pair that runs between the ends ----
	function bz(p0, p1, p2, p3, t) { var u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; }
	function poly(pts) { return "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L"); }
	function topOf(c) { var p = posOf(c); return [p[0], p[1] - 76]; }
	function splitOf(r, b) { var a = topOf(r), c = topOf(b); return [(a[0] + c[0]) / 2, Math.max(a[1], c[1]) + 54]; }
	function drawSet() {
		var H = portrait ? 1046 : 600, A = splitOf("r1", "b1"), B = splitOf("r2", "b2");
		// the pair sags below both ends (each end's control point stays inside the picture, so the curve does too)
		var d = Math.hypot(B[0] - A[0], B[1] - A[1]), s = 70 + d * 0.3;
		var c1 = [A[0], A[1] + Math.max(14, Math.min(s, H - 8 - A[1]))], c2 = [B[0], B[1] + Math.max(14, Math.min(s, H - 8 - B[1]))], n = 56, mid = [], i;
		for (i = 0; i <= n; i++) mid.push(bz(A, c1, c2, B, i / n));
		var off = 3.3, red = [], blk = [], nr = [];
		for (i = 0; i <= n; i++) {
			var p = mid[Math.max(0, i - 1)], q = mid[Math.min(n, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
			nr.push([nx, ny]); red.push([mid[i][0] + nx * off, mid[i][1] + ny * off]); blk.push([mid[i][0] - nx * off, mid[i][1] - ny * off]);
		}
		// leads: from the top of each clamp's handle down into the split
		function lead(c, end, cls) { var t = topOf(c); el("path", { d: "M" + t[0] + " " + t[1] + " C" + t[0] + " " + (t[1] + 34) + " " + end[0] + " " + (end[1] - 34) + " " + end[0] + " " + end[1], "class": "jp-wire jp-lead " + cls }, G.cab); }
		lead("r1", red[0], "jp-wr"); lead("b1", blk[0], "jp-wb"); lead("r2", red[n], "jp-wr"); lead("b2", blk[n], "jp-wb");
		el("path", { d: poly(blk), "class": "jp-wire jp-pair jp-wb" }, G.cab);
		el("path", { d: poly(red), "class": "jp-wire jp-pair jp-wr" }, G.cab);
		// zip ties along the pair, and a moulded splitter where each end's two leads leave it
		var len = 0, next = 46;
		for (i = 1; i < n; i++) {
			len += Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]);
			if (len >= next && len < d * 3) { next += 62; var k = nr[i]; el("line", { x1: mid[i][0] + k[0] * 8, y1: mid[i][1] + k[1] * 8, x2: mid[i][0] - k[0] * 8, y2: mid[i][1] - k[1] * 8, "class": "jp-tie" }, G.cab); }
		}
		[[0, A, "r1"], [n, B, "r2"]].forEach(function (e) {
			var k = nr[e[0]], m = mid[e[0]];
			el("rect", { x: m[0] - 9, y: m[1] - 7, width: 18, height: 14, rx: 4, "class": "jp-split", transform: "rotate(" + (Math.atan2(k[1], k[0]) * 180 / Math.PI) + " " + m[0] + " " + m[1] + ")" }, G.cab);
			if (dragging) return;
			var free = !S.conn[e[2]] && !S.conn[MATE[e[2]]];     // in the bag: the end's name above its two clamps; on a car: under the splitter
			el("text", { x: m[0], y: free ? topOf(e[2])[1] - 8 : m[1] + 26, "text-anchor": "middle", "class": "jp-endtxt" }, G.cab, endName(e[2]));
		});
	}
	var dragPos = {};
	function posOf(c) { return dragPos[c] || tipOf(c); }
	function draw() {
		G.cab.textContent = "";
		if (S.mode === "pack") {
			var a1 = M([650, 312]), a2 = M([780, 312]);
			el("path", { d: "M" + a1[0] + " " + a1[1] + " C" + a1[0] + " " + (a1[1] + 90) + " " + posOf("pr")[0] + " " + (posOf("pr")[1] + 40) + " " + posOf("pr")[0] + " " + (posOf("pr")[1] - 76), "class": "jp-wire jp-wr" }, G.cab);
			el("path", { d: "M" + a2[0] + " " + a2[1] + " C" + a2[0] + " " + (a2[1] + 90) + " " + posOf("pb")[0] + " " + (posOf("pb")[1] + 40) + " " + posOf("pb")[0] + " " + (posOf("pb")[1] - 76), "class": "jp-wire jp-wb" }, G.cab);
		} else {
			drawSet();
		}
		clamps().forEach(function (c) {
			var p = posOf(c), g = G.cls[c];
			g.setAttribute("transform", "translate(" + p[0] + " " + p[1] + ")");
			g.classList.toggle("sel", S.sel === c);
			g.classList.toggle("on", !!S.conn[c]);
			g.setAttribute("aria-label", labelOf(c) + (S.conn[c] ? ", on " + J.TARGETS[S.conn[c]].name : S.mode === "cables" && MATE[c] && S.conn[MATE[c]] ? ", hanging free" : ", in the bag") + (S.sel === c ? ", picked up" : ""));
		});
		var show = !!(S.sel || dragging);
		Object.keys(G.tgs).forEach(function (k) {
			G.tgs[k].classList.toggle("on", show && !Object.keys(S.conn).some(function (c) { return S.conn[c] === k; }));
			G.tgs[k].classList.toggle("near", nearT === k);
		});
		G.bag.classList.toggle("on", !!(S.sel && S.conn[S.sel]) || (dragging && !!S.conn[dragging]));
		if (G.deadEng) G.deadEng.classList.toggle("run", S.deadOn);
		if (G.donorEng) G.donorEng.classList.toggle("run", S.donorOn);
		if (G.packTxt) G.packTxt.textContent = S.packOn ? "ON 85%" : "OFF";
		if (G.packBtn) G.packBtn.classList.toggle("on", S.packOn);
	}
	function spark(x, y, big) {
		var g = el("g", { "class": "jp-spark" + (big ? " big" : ""), transform: "translate(" + x + " " + y + ")" }, G.fx);
		for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2, r = big ? 46 : 28; el("line", { x1: 0, y1: 0, x2: Math.cos(a) * r, y2: Math.sin(a) * r }, g); }
		el("circle", { r: big ? 14 : 8 }, g);
		setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 1100);
	}

	/* ---------- messages, steps, controls ---------- */
	function say(code, extra) {
		var m = MSG[code]; var box = $("jp-msg");
		if (!m) { box.className = "jp-msg"; box.innerHTML = extra || ""; return; }
		var icon = { ok: "✅", warn: "⚠️", bad: "⛔" }[m[0]];
		box.className = "jp-msg jp-" + m[0];
		box.innerHTML = "<b>" + icon + " " + m[1] + "</b><span>" + m[2] + (extra ? " " + extra : "") + "</span>";
	}
	function sayRaw(lvl, title, text) {
		var box = $("jp-msg"), icon = { ok: "✅", warn: "⚠️", bad: "⛔", info: "ℹ️" }[lvl];
		box.className = "jp-msg jp-" + lvl; box.innerHTML = "<b>" + icon + " " + title + "</b><span>" + text + "</span>";
	}
	function stepState() {      // index of the current step (0-based) in STEPS[mode]
		var n = attached().length;
		if (S.mode === "pack") {
			if (S.phase === "done") return 7;
			if (S.deadOn && !S.packOn) return n ? 5 : 6;
			if (S.deadOn) return 4;
			if (n < 2) return n;
			return S.packOn ? 3 : 2;
		}
		if (S.phase === "done") return 8;
		if (S.deadOn) return n ? 6 : 7;
		if (n < 4) return n;
		return S.donorOn ? 5 : 4;
	}
	function renderSteps() {
		var cur = stepState(), list = STEPS[S.mode] || [];
		$("jp-steps").innerHTML = list.map(function (t, i) { return '<li class="' + (i < cur ? "done" : i === cur ? "cur" : "") + '"><span class="jp-sn">' + (i < cur ? "✓" : i + 1) + "</span>" + esc(t) + "</li>"; }).join("");
		var v = S.mode === "pack" ? (S.deadOn ? 14.2 : S.packOn && attached().length === 2 ? 12.9 : 11.4) : (S.deadOn ? 14.1 : J.chargeVolts(S.donorOn && attached().length === 4 ? S.mins : 0));
		var h = '<span class="jp-meter"><b>Dead battery</b> ' + v.toFixed(1) + " V</span>";
		if (S.mode === "cables") h += '<span class="jp-meter"><b>Helper car</b> ' + (S.donorOn ? "running, 14.2 V" : "off, 12.6 V") + "</span>" + (S.donorOn ? '<span class="jp-meter"><b>Waited</b> ' + S.mins + " min</span>" : "");
		else h += '<span class="jp-meter"><b>Pack</b> ' + (S.packOn ? "on" : "off") + "</span>";
		$("jp-meters").innerHTML = h;
		renderCtl();
	}
	function btn(id, label, primary) { return '<button type="button" class="tu-btn' + (primary ? " tu-btn--primary" : "") + '" data-a="' + id + '">' + label + "</button>"; }
	function renderCtl() {
		var h = "", n = attached().length;
		if (S.mode === "cables") {
			if (S.phase === "done") h += "";
			else if (S.deadOn) h += btn("next", "Show me the next clamp");
			else if (n < 4) h += btn("next", "Show me the next step");
			else if (!S.donorOn) h += btn("donor", "▶ Start the helper car", true) + btn("crank", "Try to start the dead car");
			else h += btn("wait", "⏱ Wait 1 minute", S.mins < J.WAIT_NEEDED) + btn("crank", "🔑 Start the dead car", S.mins >= J.WAIT_NEEDED);
		} else if (S.mode === "pack") {
			if (S.phase === "done") h += "";
			else if (S.deadOn && S.packOn) h += btn("packoff", "⏻ Switch the pack off", true);
			else if (S.deadOn) h += btn("next", "Show me the next clamp");
			else if (n < 2) h += btn("next", "Show me the next step");
			else if (!S.packOn) h += btn("packon", "⏻ Switch the pack on", true);
			else h += btn("crank", "🔑 Crank (up to 5 s)", true) + btn("packoff", "⏻ Switch the pack off");
		}
		h += btn("reset", "↺ Start over");
		$("jp-ctl").innerHTML = h;
	}
	$("jp-ctl").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a");
		if (a === "reset") return reset();
		if (a === "next") return showNext();
		if (a === "donor") { S.donorOn = true; S.mins = 0; sayRaw("ok", "Helper car running", "Its alternator now feeds both batteries. Let it run 2–5 minutes before you try the dead car (a very flat battery may need longer). Keep everyone's hands away from fans and belts."); }
		if (a === "wait") { S.mins++; sayRaw("info", S.mins + (S.mins === 1 ? " minute" : " minutes"), "The dead battery takes some charge: about " + J.chargeVolts(S.mins).toFixed(1) + " V now." + (S.mins >= J.WAIT_NEEDED ? " Try starting the dead car." : "")); }
		if (a === "crank") crank();
		if (a === "packon") { S.packOn = true; sayRaw("ok", "Pack on", "Some packs have a Boost button for a very flat battery (it bypasses the safety check: only use it when the clamps are certainly right). Now crank."); }
		if (a === "packoff") {
			S.packOn = false;
			sayRaw("ok", "Pack off", S.deadOn ? "Now take the clamps off: black first, then red." : "Pack off. You can move the clamps safely.");
		}
		scene(); renderSteps();
	});
	function crank() {
		if (S.mode === "pack") {
			S.deadOn = true;
			sayRaw("ok", "It started!", "Leave it running and switch the pack off within a few seconds (many packs say so), then take the clamps off: black first, then red."); return;
		}
		if (attached().length < 4) { sayRaw("warn", "Connect all four clamps first", ""); return; }
		if (!S.donorOn) { sayRaw("warn", "Start the helper car first", "Cranking straight away drags the good battery down too, and you might end up with two cars that won't start. Start the helper car and let it run a few minutes."); return; }
		if (S.mins < J.WAIT_NEEDED) {
			S.fails++;
			if (S.fails >= 3) sayRaw("bad", "Stop for now", "Three tries without a start. Let the starter cool for a few minutes and the helper car charge longer. If it still won't go, check that every clamp bites bare metal, try thicker cables, or call roadside assistance: the battery may be beyond saving, or it may not be the battery (fuel, starter, immobilizer).");
			else sayRaw("warn", "Click-click… slow crank", "The dead battery is still too low. Release the key after 5–10 seconds, wait a minute or two (let the helper car keep running) and try again.");
			return;
		}
		S.deadOn = true; S.phase = "running";
		sayRaw("ok", "It started!", "Let both engines run for a minute. Now take the clamps off in <b>reverse</b> order, without letting them touch: drag each clamp back to the cable bag.");
	}
	function reset() {
		S.conn = {}; S.phase = "connect"; S.donorOn = false; S.deadOn = false; S.mins = 0; S.fails = 0; S.packOn = false; S.sel = null; dragPos = {};
		say(null, '<span>' + (S.mode === "pack" ? "Jump pack: connect the red clamp to the dead battery's + first, with the pack switched off." : "Start with step 1: take one end of the cable set to the dead car and put its red clamp on the dead battery's + post.") + "</span>");
		scene(); renderSteps();
	}
	function showNext() {
		var n = attached().length;
		if (S.mode === "cables") {
			if (S.deadOn) { var want = J.REMOVE_ORDER.filter(function (t) { return attached().some(function (c) { return S.conn[c] === t; }); })[0]; var c = attached().filter(function (k) { return S.conn[k] === want; })[0]; if (c) doRemove(c); return; }
			var plan = [["r1", "dPos"], ["r2", "gPos"], ["b1", "gNeg"], ["b2", "dGnd"]];
			var p = plan[n]; if (p) {
				var free = J.colourOf(p[0]) === "red" ? (S.conn.r1 ? "r2" : "r1") : (["b1", "b2"].filter(function (k) { return !S.conn[k] && carOf(S.conn[MATE[k]]) === carOf(p[1]); })[0] || (S.conn.b1 ? "b2" : "b1"));
				drop(free, p[1], targets()[p[1]]);
			}
		} else {
			if (S.deadOn) { doRemove(S.conn.pb ? "pb" : "pr"); return; }
			if (!S.conn.pr) drop("pr", "dPos", targets().dPos); else if (!S.conn.pb) drop("pb", "dGnd", targets().dGnd);
		}
	}
	function select(c) { S.sel = c; draw(); if (c) $("jp-hint").textContent = labelOf(c) + " picked up: now tap where it goes" + (S.conn[c] ? " (or the bag to take it off)" : "") + "."; else $("jp-hint").textContent = "Drag a clamp onto a glowing spot, or tap a clamp and then tap where it goes."; }

	/* ---------- actions ---------- */
	function drop(c, target, at) {
		var conn = Object.assign({}, S.conn), was = conn[c];
		if (was === target) { select(null); return; }
		if (was) {               // moving a clamp that is on: it has to come off first
			var rr = S.mode === "pack" ? J.removePack(conn, c, S.packOn) : J.removeCable(conn, c);
			if (!rr.ok) { say(rr.code); select(null); return; }
			conn[c] = null;
		}
		var r = S.mode === "pack" ? J.placePack(conn, c, target, S.packOn) : J.placeCable(conn, c, target);
		if (r.ok && S.mode === "cables" && MATE[c] && conn[MATE[c]] && carOf(conn[MATE[c]]) !== carOf(target)) r = { ok: false, code: carOf(target) === "good" ? "wrong-end-good" : "wrong-end-dead" };
		if (!r.ok) {
			say(r.code);
			var lvl = (MSG[r.code] || [])[0];
			if (lvl === "bad" && at) spark(at[0], at[1], r.code === "short");
			select(null); draw(); return;
		}
		if (was) S.conn[c] = null;
		S.conn[c] = target;
		if (r.step === 4 || r.code === "step4") spark(at[0], at[1], false);
		say(r.code);
		select(null); renderSteps();
	}
	function doRemove(c) {
		var r = S.mode === "pack" ? J.removePack(S.conn, c, S.packOn) : J.removeCable(S.conn, c);
		if (!r.ok) { say(r.code); select(null); return; }
		// before the car runs, taking clamps off is just undoing (no message about driving)
		S.conn[c] = null;
		var left = attached().length;
		if (!S.deadOn) { if (S.mode === "cables" && left < 4) S.mins = 0; if (S.mode === "pack" && left < 2) S.packOn = false; sayRaw("info", "Clamp off", S.mode === "cables" && MATE[c] && S.conn[MATE[c]] ? "It hangs from its end of the set again." : "Back in the bag."); }
		else { say(r.code); if (!left) S.phase = "done"; }
		select(null); scene(); renderSteps();
	}
	function togglePack() {
		if (S.packOn) { S.packOn = false; sayRaw("ok", "Pack off", S.deadOn ? "Now take the clamps off: black first, then red." : ""); }
		else if (attached().length < 2) sayRaw("warn", "Clamps first", "Connect both clamps with the pack off, then switch it on.");
		else { S.packOn = true; sayRaw("ok", "Pack on", "Now crank for up to 5 seconds."); }
		scene(); renderSteps();
	}

	/* ---------- dragging ---------- */
	var dragging = null, nearT = null, start = null, moved = false, grabOff = [0, 0];
	function svgPt(e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function nearest(x, y) {
		var T = targets(), best = null, bd = 56;
		Object.keys(G.tgs).forEach(function (k) { var d = Math.hypot(T[k][0] - x, T[k][1] - y); if (d < bd) { bd = d; best = k; } });
		return best;
	}
	function grab(e, c) {
		if (e.button && e.button !== 0) return;
		e.preventDefault();
		var p = svgPt(e), tip = posOf(c);
		start = { x: p.x, y: p.y, c: c }; moved = false; grabOff = [tip[0] - p.x, tip[1] - p.y];
		try { G.cls[c].setPointerCapture(e.pointerId); } catch (x) {}
		G.cls[c].addEventListener("pointermove", move);
		G.cls[c].addEventListener("pointerup", up);
		G.cls[c].addEventListener("pointercancel", cancel);
	}
	function move(e) {
		if (!start) return;
		var p = svgPt(e);
		if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
		if (!moved) { moved = true; dragging = start.c; S.sel = null; G.cls[dragging].classList.add("drag"); }
		var x = Math.max(10, Math.min(portrait ? 490 : 990, p.x + grabOff[0])), y = Math.max(90, Math.min(portrait ? 1040 : 596, p.y + grabOff[1]));
		dragPos[dragging] = [x, y]; nearT = nearest(x, y);
		draw();
	}
	function finish(e) {
		var c = start && start.c;
		if (c) { G.cls[c].removeEventListener("pointermove", move); G.cls[c].removeEventListener("pointerup", up); G.cls[c].removeEventListener("pointercancel", cancel); G.cls[c].classList.remove("drag"); }
		return c;
	}
	function cancel(e) { finish(e); dragging = null; nearT = null; start = null; dragPos = {}; draw(); }
	function up(e) {
		var c = finish(e), wasDrag = moved, at = dragPos[c], t = nearT;
		start = null; dragging = null; nearT = null; dragPos = {};
		if (!wasDrag) { select(S.sel === c ? null : c); return; }
		if (t && S.mode === "cables") {      // dropped on a spot that already holds the other colour: the clamps touch
			var occ = J.CABLE_CLAMPS.filter(function (o) { return o !== c && S.conn[o] === t; })[0];
			if (occ) { var cc = Object.assign({}, S.conn); cc[c] = null; if (J.touchRisk(cc, c, occ)) { say("touch"); spark(targets()[t][0], targets()[t][1] - 20, true); draw(); return; } }
		}
		if (t) { drop(c, t, targets()[t]); return; }
		if (at && at[0] > BAG.x && at[0] < BAG.x + BAG.w && at[1] > BAG.y - 20 && S.conn[c]) { doRemove(c); return; }
		// touching another clamp?
		if (at && S.mode === "cables") {
			var hit = J.CABLE_CLAMPS.filter(function (o) { if (o === c) return false; var q = posOf(o); return Math.hypot(q[0] - at[0], q[1] - at[1]) < 34; })[0];
			if (hit) {
				var conn = Object.assign({}, S.conn); conn[c] = null;
				if (J.touchRisk(conn, c, hit)) { say("touch"); spark(at[0], at[1] - 10, true); draw(); return; }
			}
		}
		draw();
	}
	svg.addEventListener("click", function (e) { if (S.sel && !e.target.closest(".jp-clamp, .jp-tg, .jp-baggrp")) select(null); });

	/* ---------- modes ---------- */
	function setMode(m) {
		S.mode = m;
		["cables", "pack", "push"].forEach(function (k) { $("jp-t-" + k).setAttribute("aria-selected", k === m ? "true" : "false"); });
		$("jp-simwrap").hidden = m === "push"; $("jp-push").hidden = m !== "push";
		$("jp-remote-l").hidden = m === "push";
		if (m !== "push") reset();
	}
	root.querySelectorAll(".jp-tabs [role=tab]").forEach(function (b) {
		b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
		b.addEventListener("keydown", function (e) {
			var tabs = Array.prototype.slice.call(root.querySelectorAll(".jp-tabs [role=tab]")), i = tabs.indexOf(b);
			if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click(); }
		});
	});
	$("jp-remote").addEventListener("change", function () { S.remote = this.checked; reset(); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.sel) select(null); });
	var lastP = null;
	function relayout() { var w = svg.parentNode.clientWidth, p = w > 0 && w < 620; if (lastP !== null && p !== lastP && !dragging) scene(); lastP = p; }
	if (window.ResizeObserver) new ResizeObserver(relayout).observe(svg.parentNode); else window.addEventListener("resize", relayout);
	function panel() { if (window.MESPanel) window.MESPanel.add($("jp-sim"), { bar: $("jp-sim").querySelector(".jp-chead") }); else setTimeout(panel, 80); }
	panel();

	/* =============================== battery age =============================== */
	var clim = $("jp-clim");
	if (store.clim && J.LIFE[store.clim]) clim.value = store.clim;
	function lifeBar(months) {
		var L = J.LIFE[clim.value], max = 12, yrs = months / 12, pct = function (y) { return Math.max(0, Math.min(100, y / max * 100)); };
		var verdict = yrs < L[0] ? ["ok", "Within normal life"] : yrs <= L[1] ? ["warn", "In the replacement window: have it tested before winter"] : ["bad", "Past typical life for your climate: plan to replace it"];
		return '<div class="jp-life" role="img" aria-label="Age ' + yrs.toFixed(1) + ' years; typical life ' + L[0] + " to " + L[1] + ' years"><span class="jp-lifeband" style="left:' + pct(L[0]) + "%;width:" + (pct(L[1]) - pct(L[0])) + '%"></span><span class="jp-lifemk" style="left:' + pct(Math.min(yrs, max)) + '%"></span></div>' +
			'<div class="jp-lifeax"><span>0</span><span>3 y</span><span>6 y</span><span>9 y</span><span>12 y</span></div><p class="jp-v jp-' + verdict[0] + '">' + verdict[1] + " (typical " + L[0] + "–" + L[1] + " years here)</p>";
	}
	function decode() {
		var v = $("jp-code").value, out = $("jp-codeout");
		store.code = v; save();
		if (!v.trim()) { out.innerHTML = ""; return; }
		var list = J.decode(v);
		if (!list.length) { out.innerHTML = '<p class="jp-v jp-warn">No date format recognised. Look for a short letter + number (like F-15) or a month/year on a sticker; long stamped codes often hide the date in a few characters. Try typing just that part.</p>'; return; }
		out.innerHTML = list.slice(0, 5).map(function (r, i) {
			return '<div class="jp-read' + (i === 0 ? " first" : "") + '"><div class="jp-readh"><b>' + esc(r.text) + '</b><span class="jp-conf jp-c-' + r.conf + '">' + r.conf + '</span></div><div class="jp-readl">' + esc(r.label) + (r.note ? " · " + esc(r.note) : "") + "</div>" +
				'<div class="jp-age">Age about <b>' + esc(J.ageText(r.age)) + "</b></div>" + lifeBar(r.age) + "</div>";
		}).join("");
	}
	$("jp-code").addEventListener("input", decode);
	clim.addEventListener("change", function () { store.clim = clim.value; save(); decode(); pick(); });
	$("jp-codechips").addEventListener("click", function (e) { var b = e.target.closest("[data-code]"); if (b) { $("jp-code").value = b.getAttribute("data-code"); decode(); } });
	var pm = $("jp-pm"), py = $("jp-py"), now = new Date();
	pm.innerHTML = J.MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
	for (var y = now.getFullYear(); y >= now.getFullYear() - 15; y--) py.insertAdjacentHTML("beforeend", "<option>" + y + "</option>");
	pm.value = "6"; py.value = String(now.getFullYear() - 3);
	function pick() { var m = J.ageMonths(+py.value, +pm.value); $("jp-pickout").innerHTML = m < 0 ? '<p class="jp-v jp-warn">That is in the future.</p>' : '<div class="jp-read"><div class="jp-age">Age about <b>' + esc(J.ageText(m)) + "</b></div>" + lifeBar(m) + "</div>"; }
	pm.addEventListener("change", pick); py.addEventListener("change", pick); pick();
	if (Q.get("code")) $("jp-code").value = Q.get("code").slice(0, 24); else if (store.code) $("jp-code").value = store.code;
	decode();

	/* =============================== cold =============================== */
	var unit = store.unit === "f" ? "f" : "c", tempEl = $("jp-temp");
	function fmtT(c) { return unit === "f" ? Math.round(J.cToF(c)) + " °F" : Math.round(c) + " °C"; }
	function wx(t) { return t >= 30 ? ["🔥", "Hot: hard on batteries over time"] : t >= 18 ? ["☀️", "Warm"] : t >= 6 ? ["⛅", "Cool"] : t >= -4 ? ["🌧️", "Near freezing"] : t >= -15 ? ["❄️", "Freezing"] : ["🥶", "Bitter cold"]; }
	function lvlCol(m) { return m > 0.6 ? "ok" : m > 0.35 ? "warn" : "bad"; }
	function cold() {
		var t = +tempEl.value, p = J.powerAt(t), n = J.needAt(t), m = J.margin(t), w = wx(t), cls = lvlCol(m);
		$("jp-temp-v").textContent = fmtT(t); $("jp-wx").textContent = w[0]; $("jp-wx-t").textContent = w[1];
		var f = $("jp-fuel"); f.textContent = "";
		// battery "fuel" graphic
		el("rect", { x: 20, y: 40, width: 120, height: 140, rx: 12, "class": "jp-fb" }, f);
		el("rect", { x: 48, y: 28, width: 22, height: 14, rx: 3, "class": "jp-fbt" }, f); el("rect", { x: 92, y: 28, width: 22, height: 14, rx: 3, "class": "jp-fbt" }, f);
		var h = 126 * p / 100; el("rect", { x: 27, y: 173 - h, width: 106, height: h, rx: 7, "class": "jp-ff jp-f-" + cls }, f);
		el("text", { x: 80, y: 115, "text-anchor": "middle", "class": "jp-fnum" }, f, Math.round(p) + "%");
		el("text", { x: 80, y: 18, "text-anchor": "middle", "class": "jp-flbl" }, f, "Battery can give");
		// engine need bar (0..250 %)
		el("text", { x: 260, y: 18, "text-anchor": "middle", "class": "jp-flbl" }, f, "Engine needs");
		el("rect", { x: 220, y: 40, width: 80, height: 140, rx: 8, "class": "jp-fneedbg" }, f);
		var nh = 140 * Math.min(n, 250) / 250; el("rect", { x: 220, y: 180 - nh, width: 80, height: nh, rx: 8, "class": "jp-fneed" }, f);
		var hy = 180 - 140 * 100 / 250; el("line", { x1: 212, y1: hy, x2: 308, y2: hy, "class": "jp-f100" }, f); el("text", { x: 314, y: hy + 4, "class": "jp-fsm" }, f, "warm");
		el("text", { x: 260, y: 115, "text-anchor": "middle", "class": "jp-fnum2" }, f, Math.round(n) + "%");
		var freeze = t <= -8 ? " At this temperature a <b>flat</b> battery can freeze (a full one is safe to about −58 °C / −72 °F): never jump a frozen one." : "";
		var heat = t >= 30 ? " Heat doesn't stop a car starting, but it ages the battery fastest: water loss and grid corrosion now are what fail you next winter." : "";
		$("jp-coldtxt").innerHTML = '<span class="jp-v jp-' + cls + '">Starting reserve: ' + Math.round(m * 100) + "% of a warm day.</span> " +
			(t < 27 ? "A healthy battery gives about " + Math.round(p) + "% of its warm-weather power while the engine needs about " + (n / 100).toFixed(2).replace(/0$/, "") + "× as much to turn over." : "Full power, normal effort.") + freeze + heat;
		chart(t);
		store.unit = unit; save();
	}
	function chart(t) {
		var c = $("jp-coldchart"); c.textContent = "";
		var X0 = 52, X1 = 620, Y0 = 220, Y1 = 20, tx = function (v) { return X0 + (v + 35) / 80 * (X1 - X0); }, ty = function (v) { return Y0 - v / 300 * (Y0 - Y1); };
		for (var v = 0; v <= 300; v += 50) { el("line", { x1: X0, y1: ty(v), x2: X1, y2: ty(v), "class": "jp-grid" }, c); el("text", { x: X0 - 6, y: ty(v) + 4, "text-anchor": "end", "class": "jp-ax" }, c, v + "%"); }
		for (var d = -30; d <= 40; d += 10) { var lab = unit === "f" ? Math.round(J.cToF(d)) + "°" : d + "°"; el("text", { x: tx(d), y: Y0 + 18, "text-anchor": "middle", "class": "jp-ax" }, c, lab); }
		el("text", { x: X1, y: Y0 + 36, "text-anchor": "end", "class": "jp-ax" }, c, "temperature (" + (unit === "f" ? "°F" : "°C") + ")");
		var pp = [], nn = [], area = [];
		for (var s = -35; s <= 45; s += 1) { pp.push(tx(s) + "," + ty(J.powerAt(s))); nn.push(tx(s) + "," + ty(J.needAt(s))); }
		el("polygon", { points: pp.join(" ") + " " + nn.slice().reverse().join(" "), "class": "jp-gap" }, c);
		el("polyline", { points: nn.join(" "), "class": "jp-lneed" }, c);
		el("polyline", { points: pp.join(" "), "class": "jp-lpow" }, c);
		el("line", { x1: tx(t), y1: Y1, x2: tx(t), y2: Y0, "class": "jp-mark" }, c);
		el("circle", { cx: tx(t), cy: ty(J.powerAt(t)), r: 6, "class": "jp-dpow" }, c); el("circle", { cx: tx(t), cy: ty(J.needAt(t)), r: 6, "class": "jp-dneed" }, c);
		el("text", { x: 380, y: Y1 + 14, "class": "jp-lg jp-lgp" }, c, "— battery power available");
		el("text", { x: 380, y: Y1 + 32, "class": "jp-lg jp-lgn" }, c, "— power the engine needs to crank");
		// click / drag on the chart sets the temperature
		function at(e) { var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 640; tempEl.value = Math.round(Math.max(-35, Math.min(45, (x - X0) / (X1 - X0) * 80 - 35))); cold(); }
		c.onpointerdown = function (e) { at(e); c.setPointerCapture(e.pointerId); c.onpointermove = at; };
		c.onpointerup = function () { c.onpointermove = null; };
	}
	tempEl.addEventListener("input", cold);
	root.querySelectorAll("[data-u]").forEach(function (b) {
		b.setAttribute("aria-pressed", b.getAttribute("data-u") === unit ? "true" : "false");
		b.addEventListener("click", function () { unit = b.getAttribute("data-u"); root.querySelectorAll("[data-u]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); cold(); });
	});
	$("jp-temp-reset").addEventListener("click", function () { tempEl.value = 20; cold(); });
	cold();

	/* =============================== drain =============================== */
	var maEl = $("jp-ma"), LMAX = Math.log10(15000 / 10);
	function maOf(v) { return Math.round(10 * Math.pow(10, v / 1000 * LMAX)); }
	function vOf(ma) { return Math.round(Math.log10(ma / 10) / LMAX * 1000); }
	function fmtMa(ma) { return ma >= 1000 ? (ma / 1000).toFixed(ma >= 10000 ? 0 : 1) + " A" : ma + " mA"; }
	function drain() {
		var ma = maOf(+maEl.value), ah = Math.max(1, +$("jp-ah").value || 60), soc = +$("jp-soc0").value, d = J.drainDays(ah, ma, soc, 50);
		$("jp-ma-v").textContent = fmtMa(ma);
		var t = d < 2 ? Math.round(d * 24 * 10) / 10 + " hours" : Math.round(d) + " days";
		var cls = d < 3 ? "bad" : d < 14 ? "warn" : "ok";
		$("jp-drainout").innerHTML = '<span class="jp-v jp-' + cls + '">About <b>' + t + "</b> until it may not start</span> (from " + soc + "% down to about 50%, where many cars stop cranking; sooner in the cold). " +
			(ma <= 50 ? "A normal parked draw: a healthy battery copes for a few weeks." : ma < 1000 ? "More than a modern car should draw when parked (most are 20–50 mA, settled 30–60 minutes after locking). A shop can find the circuit by pulling fuses one at a time." : "Something is left on.");
	}
	maEl.value = vOf(40);
	[maEl, $("jp-ah"), $("jp-soc0")].forEach(function (x) { x.addEventListener("input", drain); x.addEventListener("change", drain); });
	$("jp-machips").addEventListener("click", function (e) { var b = e.target.closest("[data-ma]"); if (b) { maEl.value = vOf(+b.getAttribute("data-ma")); drain(); } });
	drain();

	/* =============================== voltmeter =============================== */
	var vm = store.vm === "run" ? "run" : "rest", bt = store.bt === "agm" ? "agm" : "flooded", vEl = $("jp-v");
	var BANDS = {
		rest: [[10.5, 11.9, "bad"], [11.9, 12.2, "warn2"], [12.2, 12.4, "warn"], [12.4, 12.6, "ok2"], [12.6, 13.0, "ok"], [13.0, 15.5, "na"]],
		run: [[10.5, 12.8, "bad"], [12.8, 13.5, "warn"], [13.5, 14.8, "ok"], [14.8, 15.0, "warn"], [15.0, 15.5, "bad"]]
	};
	function gauge() {
		var v = +vEl.value, g = $("jp-gauge"); g.textContent = "";
		var cx = 160, cy = 160, R = 125, ang = function (x) { return Math.PI * (1 - (x - 10.5) / 5); }, pt = function (x, r) { var a = ang(x); return [cx + Math.cos(a) * r, cy - Math.sin(a) * r]; };
		var shift = vm === "rest" && bt === "agm" ? 0.15 : 0;
		BANDS[vm].forEach(function (b) {
			var a = pt(b[0] + (b[0] > 10.5 ? shift : 0), R), c2 = pt(Math.min(15.5, b[1] + shift), R);
			el("path", { d: "M" + a[0] + " " + a[1] + " A" + R + " " + R + " 0 0 1 " + c2[0] + " " + c2[1], "class": "jp-arc jp-a-" + b[2] }, g);
		});
		for (var x = 11; x <= 15; x++) { var p1 = pt(x, R - 22), p2 = pt(x, R - 10), pl = pt(x, R - 38); el("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], "class": "jp-tick" }, g); el("text", { x: pl[0], y: pl[1] + 5, "text-anchor": "middle", "class": "jp-ax" }, g, x); }
		var n = pt(v, R - 18); el("line", { x1: cx, y1: cy, x2: n[0], y2: n[1], "class": "jp-needle" }, g); el("circle", { cx: cx, cy: cy, r: 9, "class": "jp-hub" }, g);
		el("text", { x: cx, y: cy - 34, "text-anchor": "middle", "class": "jp-gnum" }, g, v.toFixed(2) + " V");
		$("jp-v-v").textContent = v.toFixed(2) + " V";
		var o = $("jp-voltout"), txt;
		if (vm === "rest") {
			var r = J.restVerdict(v, bt);
			txt = { surface: ["warn", "Higher than a resting battery can be: surface charge from driving or a charger. Turn the headlights on for a minute, off, wait, and measure again."], full: ["ok", "Fully charged (about " + r.soc + "%)."], good: ["ok", "About " + r.soc + "% charged: fine, a drive tops it up."], half: ["warn", "About " + r.soc + "% charged: charge it soon. Low charge sulfates a battery and it can freeze in a hard frost."], low: ["bad", "About " + r.soc + "% charged: weak; it may not start a cold engine. Charge it and have it tested."], flat: ["bad", "Flat. Charge it fully, then have it load-tested; if it won't hold 12.4 V a day later, it is worn out."] }[r.k];
		} else {
			txt = { "not-charging": ["bad", "Not charging: the alternator, its belt or a fuse/wire may have failed (or the battery is very flat). The car is running on the battery."], "low-charge": ["warn", "Low. Many smart-charging cars sit here when the battery is full; otherwise it may be undercharging. Check again with lights and fan on."], normal: ["ok", "Normal charging (13.7–14.7 V)."], high: ["warn", "On the high side; fine in very cold weather, otherwise watch it."], over: ["bad", "Overcharging: the regulator may be faulty. It boils the battery and can damage electronics."] }[J.runVerdict(v)];
		}
		o.innerHTML = '<span class="jp-v jp-' + txt[0] + '">' + txt[1] + "</span>";
		store.vm = vm; store.bt = bt; save();
	}
	vEl.addEventListener("input", gauge);
	function segs(attr, get, set) {
		root.querySelectorAll("[" + attr + "]").forEach(function (b) {
			b.setAttribute("aria-pressed", b.getAttribute(attr) === get() ? "true" : "false");
			b.addEventListener("click", function () { set(b.getAttribute(attr)); root.querySelectorAll("[" + attr + "]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); gauge(); });
		});
	}
	segs("data-vm", function () { return vm; }, function (x) { vm = x; vEl.value = x === "run" ? 14.2 : 12.4; });
	segs("data-bt", function () { return bt; }, function (x) { bt = x; });
	if (vm === "run") vEl.value = 14.2;
	gauge();

	/* =============================== checklist =============================== */
	$("jp-print").addEventListener("click", function () {
		document.documentElement.classList.add("jp-print");
		setTimeout(function () { window.print(); setTimeout(function () { document.documentElement.classList.remove("jp-print"); }, 400); }, 30);
	});
	window.addEventListener("afterprint", function () { document.documentElement.classList.remove("jp-print"); });
	$("jp-check-reset").addEventListener("click", function () { root.querySelectorAll("#jp-checklist input").forEach(function (x) { x.checked = false; }); });

	/* ---------- start ---------- */
	var m0 = Q.get("mode"); setMode(m0 === "pack" || m0 === "push" ? m0 : "cables");
	if (Q.get("code")) setTimeout(function () { var a = $("jp-age"); if (a) a.scrollIntoView(); }, 300);
})();
