/* MES Clock -- pure helpers (no DOM). Browser global `CK`; node: require('./tool_apps_src/clock/lib.js'); tests: node tool_apps_src/clock-tests.js */
(function (root) {
	"use strict";
	var FMT = {};
	function fmt(tz) {
		if (!FMT[tz]) FMT[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
		return FMT[tz];
	}
	function valid(tz) { try { fmt(tz); return true; } catch (e) { return false; } }
	var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	// B.C. stays on UTC-7 all year from 1 Nov 2026 (clocks did not fall back). Browsers / node with older time-zone data
	// still put America/Vancouver on PST (UTC-8) after that date, so the zone is swapped for Etc/GMT+7 (= UTC-7) then.
	var BC_FROM = Date.UTC(2026, 10, 1, 9), BC_OLD = null;
	function bcOld() {
		if (BC_OLD === null) { try { BC_OLD = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "numeric", hourCycle: "h23" }).format(new Date(Date.UTC(2027, 0, 15, 12))).replace(/^0/, "") === "4"; } catch (e) { BC_OLD = false; } }
		return BC_OLD;
	}
	// the IANA name to hand Intl for `tz` at `date` ("" = the browser's own zone)
	function zoneAt(tz, date) {
		var z = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
		if (z === "America/Vancouver" && +date >= BC_FROM && bcOld()) return "Etc/GMT+7";
		return z;
	}
	// wall-clock parts of `date` in time zone `tz` ("" / null = the browser's own zone)
	function partsIn(date, tz) {
		var o = {}, ms = ((date.getTime() % 1000) + 1000) % 1000;
		var f = fmt(zoneAt(tz, date));
		f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
		var h = +o.hour; if (h === 24) h = 0;
		return { y: +o.year, mo: +o.month, d: +o.day, h: h, m: +o.minute, s: +o.second, ms: ms, wd: WD[o.weekday] };
	}
	// UTC offset in minutes (east positive), from the wall clock vs the real instant
	function offsetMin(date, tz) {
		var p = partsIn(date, tz), asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s);
		return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
	}
	function offsetLabel(min) { var sign = min < 0 ? "-" : "+", a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return "UTC" + sign + h + (m ? ":" + (m < 10 ? "0" : "") + m : ""); }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	// "3:45:07 PM" / "15:45:07" / "3:45 PM"
	function timeText(p, h12, sec) {
		var h = p.h, suffix = "";
		if (h12) { suffix = h >= 12 ? " PM" : " AM"; h = h % 12; if (h === 0) h = 12; }
		return (h12 ? h : pad(h)) + ":" + pad(p.m) + (sec ? ":" + pad(p.s) : "") + suffix;
	}
	function angles(p, smooth) {
		var s = p.s + (smooth ? p.ms / 1000 : 0), m = p.m + s / 60, h = (p.h % 12) + m / 60;
		return { hour: h * 30, min: m * 6, sec: s * 6 };
	}
	function dayOfYear(y, mo, d) { return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000); }
	function isoWeek(y, mo, d) {
		var t = new Date(Date.UTC(y, mo - 1, d)), dow = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dow);
		return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
	}
	function city(tz) { return String(tz || "").split("/").pop().replace(/_/g, " "); }
	// "3 h ahead of", "5 h 30 min behind", "same time as"
	function diffText(minOther, minMain) {
		var d = minOther - minMain; if (d === 0) return "same time as";
		var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60, s = (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
		return s + (d > 0 ? " ahead of" : " behind");
	}
	function isDay(p) { return p.h >= 6 && p.h < 18; }
	var POPULAR = ["America/Vancouver", "America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
	var CK = { zoneAt: zoneAt, valid: valid, partsIn: partsIn, offsetMin: offsetMin, offsetLabel: offsetLabel, timeText: timeText, angles: angles, dayOfYear: dayOfYear, isoWeek: isoWeek, city: city, diffText: diffText, isDay: isDay, pad: pad, POPULAR: POPULAR };
	if (typeof module !== "undefined" && module.exports) module.exports = CK; else root.CK = CK;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Zodiac & Birth Chart -- pure maths (no DOM). Browser global `ZD` (needs Astronomy Engine `Astronomy`, /moon/js/astronomy.browser.min.js,
 * and the Clock's `CK`, both loaded first); node: require('./tool_apps_src/zodiac/lib.js') after `global.Astronomy = require(...)`.
 * Tests: node tool_apps_src/zodiac-tests.js
 * Tropical zodiac: geocentric apparent longitudes on the true ecliptic of date (Astronomy.Ecliptic / SunPosition / EclipticGeoMoon).
 * Houses: whole-sign (default) or equal houses from the ascendant. Chinese zodiac: the year starts at Lunar New Year = the new moon
 * that falls on 21 Jan - 20 Feb in China's time (UTC+8), not on 1 January. */
(function (root) {
	"use strict";
	var CK = root.CK || (typeof require !== "undefined" ? require("../clock/lib.js") : null);
	function A() { return root.Astronomy; }
	var D2R = Math.PI / 180, DAY = 86400000;
	function wrap(x) { x %= 360; return x < 0 ? x + 360 : x; }
	var SIGNS = [
		["Aries", "♈", "Fire", "Cardinal", "Mars", "Mar 21 – Apr 19", "bold, direct, energetic"],
		["Taurus", "♉", "Earth", "Fixed", "Venus", "Apr 20 – May 20", "steady, patient, sensual"],
		["Gemini", "♊", "Air", "Mutable", "Mercury", "May 21 – Jun 20", "curious, talkative, quick"],
		["Cancer", "♋", "Water", "Cardinal", "the Moon", "Jun 21 – Jul 22", "caring, protective, moody"],
		["Leo", "♌", "Fire", "Fixed", "the Sun", "Jul 23 – Aug 22", "warm, proud, playful"],
		["Virgo", "♍", "Earth", "Mutable", "Mercury", "Aug 23 – Sep 22", "careful, practical, helpful"],
		["Libra", "♎", "Air", "Cardinal", "Venus", "Sep 23 – Oct 22", "fair, sociable, diplomatic"],
		["Scorpio", "♏", "Water", "Fixed", "Mars / Pluto", "Oct 23 – Nov 21", "intense, private, determined"],
		["Sagittarius", "♐", "Fire", "Mutable", "Jupiter", "Nov 22 – Dec 21", "free, optimistic, blunt"],
		["Capricorn", "♑", "Earth", "Cardinal", "Saturn", "Dec 22 – Jan 19", "ambitious, disciplined, dry humour"],
		["Aquarius", "♒", "Air", "Fixed", "Saturn / Uranus", "Jan 20 – Feb 18", "original, independent, idealistic"],
		["Pisces", "♓", "Water", "Mutable", "Jupiter / Neptune", "Feb 19 – Mar 20", "dreamy, gentle, imaginative"]
	].map(function (r, i) { return { i: i, name: r[0], glyph: r[1] + "\uFE0E", element: r[2], mode: r[3], ruler: r[4], dates: r[5], traits: r[6] }; });
	var BODIES = [
		{ id: "sun", name: "Sun", glyph: "☉" }, { id: "moon", name: "Moon", glyph: "☽" },
		{ id: "mercury", name: "Mercury", glyph: "☿", body: "Mercury" }, { id: "venus", name: "Venus", glyph: "♀", body: "Venus" },
		{ id: "mars", name: "Mars", glyph: "♂", body: "Mars" }, { id: "jupiter", name: "Jupiter", glyph: "♃", body: "Jupiter" },
		{ id: "saturn", name: "Saturn", glyph: "♄", body: "Saturn" }, { id: "uranus", name: "Uranus", glyph: "♅", body: "Uranus" },
		{ id: "neptune", name: "Neptune", glyph: "♆", body: "Neptune" }, { id: "pluto", name: "Pluto", glyph: "♇", body: "Pluto" }
	];
	var ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
	var ANIMAL_EMOJI = ["🐀", "🐂", "🐅", "🐇", "🐉", "🐍", "🐎", "🐐", "🐒", "🐓", "🐕", "🐖"];
	var ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"];

	function lonOf(id, date) {
		var Ast = A();
		if (id === "sun") return Ast.SunPosition(date).elon;
		if (id === "moon") return Ast.EclipticGeoMoon(date).lon;
		var b = null; BODIES.forEach(function (x) { if (x.id === id) b = x.body; });
		return Ast.Ecliptic(Ast.GeoVector(b, date, true)).elon;
	}
	function signOf(lon) { lon = wrap(lon); var i = Math.floor(lon / 30); return { i: i, sign: SIGNS[i], deg: lon - i * 30 }; }
	function degText(deg) { var d = Math.floor(deg), m = Math.floor((deg - d) * 60); return d + "°" + (m < 10 ? "0" : "") + m + "′"; }

	// wall clock in a zone -> UTC ms. tz = IANA name, or a fixed offset "+05:30" / "-8" / "UTC+2".
	function fixedOffset(tz) {
		var m = /^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(String(tz || "").trim());
		return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0)) : null;
	}
	function validZone(tz) { return fixedOffset(tz) !== null || (!!tz && CK.valid(tz)); }
	function wallToUtc(y, mo, d, h, mi, tz) {
		var guess = Date.UTC(y, mo - 1, d, h, mi), fo = fixedOffset(tz);
		if (fo !== null) return guess - fo * 60000;
		if (!tz || !CK.valid(tz)) return guess;
		var c = [guess - DAY, guess + DAY].map(function (x) { return guess - CK.offsetMin(new Date(x), tz) * 60000; });
		for (var i = 0; i < 2; i++) { var p = CK.partsIn(new Date(c[i]), tz); if (p.h === h && p.m === mi && p.d === d) return c[i]; }
		return c[0];
	}
	function offsetAt(ms, tz) { var fo = fixedOffset(tz); return fo !== null ? fo : (tz && CK.valid(tz) ? CK.offsetMin(new Date(ms), tz) : 0); }

	// "1980-10-26", "10-26" (no year), "26 Oct 1980", "Oct 26, 1980", "10/26/1980" (US), "26.10.1980" -> {y?, mo, d} or null
	var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
	function parseDate(s) {
		s = String(s || "").trim().toLowerCase(); if (!s) return null;
		var m, r = null;
		if ((m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(s))) r = { y: +m[1], mo: +m[2], d: +m[3] };
		else if ((m = /^(\d{1,2})-(\d{1,2})$/.exec(s))) r = { mo: +m[1], d: +m[2] };
		else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s))) r = { mo: +m[1], d: +m[2], y: m[3] ? +m[3] : undefined };
		else if ((m = /^(\d{1,2})\.(\d{1,2})\.?(?:(\d{4}))?$/.exec(s))) r = { d: +m[1], mo: +m[2], y: m[3] ? +m[3] : undefined };
		else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\.?,?\s*(\d{4})?$/.exec(s)) && MON[m[2]]) r = { d: +m[1], mo: MON[m[2]], y: m[3] ? +m[3] : undefined };
		else if ((m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/.exec(s)) && MON[m[1]]) r = { mo: MON[m[1]], d: +m[2], y: m[3] ? +m[3] : undefined };
		if (!r || r.mo < 1 || r.mo > 12 || r.d < 1 || r.d > daysIn(r.y || 2000, r.mo)) return null;
		if (r.y === undefined) delete r.y;
		return r;
	}
	function daysIn(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
	function parseTime(s) {
		s = String(s || "").trim().toLowerCase().replace(/\s+/g, ""); if (!s) return null;
		if (s === "noon") return { h: 12, m: 0 }; if (s === "midnight") return { h: 0, m: 0 };
		var m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(s); if (!m) return null;
		var h = +m[1], mi = +(m[2] || 0);
		if (m[3]) { if (h < 1 || h > 12) return null; h = h % 12 + (m[3][0] === "p" ? 12 : 0); }
		if (h > 23 || mi > 59) return null;
		return { h: h, m: mi };
	}

	// ascendant + MC for a UTC instant and place (degrees, east longitude positive)
	function angles(ms, lat, lon) {
		var Ast = A(), date = new Date(ms), t = Ast.MakeTime(date);
		var eps = Ast.e_tilt(t).tobl * D2R, ramc = wrap(Ast.SiderealTime(date) * 15 + lon) * D2R, phi = lat * D2R;
		var asc = wrap(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R);
		var mc = wrap(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / D2R);
		return { asc: asc, mc: mc, ramc: ramc / D2R };
	}
	function phaseName(a) {
		var n = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
		return n[Math.floor(wrap(a + 22.5) / 45) % 8];
	}
	function phaseEmoji(a) { return ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][Math.floor(wrap(a + 22.5) / 45) % 8]; }

	// Chinese zodiac for a calendar date (the date as lived; China's own new-year date is used)
	var LNY = {}, LNY_FIX = { 1916: [2, 3], 1920: [2, 20], 1985: [2, 20] };   // years the 21 Jan - 20 Feb new-moon rule gets wrong (checked against published tables)
	function lunarNewYear(y) {
		if (LNY[y]) return LNY[y];
		if (LNY_FIX[y]) return (LNY[y] = { y: y, mo: LNY_FIX[y][0], d: LNY_FIX[y][1] });
		var Ast = A(), start = new Date(Date.UTC(y, 0, 20, 16)), r = null;     // 21 Jan 00:00 in UTC+8
		for (var k = 0; k < 2 && !r; k++) {
			var nm = Ast.SearchMoonPhase(0, start, 40); if (!nm) break;
			var local = new Date(nm.date.getTime() + 8 * 3600000), mo = local.getUTCMonth() + 1, d = local.getUTCDate();
			if ((mo === 1 && d >= 21) || (mo === 2 && d <= 20)) r = { y: y, mo: mo, d: d };
			start = new Date(nm.date.getTime() + DAY);
		}
		return (LNY[y] = r);
	}
	function chinese(y, mo, d) {
		var ny = lunarNewYear(y), cy = y;
		if (ny && (mo < ny.mo || (mo === ny.mo && d < ny.d))) cy = y - 1;
		var a = ((cy - 4) % 12 + 12) % 12, s = ((cy - 4) % 10 + 10) % 10;
		return { year: cy, animal: ANIMALS[a], emoji: ANIMAL_EMOJI[a], i: a, element: ELEMENTS[Math.floor(s / 2)], yin: s % 2 === 1, newYear: ny, newYear2: lunarNewYear(cy + 1) };
	}
	function chineseByYearOnly(y) { var a = ((y - 4) % 12 + 12) % 12, s = ((y - 4) % 10 + 10) % 10; return { animal: ANIMALS[a], emoji: ANIMAL_EMOJI[a], element: ELEMENTS[Math.floor(s / 2)], yin: s % 2 === 1 }; }

	// first instant in [a, b] (ms) where body enters a new sign (bisection), or null
	function signChange(id, a, b) {
		var sa = signOf(lonOf(id, new Date(a))).i, sb = signOf(lonOf(id, new Date(b))).i;
		if (sa === sb) return null;
		for (var k = 0; k < 40 && b - a > 30000; k++) { var mid = (a + b) / 2; if (signOf(lonOf(id, new Date(mid))).i === sa) a = mid; else b = mid; }
		return { at: b, from: sa, to: sb };
	}

	/* A chart. o = { y, mo, d, h?, m? (local time; missing = unknown), tz (IANA or "+05:30"; default UTC), lat?, lon? (place; needed for the ascendant), houses: "whole"|"equal" }
	 * Time unknown: positions are for local noon, and every body whose sign changes during that local day is listed in `ambiguous`. */
	function chart(o) {
		var timeKnown = o.h !== undefined && o.h !== null, tz = o.tz || "UTC";
		var ms = wallToUtc(o.y, o.mo, o.d, timeKnown ? o.h : 12, timeKnown ? (o.m || 0) : 0, tz), date = new Date(ms);
		var out = { ms: ms, timeKnown: timeKnown, tz: tz, offset: offsetAt(ms, tz), bodies: [], ambiguous: [] };
		BODIES.forEach(function (b) {
			var lon = lonOf(b.id, date), s = signOf(lon), x = { id: b.id, name: b.name, glyph: b.glyph, lon: lon, i: s.i, sign: s.sign, deg: s.deg, retro: false };
			if (b.body) { var l1 = lonOf(b.id, new Date(ms - DAY / 2)), l2 = lonOf(b.id, new Date(ms + DAY / 2)); x.retro = wrap(l2 - l1 + 180) - 180 < 0; }
			out.bodies.push(x);
		});
		out.by = {}; out.bodies.forEach(function (b) { out.by[b.id] = b; });
		if (!timeKnown) {
			var a = wallToUtc(o.y, o.mo, o.d, 0, 0, tz), z = wallToUtc(o.y, o.mo, o.d, 23, 59, tz) + 59999;
			out.dayStart = a; out.dayEnd = z;
			BODIES.forEach(function (b) { var c = signChange(b.id, a, z); if (c) out.ambiguous.push({ id: b.id, name: b.name, at: c.at, from: SIGNS[c.from], to: SIGNS[c.to] }); });
		}
		var ph = A().MoonPhase(date);
		out.phase = { angle: ph, name: phaseName(ph), emoji: phaseEmoji(ph), illum: (1 - Math.cos(ph * D2R)) / 2 };
		out.chinese = chinese(o.y, o.mo, o.d);
		if (timeKnown && typeof o.lat === "number" && typeof o.lon === "number" && isFinite(o.lat) && isFinite(o.lon) && Math.abs(o.lat) < 89.9) {
			var an = angles(ms, o.lat, o.lon), mode = o.houses === "equal" ? "equal" : "whole";
			out.asc = an.asc; out.mc = an.mc; out.ascSign = signOf(an.asc); out.mcSign = signOf(an.mc); out.houseMode = mode;
			var first = mode === "whole" ? Math.floor(an.asc / 30) * 30 : an.asc;
			out.cusps = []; for (var i = 0; i < 12; i++) out.cusps.push(wrap(first + 30 * i));
			out.bodies.forEach(function (b) { b.house = Math.floor(wrap(b.lon - first) / 30) + 1; });
			out.polar = Math.abs(o.lat) > 66;
		}
		return out;
	}
	// Sun / Moon / Chinese for a date with no time or place (famous people): noon UTC, plus ambiguity over the whole date anywhere on Earth
	function quick(y, mo, d) {
		var noon = Date.UTC(y, mo - 1, d, 12), a = Date.UTC(y, mo - 1, d) - 14 * 3600000, z = Date.UTC(y, mo - 1, d + 1) + 12 * 3600000;
		var sun = signOf(lonOf("sun", new Date(noon))), moon = signOf(lonOf("moon", new Date(noon)));
		var sa = signOf(lonOf("sun", new Date(a))).i, sz = signOf(lonOf("sun", new Date(z))).i, ma = signOf(lonOf("moon", new Date(a))).i, mz = signOf(lonOf("moon", new Date(z))).i;
		return { sun: sun.sign, sunAlt: sa !== sz ? SIGNS[sun.i === sa ? sz : sa] : null, moon: moon.sign, moonAlt: ma !== mz ? SIGNS[moon.i === ma ? mz : ma] : null, chinese: chinese(y, mo, d) };
	}
	// Sun sign of a month/day with no year: the usual date ranges (the exact change day moves by a day between years)
	var CUSPS = [[1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3], [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9]];
	function sunSignByDay(mo, d) {
		var c = CUSPS[mo - 1];
		return SIGNS[d >= c[1] ? c[2] : (c[2] + 11) % 12];
	}
	// month/day range of a sign, as [[mo, dFrom, dTo], [mo, dFrom, dTo]]
	function signDays(i) {
		var start = null, end = null;
		CUSPS.forEach(function (c) { if (c[2] === i) start = [c[0], c[1]]; if (c[2] === (i + 1) % 12) end = [c[0], c[1] - 1]; });
		return start[0] === end[0] ? [[start[0], start[1], end[1]]] : [[start[0], start[1], daysIn(2000, start[0])], [end[0], 1, end[1]]];
	}

	// a few hundred places for the birth-place search (name|country|lat|lon|zone); anything else: type latitude / longitude
	var CITIES = ("Vancouver|Canada|49.28|-123.12|America/Vancouver;Victoria|Canada|48.43|-123.37|America/Vancouver;Calgary|Canada|51.05|-114.07|America/Edmonton;Edmonton|Canada|53.55|-113.49|America/Edmonton;Winnipeg|Canada|49.9|-97.14|America/Winnipeg;Regina|Canada|50.45|-104.61|America/Regina;Saskatoon|Canada|52.13|-106.67|America/Regina;Toronto|Canada|43.65|-79.38|America/Toronto;Ottawa|Canada|45.42|-75.7|America/Toronto;Montreal|Canada|45.5|-73.57|America/Toronto;Quebec City|Canada|46.81|-71.21|America/Toronto;Halifax|Canada|44.65|-63.57|America/Halifax;St. John's|Canada|47.56|-52.71|America/St_Johns;Kelowna|Canada|49.89|-119.5|America/Vancouver;Kamloops|Canada|50.67|-120.33|America/Vancouver;Hamilton|Canada|43.26|-79.87|America/Toronto;London (Ontario)|Canada|42.98|-81.25|America/Toronto;Whitehorse|Canada|60.72|-135.06|America/Whitehorse;Yellowknife|Canada|62.45|-114.37|America/Edmonton;"
		+ "New York|USA|40.71|-74.01|America/New_York;Los Angeles|USA|34.05|-118.24|America/Los_Angeles;Chicago|USA|41.88|-87.63|America/Chicago;Houston|USA|29.76|-95.37|America/Chicago;Phoenix|USA|33.45|-112.07|America/Phoenix;Philadelphia|USA|39.95|-75.17|America/New_York;San Antonio|USA|29.42|-98.49|America/Chicago;San Diego|USA|32.72|-117.16|America/Los_Angeles;Dallas|USA|32.78|-96.8|America/Chicago;Austin|USA|30.27|-97.74|America/Chicago;San Francisco|USA|37.77|-122.42|America/Los_Angeles;San Jose|USA|37.34|-121.89|America/Los_Angeles;Seattle|USA|47.61|-122.33|America/Los_Angeles;Portland|USA|45.52|-122.68|America/Los_Angeles;Denver|USA|39.74|-104.99|America/Denver;Salt Lake City|USA|40.76|-111.89|America/Denver;Las Vegas|USA|36.17|-115.14|America/Los_Angeles;Boston|USA|42.36|-71.06|America/New_York;Washington, D.C.|USA|38.91|-77.04|America/New_York;Baltimore|USA|39.29|-76.61|America/New_York;Atlanta|USA|33.75|-84.39|America/New_York;Miami|USA|25.76|-80.19|America/New_York;Orlando|USA|28.54|-81.38|America/New_York;Tampa|USA|27.95|-82.46|America/New_York;Detroit|USA|42.33|-83.05|America/Detroit;Minneapolis|USA|44.98|-93.27|America/Chicago;St. Louis|USA|38.63|-90.2|America/Chicago;Kansas City|USA|39.1|-94.58|America/Chicago;New Orleans|USA|29.95|-90.07|America/Chicago;Nashville|USA|36.16|-86.78|America/Chicago;Memphis|USA|35.15|-90.05|America/Chicago;Charlotte|USA|35.23|-80.84|America/New_York;Pittsburgh|USA|40.44|-79.99|America/New_York;Cleveland|USA|41.5|-81.69|America/New_York;Cincinnati|USA|39.1|-84.51|America/New_York;Indianapolis|USA|39.77|-86.16|America/Indiana/Indianapolis;Columbus|USA|39.96|-83|America/New_York;Milwaukee|USA|43.04|-87.91|America/Chicago;Sacramento|USA|38.58|-121.49|America/Los_Angeles;Albuquerque|USA|35.08|-106.65|America/Denver;Oklahoma City|USA|35.47|-97.52|America/Chicago;Honolulu|USA|21.31|-157.86|Pacific/Honolulu;Anchorage|USA|61.22|-149.9|America/Anchorage;Little Rock|USA|34.75|-92.29|America/Chicago;Hope (Arkansas)|USA|33.67|-93.59|America/Chicago;Richmond|USA|37.54|-77.44|America/New_York;Buffalo|USA|42.89|-78.88|America/New_York;Brooklyn|USA|40.68|-73.94|America/New_York;Newark|USA|40.74|-74.17|America/New_York;Raleigh|USA|35.78|-78.64|America/New_York;Louisville|USA|38.25|-85.76|America/Kentucky/Louisville;Tucson|USA|32.22|-110.97|America/Phoenix;El Paso|USA|31.76|-106.49|America/Denver;Omaha|USA|41.26|-95.93|America/Chicago;Boise|USA|43.62|-116.2|America/Boise;"
		+ "Mexico City|Mexico|19.43|-99.13|America/Mexico_City;Guadalajara|Mexico|20.67|-103.35|America/Mexico_City;Monterrey|Mexico|25.69|-100.32|America/Monterrey;Tijuana|Mexico|32.51|-117.04|America/Tijuana;Cancun|Mexico|21.16|-86.85|America/Cancun;Havana|Cuba|23.11|-82.37|America/Havana;Kingston|Jamaica|17.97|-76.79|America/Jamaica;San Juan|Puerto Rico|18.47|-66.11|America/Puerto_Rico;Santo Domingo|Dominican Republic|18.49|-69.93|America/Santo_Domingo;Port-au-Prince|Haiti|18.59|-72.31|America/Port-au-Prince;Guatemala City|Guatemala|14.63|-90.51|America/Guatemala;San Salvador|El Salvador|13.69|-89.22|America/El_Salvador;Tegucigalpa|Honduras|14.07|-87.19|America/Tegucigalpa;Managua|Nicaragua|12.11|-86.24|America/Managua;San Jose (Costa Rica)|Costa Rica|9.93|-84.08|America/Costa_Rica;Panama City|Panama|8.98|-79.52|America/Panama;"
		+ "Bogota|Colombia|4.71|-74.07|America/Bogota;Medellin|Colombia|6.24|-75.58|America/Bogota;Caracas|Venezuela|10.48|-66.9|America/Caracas;Quito|Ecuador|-0.18|-78.47|America/Guayaquil;Guayaquil|Ecuador|-2.19|-79.89|America/Guayaquil;Lima|Peru|-12.05|-77.04|America/Lima;La Paz|Bolivia|-16.5|-68.15|America/La_Paz;Santiago|Chile|-33.45|-70.67|America/Santiago;Buenos Aires|Argentina|-34.6|-58.38|America/Argentina/Buenos_Aires;Cordoba|Argentina|-31.42|-64.18|America/Argentina/Cordoba;Rosario|Argentina|-32.95|-60.64|America/Argentina/Cordoba;Montevideo|Uruguay|-34.9|-56.16|America/Montevideo;Asuncion|Paraguay|-25.26|-57.58|America/Asuncion;Sao Paulo|Brazil|-23.55|-46.63|America/Sao_Paulo;Rio de Janeiro|Brazil|-22.91|-43.17|America/Sao_Paulo;Brasilia|Brazil|-15.79|-47.88|America/Sao_Paulo;Salvador|Brazil|-12.97|-38.5|America/Bahia;Belo Horizonte|Brazil|-19.92|-43.94|America/Sao_Paulo;Recife|Brazil|-8.05|-34.88|America/Recife;Fortaleza|Brazil|-3.73|-38.53|America/Fortaleza;Manaus|Brazil|-3.12|-60.02|America/Manaus;Porto Alegre|Brazil|-30.03|-51.23|America/Sao_Paulo;Curitiba|Brazil|-25.43|-49.27|America/Sao_Paulo;"
		+ "London|United Kingdom|51.51|-0.13|Europe/London;Manchester|United Kingdom|53.48|-2.24|Europe/London;Birmingham|United Kingdom|52.49|-1.89|Europe/London;Liverpool|United Kingdom|53.41|-2.98|Europe/London;Leeds|United Kingdom|53.8|-1.55|Europe/London;Bristol|United Kingdom|51.45|-2.59|Europe/London;Glasgow|United Kingdom|55.86|-4.25|Europe/London;Edinburgh|United Kingdom|55.95|-3.19|Europe/London;Cardiff|United Kingdom|51.48|-3.18|Europe/London;Belfast|United Kingdom|54.6|-5.93|Europe/London;Dublin|Ireland|53.35|-6.26|Europe/Dublin;Cork|Ireland|51.9|-8.47|Europe/Dublin;Paris|France|48.86|2.35|Europe/Paris;Marseille|France|43.3|5.37|Europe/Paris;Lyon|France|45.76|4.84|Europe/Paris;Nice|France|43.7|7.27|Europe/Paris;Toulouse|France|43.6|1.44|Europe/Paris;Bordeaux|France|44.84|-0.58|Europe/Paris;Brussels|Belgium|50.85|4.35|Europe/Brussels;Antwerp|Belgium|51.22|4.4|Europe/Brussels;Amsterdam|Netherlands|52.37|4.9|Europe/Amsterdam;Rotterdam|Netherlands|51.92|4.48|Europe/Amsterdam;Luxembourg|Luxembourg|49.61|6.13|Europe/Luxembourg;Berlin|Germany|52.52|13.4|Europe/Berlin;Hamburg|Germany|53.55|9.99|Europe/Berlin;Munich|Germany|48.14|11.58|Europe/Berlin;Cologne|Germany|50.94|6.96|Europe/Berlin;Frankfurt|Germany|50.11|8.68|Europe/Berlin;Stuttgart|Germany|48.78|9.18|Europe/Berlin;Dusseldorf|Germany|51.23|6.77|Europe/Berlin;Leipzig|Germany|51.34|12.37|Europe/Berlin;Dresden|Germany|51.05|13.74|Europe/Berlin;Vienna|Austria|48.21|16.37|Europe/Vienna;Salzburg|Austria|47.81|13.04|Europe/Vienna;Zurich|Switzerland|47.38|8.54|Europe/Zurich;Geneva|Switzerland|46.2|6.14|Europe/Zurich;Bern|Switzerland|46.95|7.45|Europe/Zurich;"
		+ "Madrid|Spain|40.42|-3.7|Europe/Madrid;Barcelona|Spain|41.39|2.17|Europe/Madrid;Valencia|Spain|39.47|-0.38|Europe/Madrid;Seville|Spain|37.39|-5.98|Europe/Madrid;Malaga|Spain|36.72|-4.42|Europe/Madrid;Bilbao|Spain|43.26|-2.93|Europe/Madrid;Lisbon|Portugal|38.72|-9.14|Europe/Lisbon;Porto|Portugal|41.15|-8.61|Europe/Lisbon;Rome|Italy|41.9|12.5|Europe/Rome;Milan|Italy|45.46|9.19|Europe/Rome;Naples|Italy|40.85|14.27|Europe/Rome;Turin|Italy|45.07|7.69|Europe/Rome;Florence|Italy|43.77|11.26|Europe/Rome;Venice|Italy|45.44|12.32|Europe/Rome;Palermo|Italy|38.12|13.36|Europe/Rome;Bologna|Italy|44.49|11.34|Europe/Rome;Athens|Greece|37.98|23.73|Europe/Athens;Thessaloniki|Greece|40.64|22.94|Europe/Athens;Valletta|Malta|35.9|14.51|Europe/Malta;Nicosia|Cyprus|35.19|33.38|Asia/Nicosia;"
		+ "Copenhagen|Denmark|55.68|12.57|Europe/Copenhagen;Oslo|Norway|59.91|10.75|Europe/Oslo;Bergen|Norway|60.39|5.32|Europe/Oslo;Stockholm|Sweden|59.33|18.07|Europe/Stockholm;Gothenburg|Sweden|57.71|11.97|Europe/Stockholm;Helsinki|Finland|60.17|24.94|Europe/Helsinki;Reykjavik|Iceland|64.15|-21.94|Atlantic/Reykjavik;Tallinn|Estonia|59.44|24.75|Europe/Tallinn;Riga|Latvia|56.95|24.11|Europe/Riga;Vilnius|Lithuania|54.69|25.28|Europe/Vilnius;Warsaw|Poland|52.23|21.01|Europe/Warsaw;Krakow|Poland|50.06|19.94|Europe/Warsaw;Gdansk|Poland|54.35|18.65|Europe/Warsaw;Wroclaw|Poland|51.11|17.03|Europe/Warsaw;Prague|Czechia|50.08|14.44|Europe/Prague;Brno|Czechia|49.2|16.61|Europe/Prague;Bratislava|Slovakia|48.15|17.11|Europe/Bratislava;Budapest|Hungary|47.5|19.04|Europe/Budapest;Ljubljana|Slovenia|46.06|14.51|Europe/Ljubljana;Zagreb|Croatia|45.81|15.98|Europe/Zagreb;Split|Croatia|43.51|16.44|Europe/Zagreb;Sarajevo|Bosnia and Herzegovina|43.86|18.41|Europe/Sarajevo;Belgrade|Serbia|44.79|20.45|Europe/Belgrade;Novi Sad|Serbia|45.27|19.83|Europe/Belgrade;Smiljan|Croatia|44.56|15.32|Europe/Zagreb;Podgorica|Montenegro|42.44|19.26|Europe/Podgorica;Skopje|North Macedonia|42|21.43|Europe/Skopje;Tirana|Albania|41.33|19.82|Europe/Tirane;Sofia|Bulgaria|42.7|23.32|Europe/Sofia;Bucharest|Romania|44.43|26.1|Europe/Bucharest;Cluj-Napoca|Romania|46.77|23.6|Europe/Bucharest;Chisinau|Moldova|47.01|28.86|Europe/Chisinau;Kyiv|Ukraine|50.45|30.52|Europe/Kyiv;Lviv|Ukraine|49.84|24.03|Europe/Kyiv;Odesa|Ukraine|46.48|30.72|Europe/Kyiv;Kharkiv|Ukraine|49.99|36.23|Europe/Kyiv;Minsk|Belarus|53.9|27.56|Europe/Minsk;Moscow|Russia|55.76|37.62|Europe/Moscow;Saint Petersburg|Russia|59.93|30.34|Europe/Moscow;Kazan|Russia|55.8|49.11|Europe/Moscow;Yekaterinburg|Russia|56.84|60.61|Asia/Yekaterinburg;Novosibirsk|Russia|55.03|82.92|Asia/Novosibirsk;Vladivostok|Russia|43.12|131.89|Asia/Vladivostok;Istanbul|Turkey|41.01|28.98|Europe/Istanbul;Ankara|Turkey|39.93|32.86|Europe/Istanbul;Izmir|Turkey|38.42|27.14|Europe/Istanbul;Tbilisi|Georgia|41.72|44.79|Asia/Tbilisi;Yerevan|Armenia|40.18|44.51|Asia/Yerevan;Baku|Azerbaijan|40.41|49.87|Asia/Baku;"
		+ "Jerusalem|Israel|31.77|35.21|Asia/Jerusalem;Tel Aviv|Israel|32.09|34.78|Asia/Jerusalem;Haifa|Israel|32.79|34.99|Asia/Jerusalem;Beirut|Lebanon|33.89|35.5|Asia/Beirut;Damascus|Syria|33.51|36.29|Asia/Damascus;Amman|Jordan|31.95|35.93|Asia/Amman;Baghdad|Iraq|33.31|44.36|Asia/Baghdad;Tehran|Iran|35.69|51.39|Asia/Tehran;Riyadh|Saudi Arabia|24.71|46.68|Asia/Riyadh;Jeddah|Saudi Arabia|21.49|39.19|Asia/Riyadh;Mecca|Saudi Arabia|21.39|39.86|Asia/Riyadh;Kuwait City|Kuwait|29.38|47.99|Asia/Kuwait;Doha|Qatar|25.29|51.53|Asia/Qatar;Dubai|United Arab Emirates|25.2|55.27|Asia/Dubai;Abu Dhabi|United Arab Emirates|24.45|54.38|Asia/Dubai;Muscat|Oman|23.59|58.41|Asia/Muscat;Kabul|Afghanistan|34.56|69.21|Asia/Kabul;Tashkent|Uzbekistan|41.3|69.24|Asia/Tashkent;Almaty|Kazakhstan|43.24|76.89|Asia/Almaty;Astana|Kazakhstan|51.17|71.43|Asia/Almaty;"
		+ "Karachi|Pakistan|24.86|67.01|Asia/Karachi;Lahore|Pakistan|31.55|74.34|Asia/Karachi;Islamabad|Pakistan|33.68|73.05|Asia/Karachi;Delhi|India|28.61|77.21|Asia/Kolkata;Mumbai|India|19.08|72.88|Asia/Kolkata;Kolkata|India|22.57|88.36|Asia/Kolkata;Chennai|India|13.08|80.27|Asia/Kolkata;Bengaluru|India|12.97|77.59|Asia/Kolkata;Hyderabad|India|17.39|78.49|Asia/Kolkata;Ahmedabad|India|23.02|72.57|Asia/Kolkata;Pune|India|18.52|73.86|Asia/Kolkata;Jaipur|India|26.91|75.79|Asia/Kolkata;Lucknow|India|26.85|80.95|Asia/Kolkata;Kathmandu|Nepal|27.72|85.32|Asia/Kathmandu;Dhaka|Bangladesh|23.81|90.41|Asia/Dhaka;Colombo|Sri Lanka|6.93|79.86|Asia/Colombo;Yangon|Myanmar|16.84|96.17|Asia/Yangon;Bangkok|Thailand|13.76|100.5|Asia/Bangkok;Chiang Mai|Thailand|18.79|98.98|Asia/Bangkok;Phnom Penh|Cambodia|11.56|104.93|Asia/Phnom_Penh;Vientiane|Laos|17.98|102.63|Asia/Vientiane;Hanoi|Vietnam|21.03|105.85|Asia/Ho_Chi_Minh;Ho Chi Minh City|Vietnam|10.82|106.63|Asia/Ho_Chi_Minh;Da Nang|Vietnam|16.05|108.2|Asia/Ho_Chi_Minh;Hue|Vietnam|16.46|107.59|Asia/Ho_Chi_Minh;Kuala Lumpur|Malaysia|3.14|101.69|Asia/Kuala_Lumpur;Singapore|Singapore|1.35|103.82|Asia/Singapore;Jakarta|Indonesia|-6.21|106.85|Asia/Jakarta;Surabaya|Indonesia|-7.25|112.75|Asia/Jakarta;Bali (Denpasar)|Indonesia|-8.65|115.22|Asia/Makassar;Manila|Philippines|14.6|120.98|Asia/Manila;Cebu|Philippines|10.32|123.89|Asia/Manila;"
		+ "Beijing|China|39.9|116.41|Asia/Shanghai;Shanghai|China|31.23|121.47|Asia/Shanghai;Guangzhou|China|23.13|113.26|Asia/Shanghai;Shenzhen|China|22.54|114.06|Asia/Shanghai;Chengdu|China|30.57|104.07|Asia/Shanghai;Wuhan|China|30.59|114.31|Asia/Shanghai;Xi'an|China|34.34|108.94|Asia/Shanghai;Hong Kong|China|22.32|114.17|Asia/Hong_Kong;Macau|China|22.2|113.54|Asia/Macau;Taipei|Taiwan|25.03|121.57|Asia/Taipei;Seoul|South Korea|37.57|126.98|Asia/Seoul;Busan|South Korea|35.18|129.08|Asia/Seoul;Pyongyang|North Korea|39.04|125.76|Asia/Pyongyang;Tokyo|Japan|35.68|139.69|Asia/Tokyo;Osaka|Japan|34.69|135.5|Asia/Tokyo;Kyoto|Japan|35.01|135.77|Asia/Tokyo;Nagoya|Japan|35.18|136.91|Asia/Tokyo;Sapporo|Japan|43.06|141.35|Asia/Tokyo;Fukuoka|Japan|33.59|130.4|Asia/Tokyo;Ulaanbaatar|Mongolia|47.89|106.91|Asia/Ulaanbaatar;"
		+ "Sydney|Australia|-33.87|151.21|Australia/Sydney;Melbourne|Australia|-37.81|144.96|Australia/Melbourne;Brisbane|Australia|-27.47|153.03|Australia/Brisbane;Perth|Australia|-31.95|115.86|Australia/Perth;Adelaide|Australia|-34.93|138.6|Australia/Adelaide;Canberra|Australia|-35.28|149.13|Australia/Sydney;Hobart|Australia|-42.88|147.33|Australia/Hobart;Darwin|Australia|-12.46|130.84|Australia/Darwin;Gold Coast|Australia|-28.02|153.4|Australia/Brisbane;Auckland|New Zealand|-36.85|174.76|Pacific/Auckland;Wellington|New Zealand|-41.29|174.78|Pacific/Auckland;Christchurch|New Zealand|-43.53|172.64|Pacific/Auckland;Suva|Fiji|-18.14|178.44|Pacific/Fiji;Port Moresby|Papua New Guinea|-9.44|147.18|Pacific/Port_Moresby;"
		+ "Cairo|Egypt|30.04|31.24|Africa/Cairo;Alexandria|Egypt|31.2|29.92|Africa/Cairo;Casablanca|Morocco|33.57|-7.59|Africa/Casablanca;Rabat|Morocco|34.02|-6.84|Africa/Casablanca;Marrakesh|Morocco|31.63|-8.01|Africa/Casablanca;Algiers|Algeria|36.75|3.06|Africa/Algiers;Tunis|Tunisia|36.81|10.18|Africa/Tunis;Tripoli|Libya|32.89|13.19|Africa/Tripoli;Khartoum|Sudan|15.5|32.56|Africa/Khartoum;Addis Ababa|Ethiopia|9.03|38.74|Africa/Addis_Ababa;Nairobi|Kenya|-1.29|36.82|Africa/Nairobi;Mombasa|Kenya|-4.04|39.67|Africa/Nairobi;Kampala|Uganda|0.35|32.58|Africa/Kampala;Dar es Salaam|Tanzania|-6.79|39.21|Africa/Dar_es_Salaam;Kigali|Rwanda|-1.94|30.06|Africa/Kigali;Lagos|Nigeria|6.52|3.38|Africa/Lagos;Abuja|Nigeria|9.08|7.4|Africa/Lagos;Accra|Ghana|5.6|-0.19|Africa/Accra;Dakar|Senegal|14.72|-17.47|Africa/Dakar;Abidjan|Ivory Coast|5.36|-4.01|Africa/Abidjan;Kinshasa|DR Congo|-4.44|15.27|Africa/Kinshasa;Luanda|Angola|-8.84|13.23|Africa/Luanda;Lusaka|Zambia|-15.39|28.32|Africa/Lusaka;Harare|Zimbabwe|-17.83|31.05|Africa/Harare;Johannesburg|South Africa|-26.2|28.05|Africa/Johannesburg;Cape Town|South Africa|-33.92|18.42|Africa/Johannesburg;Durban|South Africa|-29.86|31.02|Africa/Johannesburg;Pretoria|South Africa|-25.75|28.19|Africa/Johannesburg;Windhoek|Namibia|-22.56|17.08|Africa/Windhoek;Antananarivo|Madagascar|-18.88|47.51|Indian/Antananarivo;Port Louis|Mauritius|-20.16|57.5|Indian/Mauritius")
		.split(";").map(function (r) { var f = r.split("|"); return { name: f[0], country: f[1], lat: +f[2], lon: +f[3], tz: f[4] }; });
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
	function findCities(q, n) {
		q = norm(q); if (!q) return [];
		var out = [];
		CITIES.forEach(function (c) {
			var a = norm(c.name), b = norm(c.name + " " + c.country), s = a === q ? 0 : a.indexOf(q) === 0 ? 1 : b.indexOf(q) >= 0 ? 2 : -1;
			if (s >= 0) out.push({ c: c, s: s });
		});
		return out.sort(function (x, y) { return x.s - y.s || x.c.name.localeCompare(y.c.name); }).slice(0, n || 8).map(function (x) { return x.c; });
	}
	// "49.28, -123.12" / "49°17'N 123°7'W" -> {lat, lon} or null
	function parseLatLon(s) {
		s = String(s || "").trim().toUpperCase(); if (!s) return null;
		var nums = [], re = /(-?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])?/g, m;
		while ((m = re.exec(s)) && nums.length < 2) {
			if (m[0] === "") { re.lastIndex++; continue; }
			var v = Math.abs(+m[1]) + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600; if (+m[1] < 0 || m[4] === "S" || m[4] === "W") v = -v;
			nums.push({ v: v, h: m[4] || "" });
		}
		if (nums.length < 2) return null;
		var lat = nums[0].v, lon = nums[1].v;
		if (nums[0].h === "E" || nums[0].h === "W") { lat = nums[1].v; lon = nums[0].v; }
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
		return { lat: lat, lon: lon };
	}

	var ZD = { SIGNS: SIGNS, BODIES: BODIES, ANIMALS: ANIMALS, ELEMENTS: ELEMENTS, CITIES: CITIES, wrap: wrap, lonOf: lonOf, signOf: signOf, degText: degText, parseDate: parseDate, parseTime: parseTime,
		daysIn: daysIn, wallToUtc: wallToUtc, offsetAt: offsetAt, fixedOffset: fixedOffset, validZone: validZone, angles: angles, phaseName: phaseName, lunarNewYear: lunarNewYear, chinese: chinese,
		chineseByYearOnly: chineseByYearOnly, signChange: signChange, chart: chart, quick: quick, sunSignByDay: sunSignByDay, signDays: signDays, findCities: findCities, parseLatLon: parseLatLon, norm: norm };
	if (typeof module !== "undefined" && module.exports) module.exports = ZD; else root.ZD = ZD;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Birthday Personality -- pure text engine (no DOM). Browser global `BP`; node: require('./tool_apps_src/birthday-personality/lib.js').
 * Used by mes.fm/birthday-personality (full profile), mes.fm/birthday and mes.fm/zodiac (a compact card). Tests: node tool_apps_src/birthday-personality-tests.js
 *
 * FOR FUN ONLY. Every sentence here is original writing for mes.fm (not taken or paraphrased from any book). A profile is put together from
 * phrase banks: the sign (12), its decan (36: the sign split into thirds, each with a co-ruling sign of the same element), the cusp (the
 * first / last 3 days of a sign), and the numerology of the day of the month (9). The archetype title is "The <adjective> <noun>": the
 * adjective is unique to the day of the month (31) and the noun comes from the decan's own three nouns (108 nouns, all different), so two days
 * can never share a title (the same day of the month in two months always falls in two different decans). 29 February has its own entry.
 * Sign dates are the usual fixed ranges; the real Sun changes sign on slightly different days each year (the page says so on cusp days). */
(function (root) {
	"use strict";
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	function doy(mo, d) { return Math.round((Date.UTC(2000, mo - 1, d) - Date.UTC(2000, 0, 0)) / 86400000); }    // 1..366 in a leap year
	function fromDoy(n) { var t = new Date(Date.UTC(2000, 0, n)); return { mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
	function daysIn(mo) { return new Date(Date.UTC(2000, mo, 0)).getUTCDate(); }        // February = 29 here
	function valid(mo, d) { return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(mo) && Math.floor(mo) === mo && Math.floor(d) === d; }

	// sign: name, glyph, element, modality, traditional ruler, lucky weekday (the ruler's day), start month/day
	var SIGNS = [
		["Aries", "♈", "Fire", "Cardinal", "Mars", 2, 3, 21], ["Taurus", "♉", "Earth", "Fixed", "Venus", 5, 4, 20], ["Gemini", "♊", "Air", "Mutable", "Mercury", 3, 5, 21],
		["Cancer", "♋", "Water", "Cardinal", "the Moon", 1, 6, 21], ["Leo", "♌", "Fire", "Fixed", "the Sun", 0, 7, 23], ["Virgo", "♍", "Earth", "Mutable", "Mercury", 3, 8, 23],
		["Libra", "♎", "Air", "Cardinal", "Venus", 5, 9, 23], ["Scorpio", "♏", "Water", "Fixed", "Mars", 2, 10, 23], ["Sagittarius", "♐", "Fire", "Mutable", "Jupiter", 4, 11, 22],
		["Capricorn", "♑", "Earth", "Cardinal", "Saturn", 6, 12, 22], ["Aquarius", "♒", "Air", "Fixed", "Saturn", 6, 1, 20], ["Pisces", "♓", "Water", "Mutable", "Jupiter", 4, 2, 19]
	].map(function (r, i) { return { i: i, name: r[0], glyph: r[1] + "︎", element: r[2], modality: r[3], ruler: r[4], weekday: WEEKDAYS[r[5]], start: doy(r[6], r[7]) }; });
	SIGNS.forEach(function (s, i) {
		var next = SIGNS[(i + 1) % 12], end = fromDoy(next.start - 1 < 1 ? 366 : next.start - 1), st = fromDoy(s.start);
		s.len = ((next.start - s.start) + 366) % 366;
		s.dates = MONTHS[st.mo - 1].slice(0, 3) + " " + st.d + " – " + MONTHS[end.mo - 1].slice(0, 3) + " " + end.d;
	});

	// Per-sign phrase banks (original text): openers, strengths, challenges, love, work, advice
	var TXT = {
		Aries: {
			open: ["Aries is the spark that starts the zodiac, and you bring that first-match energy to everything you touch.",
				"Ruled by Mars, you meet life head-on: you would rather knock on the door than wait for it to open.",
				"You are an Aries, which means patience is something you admire, mostly in other people.",
				"Your fire sign burns fast and honest: what you feel shows on your face before you can hide it."],
			str: ["Starts things other people only talk about", "Brave in a crisis", "Refreshingly honest", "Bounces back fast from setbacks", "Protective of friends", "Energy that lifts a whole team"],
			chal: ["Impatience when things move slowly", "A temper that flares and fades quickly", "Starting five projects and finishing two", "Hearing advice as criticism", "Treating every disagreement as a race"],
			love: ["In love you are direct and wholehearted: if you like someone, they will know by Thursday.",
				"You need a partner who can keep up, push back and laugh when you lose a board game badly.",
				"Friendship with you is an adventure, and you defend your friends like family."],
			work: ["At work you shine wherever speed and nerve matter: launches, emergencies, sales, sport, anything with a starting line.",
				"Money tends to arrive in bursts, so a simple automatic savings habit protects you from your own impulse buys.",
				"Give yourself a role with visible wins, or you will invent a competition just to feel alive."],
			adv: ["Count to ten, then still go first.", "Finish one brave thing before you start the next.", "Let someone else win the small races."]
		},
		Taurus: {
			open: ["Taurus is the zodiac's gardener, and you grow your life the way a good garden grows: steadily, seasonally, without fuss.",
				"Venus rules your sign, so beauty, comfort and good food are not luxuries to you; they are necessities.",
				"You are calm on the outside and immovable on the inside once your mind is made up.",
				"As an earth sign, you trust what is real: what can be touched, tasted, counted and kept."],
			str: ["Reliable when it matters most", "Patient with long projects", "An excellent eye for quality", "Calm under pressure", "Loyal for life", "Practical with money"],
			chal: ["Stubbornness dressed up as principle", "Resisting change long after it has arrived", "Holding on to things, and grudges, too long", "Comfort that slowly becomes a rut", "Saying “fine” when it is not"],
			love: ["In love you are affectionate, steady and sensual; you remember exactly how someone takes their tea.",
				"You fall slowly and stay long, and you need a partner who values loyalty as much as you do.",
				"Friends rely on you as the one who always shows up, usually with snacks."],
			work: ["You do well in careers that reward patience and taste: finance, food, design, building, music, land and anything that grows in value.",
				"Money means security to you, and a slow, sensible plan suits you far better than a hot tip.",
				"You are the colleague who quietly finishes what everyone else abandoned."],
			adv: ["Try one new thing a month, on purpose.", "Let go of what no longer feeds you.", "Comfort is a gift; just do not let it become a fence."]
		},
		Gemini: {
			open: ["Gemini is the zodiac's conversation, and you are always halfway through an interesting one.",
				"Mercury rules your sign, so your mind moves quickly and your words move even faster.",
				"You are a Gemini, which means two good ideas before breakfast and three more by lunch.",
				"As an air sign, you live among ideas, news, jokes and the connections between people."],
			str: ["Quick-witted and funny", "Learns new skills fast", "Can talk to anyone", "Adapts easily to change", "Brings people together", "Sees both sides of a question"],
			chal: ["Losing interest once the novelty fades", "Scattering energy across too many plans", "Talking about feelings instead of feeling them", "Restlessness when life turns routine", "Telling a story better than it happened"],
			love: ["In love you need a partner who is also a friend, someone you can talk to until two in the morning.",
				"Variety keeps your heart engaged: shared trips, new restaurants, silly debates over dinner.",
				"Your friendships are many and lively, and you somehow remember everyone's news."],
			work: ["You thrive in roles full of words and people: writing, teaching, media, sales, coding, anything with variety.",
				"Your income may come from more than one source, which suits you, as long as you keep track of it.",
				"A to-do list is your best friend and your favourite thing to ignore."],
			adv: ["Pick one thing and see it all the way through.", "Listen as fast as you talk.", "Your curiosity is a gift; give it some depth too."]
		},
		Cancer: {
			open: ["Cancer is the zodiac's home, and you carry a little of that warmth with you wherever you go.",
				"Ruled by the Moon, your moods have tides, and so does your intuition, which is usually right.",
				"You are a Cancer: soft at the centre, protected by a shell that took years to build.",
				"As a water sign, you feel the emotional weather of a room before anyone says a word."],
			str: ["Deeply caring", "A memory for what matters to people", "Strong intuition", "Fiercely protective", "Makes anywhere feel like home", "Loyal through hard times"],
			chal: ["Taking things personally", "Retreating into your shell when hurt", "Worrying about people you cannot control", "Holding on to the past", "Mood swings that confuse others"],
			love: ["In love you are devoted and nurturing, and you need to feel safe before you open up completely.",
				"Small gestures mean everything to you, and you never forget an anniversary.",
				"Your friends become family, and family is the centre of your world."],
			work: ["You do well where care and instinct count: health, teaching, food, hospitality, property, history and family businesses.",
				"Money is about security for you; a well-stocked savings account is what lets you sleep.",
				"You lead like a good parent: protective, demanding and proud of your team."],
			adv: ["Say what you need instead of hoping people guess.", "The past is a good teacher and a poor place to live.", "Look after yourself as well as you look after everyone else."]
		},
		Leo: {
			open: ["Leo is the zodiac's sunshine, and people tend to feel a little warmer around you.",
				"Ruled by the Sun itself, you were made to shine and, at your best, to help others shine too.",
				"You are a Leo: generous, dramatic and very hard to ignore.",
				"As a fire sign, you bring heat, colour and a sense of occasion to ordinary days."],
			str: ["Generous with time and praise", "Natural confidence", "Creative and expressive", "Loyal and warm", "Leads by example", "Makes ordinary moments feel special"],
			chal: ["Needing applause a little too much", "Pride that makes apologies hard", "Taking over the conversation", "Stubbornness when your ego is bruised", "Spending to impress"],
			love: ["In love you are romantic and big-hearted; you plan surprises and expect a little adoration in return.",
				"You need a partner who admires you and is secure enough not to compete for the spotlight.",
				"Your friends know you as the one who throws the party and remembers every birthday."],
			work: ["You shine where you can lead, create or perform: management, entertainment, teaching, design, politics and anything with a stage.",
				"Money comes and goes with flair; a budget that leaves room for fun is the one you will actually keep.",
				"Praise motivates you more than a pay rise, though you would happily take both."],
			adv: ["Let others take a bow too.", "Your heart is your crown; wear it kindly.", "Quiet confidence carries further than a roar."]
		},
		Virgo: {
			open: ["Virgo is the zodiac's craftsperson, and you notice every detail, including a few you wish you had not.",
				"Ruled by Mercury, your mind is sharp, analytical and always looking for a better way.",
				"You are a Virgo: modest about your gifts and surprisingly funny once people get to know you.",
				"As an earth sign, you show love through action: fixing, tidying, helping, remembering."],
			str: ["Precise and thorough", "A practical problem-solver", "Helpful without being asked", "Gives honest feedback", "Organised under pressure", "Learns from every mistake"],
			chal: ["Perfectionism that delays finishing", "Being your own harshest critic", "Worrying about small things", "Finding it hard to accept help", "Correcting people who did not ask"],
			love: ["In love you are attentive and sincere, and you show devotion in a hundred small, practical ways.",
				"You need a partner who appreciates care that is quiet rather than showy.",
				"Friends come to you for advice and leave with a plan."],
			work: ["You do well wherever accuracy matters: health, science, editing, accounting, engineering, craft and service.",
				"You are careful with money and good at finding the best value, sometimes after reading every single review.",
				"You are the one who spots the mistake before it costs anything."],
			adv: ["Done is a kind of perfect too.", "Give yourself the patience you give others.", "Not every flaw needs fixing; some just need love."]
		},
		Libra: {
			open: ["Libra is the zodiac's balance, and you spend your life weighing what is fair, kind and beautiful.",
				"Ruled by Venus, you have a gift for charm, harmony and making hard things look effortless.",
				"You are a Libra: sociable, gracious and sometimes stuck between two equally good options.",
				"As an air sign, you think in relationships: you see how people, ideas and colours fit together."],
			str: ["Fair-minded", "Gracious and charming", "A natural mediator", "A strong sense of style", "A good listener", "Brings out the best in a partner"],
			chal: ["Indecision when choices are close", "Avoiding conflict until it grows", "Putting other people's wishes first", "Caring a lot about appearances", "Saying yes just to keep the peace"],
			love: ["In love you are romantic and attentive; you believe partnership is one of life's great arts.",
				"You need a partner who talks things through and appreciates a beautiful evening.",
				"As a friend you are everyone's favourite plus-one and the calm voice in any quarrel."],
			work: ["You do well in roles that need diplomacy and taste: law, design, mediation, fashion, people management, the arts and public relations.",
				"Money is easiest for you with a partner or a clear plan; impulse shopping for lovely things is the risk.",
				"You make a group of colleagues feel like a team."],
			adv: ["Make the choice; balance comes after.", "Peace that hides problems is not peace.", "Your opinion counts too, so say it."]
		},
		Scorpio: {
			open: ["Scorpio is the zodiac's deep water, and very few people ever see how far down you go.",
				"Traditionally ruled by Mars, you have quiet power and a will that does not bend easily.",
				"You are a Scorpio: magnetic, private and impossible to fool for long.",
				"As a water sign, you feel things intensely, though you may show only a fraction of it."],
			str: ["Determined and resilient", "Sees through pretence", "Fiercely loyal", "Keeps secrets safe", "Brave about hard truths", "Turns setbacks into strength"],
			chal: ["Jealousy and suspicion", "Holding grudges", "A need for control", "Testing people before trusting them", "Keeping feelings bottled up"],
			love: ["In love you are intense and devoted; you want depth, honesty and nothing lukewarm.",
				"Trust is everything to you, and once broken it is very hard to rebuild.",
				"You have few close friends, and you would do anything for each of them."],
			work: ["You thrive where depth and focus matter: research, investigation, medicine, psychology, finance and crisis work.",
				"You are strategic with money and good at quietly building reserves.",
				"Give you a mystery and you will not sleep until it is solved."],
			adv: ["Let one person all the way in.", "Forgiveness is a power move too.", "Not everything needs to be a test."]
		},
		Sagittarius: {
			open: ["Sagittarius is the zodiac's explorer, and your mind is usually already somewhere further away.",
				"Ruled by Jupiter, the planet of growth, you expect life to be generous, and quite often it is.",
				"You are a Sagittarius: honest, funny and always up for the trip.",
				"As a fire sign, you burn with enthusiasm for ideas, places and people who make you think."],
			str: ["Optimistic", "Adventurous", "Honest and open", "A great sense of humour", "Loves to learn and to teach", "A generous spirit"],
			chal: ["Bluntness that stings", "Restlessness and commitment nerves", "Overpromising", "Impatience with details", "Preaching when you mean to share"],
			love: ["In love you need freedom and a partner who is also a travel buddy and a debating partner.",
				"You fall fast for a brilliant mind and stay for the laughter.",
				"Your friends come from everywhere, and you keep in touch from anywhere."],
			work: ["You do well where learning, travel and big ideas meet: teaching, publishing, law, tourism, sport and anything international.",
				"Money tends to flow out on experiences; a dedicated travel fund keeps your two loves on speaking terms.",
				"You need a mission bigger than the pay cheque."],
			adv: ["Stay long enough to see what grows.", "Truth lands softer with a little tact.", "Small promises kept beat big ones forgotten."]
		},
		Capricorn: {
			open: ["Capricorn is the zodiac's mountain climber, and you tend to reach the top by simply never stopping.",
				"Ruled by Saturn, you understand time, effort and the value of things that last.",
				"You are a Capricorn: serious when needed, funny when you choose to be, and much warmer than you look.",
				"As an earth sign, you build things: careers, families, savings and reputations, one solid brick at a time."],
			str: ["Disciplined", "Responsible", "Patient with long goals", "Dry, clever humour", "A practical leader", "Keeps promises"],
			chal: ["Working too much", "Pessimism dressed up as realism", "Finding it hard to relax", "Being hard on yourself", "Keeping feelings formal"],
			love: ["In love you are loyal and steady, slow to commit and very hard to shake once you have.",
				"You show love by providing, planning and showing up, year after year.",
				"Your friends are few but long-standing, and you help them in practical ways."],
			work: ["You do well where responsibility and long-term planning matter: management, finance, government, engineering, law and building anything from scratch.",
				"You are careful with money and very good at playing the long game.",
				"Titles matter less to you than results, though you would not say no to both."],
			adv: ["Rest is part of the climb.", "Celebrate the halfway point.", "Let people see the warmth behind the work."]
		},
		Aquarius: {
			open: ["Aquarius is the zodiac's free thinker, and you have never been very interested in doing things the usual way.",
				"Traditionally ruled by Saturn, you mix steady principles with surprisingly radical ideas.",
				"You are an Aquarius: friendly to all, fully understood by few, and fine with that.",
				"As an air sign, you live in ideas, especially the ones about how the world could work better."],
			str: ["An original thinker", "Fair and humane", "A loyal friend", "Independent", "Good with technology and systems", "Calm in a storm"],
			chal: ["Detachment when emotions run high", "Stubbornness about your ideas", "Rebelling for its own sake", "Unpredictability", "Caring for humanity more easily than for one person"],
			love: ["In love you need a best friend first, and space to remain your own person.",
				"You are loyal in an unusual way: you may forget an anniversary, but never a promise.",
				"Your friendships cross every kind of border, and you value them deeply."],
			work: ["You do well where new ideas matter: science, technology, social causes, design, media and anything that has not been invented yet.",
				"Money is a tool for freedom to you; the right investment is one that buys you choices.",
				"You work best towards a goal that helps more people than just you."],
			adv: ["Let someone close see your heart.", "Being different is a gift; being kind is a bigger one.", "Not every rule is wrong, so choose your rebellions."]
		},
		Pisces: {
			open: ["Pisces is the zodiac's ocean, where the colours of every other sign meet and blend, and you feel all of them.",
				"Traditionally ruled by Jupiter, you have a generous, forgiving heart and an enormous imagination.",
				"You are a Pisces: dreamy, kind and wiser than you let on.",
				"As a water sign, you read feelings the way other people read street signs."],
			str: ["Compassionate", "Imaginative", "Intuitive", "Artistic", "Adaptable", "Forgiving"],
			chal: ["Escaping when life gets hard", "Weak boundaries", "Saying yes to everyone", "Feeling flooded by other people's moods", "Avoiding practical details"],
			love: ["In love you are romantic and devoted, and you see the best in people, sometimes more than they show.",
				"You need a gentle partner who protects your dreamy side instead of laughing at it.",
				"Your friends feel truly understood when they are around you."],
			work: ["You do well where empathy and imagination count: art, music, healing, care, film, spiritual and charitable work.",
				"Money can slip through your fingers; a simple automatic budget gives your dreams a floor to stand on.",
				"You need work with meaning, because a pay cheque alone will never be enough."],
			adv: ["Boundaries are a form of kindness.", "Bring one dream down to earth this month.", "Your sensitivity is a strength; protect it."]
		}
	};

	// Decans: [nouns x3, "of ..." endings x2, sentences x2, lucky colour, mottos x2, strength]
	var DEC = {
		Aries: [
			[["Trailblazer", "Spark", "Vanguard"], ["of First Light", "of the Open Road"],
				["Born in the opening days of the zodiac's first sign, you have the energy of a starting gun: things begin when you arrive.", "You would rather try and fail loudly than wait politely for permission."],
				"scarlet", ["Begin before you feel ready.", "The first step is the only one I need to see."], "Acts while others are still deciding"],
			[["Champion", "Torchbearer", "Showrunner"], ["of Bright Causes", "of the Main Stage"],
				["A Leo note in your fire adds warmth and a love of the spotlight to Aries courage.", "You lead best when there is an audience to inspire and a cause worth the noise."],
				"flame orange", ["If it matters, say it out loud.", "Light the way, then pass the torch."], "Rallies people to a cause"],
			[["Adventurer", "Frontier Scout", "Daredevil"], ["of Far Horizons", "of Wild Ideas"],
				["The Sagittarius thread in your decan turns raw drive into a hunger for distance, meaning and big ideas.", "You are happiest when a plan is half adventure and half philosophy."],
				"ember red", ["The map ends where the fun starts.", "Go far, come back wiser."], "Turns risk into a good story"]
		],
		Taurus: [
			[["Gardener", "Keeper", "Cornerstone"], ["of Slow Seasons", "of Good Things"],
				["Early Taurus days bring a deep, unhurried strength: you grow plants, people and savings at the speed they actually grow.", "You trust what you can touch, taste and test for yourself."],
				"moss green", ["Good things are worth the wait.", "Root first, then rise."], "Makes things grow"],
			[["Artisan", "Steward", "Mender"], ["of Fine Details", "of Useful Beauty"],
				["A Virgo undertone makes you a perfectionist with a soft touch, the person who fixes the wobbly table and then polishes it.", "Your taste is excellent, and you can explain exactly why."],
				"sage green", ["Do it well or do it twice.", "Beauty should also work."], "Skilled with your hands"],
			[["Architect", "Treasurer", "Stonemason"], ["of Lasting Things", "of the Long Game"],
				["With Capricorn shading your decan, the love of comfort becomes ambition: you want a life that will still be standing in fifty years.", "You plan in decades and rarely panic in days."],
				"earth brown", ["Build it to outlast me.", "Steady wins, eventually and completely."], "Thinks in decades"]
		],
		Gemini: [
			[["Messenger", "Storyteller", "Juggler"], ["of Quick Words", "of a Thousand Questions"],
				["The first Gemini days hum with curiosity; you collect facts, friends and open browser tabs at the same pace.", "Boredom is the only thing you truly fear."],
				"lemon yellow", ["Ask one more question.", "Every room has a conversation waiting."], "Explains anything simply"],
			[["Diplomat", "Matchmaker", "Charmer"], ["of Easy Company", "of Clever Balance"],
				["A Libra breeze softens Gemini wit into charm: you could talk two rivals into having lunch together.", "You think best out loud, with someone across the table."],
				"sky blue", ["There is always a kinder way to say it.", "Two minds are better than my one."], "Smooths over awkward moments"],
			[["Inventor", "Futurist", "Free Thinker"], ["of Odd Ideas", "of Tomorrow"],
				["With Aquarius in the mix, your mind races ahead of the crowd and comes back with inventions nobody asked for, yet.", "You are friendly with everyone and predictable to no one."],
				"electric teal", ["Weird is just early.", "Change the question."], "Spots trends early"]
		],
		Cancer: [
			[["Guardian", "Hearth Keeper", "Nurturer"], ["of the Home Fires", "of Small Kindnesses"],
				["Born as the days are longest, you hold on to people and memories with the same fierce tenderness.", "Home, for you, is less a place than the people you have decided to protect."],
				"pearl white", ["Feed people first, then argue.", "My door stays open."], "Makes people feel safe"],
			[["Confidant", "Tidecaller", "Secret Keeper"], ["of Deep Waters", "of Quiet Loyalty"],
				["A Scorpio current runs beneath your gentle Cancer surface, adding intuition and a memory that forgets nothing.", "People tell you things they have never told anyone else."],
				"sea green", ["Feelings are information.", "What is shared with me stays with me."], "Trusted with secrets"],
			[["Poet", "Healer", "Lighthouse"], ["of Gentle Tides", "of Remembered Songs"],
				["Pisces in your decan makes you imaginative and deeply empathic, the friend who senses a bad day before a word is said.", "You turn feelings into art, meals, letters or music."],
				"silver blue", ["Softness is not weakness.", "Every hurt can teach a song."], "Comforts without words"]
		],
		Leo: [
			[["Sovereign", "Performer", "Lionheart"], ["of the Golden Hour", "of Big Gestures"],
				["Early Leos shine without trying; a room seems to turn slightly towards you when you walk in.", "You love generously, loudly and with a real sense of occasion."],
				"gold", ["Shine so others feel brave enough to.", "Go big, with heart."], "Lights up a room"],
			[["Ringmaster", "Optimist", "Bard"], ["of Grand Adventures", "of Good Fortune"],
				["A Sagittarius flame adds wanderlust and humour to Leo pride; you make every trip and every story bigger.", "Your optimism is contagious, and now and then a little reckless."],
				"sunset orange", ["Say yes to the story.", "Luck likes the bold."], "Turns plans into celebrations"],
			[["Commander", "Firebrand", "Hero"], ["of Brave Choices", "of the Front Line"],
				["Aries energy in your decan makes your Leo warmth decisive: you do not just admire courage, you go first.", "You protect the underdog almost by reflex."],
				"crimson", ["Courage is a choice I make daily.", "Stand up, then stand by them."], "Stands up for the underdog"]
		],
		Virgo: [
			[["Analyst", "Editor", "Problem Solver"], ["of Small Miracles", "of Clean Lines"],
				["Early Virgos notice what everyone else misses: the typo, the loose thread, the friend who has gone quiet.", "You show love by being useful."],
				"wheat", ["Details are where care lives.", "Leave it better than I found it."], "Notices what others miss"],
			[["Engineer", "Strategist", "Clockmaker"], ["of Working Systems", "of Tomorrow's Plans"],
				["A Capricorn layer makes your precision ambitious: you design systems that keep working long after you have left the room.", "You stay calm in a crisis because you already wrote the checklist."],
				"slate grey", ["A good plan is a kindness to my future self.", "Measure twice, live once."], "Designs systems that last"],
			[["Herbalist", "Caretaker", "Naturalist"], ["of Green Things", "of Honest Work"],
				["Taurus earth in your decan slows Virgo worry into patient craft; you are at your best with your hands busy.", "You find peace in routines that other people call boring."],
				"olive", ["Tend the garden in front of me.", "Simple, done well, every day."], "Finds calm in routine"]
		],
		Libra: [
			[["Peacemaker", "Aesthete", "Host"], ["of Fair Play", "of Beautiful Rooms"],
				["Born near the equinox, when day and night are equal, you are built for balance and allergic to unfairness.", "You can make a stranger feel like the guest of honour."],
				"rose pink", ["Fair first, then fast.", "Make the space lovely and the people welcome."], "Makes everyone feel welcome"],
			[["Reformer", "Idealist", "Bridge Builder"], ["of Better Rules", "of Common Ground"],
				["An Aquarius current pushes your Libra fairness outwards: you want justice for strangers, not just harmony at home.", "You argue for the people who are not in the room."],
				"periwinkle", ["Better is possible.", "Build the bridge, then walk it first."], "Speaks up for fairness"],
			[["Wordsmith", "Negotiator", "Socialite"], ["of Witty Replies", "of Second Chances"],
				["With Gemini in your decan, your charm comes with a quick tongue: you can win the argument and keep the friend.", "You are rarely short of an invitation or an opinion."],
				"lilac", ["Every story has another side.", "Say it kindly, say it well."], "Wins arguments gracefully"]
		],
		Scorpio: [
			[["Alchemist", "Detective", "Phoenix"], ["of Hidden Truths", "of Second Lives"],
				["Early Scorpios are intense and private, with a talent for seeing what is really happening under the surface.", "You do nothing halfway, loyalty included."],
				"deep burgundy", ["The truth is usually one layer down.", "Burn it down, grow it back better."], "Reinvention after a setback"],
			[["Mystic", "Seer", "Night Swimmer"], ["of Midnight Thoughts", "of Unspoken Things"],
				["Pisces shading gives your Scorpio depth a dreamy, almost psychic edge; your hunches are right often enough to be unnerving.", "You need time alone the way other people need sleep."],
				"indigo", ["Trust the quiet voice.", "Still water, deep roots."], "Hunches that turn out right"],
			[["Protector", "Sentinel", "Loyalist"], ["of the Inner Circle", "of Kept Promises"],
				["Cancer in your decan turns Scorpio intensity into fierce protection of the few people you let all the way in.", "Anyone who hurts your family will meet a very different side of you."],
				"wine red", ["My people, my promise.", "Loyalty is my first language."], "Defends the people you love"]
		],
		Sagittarius: [
			[["Explorer", "Archer", "Wanderer"], ["of Open Skies", "of Big Questions"],
				["Early Sagittarians aim far; you are drawn to travel, teaching and anything that makes the world feel bigger.", "Honesty comes out of you fast, sometimes before tact has caught up."],
				"royal purple", ["Aim high, pack light.", "Go and see for myself."], "Makes the world feel bigger"],
			[["Crusader", "Maverick", "Pathfinder"], ["of Bold Truths", "of Unmapped Places"],
				["Aries fire in your decan sharpens Sagittarius optimism into action: you do not just dream about the trip, you book it.", "You grow restless when life stands still for too long."],
				"turquoise", ["Fortune favours the packed bag.", "If not now, then soon, but probably now."], "Turns dreams into tickets"],
			[["Philosopher", "Entertainer", "Teacher"], ["of Joyful Lessons", "of the Long Table"],
				["With Leo warmth in your decan, your wisdom comes wrapped in humour; people learn from you without noticing they are being taught.", "You are generous with laughter, advice and dessert."],
				"plum", ["Teach with a smile.", "Laughter is the best lecture."], "Teaches without preaching"]
		],
		Capricorn: [
			[["Mountaineer", "Timekeeper", "Chieftain"], ["of Quiet Summits", "of Long Winters"],
				["Born as the year turns dark and cold, you have a winter kind of strength: patient, practical and very hard to knock over.", "You took life seriously early, and you tend to enjoy it more with every passing year."],
				"charcoal", ["One handhold at a time.", "Earn it, keep it."], "Endures what others quit"],
			[["Founder", "Patron", "Provider"], ["of New Beginnings", "of Solid Ground"],
				["A Taurus note gives Capricorn ambition a love of comfort and quality: you work hard so that life can be beautiful, eventually.", "You are a reliable friend with excellent taste in shoes and investments."],
				"forest green", ["Build the table, then invite everyone.", "Slow money is good money."], "Builds security for others"],
			[["Mastermind", "Navigator", "Pillar"], ["of Hard Problems", "of Quiet Excellence"],
				["Virgo precision in your decan makes your Capricorn drive meticulous; you are the one a team relies on when the stakes are high.", "Your humour is dry enough to miss, which is half of its charm."],
				"steel grey", ["Quietly, thoroughly, completely.", "Trust the plan I drew."], "Calm when the stakes are high"]
		],
		Aquarius: [
			[["Visionary", "Rebel", "Humanitarian"], ["of the Next Big Thing", "of Free Minds"],
				["Early Aquarians are original by default; you see where the world is heading and wonder why everyone else is standing still.", "You care about humanity in general and need plenty of space in particular."],
				"electric blue", ["The future needs a first draft.", "Be kind, be strange, be free."], "Sees where things are heading"],
			[["Tinkerer", "Networker", "Wit"], ["of Bright Sparks", "of Many Friends"],
				["Gemini air in your decan makes your Aquarian mind sociable and quick; you connect people and ideas that would never otherwise have met.", "Routine bores you, and a clever problem wakes you right up."],
				"aqua", ["Connect the dots, then the people.", "Curiosity is my compass."], "Connects people and ideas"],
			[["Activist", "Ambassador", "Kindred Spirit"], ["of Gentle Revolutions", "of Fair Futures"],
				["Libra grace in your decan softens Aquarian independence: you want to change the world and charm it while you do.", "You are more romantic than you let most people know."],
				"lavender blue", ["Change the world politely, but change it.", "Kindness is my rebellion."], "Changes minds without a fight"]
		],
		Pisces: [
			[["Dreamweaver", "Muse", "Empath"], ["of Soft Light", "of Endless Oceans"],
				["Early Pisceans feel everything: the mood of a room, the sadness in a song, the thing a friend did not quite say.", "Your imagination is a safe harbour, and sometimes a place to hide."],
				"seafoam", ["Feel it all, then make something.", "Dreams are plans in disguise."], "Inspires other people's creativity"],
			[["Comforter", "Storykeeper", "Shepherd"], ["of Kind Hands", "of Old Stories"],
				["A Cancer tide in your decan turns Piscean empathy into practical caring: you show up with soup, not just sympathy.", "Family, chosen or born, is where your heart lives."],
				"lagoon blue", ["Be the soft place to land.", "Kindness first, questions later."], "Shows up when it counts"],
			[["Enchanter", "Deep Diver", "Prophet"], ["of the Final Tide", "of Hidden Currents"],
				["Born as the zodiac comes full circle, with Scorpio intensity in your decan, you understand endings, transformations and the magic in between.", "You see patterns and meanings that others walk straight past."],
				"violet", ["Every ending is a door.", "Swim deeper."], "Sees meaning in patterns"]
		]
	};

	// Day of the month: adjective (unique per day 1..31, indexed by [day number][k = floor((day - 1) / 9)]), motto, and per-number banks
	var ADJ = { 1: ["Bold", "Fearless", "Unstoppable", "Self-Made"], 2: ["Gentle", "Intuitive", "Devoted", "Tender"], 3: ["Radiant", "Playful", "Bright", "Spirited"],
		4: ["Steadfast", "Patient", "Tireless", "Grounded"], 5: ["Restless", "Curious", "Quicksilver"], 6: ["Loyal", "Warm-Hearted", "Generous"],
		7: ["Quiet", "Watchful", "Thoughtful"], 8: ["Determined", "Unshakable", "Ambitious"], 9: ["Wise", "Compassionate", "Far-Seeing"] };
	var DAYMOTTO = { 1: ["First in, last to give up.", "I make my own luck, then share it.", "Stand alone if you must, but stand.", "Built by me, open to all."],
		2: ["Kindness is a quiet kind of strength.", "Trust the voice beneath the noise.", "Together is my favourite place.", "Gentle hands move mountains."],
		3: ["Joy is worth taking seriously.", "Play is how I learn.", "Say it with colour.", "Life is better out loud."],
		4: ["Steady hands, steady heart.", "Slow and sure, every time.", "Dream big, build bigger.", "Feet on the ground, eyes on the work."],
		5: ["Change is my oldest friend.", "Every road has a story.", "Keep moving, keep learning."],
		6: ["Love shows up.", "Take care of the ones who take care.", "There is always room at my table."],
		7: ["Still waters think deep.", "Look closer.", "The question is the adventure."],
		8: ["Make it happen, make it last.", "Strength is quiet until it is needed.", "Aim high and keep score."],
		9: ["The world is my neighbourhood.", "Every person is a world.", "See far, act near."] };
	var NUM = {
		1: { name: "the starter", sum: ["Your day number, 1, adds an independent streak: you would rather build your own path than walk someone else's.", "Day number 1 gives you a self-starter's engine and a strong dislike of being told what to do."],
			str: ["Self-motivated", "Original thinking", "Decisive under pressure"], chal: ["Going it alone too often", "Impatience with slower people", "Pride that resists help"],
			love: ["You need a partner who respects your independence and cheers on your plans.", "You tend to make the first move, and you rarely regret it."],
			work: ["Self-employment, start-ups and leadership roles suit your number.", "You earn best when you are allowed to steer."],
			adv: ["Ask for help once in a while; it is still your win.", "Lead, and leave space for others to lead too."] },
		2: { name: "the partner", sum: ["Your day number, 2, adds tact and sensitivity: you read people well and work best in partnership.", "Day number 2 makes you a natural diplomat, alert to the smallest change in someone's mood."],
			str: ["Tactful", "Cooperative", "Reads people well"], chal: ["Oversensitivity", "Putting yourself last", "Fear of confrontation"],
			love: ["Partnership is where your number is happiest, and you notice the small changes in the people you love.", "You give a lot, so choose people who give back."],
			work: ["You make an outstanding second-in-command, negotiator or collaborator.", "Teamwork multiplies your income more than solo sprints do."],
			adv: ["Your needs belong in the conversation too.", "Choose partners who match your loyalty."] },
		3: { name: "the communicator", sum: ["Your day number, 3, adds sparkle and self-expression: words, colour and laughter come easily to you.", "Day number 3 gives you a playful, creative streak that makes even chores feel like a performance."],
			str: ["Expressive", "Funny", "Creative"], chal: ["Scattered energy", "Exaggeration", "Moodiness when ignored"],
			love: ["You flirt with words and laughter, and you need a partner who enjoys your jokes.", "Love has to stay fun for you, or it fades."],
			work: ["Creative, social and communication work pays you in both money and joy.", "Your best ideas arrive when you talk them out."],
			adv: ["Finish the song before you start the next one.", "Your voice matters, so use it for what you love."] },
		4: { name: "the builder", sum: ["Your day number, 4, adds steadiness: you like plans, foundations and things that are built properly.", "Day number 4 gives you a builder's patience and a firm sense of right and wrong."],
			str: ["Hard-working", "Dependable", "Organised"], chal: ["Rigidity", "Overwork", "Suspicion of shortcuts, even good ones"],
			love: ["You are a steady, faithful partner who prefers deeds to declarations.", "Trust, for you, is built one kept promise at a time."],
			work: ["You thrive on structure, systems and solid craftsmanship.", "Slow, steady saving suits your number very well."],
			adv: ["Leave room in the plan for surprises.", "Build, then rest in what you built."] },
		5: { name: "the free spirit", sum: ["Your day number, 5, adds restlessness and curiosity: you learn by doing, trying and occasionally breaking things.", "Day number 5 gives you a love of freedom and a talent for adapting to whatever happens next."],
			str: ["Adaptable", "Adventurous", "A quick learner"], chal: ["Restlessness", "Impulsiveness", "Avoiding commitments"],
			love: ["You need variety and a partner who loves surprises as much as you do.", "Freedom inside a relationship is what keeps you in it."],
			work: ["Travel, sales, media and anything fast-changing suit your number.", "Keep a safety net, because your number loves a sudden change of direction."],
			adv: ["Freedom grows stronger with a few roots.", "Try the new thing, and keep the good old ones."] },
		6: { name: "the carer", sum: ["Your day number, 6, adds warmth and responsibility: you are the one who makes sure everyone has eaten.", "Day number 6 gives you a caretaker's heart and a keen eye for harmony and beauty."],
			str: ["Nurturing", "Responsible", "An eye for beauty"], chal: ["Worrying", "Meddling out of love", "Self-sacrifice"],
			love: ["You are the caretaker of every relationship, and you love deeply and domestically.", "Home and family sit at the very centre of your heart."],
			work: ["Teaching, health, design and service roles reward your caring number.", "You often earn by helping others feel at home."],
			adv: ["Care for yourself the way you care for your people.", "Love does not have to fix everything."] },
		7: { name: "the seeker", sum: ["Your day number, 7, adds depth: you need quiet time to think, and you are rarely satisfied with easy answers.", "Day number 7 gives you a searching, analytical mind and a rich private inner world."],
			str: ["Insightful", "Analytical", "An independent mind"], chal: ["Aloofness", "Overthinking", "Secrecy"],
			love: ["You need a partner who understands your need for quiet and who thinks deeply too.", "You open up slowly, but when you do it is for real."],
			work: ["Research, analysis, writing and specialist work suit your searching number.", "You do best in work that lets you think without being interrupted."],
			adv: ["Share a thought before it is perfect.", "Trust your mind, and keep your heart as a second opinion."] },
		8: { name: "the achiever", sum: ["Your day number, 8, adds drive and authority: you understand power, money and how to get things done.", "Day number 8 gives you executive energy and the stamina to keep going when others stop."],
			str: ["Ambitious", "Resilient", "Good with money"], chal: ["Workaholism", "A controlling streak", "Measuring life by results"],
			love: ["You are protective and generous with the people you love, and you expect loyalty back.", "Shared goals bring you closer than candlelit dinners do."],
			work: ["Business, management, finance and law suit your ambitious number.", "Money tends to follow your effort, especially in your middle years."],
			adv: ["Success is sweeter when you stop to enjoy it.", "Lead with generosity and the rest follows."] },
		9: { name: "the humanitarian", sum: ["Your day number, 9, adds compassion and breadth: you think about the big picture and the people in it.", "Day number 9 gives you a generous, idealistic streak and a wisdom beyond your years."],
			str: ["Compassionate", "Broad-minded", "Generous"], chal: ["Taking on other people's burdens", "Disappointment in people", "Difficulty letting go"],
			love: ["You love with an open heart and forgive more than most people would.", "A partner who shares your ideals matters more to you than one who shares your postcode."],
			work: ["Charity, the arts, medicine, teaching and global work suit your number.", "You earn best when your work serves something bigger than yourself."],
			adv: ["Let the past go so the next chapter can start.", "Help the world, starting with the person in front of you."] }
	};
	var NUM_COLOUR = { 1: "gold", 2: "pearl", 3: "sunny yellow", 4: "olive", 5: "turquoise", 6: "rose", 7: "sea green", 8: "deep blue", 9: "crimson" };
	// cusp text, indexed by the LATER sign of the pair
	var CUSP = ["Born on the Pisces–Aries cusp, you blend dreamy intuition with an urge to act on it immediately.",
		"Born on the Aries–Taurus cusp, you combine Aries drive with Taurus staying power: hard to start against, harder to stop.",
		"On the Taurus–Gemini cusp, you mix earthy common sense with a restless, chatty mind.",
		"On the Gemini–Cancer cusp, you think with your head and decide with your heart, often within the same minute.",
		"On the Cancer–Leo cusp, you are both shy and showy: a tender heart that secretly loves an audience.",
		"On the Leo–Virgo cusp, you pair Leo flair with Virgo precision, the creative who also checks the spelling.",
		"On the Virgo–Libra cusp, you are a perfectionist with a sense of beauty, and you want things both right and lovely.",
		"On the Libra–Scorpio cusp, charm meets intensity: you can be the most gracious person in the room and the most determined.",
		"On the Scorpio–Sagittarius cusp, you combine Scorpio depth with Sagittarius daring, a serious mind with a wild streak.",
		"On the Sagittarius–Capricorn cusp, you have big dreams and the discipline to chase them.",
		"On the Capricorn–Aquarius cusp, you are a practical rebel who changes systems from the inside.",
		"On the Aquarius–Pisces cusp, you blend clear, original thinking with very deep feeling."];
	// personal year (numerology: month + day + the digits of the birthday year, reduced to 1..9)
	var PYEAR = { 1: ["a year of fresh starts", "Doors open for new projects, and the first steps you take before your next birthday matter more than usual."],
		2: ["a year of partnership", "Patience and teamwork pay off, and a friendship or partnership may become important."],
		3: ["a year of expression", "Say yes to creative invitations; your words and ideas travel further than you expect."],
		4: ["a year of building", "Lay foundations: the routines, savings and skills you build now will hold you up for years."],
		5: ["a year of change", "Expect movement: a trip, a move or a surprise change of plan that turns out well."],
		6: ["a year of home and heart", "Family, home and responsibility take centre stage, and love grows through care."],
		7: ["a year of reflection", "A quieter year for study, rest and inner work; the answers come when you slow down."],
		8: ["a year of achievement", "Effort turns into results, so ask for what you are worth and expect to be taken seriously."],
		9: ["a year of completion", "Finish, forgive and clear some space; something ends so that something better can arrive."] };
	var PTAIL = { Fire: ["Your fire likes this, as long as you pace yourself.", "Bring your courage, and keep a little patience in your pocket.", "Lead with enthusiasm and let others help carry it."],
		Earth: ["Your earthy patience is exactly what this asks for.", "Keep a simple plan and adjust it each season.", "Trust slow progress; it is still progress."],
		Air: ["Talk it through: the right conversation unlocks the rest.", "Your ideas are the spark, and a calendar makes them real.", "Stay curious, and write the good ideas down."],
		Water: ["Let your intuition choose the timing.", "Protect your energy and the rest will follow.", "Feelings are your compass this year, so trust them."] };
	var LIFEPATH = { 1: "The independent leader: you are here to start things and stand on your own feet.", 2: "The peacemaker: you are here to bring people together and to listen deeply.",
		3: "The creative communicator: you are here to express yourself and lift people's spirits.", 4: "The builder: you are here to create order, security and work that lasts.",
		5: "The adventurer: you are here to experience change, freedom and as much of the world as you can.", 6: "The nurturer: you are here to care, to heal and to make a home for others.",
		7: "The seeker: you are here to study, question and find the truth beneath appearances.", 8: "The powerhouse: you are here to master the material world and to use influence well.",
		9: "The humanitarian: you are here to give, to forgive and to see the bigger picture.",
		11: "Master number 11, the intuitive messenger: a sensitive 2 with an extra charge of inspiration and insight.",
		22: "Master number 22, the master builder: a 4 with the vision to turn big dreams into real structures.",
		33: "Master number 33, the master teacher: a 6 whose care reaches far beyond the family." };
	var FEB29 = { title: "The Leap-Day Original",
		summary: ["Born on the rarest birthday of all, you celebrate properly only once every four years, and you are used to explaining it.",
			"Leap-day people often feel slightly outside ordinary time: a little younger than their age, a little older than their friends.",
			"Pisces imagination meets a Cancer-flavoured decan here, so you mix dreaminess with a strong instinct to look after people.",
			"Day number 2 adds tact and sensitivity: you read moods quickly and do your best work beside someone you trust."],
		str: ["Unforgettable", "Imaginative", "Adaptable", "Reads people well"], chal: ["Feeling different from everyone else", "Weak boundaries", "Putting yourself last"],
		love: "In love you are romantic and loyal, and a partner who makes a fuss of your birthday in the off years wins your heart for good. You notice the small changes in the people you love.",
		work: "You do well in creative, caring and unusual work, where being one of a kind is an advantage. Teamwork multiplies your income more than solo sprints do.",
		motto: "Rare by nature, kind by choice.", advice: "Celebrate on the 28th, the 1st, or both: you have earned the extra cake.", colour: "lagoon blue, with silver" };

	function pick(arr, n) { return arr[((n % arr.length) + arr.length) % arr.length]; }
	function digitSum(n) { n = Math.abs(n); var s = 0; while (n > 0) { s += n % 10; n = Math.floor(n / 10); } return s; }
	function reduce9(n) { n = Math.abs(n); while (n > 9) n = digitSum(n); return n; }
	function reduceKeep(n) { n = Math.abs(n); while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = digitSum(n); return n; }
	function signOfDoy(n) { var best = null; SIGNS.forEach(function (s) { var off = (n - s.start + 366) % 366; if (off < s.len && (!best || off < best.off)) best = { s: s, off: off }; }); return best; }
	function signOf(mo, d) { return signOfDoy(doy(mo, d)).s; }
	function decanOf(mo, d) {
		var so = signOfDoy(doy(mo, d)), s = so.s, k = Math.min(2, Math.floor(so.off * 3 / s.len));
		var a = Math.ceil(k * s.len / 3), b = Math.ceil((k + 1) * s.len / 3) - 1, fa = fromDoy(((s.start + a - 1) % 366) + 1), fb = fromDoy(((s.start + b - 1) % 366) + 1);
		return { sign: s, n: k + 1, pos: so.off, co: SIGNS[(s.i + 4 * k) % 12], dates: MONTHS[fa.mo - 1].slice(0, 3) + " " + fa.d + " – " + MONTHS[fb.mo - 1].slice(0, 3) + " " + fb.d };
	}
	function cuspOf(mo, d) {
		var so = signOfDoy(doy(mo, d)), s = so.s;
		if (so.off <= 2) return { other: SIGNS[(s.i + 11) % 12], text: CUSP[s.i], when: "the first days of " + s.name };
		if (so.off >= s.len - 3) return { other: SIGNS[(s.i + 1) % 12], text: CUSP[(s.i + 1) % 12], when: "the last days of " + s.name };
		return null;
	}
	function titleOf(mo, d) {
		if (mo === 2 && d === 29) return FEB29.title;
		var dc = decanOf(mo, d), row = DEC[dc.sign.name][dc.n - 1], dn = reduce9(d), k = Math.floor((d - 1) / 9);
		var noun = pick(row[0], d + dc.n), t = "The " + ADJ[dn][k] + " " + noun;
		if ((d + mo) % 3 === 0) t += " " + pick(row[1], d + mo);
		return t;
	}
	function birthdayYear(mo, d, today) {   // the year of the most recent birthday on or before today
		var y = today.y, dd = mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? 28 : d;
		return today.mo < mo || (today.mo === mo && today.d < dd) ? y - 1 : y;
	}
	function todayParts() { var n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }; }
	function yearAhead(mo, d, yr, element) {
		var py = reduce9(mo + d + digitSum(yr)) || 9, p = PYEAR[py];
		return { year: yr, number: py, theme: p[0], text: "From your " + yr + " birthday to your " + (yr + 1) + " one: " + p[0] + ". " + p[1] + " " + pick(PTAIL[element], yr + d) };
	}
	function uniq(list, more) { var out = []; list.concat(more || []).forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); }); return out; }
	// a day near day-of-year n that falls in sign index want (steps outwards from n)
	function matchNear(n, want) {
		for (var k = 0; k < 40; k++) { var a = fromDoy((((n + (k % 2 ? -1 : 1) * Math.ceil(k / 2)) - 1) % 366 + 366) % 366 + 1); if (signOf(a.mo, a.d).i === want) return a; }
		return fromDoy(((n - 1) % 366 + 366) % 366 + 1);
	}

	// profile(month, day[, year of the birthday to forecast from]) -- everything is deterministic in its inputs
	function profile(mo, d, forecastYear) {
		mo = +mo; d = +d;
		if (!valid(mo, d)) return null;
		var dc = decanOf(mo, d), s = dc.sign, row = DEC[s.name][dc.n - 1], tx = TXT[s.name], dn = reduce9(d), nb = NUM[dn], k = Math.floor((d - 1) / 9), n = doy(mo, d);
		var cusp = cuspOf(mo, d), co = TXT[dc.co.name], yr = forecastYear || birthdayYear(mo, d, todayParts()), leap = mo === 2 && d === 29;
		var p = { mo: mo, d: d, date: MONTHS[mo - 1] + " " + d, title: titleOf(mo, d),
			sign: { name: s.name, glyph: s.glyph, dates: s.dates, i: s.i }, element: s.element, modality: s.modality, ruler: s.ruler,
			decan: { n: dc.n, co: dc.co.name, dates: dc.dates, text: dc.n === 1 ? "First decan of " + s.name + " (pure " + s.name + ")" : (dc.n === 2 ? "Second" : "Third") + " decan of " + s.name + ", co-ruled by " + dc.co.name },
			cusp: cusp ? { with: cusp.other.name, text: cusp.text, when: cusp.when } : null,
			dayNumber: reduceKeep(d), birthDayNumber: dn, numberName: nb.name };
		if (leap) {
			p.summary = FEB29.summary.join(" "); p.strengths = FEB29.str.slice(); p.challenges = FEB29.chal.slice(); p.love = FEB29.love; p.work = FEB29.work;
			p.motto = FEB29.motto; p.advice = FEB29.advice; p.luckyColour = FEB29.colour;
		} else {
			var sum = [pick(tx.open, d + dc.n), pick(row[2], d), pick(nb.sum, k)];
			if (cusp) sum.push(cusp.text);
			p.summary = sum.join(" ");
			var si = n % 6, st = uniq([tx.str[si], tx.str[(si + 3) % 6], row[5]], []);
			var coS = dc.n === 1 ? tx.str[(si + 1) % 6] : pick(co.str, n + 2);
			st = uniq(st, [coS, pick(nb.str, k), pick(nb.str, k + 1), tx.str[(si + 2) % 6]]).slice(0, 4);
			p.strengths = st;
			var ci = n % 5; p.challenges = uniq([tx.chal[ci], tx.chal[(ci + 2) % 5], pick(nb.chal, k)], [pick(nb.chal, k + 1), tx.chal[(ci + 4) % 5]]).slice(0, 3);
			p.love = pick(tx.love, n) + " " + pick(nb.love, k + d);
			p.work = pick(tx.work, n + 1) + " " + pick(nb.work, k + d);
			var mi = (n + dc.n) % 3; p.motto = mi < 2 ? row[4][mi] : DAYMOTTO[dn][k];
			p.advice = (n % 5) < 3 ? tx.adv[n % 3] : pick(nb.adv, n);
			var acc = NUM_COLOUR[dn]; p.luckyColour = row[3].indexOf(acc) >= 0 || acc.indexOf(row[3]) >= 0 ? row[3] : row[3] + ", with " + acc;
		}
		p.luckyColour = p.luckyColour.charAt(0).toUpperCase() + p.luckyColour.slice(1);
		p.luckyDay = s.weekday;
		p.luckyNumbers = uniq([dn, d, (n * 7) % 44 + 1, (mo * 5 + d * 3) % 49 + 1, s.i + 10, dn + 18]).slice(0, 4).sort(function (a, b) { return a - b; });
		p.yearAhead = yearAhead(mo, d, yr, s.element);
		p.matches = [[124, 4, "Same element (" + s.element + "): you understand each other without trying."], [-124, 8, "Same element (" + s.element + "): an easy, natural rhythm."],
			[181, 6, "Your opposite sign: different strengths that balance yours."]].map(function (x) {
			var t = matchNear(n + x[0], (s.i + x[1]) % 12); return { mo: t.mo, d: t.d, date: MONTHS[t.mo - 1] + " " + t.d, title: titleOf(t.mo, t.d), sign: SIGNS[(s.i + x[1]) % 12].name, why: x[2] };
		});
		p.forFun = "For fun only: a playful character sketch, not a prediction and not science.";
		return p;
	}
	// Lunar New Year 1900-2100 (China, UTC+8), one letter per year = days after 21 January (A = Jan 21). Computed as the new moon falling on
	// 21 Jan - 20 Feb (Astronomy Engine, via the zodiac page's lib), then corrected for the years that rule gets wrong (1916, 1920, 1985).
	// Approximate outside that check: verify against an almanac before relying on a date right at the turn of a year.
	var LNY = "K^SI[OEXMBUJ]QFYOCVLASH[PDXMCUJ\\QFYODVK^SGZPEXMBUI\\QGYNDWK]SHZPEXMATJ\\QGZNCVK]RH[PEXMATI\\QGZOCUK^RH[PDWLBTI]RFYNCUK^SH[PEWLBUI\\QFXNCVK^SHZODWLBUJ\\QFYMCVL^SHZODWMATI\\PFYNCVK^RGZPDWMBTI\\QFYNDUJ]RGZPEWLAT";
	var LNY_FIX = { 1916: 13, 1920: 30, 1985: 30 };
	var ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"], CN_EL = ["Wood", "Fire", "Earth", "Metal", "Water"];
	function lunarNewYear(y) {
		if (y < 1900 || y > 2100) return null;
		var off = LNY_FIX[y] !== undefined ? LNY_FIX[y] : LNY.charCodeAt(y - 1900) - 65, t = new Date(Date.UTC(y, 0, 21 + off));
		return { y: y, mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
	}
	function chinese(y, mo, d) {
		var ny = lunarNewYear(y), cy = y;
		if (ny && (mo < ny.mo || (mo === ny.mo && d < ny.d))) cy = y - 1;
		var a = ((cy - 4) % 12 + 12) % 12, st = ((cy - 4) % 10 + 10) % 10;
		return { year: cy, animal: ANIMALS[a], element: CN_EL[Math.floor(st / 2)], yin: st % 2 === 1, approximate: !ny, newYear: ny };
	}
	function lifePath(y, mo, d) {
		var a = reduceKeep(mo), b = reduceKeep(d), c = reduceKeep(digitSum(y)), n = reduceKeep(a + b + c);
		return { n: n, master: n === 11 || n === 22 || n === 33, steps: "month " + mo + " → " + a + ", day " + d + " → " + b + ", year " + y + " → " + c + "; " + a + " + " + b + " + " + c + " = " + (a + b + c) + (a + b + c !== n ? " → " + n : ""), text: LIFEPATH[n] };
	}
	// yearProfile(y, m, d[, today {y, mo, d}]) = profile + life path, Chinese zodiac, age, and the forecast for the current birthday year
	function yearProfile(y, mo, d, today) {
		y = +y; mo = +mo; d = +d;
		if (!(y >= 1 && y <= 9999) || !valid(mo, d) || (mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1)) return null;
		today = today || todayParts();
		var by = birthdayYear(mo, d, today), p = profile(mo, d, by);
		p.y = y; p.age = by - y; p.lifePath = lifePath(y, mo, d); p.chinese = chinese(y, mo, d);
		return p;
	}
	var ALL = null;
	function all() {
		if (ALL) return ALL;
		ALL = [];
		for (var n = 1; n <= 366; n++) { var t = fromDoy(n); ALL.push({ mo: t.mo, d: t.d, title: titleOf(t.mo, t.d), sign: signOf(t.mo, t.d).name, element: signOf(t.mo, t.d).element }); }
		return ALL;
	}
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
	function search(q, n) {
		var w = norm(q).split(" ").filter(Boolean); if (!w.length) return [];
		return all().filter(function (e) { var t = " " + norm(e.title + " " + e.sign + " " + MONTHS[e.mo - 1]); return w.every(function (x) { return t.indexOf(" " + x) >= 0; }); }).slice(0, n || 40);
	}
	// short two-sentence summary for the compact cards on /birthday and /zodiac
	function short(mo, d) {
		var p = profile(mo, d, 2000); if (!p) return null;
		var s = p.summary.match(/[^.!?]+[.!?]+/g) || [p.summary];
		return { title: p.title, text: (s[0].trim() + " " + (s[1] || "").trim()).trim(), sign: p.sign.name, url: "/birthday-personality?m=" + mo + "&d=" + d };
	}
	var BP = { MONTHS: MONTHS, SIGNS: SIGNS, doy: doy, fromDoy: fromDoy, daysIn: daysIn, valid: valid, signOf: signOf, decanOf: decanOf, cuspOf: cuspOf, titleOf: titleOf,
		profile: profile, yearProfile: yearProfile, lifePath: lifePath, chinese: chinese, lunarNewYear: lunarNewYear, reduce9: reduce9, reduceKeep: reduceKeep,
		birthdayYear: birthdayYear, all: all, search: search, short: short, norm: norm };
	if (typeof module !== "undefined" && module.exports) module.exports = BP; else root.BP = BP;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Famous Birthdays -- pure helpers (no DOM) + a small data loader. Browser global `BD`; node: require('./tool_apps_src/birthday/lib.js').
 * Data: mes.fm/birthday/data/MM.json (people born in month MM, sorted by day then fame rank) + index.json (every person's id, name, birth date, rank),
 * written by build_birthdays.py from Wikidata (CC0). Used by mes.fm/birthday and mes.fm/zodiac. Tests: node tool_apps_src/birthday-tests.js */
(function (root) {
	"use strict";
	var DATA_V = "2026-10-21.3";    // date of the data files: build_birthdays.py --apply updates it (then rebuild both pages so browsers fetch the new files)
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var FIELDS = { music: "Music", film: "Film, TV & internet", sports: "Sports", politics: "Politics & law", science: "Science & ideas", writing: "Writing",
		art: "Art & design", business: "Business", religion: "Religion", royalty: "Royalty", military: "Military & exploration", other: "Other" };
	var ERAS = [["old", "Before 1800", -1e9, 1799], ["c19", "1800s", 1800, 1899], ["e20", "1900–1945", 1900, 1945], ["m20", "1946–1969", 1946, 1969], ["l20", "1970–1989", 1970, 1989], ["new", "1990 and later", 1990, 1e9]];
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	function rows(json) {
		var c = json.cols;
		return json.rows.map(function (r) {
			var p = {}; for (var i = 0; i < c.length; i++) p[c[i]] = r[i];
			p.y = +p.dob.slice(0, 4); p.mo = +p.dob.slice(5, 7); p.d = +p.dob.slice(8, 10);
			return p;
		});
	}
	function eraOf(y) { for (var i = 0; i < ERAS.length; i++) if (y >= ERAS[i][2] && y <= ERAS[i][3]) return ERAS[i][0]; return "new"; }
	// years: alive -> age on `today` ({y, mo, d}); died -> age at death (when the death date is complete)
	function ageOn(y, mo, d, t) { var a = t.y - y; if (t.mo < mo || (t.mo === mo && t.d < d)) a--; return a; }
	function lifeText(p, today) {
		if (p.dod) {
			var dy = +p.dod.slice(0, 4), full = p.dod.length >= 10;
			return p.y + "–" + dy + (full ? " (died at " + ageOn(p.y, p.mo, p.d, { y: dy, mo: +p.dod.slice(5, 7), d: +p.dod.slice(8, 10) }) + ")" : "");
		}
		var a = ageOn(p.y, p.mo, p.d, today);
		if (a > 115) return "born " + p.y;     // no recorded death date, but surely not alive
		return "born " + p.y + " (age " + a + ")";
	}
	function alive(p, today) { return !p.dod && ageOn(p.y, p.mo, p.d, today) <= 115; }
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[ðđ]/g, "d").replace(/þ/g, "th").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ł/g, "l").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim(); }
	// filters: {field, country, era, alive (bool), q (text in name / description)}
	function filter(list, f, today) {
		var q = f.q ? norm(f.q) : "";
		return list.filter(function (p) {
			if (f.field && p.field !== f.field) return false;
			if (f.country && p.country !== f.country) return false;
			if (f.era && eraOf(p.y) !== f.era) return false;
			if (f.alive && !alive(p, today)) return false;
			if (q && norm(p.name + " " + p.desc).indexOf(q) < 0) return false;
			return true;
		});
	}
	function counts(list, key) {
		var c = {}; list.forEach(function (p) { var k = key === "era" ? eraOf(p.y) : p[key]; if (k) c[k] = (c[k] || 0) + 1; });
		return c;
	}
	function sortBy(list, how) {
		var a = list.slice();
		if (how === "old") a.sort(function (x, y) { return x.y - y.y || x.rank - y.rank; });
		else if (how === "young") a.sort(function (x, y) { return y.y - x.y || x.rank - y.rank; });
		else if (how === "name") a.sort(function (x, y) { return x.name.localeCompare(y.name); });
		else a.sort(function (x, y) { return x.rank - y.rank; });
		return a;
	}
	// day of a (leap) year, 1..366, so 29 Feb has its own slot
	function doy(mo, d) { return Math.round((Date.UTC(2000, mo - 1, d) - Date.UTC(2000, 0, 0)) / 86400000); }
	function dayGap(mo1, d1, mo2, d2) { var g = Math.abs(doy(mo1, d1) - doy(mo2, d2)); return Math.min(g, 366 - g); }
	function shift(mo, d, n) { var t = new Date(Date.UTC(2000, mo - 1, d + n)); return { mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
	// name search over index rows [id, name, dob, rank]: every word must start a word of the name (or appear inside it); exact / prefix ranks first, then fame
	function search(index, q, n) {
		var w = norm(q).split(" ").filter(Boolean); if (!w.length) return [];
		var out = [];
		for (var i = 0; i < index.length; i++) {
			var r = index[i], nm = " " + norm(r[1]), sc = 0, okAll = true;
			for (var k = 0; k < w.length; k++) {
				var at = nm.indexOf(" " + w[k]);
				if (at >= 0) sc += 2; else if (nm.indexOf(w[k]) >= 0) sc += 1; else { okAll = false; break; }
			}
			if (!okAll) continue;
			if (nm.trim() === w.join(" ")) sc += 5;
			out.push({ r: r, s: sc });
		}
		out.sort(function (a, b) { return b.s - a.s || a.r[3] - b.r[3]; });
		return out.slice(0, n || 20).map(function (x) { return { id: x.r[0], name: x.r[1], dob: x.r[2], rank: x.r[3], y: +x.r[2].slice(0, 4), mo: +x.r[2].slice(5, 7), d: +x.r[2].slice(8, 10) }; });
	}
	// people from the index born in year y (closest birthday to mo/d first), and those with the exact same date
	function sameYear(index, y, mo, d, n) {
		var a = [];
		index.forEach(function (r) { if (+r[2].slice(0, 4) === y) a.push({ id: r[0], name: r[1], dob: r[2], rank: r[3], y: y, mo: +r[2].slice(5, 7), d: +r[2].slice(8, 10) }); });
		a.forEach(function (p) { p.gap = Math.abs(doy(p.mo, p.d) - doy(mo, d)); });
		a.sort(function (p, q) { return p.gap - q.gap || p.rank - q.rank; });
		return a.slice(0, n || 12);
	}
	// nearest birthdays (ignoring the year), not on the day itself: days +-1..+-maxGap, most famous first within each gap
	function nearest(index, mo, d, n, maxGap) {
		var a = [];
		index.forEach(function (r) {
			var pm = +r[2].slice(5, 7), pd = +r[2].slice(8, 10), g = dayGap(mo, d, pm, pd);
			if (g > 0 && g <= (maxGap || 3)) a.push({ id: r[0], name: r[1], dob: r[2], rank: r[3], y: +r[2].slice(0, 4), mo: pm, d: pd, gap: g, after: (doy(pm, pd) - doy(mo, d) + 366) % 366 < 183 });
		});
		a.sort(function (p, q) { return p.gap - q.gap || p.rank - q.rank; });
		return a.slice(0, n || 12);
	}
	function dateText(mo, d, y) { return MONTHS[mo - 1] + " " + d + (y ? ", " + y : ""); }
	function dobText(dob) { return dateText(+dob.slice(5, 7), +dob.slice(8, 10), +dob.slice(0, 4)); }
	function wikiUrl(p) { return p.wiki ? "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.wiki.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":") : "https://www.wikidata.org/wiki/" + p.id; }
	function iso(p) { return (p.y ? p.y + "-" : "") + pad(p.mo) + "-" + pad(p.d); }
	// ?d=10-26 or ?d=1980-10-26, ?q=, ?f=field, ?c=country, ?e=era, ?a=1 (alive), ?s=sort
	function fromQuery(search) {
		var q = new URLSearchParams(search || ""), o = {}, m = /^(?:(\d{3,4})-)?(\d{1,2})-(\d{1,2})$/.exec(q.get("d") || "");
		if (m) { o.mo = +m[2]; o.d = +m[3]; if (m[1]) o.y = +m[1]; if (o.mo < 1 || o.mo > 12 || o.d < 1 || o.d > new Date(Date.UTC(o.y || 2000, o.mo, 0)).getUTCDate()) { delete o.mo; delete o.d; delete o.y; } }
		if (q.get("q")) o.q = q.get("q").slice(0, 80);
		if (FIELDS[q.get("f")]) o.field = q.get("f");
		if (q.get("c")) o.country = q.get("c").slice(0, 60);
		if (ERAS.some(function (e) { return e[0] === q.get("e"); })) o.era = q.get("e");
		if (q.get("a") === "1") o.alive = true;
		if (/^(fame|old|young|name)$/.test(q.get("s") || "")) o.sort = q.get("s");
		return o;
	}
	function toQuery(o) {
		var q = new URLSearchParams();
		if (o.mo) q.set("d", (o.y ? o.y + "-" : "") + pad(o.mo) + "-" + pad(o.d));
		if (o.q) q.set("q", o.q); if (o.field) q.set("f", o.field); if (o.country) q.set("c", o.country); if (o.era) q.set("e", o.era); if (o.alive) q.set("a", "1");
		if (o.sort && o.sort !== "fame") q.set("s", o.sort);
		return q.toString();
	}
	// portrait thumbnail on upload.wikimedia.org from "<md5 prefix>|<Commons file name>" (build_birthdays.py). TIFF thumbnails are JPEGs, SVG ones PNGs;
	// 120px is one of Wikimedia's standard thumbnail widths (drawn at 60 CSS px, sharp on 2x screens).
	function thumbUrl(img, w) {
		if (!img || img.indexOf("|") !== 2) return "";
		var h = img.slice(0, 2), f = img.slice(3), ext = f.slice(f.lastIndexOf(".") + 1).toLowerCase(), q = encodeURIComponent(f).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")");
		var tail = ext === "tif" || ext === "tiff" ? ".jpg" : ext === "svg" ? ".png" : "";
		return "https://upload.wikimedia.org/wikipedia/commons/thumb/" + h[0] + "/" + h + "/" + q + "/" + (w || 120) + "px-" + q + tail;
	}
	function commonsUrl(img) { return img && img.indexOf("|") === 2 ? "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(img.slice(3)).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")") : ""; }
	function initials(name) { var w = String(name || "?").replace(/\(.*?\)/g, "").trim().split(/\s+/); return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase(); }
	// whole years from date a to a later date b ({y, mo, d})
	function yearsBetween(a, b) { var n = b.y - a.y; if (b.mo < a.mo || (b.mo === a.mo && b.d < a.d)) n--; return n; }
	function dayNum(o) { return Math.round(Date.UTC(o.y, o.mo - 1, o.d) / 86400000); }
	// "8 years older than you" / "3 years younger than you" / "born the same day as you" / "a few months older than you"
	function ageGapText(p, me, you) {
		you = you || "you";
		var dn = dayNum(p) - dayNum(me);
		if (dn === 0) return "born the same day as " + you;
		var older = dn < 0, n = older ? yearsBetween(p, me) : yearsBetween(me, p);
		if (n === 0) { var days = Math.abs(dn); return (days < 61 ? days + (days === 1 ? " day " : " days ") : Math.round(days / 30.44) + " months ") + (older ? "older" : "younger") + " than " + you; }
		return n + (n === 1 ? " year " : " years ") + (older ? "older" : "younger") + " than " + you;
	}
	// next birthday on or after `today` ({y, mo, d}); 29 February is celebrated on 28 February in other years
	function nextBirthday(mo, d, today, birthYear) {
		function at(y) { var dd = mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? 28 : d; return { y: y, mo: mo, d: dd }; }
		var n = at(today.y);
		if (dayNum(n) < dayNum(today)) n = at(today.y + 1);
		n.days = dayNum(n) - dayNum(today);
		n.wd = new Date(Date.UTC(n.y, n.mo - 1, n.d)).getUTCDay();
		if (birthYear) n.turns = n.y - birthYear;
		return n;
	}
	// the person in the index born closest to the date (either side, any amount), excluding ids in `skip`
	function closestTwin(index, y, mo, d, skip) {
		var me = dayNum({ y: y, mo: mo, d: d }), best = null;
		index.forEach(function (r) {
			if (skip && skip.indexOf(r[0]) >= 0) return;
			var g = Math.abs(Math.round(Date.UTC(+r[2].slice(0, 4), +r[2].slice(5, 7) - 1, +r[2].slice(8, 10)) / 86400000) - me);
			if (!best || g < best.gap || (g === best.gap && r[3] < best.rank)) best = { id: r[0], name: r[1], dob: r[2], rank: r[3], gap: g, y: +r[2].slice(0, 4), mo: +r[2].slice(5, 7), d: +r[2].slice(8, 10) };
		});
		return best;
	}
	var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	// Wikipedia "On this day" (REST feed, CC BY-SA): keep only year, text and the first linked article of each item
	function slimOnThisDay(json, type) {
		return (json[type] || []).map(function (e) {
			var pg = (e.pages || [])[0];
			return { y: e.year === undefined ? null : e.year, t: e.text || "", a: pg ? (pg.titles && pg.titles.normalized) || pg.title || "" : "", u: pg && pg.content_urls && pg.content_urls.desktop ? pg.content_urls.desktop.page : "" };
		}).filter(function (e) { return e.t; });
	}
	// fetch helpers (browser): cached promises per file
	function loader(base) {
		var cache = {};
		function get(name) {
			if (!cache[name]) cache[name] = fetch(base + name + "?v=" + DATA_V).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
			return cache[name];
		}
		return {
			month: function (m) { return get(pad(m) + ".json").then(function (j) { return j.__p || (j.__p = rows(j)); }); },
			index: function () { return get("index.json").then(function (j) { return j.rows; }); },
			day: function (mo, d) { return this.month(mo).then(function (list) { return list.filter(function (p) { return p.d === d; }); }); },
			person: function (id, dob) { return this.month(+dob.slice(5, 7)).then(function (list) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }); },
			range: function (parts) { var self = this; return Promise.all(parts.map(function (r) { return self.month(r[0]).then(function (l) { return l.filter(function (p) { return p.d >= r[1] && p.d <= r[2]; }); }); })).then(function (a) { return [].concat.apply([], a); }); }
		};
	}
	var BD = { WEEKDAYS: WEEKDAYS, thumbUrl: thumbUrl, commonsUrl: commonsUrl, initials: initials, yearsBetween: yearsBetween, dayNum: dayNum, ageGapText: ageGapText, nextBirthday: nextBirthday, closestTwin: closestTwin, slimOnThisDay: slimOnThisDay, DATA_V: DATA_V, MONTHS: MONTHS, FIELDS: FIELDS, ERAS: ERAS, rows: rows, eraOf: eraOf, ageOn: ageOn, lifeText: lifeText, alive: alive, norm: norm, filter: filter, counts: counts, sortBy: sortBy,
		doy: doy, dayGap: dayGap, shift: shift, search: search, sameYear: sameYear, nearest: nearest, dateText: dateText, dobText: dobText, wikiUrl: wikiUrl, iso: iso, fromQuery: fromQuery, toQuery: toQuery, loader: loader, pad: pad };
	if (typeof module !== "undefined" && module.exports) module.exports = BD; else root.BD = BD;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Famous Birthdays -- mes.fm/birthday (UI). Helpers + loader in lib.js (global BD); Sun sign / Chinese animal from the zodiac page's lib (global ZD,
 * on Astronomy Engine). Links: ?d=10-26 | ?d=1980-10-26, &q= (name filter), &f= field, &c= country, &e= era, &a=1 living, &s= sort. Nothing is stored or sent. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bd");
	if (!root || !window.BD) return;
	var L = BD.loader("/birthday/data/"), PAGE = 30;
	var now = new Date(), TODAY = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
	var S = { mo: TODAY.mo, d: TODAY.d, y: null, me: null, field: "", country: "", era: "", alive: false, sort: "fame", shown: PAGE, hl: "" };
	// per-browser preferences (never sent): pictures on / off, and the "Line them up" list
	var KEY = "mes-birthday:v1", P = { pics: true, friends: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (typeof sv.pics === "boolean") P.pics = sv.pics; if (Array.isArray(sv.friends)) P.friends = sv.friends.filter(function (f) { return f && typeof f.n === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.d); }).slice(0, 12); } } catch (e) {}
	function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
	var DAY = [];          // people of the current day
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("bd-toast"); if (!t) { t = document.createElement("div"); t.id = "bd-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	var hasAstro = function () { return !!(window.ZD && window.Astronomy); };
	// Sun sign for a known date (noon UTC; both signs on a change day) + Chinese animal
	var SIGNC = {};
	function signs(p) {
		var k = p.y + "-" + p.mo + "-" + p.d; if (SIGNC[k]) return SIGNC[k];
		var r = {};
		if (hasAstro()) {
			try {
				var a = ZD.signOf(ZD.lonOf("sun", new Date(Date.UTC(p.y, p.mo - 1, p.d) - 14 * 3600000))).sign, b = ZD.signOf(ZD.lonOf("sun", new Date(Date.UTC(p.y, p.mo - 1, p.d + 1) + 12 * 3600000))).sign;
				r.sun = a; r.sun2 = a.i !== b.i ? b : null; r.cn = ZD.chinese(p.y, p.mo, p.d);
			} catch (e) {}
		}
		if (!r.sun && window.ZD) r.sun = ZD.sunSignByDay(p.mo, p.d);
		return (SIGNC[k] = r);
	}
	function signHtml(p) {
		var s = signs(p), h = "";
		if (s.sun) h += '<span class="bd-sign" title="Sun sign' + (s.sun2 ? ": the Sun changed sign that day" : "") + '">' + s.sun.glyph + " " + s.sun.name + (s.sun2 ? " / " + s.sun2.name : "") + "</span>";
		if (s.cn) h += '<span class="bd-sign" title="Chinese zodiac (year from Lunar New Year)">' + s.cn.emoji + " " + s.cn.element + " " + s.cn.animal + "</span>";
		return h;
	}
	function avatar(p) {
		if (!P.pics) return "";
		var u = BD.thumbUrl(p.img, 120), ini = '<span class="bd-ini" aria-hidden="true">' + esc(BD.initials(p.name)) + "</span>";
		if (!u) return '<span class="bd-av bd-av--none">' + ini + "</span>";
		return '<a class="bd-av" href="' + esc(BD.commonsUrl(p.img)) + '" target="_blank" rel="noopener" title="Photo from Wikimedia Commons: ' + esc(p.img.slice(3).replace(/_/g, " ")) + ' (opens the file page with its author and licence)">' + ini +
			'<img src="' + esc(u) + '" width="60" height="60" loading="lazy" decoding="async" alt="' + esc(p.name) + '" referrerpolicy="no-referrer"></a>';
	}
	function zodiacUrl(p, extra) { return "/zodiac?d=" + BD.iso(p) + (extra || ""); }
	function card(p) {
		var url = p.link || BD.wikiUrl(p), cmp = "/zodiac?p=" + encodeURIComponent(p.id) + (S.me ? "&d=" + BD.iso(S.me) : "");
		return '<div class="bd-p' + (p.id === S.hl ? " bd-hl" : "") + '" id="p-' + esc(p.id) + '">' + avatar(p) +
			'<div class="bd-main"><div class="bd-top"><a class="bd-name" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>" +
			'<span class="bd-life">' + esc(BD.lifeText(p, TODAY)) + "</span></div>" +
			(S.me ? '<div class="bd-gap">' + esc(BD.ageGapText(p, S.me)) + "</div>" : "") +
			(p.desc ? '<div class="bd-desc">' + esc(p.desc) + "</div>" : "") +
			'<div class="bd-meta"><span class="bd-tag bd-f-' + esc(p.field) + '">' + esc(BD.FIELDS[p.field] || "Other") + "</span>" +
			(p.country ? '<span class="bd-ctry">' + esc(p.country) + "</span>" : "") + signHtml(p) +
			'<a class="bd-cmp" href="' + esc(cmp) + '">' + (S.me ? "Compare signs with yours" : "Compare signs") + "</a>" +
			(p.os ? '<span class="bd-os" title="Born when the old Julian calendar was used there: the date is shown in today&rsquo;s calendar">modern-calendar date</span>' : "") +
			"</div></div></div>";
	}
	function mini(p, label) {
		return '<button type="button" class="bd-mini" data-go="' + esc(p.dob) + '" data-id="' + esc(p.id) + '"><span class="bd-mini-n">' + esc(p.name) + '</span><span class="bd-mini-d">' + esc(label || BD.dobText(p.dob)) + "</span></button>";
	}

	/* ---------- day picker ---------- */
	function fillPickers() {
		$("bd-month").innerHTML = BD.MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
		fillDays();
	}
	function fillDays() {
		var n = new Date(Date.UTC(2000, S.mo, 0)).getUTCDate(), h = "";
		for (var d = 1; d <= n; d++) h += '<option value="' + d + '">' + d + "</option>";
		$("bd-day").innerHTML = h; $("bd-month").value = S.mo; $("bd-day").value = Math.min(S.d, n);
	}
	function setDay(mo, d, y, keepFilters) {
		S.mo = mo; S.d = d; S.y = y || null; S.shown = PAGE;
		if (!keepFilters) { S.field = ""; S.country = ""; S.era = ""; }
		fillDays(); load();
	}

	/* ---------- render ---------- */
	function filtered() { return BD.sortBy(BD.filter(DAY, { field: S.field, country: S.country, era: S.era, alive: S.alive }, TODAY), S.sort); }
	function renderFilters() {
		var base = BD.filter(DAY, { country: S.country, era: S.era, alive: S.alive }, TODAY), fc = BD.counts(base, "field");
		var h = '<button type="button" class="tu-chip" data-f="" aria-pressed="' + (!S.field) + '">All ' + base.length + "</button>";
		Object.keys(BD.FIELDS).forEach(function (k) { if (fc[k] || S.field === k) h += '<button type="button" class="tu-chip" data-f="' + k + '" aria-pressed="' + (S.field === k) + '">' + esc(BD.FIELDS[k]) + " " + (fc[k] || 0) + "</button>"; });
		$("bd-fields").innerHTML = h;
		var cc = BD.counts(BD.filter(DAY, { field: S.field, era: S.era, alive: S.alive }, TODAY), "country"), keys = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a] || a.localeCompare(b); });
		if (S.country && keys.indexOf(S.country) < 0) keys.unshift(S.country);
		$("bd-country").innerHTML = '<option value="">Every country</option>' + keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + " (" + (cc[k] || 0) + ")</option>"; }).join("");
		$("bd-country").value = S.country;
		var ec = BD.counts(BD.filter(DAY, { field: S.field, country: S.country, alive: S.alive }, TODAY), "era");
		$("bd-era").innerHTML = '<option value="">Any year</option>' + BD.ERAS.map(function (e) { return '<option value="' + e[0] + '">' + e[1] + " (" + (ec[e[0]] || 0) + ")</option>"; }).join("");
		$("bd-era").value = S.era; $("bd-sort").value = S.sort; $("bd-alive").checked = S.alive;
	}
	// Share bar under the day title: the day's link (month + day only, never the visitor's birth year) and the best-known names.
	function shareInfo(list) {
		var u = location.origin + "/birthday?" + BD.toQuery({ mo: S.mo, d: S.d, field: S.field });
		var top = BD.sortBy(list || filtered(), "fame").slice(0, 3).map(function (p) { return p.name; });
		var t = "Famous birthdays on " + BD.dateText(S.mo, S.d) + (top.length ? ": " + top.join(", ") + (DAY.length > top.length ? " and " + (DAY.length - top.length) + " more" : "") : "");
		return { url: u, text: t };
	}
	function renderShare(list) {
		var s = shareInfo(list), e = encodeURIComponent;
		$("bd-shx").href = "https://x.com/intent/post?text=" + e(s.text) + "&url=" + e(s.url);
		$("bd-shfb").href = "https://www.facebook.com/sharer/sharer.php?u=" + e(s.url);
		$("bd-shtg").href = "https://t.me/share/url?url=" + e(s.url) + "&text=" + e(s.text);
		$("bd-shwa").href = "https://wa.me/?text=" + e(s.text + " " + s.url);
		$("bd-share").textContent = navigator.share ? "Share this day" : "Copy link to share";
		$("bd-shcopy").style.display = navigator.share ? "" : "none";   // without the share sheet the main button already copies
	}
	function copyText(u, msg) { (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast(msg); }, function () { prompt("Copy this link:", u); }); }
	function render() {
		var isToday = S.mo === TODAY.mo && S.d === TODAY.d;
		$("bd-title").textContent = (isToday ? "Born today, " : "Born on ") + BD.dateText(S.mo, S.d);
		var sg = window.ZD ? ZD.sunSignByDay(S.mo, S.d) : null;
		$("bd-sub").textContent = DAY.length + " famous people" + (sg ? " · usually " + sg.glyph + " " + sg.name : "");
		renderFilters();
		var list = filtered();
		if (S.hl) { var at = -1; list.forEach(function (p, i) { if (p.id === S.hl) at = i; }); if (at >= S.shown) S.shown = at + 1; }
		$("bd-list").innerHTML = list.length ? list.slice(0, S.shown).map(card).join("") : '<p class="bd-empty">Nobody matches these filters on this day.</p>';
		$("bd-moreb").hidden = list.length <= S.shown;
		$("bd-moreb").textContent = "Show more (" + (list.length - S.shown) + " left)";
		$("bd-zlink").href = "/zodiac?d=" + (S.y ? S.y + "-" : "") + BD.pad(S.mo) + "-" + BD.pad(S.d);
		$("bd-zlink").textContent = S.y ? "Your birth chart" : "Zodiac sign for this date";
		renderShare(list);
		renderYou(); renderNext(); renderBP(); renderExtra(); renderLine(); otdReset();
		history.replaceState(null, "", location.pathname + (function () { var q = BD.toQuery({ mo: S.mo, d: S.d, y: S.y, field: S.field, country: S.country, era: S.era, alive: S.alive, sort: S.sort }); return q && !(isToday && !S.y && q === BD.toQuery({ mo: S.mo, d: S.d })) ? "?" + q : ""; })());
		if (S.hl) { var el = $("p-" + S.hl); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
	}
	function renderYou() {
		var box = $("bd-you");
		if (!S.y) { box.hidden = true; box.innerHTML = ""; return; }
		var me = { y: S.y, mo: S.mo, d: S.d }, s = signs(me), same = DAY.filter(function (p) { return p.y === S.y; });
		var age = BD.ageOn(S.y, S.mo, S.d, TODAY), h = '<div class="tu-card bd-youc"><h3>You: ' + esc(BD.dateText(S.mo, S.d, S.y)) + (age >= 0 && age < 130 ? " <span class=\"bd-age\">(age " + age + ")</span>" : "") + "</h3>";
		h += '<p class="bd-yousigns">' + (s.sun ? "<strong>" + s.sun.glyph + " " + s.sun.name + (s.sun2 ? " or " + s.sun2.name : "") + "</strong> Sun sign" + (s.sun2 ? " (the Sun changed sign that day: your birth time decides)" : "") : "") +
			(s.cn ? " · <strong>" + s.cn.emoji + " " + s.cn.element + " " + s.cn.animal + "</strong> in the Chinese zodiac" : "") + ' · <a href="' + esc(zodiacUrl(me)) + '">Your full birth chart</a></p>';
		h += same.length ? '<p class="bd-youline">Born on <strong>exactly the same date</strong>: ' + same.map(function (p) { return '<a href="' + esc(p.link || BD.wikiUrl(p)) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>"; }).join(", ") + "</p>"
			: '<p class="bd-youline">Nobody in the list was born on exactly the same date (' + esc(BD.dateText(S.mo, S.d, S.y)) + ").</p>";
		h += '<p class="bd-youline" id="bd-twin"></p>';
		box.innerHTML = h + "</div>"; box.hidden = false;
		var want = BD.iso(me);
		L.index().then(function (idx) {
			var t = BD.closestTwin(idx, me.y, me.mo, me.d), el = $("bd-twin");
			if (!t || !el || BD.iso(S.me || {}) !== want) return;
			el.innerHTML = "Closest birth-date twin: " + mini(t, t.gap === 0 ? "born the same day as you" : BD.dobText(t.dob) + ", " + t.gap + (t.gap === 1 ? " day " : " days ") + (BD.dayNum(t) < BD.dayNum(me) ? "before you" : "after you"));
		}).catch(function () {});
	}
	// "Next October 26": weekday, days to go, the age you turn, and famous living people turning N that day
	function renderNext() {
		var box = $("bd-nextc"), mine = S.me && S.me.mo === S.mo && S.me.d === S.d, nb = BD.nextBirthday(S.mo, S.d, TODAY, mine ? S.me.y : null);
		var when = BD.WEEKDAYS[nb.wd] + ", " + BD.dateText(nb.mo, nb.d, nb.y), soon = nb.days === 0 ? "today!" : nb.days === 1 ? "tomorrow" : "in " + nb.days + " days";
		var h = '<div class="bd-nextbig"><span class="bd-nextn">' + (nb.days === 0 ? "🎉" : nb.days) + '</span><span class="bd-nextl">' + (nb.days === 0 ? "today" : nb.days === 1 ? "day to go" : "days to go") + "</span></div><div>";
		h += "<h3>" + (mine ? "Your next birthday" : "Next " + esc(BD.dateText(S.mo, S.d))) + "</h3><p>" + esc(when) + (nb.days === 0 ? ": today!" : ", " + soon + ".") + (mine && nb.turns > 0 ? " You turn <strong>" + nb.turns + "</strong>." : "") + "</p>";
		var turning = DAY.filter(function (p) { return BD.alive(p, TODAY) && p.d === nb.d; }).slice(0, 3);
		if (turning.length) h += '<p class="bd-turns">' + turning.map(function (p) { return esc(p.name) + " turns " + (nb.y - p.y); }).join(" · ") + " that day.</p>";
		if (S.mo === 2 && S.d === 29 && nb.d === 28) h += '<p class="bd-turns">Not a leap year, so most people born on 29 February celebrate on 28 February.</p>';
		box.innerHTML = h + "</div>"; box.hidden = false;
	}
	// compact "Your birthday personality" card (BP = mes.fm/birthday-personality's lib, loaded through lib_from)
	function renderBP() {
		var box = $("bd-bp"), s = window.BP && BP.short(S.mo, S.d);
		if (!s) { box.hidden = true; return; }
		box.innerHTML = '<p class="bp-mini-k">' + (S.y ? "Your birthday personality" : "Birthday personality for " + esc(BD.dateText(S.mo, S.d))) + ' <span>for fun</span></p><h3 class="bp-mini-t">' + esc(s.title) + '</h3><p class="bp-mini-p">' + esc(s.text) + '</p><a class="bp-mini-a" href="' + esc(s.url) + (S.y ? "&amp;y=" + S.y : "") + '">Read the full profile →</a>';
		box.hidden = false;
	}
	function renderExtra() {
		var box = $("bd-extra"), want = S.mo + "-" + S.d + "-" + (S.y || ""), near = [-2, -1, 1, 2].map(function (n) { var t = BD.shift(S.mo, S.d, n); t.gap = Math.abs(n); return t; });
		box.dataset.want = want;
		// the name index (~160 KB gzipped) is only needed for "same year"; nearby days come from the month files
		Promise.all([S.y ? L.index() : Promise.resolve(null), Promise.all(near.map(function (t) { return L.day(t.mo, t.d).then(function (l) { return l.map(function (p) { p.gap = t.gap; return p; }); }); }))]).then(function (r) {
			if (box.dataset.want !== want) return;
			var h = "", idx = r[0];
			if (S.y && idx) {
				var sy = BD.sameYear(idx, S.y, S.mo, S.d, 16).filter(function (p) { return !(p.mo === S.mo && p.d === S.d); }).slice(0, 12);
				if (sy.length) h += '<div class="tu-card"><h3>Also born in ' + S.y + ", closest to your birthday</h3><div class=\"bd-minis\">" + sy.map(function (p) { return mini(p, BD.dateText(p.mo, p.d) + " (" + p.gap + (p.gap === 1 ? " day " : " days ") + (BD.doy(p.mo, p.d) > BD.doy(S.mo, S.d) ? "after" : "before") + ")"); }).join("") + "</div></div>";
			}
			[["bd-prevn", r[1][1]], ["bd-nextn2", r[1][2]]].forEach(function (x) { var el = $(x[0]), top = BD.sortBy(x[1], "fame")[0]; if (el) el.textContent = top ? top.name : ""; });
			[["bd-prevd", near[1]], ["bd-nextd", near[2]]].forEach(function (x) { var el = $(x[0]); if (el) el.textContent = BD.MONTHS[x[1].mo - 1].slice(0, 3) + " " + x[1].d; });
			var nr = [].concat.apply([], r[1]).sort(function (a, b) { return a.gap - b.gap || a.rank - b.rank; }).slice(0, 12);
			if (nr.length) h += '<div class="tu-card"><h3>Birthdays a day or two away</h3><div class="bd-minis">' + nr.map(function (p) { return mini(p, BD.dateText(p.mo, p.d) + ", " + p.y); }).join("") + "</div></div>";
			box.innerHTML = h;
		}).catch(function () { box.innerHTML = ""; });
	}
	function load() {
		$("bd-list").innerHTML = '<p class="bd-empty">Loading…</p>';
		var want = S.mo + "-" + S.d;
		L.day(S.mo, S.d).then(function (list) { if (want !== S.mo + "-" + S.d) return; DAY = list; render(); })
			.catch(function () { $("bd-list").innerHTML = '<p class="bd-empty">The list of people could not be loaded. Check your connection and reload.</p>'; });
	}

	/* ---------- name search ---------- */
	var searchT;
	function doSearch() {
		var q = $("bd-q").value.trim(), box = $("bd-results");
		if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
		L.index().then(function (idx) {
			if ($("bd-q").value.trim() !== q) return;
			var r = BD.search(idx, q, 12);
			box.innerHTML = r.length ? r.map(function (p) { return mini(p); }).join("") : '<p class="bd-empty">No one called “' + esc(q) + '” in the list.</p>';
			box.hidden = false;
		});
	}
	function goTo(dob, id) {
		var y = +dob.slice(0, 4), mo = +dob.slice(5, 7), d = +dob.slice(8, 10);
		S.hl = id || ""; S.alive = false;
		setDay(mo, d, S.y && !id ? S.y : null);
		$("bd-results").hidden = true;
		window.scrollTo({ top: $("bd-title").getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
	}

	/* ---------- wiring ---------- */
	function fromInput() {
		var p = window.ZD ? ZD.parseDate($("bd-date").value) : null;
		if (!p) { if ($("bd-date").value.trim()) toast("Type a date like Oct 26, 1980 or 1980-10-26"); return; }
		S.hl = ""; if (p.y) S.me = { y: p.y, mo: p.mo, d: p.d };
		setDay(p.mo, p.d, p.y || null, true);
	}
	$("bd-go").addEventListener("click", function () { if ($("bd-date").value.trim()) fromInput(); else { S.hl = ""; setDay(+$("bd-month").value, +$("bd-day").value, null, true); } });
	$("bd-date").addEventListener("keydown", function (e) { if (e.key === "Enter") fromInput(); });
	$("bd-month").addEventListener("change", function () { $("bd-date").value = ""; S.hl = ""; S.mo = +$("bd-month").value; fillDays(); setDay(S.mo, +$("bd-day").value, null, true); });
	$("bd-day").addEventListener("change", function () { $("bd-date").value = ""; S.hl = ""; setDay(S.mo, +$("bd-day").value, null, true); });
	$("bd-today").addEventListener("click", function () { $("bd-date").value = ""; S.hl = ""; setDay(TODAY.mo, TODAY.d, null); });
	function step(n) { var t = BD.shift(S.mo, S.d, n); S.hl = ""; $("bd-date").value = ""; setDay(t.mo, t.d, null, true); }
	$("bd-prev").addEventListener("click", function () { step(-1); });
	$("bd-next").addEventListener("click", function () { step(1); });
	$("bd-fields").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; S.field = b.getAttribute("data-f"); S.shown = PAGE; S.hl = ""; render(); });
	$("bd-country").addEventListener("change", function () { S.country = this.value; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-era").addEventListener("change", function () { S.era = this.value; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-sort").addEventListener("change", function () { S.sort = this.value; S.shown = PAGE; render(); });
	$("bd-alive").addEventListener("change", function () { S.alive = this.checked; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-moreb").addEventListener("click", function () { S.shown += PAGE * 2; S.hl = ""; render(); });
	$("bd-q").addEventListener("input", function () { clearTimeout(searchT); searchT = setTimeout(doSearch, 160); });
	$("bd-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = $("bd-results").querySelector("[data-go]"); if (b) b.click(); } if (e.key === "Escape") { this.value = ""; doSearch(); } });
	root.addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) goTo(b.getAttribute("data-go"), b.getAttribute("data-id")); });
	$("bd-share").addEventListener("click", function () {
		var s = shareInfo();
		if (navigator.share) navigator.share({ title: s.text, text: s.text, url: s.url }).catch(function () {});
		else copyText(s.url, "Link copied");
	});
	$("bd-shcopy").addEventListener("click", function () { copyText(shareInfo().url, "Link copied"); });
	$("bd-copy").addEventListener("click", function () {
		var u = location.origin + "/birthday?" + BD.toQuery({ mo: S.mo, d: S.d, y: S.y, field: S.field, country: S.country, era: S.era, alive: S.alive, sort: S.sort });
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", u); });
	});
	$("bd-gen").textContent = BD.DATA_V.slice(0, 10);

	/* ---------- pictures on / off ---------- */
	function applyPics() { root.classList.toggle("bd-nopics", !P.pics); $("bd-pics").checked = P.pics; }
	$("bd-pics").addEventListener("change", function () { P.pics = this.checked; savePrefs(); applyPics(); render(); });
	// a portrait that fails to load (deleted file, blocked host) leaves the initials avatar underneath
	root.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList.contains("bd-av")) { t.parentNode.classList.add("bd-av--none"); t.remove(); } }, true);
	applyPics();

	/* ---------- Line them up (friends, kept in this browser only) ---------- */
	function renderLine() {
		var box = $("bd-line"), rows = P.friends.map(function (f) { var y = +f.d.slice(0, 4), mo = +f.d.slice(5, 7), d = +f.d.slice(8, 10); return { name: f.n, y: y, mo: mo, d: d, friend: true }; });
		if (S.me) rows.push({ name: "You", y: S.me.y, mo: S.me.mo, d: S.me.d, you: true });
		rows.sort(function (a, b) { return BD.dayNum(a) - BD.dayNum(b); });
		if (!rows.length) { box.innerHTML = '<p class="tu-note" style="margin:0.4em 0 0;">Add a friend or relative to compare ages and signs. Type your own birthday (with the year) above to be in the line too.</p>'; return; }
		var h = '<div class="tu-table-wrap"><table class="tu-table bd-ltab"><thead><tr><th>Name</th><th>Born</th><th>Age</th><th>Signs</th><th>Next birthday</th>' + (S.me ? "<th>Compared with you</th>" : "") + "<th></th></tr></thead><tbody>";
		rows.forEach(function (r) {
			var sg = signs(r), nb = BD.nextBirthday(r.mo, r.d, TODAY, r.y), i = r.friend ? P.friends.findIndex(function (f) { return f.n === r.name && f.d === BD.iso(r); }) : -1;
			h += "<tr" + (r.you ? ' class="bd-lyou"' : "") + "><td>" + esc(r.name) + "</td><td>" + esc(BD.dateText(r.mo, r.d, r.y)) + "</td><td>" + BD.ageOn(r.y, r.mo, r.d, TODAY) + "</td><td>" +
				(sg.sun ? sg.sun.glyph + " " + sg.sun.name : "") + (sg.cn ? " · " + sg.cn.emoji + " " + sg.cn.animal : "") + "</td><td>" + (nb.days === 0 ? "today 🎉" : "in " + nb.days + " d, turns " + nb.turns) + "</td>" +
				(S.me ? "<td>" + (r.you ? "—" : esc(BD.ageGapText(r, S.me))) + "</td>" : "") +
				"<td>" + (i >= 0 ? '<button type="button" class="bd-x" data-del="' + i + '" aria-label="Remove ' + esc(r.name) + '">✕</button>' : "") + "</td></tr>";
		});
		box.innerHTML = h + "</tbody></table></div>";
	}
	$("bd-ladd").addEventListener("click", function () {
		var n = $("bd-lname").value.trim().slice(0, 40), p = window.ZD ? ZD.parseDate($("bd-ldate").value) : null;
		if (!p || !p.y) { toast("Type their birthday with the year, e.g. 1984-03-02"); $("bd-ldate").focus(); return; }
		if (P.friends.length >= 12) { toast("Up to 12 people"); return; }
		P.friends.push({ n: n || "Friend " + (P.friends.length + 1), d: BD.iso(p) }); savePrefs();
		$("bd-lname").value = ""; $("bd-ldate").value = ""; renderLine();
	});
	$("bd-ldate").addEventListener("keydown", function (e) { if (e.key === "Enter") $("bd-ladd").click(); });
	$("bd-line").addEventListener("click", function (e) { var b = e.target.closest("[data-del]"); if (!b) return; P.friends.splice(+b.getAttribute("data-del"), 1); savePrefs(); renderLine(); });

	/* ---------- On this day (Wikipedia feed, CC BY-SA): loaded when the section comes into view, cached for the tab's session ---------- */
	var OTD = { tab: "events", open: false, all: false };
	function otdKey(t) { return "mes-otd:" + t + ":" + BD.pad(S.mo) + "-" + BD.pad(S.d); }
	function otdReset() { OTD.all = false; if (OTD.open) otdLoad(); else $("bd-otdlist").innerHTML = ""; $("bd-otdh").textContent = "On this day, " + BD.dateText(S.mo, S.d); }
	function otdLoad() {
		var t = OTD.tab, key = otdKey(t), box = $("bd-otdlist"), cached = null;
		OTD.open = true;
		Array.prototype.forEach.call($("bd-otdtabs").querySelectorAll("[data-otd]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-otd") === t)); });
		try { cached = JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) {}
		if (cached) { otdShow(cached); return; }
		box.innerHTML = '<p class="bd-empty">Loading from Wikipedia…</p>';
		fetch("https://en.wikipedia.org/api/rest_v1/feed/onthisday/" + t + "/" + BD.pad(S.mo) + "/" + BD.pad(S.d), { headers: { "Api-User-Agent": "MES Famous Birthdays (https://mes.fm/birthday)" } })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
			.then(function (j) {
				var list = BD.slimOnThisDay(j, t);
				try { sessionStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
				if (key === otdKey(OTD.tab)) otdShow(list);
			})
			.catch(function () { if (key === otdKey(OTD.tab)) box.innerHTML = '<p class="bd-empty">Wikipedia could not be reached (offline, or blocked by an extension). <a href="https://en.wikipedia.org/wiki/' + BD.MONTHS[S.mo - 1] + "_" + S.d + '" target="_blank" rel="noopener">Open ' + BD.dateText(S.mo, S.d) + " on Wikipedia</a>.</p>"; });
	}
	function otdShow(list) {
		var box = $("bd-otdlist"), n = OTD.all ? list.length : 15;
		if (!list.length) { box.innerHTML = '<p class="bd-empty">Nothing listed for this day.</p>'; return; }
		var h = '<ul class="bd-otd">' + list.slice(0, n).map(function (e) {
			return "<li>" + (e.y !== null ? '<span class="bd-oty">' + (e.y < 0 ? -e.y + " BC" : e.y) + "</span>" : "") + '<span class="bd-ott">' + esc(e.t) +
				(e.u && /^https:\/\/en\.wikipedia\.org\//.test(e.u) ? ' <a href="' + esc(e.u) + '" target="_blank" rel="noopener">' + esc(e.a) + " →</a>" : "") + "</span></li>";
		}).join("") + "</ul>";
		if (list.length > n) h += '<button type="button" class="tu-btn" id="bd-otdmore">Show all ' + list.length + "</button>";
		box.innerHTML = h;
	}
	$("bd-otdtabs").addEventListener("click", function (e) { var b = e.target.closest("[data-otd]"); if (!b) return; OTD.tab = b.getAttribute("data-otd"); OTD.all = false; otdLoad(); });
	$("bd-otdlist").addEventListener("click", function (e) { if (e.target.id === "bd-otdmore") { OTD.all = true; otdLoad(); } });
	if ("IntersectionObserver" in window) {
		var io = new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); if (!OTD.open) otdLoad(); } }, { rootMargin: "200px" });
		io.observe($("bd-otdc"));
	} else otdLoad();

	/* ---------- start ---------- */
	var q = BD.fromQuery(location.search);
	if (q.mo) { S.mo = q.mo; S.d = q.d; S.y = q.y || null; if (q.y) { $("bd-date").value = BD.dateText(q.mo, q.d, q.y); S.me = { y: q.y, mo: q.mo, d: q.d }; } }
	["field", "country", "era", "alive", "sort"].forEach(function (k) { if (q[k] !== undefined) S[k] = q[k]; });
	fillPickers();
	if (q.q) { $("bd-q").value = q.q; doSearch(); }
	load();
})();
