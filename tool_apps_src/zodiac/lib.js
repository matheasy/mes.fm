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
	var LNY = {};
	function lunarNewYear(y) {
		if (LNY[y]) return LNY[y];
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
