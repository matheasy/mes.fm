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
