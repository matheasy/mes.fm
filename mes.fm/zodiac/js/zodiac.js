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
	// wall-clock parts of `date` in time zone `tz` ("" / null = the browser's own zone)
	function partsIn(date, tz) {
		var o = {}, ms = ((date.getTime() % 1000) + 1000) % 1000;
		var f = tz ? fmt(tz) : fmt(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
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
	var CK = { valid: valid, partsIn: partsIn, offsetMin: offsetMin, offsetLabel: offsetLabel, timeText: timeText, angles: angles, dayOfYear: dayOfYear, isoWeek: isoWeek, city: city, diffText: diffText, isDay: isDay, pad: pad, POPULAR: POPULAR };
	if (typeof module !== "undefined" && module.exports) module.exports = CK; else root.CK = CK;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Famous Birthdays -- pure helpers (no DOM) + a small data loader. Browser global `BD`; node: require('./tool_apps_src/birthday/lib.js').
 * Data: mes.fm/birthday/data/MM.json (people born in month MM, sorted by day then fame rank) + index.json (every person's id, name, birth date, rank),
 * written by build_birthdays.py from Wikidata (CC0). Used by mes.fm/birthday and mes.fm/zodiac. Tests: node tool_apps_src/birthday-tests.js */
(function (root) {
	"use strict";
	var DATA_V = "2026-10-21.2";    // date of the data files: build_birthdays.py --apply updates it (then rebuild both pages so browsers fetch the new files)
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

/* MES Zodiac & Birth Chart -- mes.fm/zodiac (UI). Maths in lib.js (global ZD, on Astronomy Engine + the Clock's CK); famous people from the
 * birthday data (global BD, mes.fm/birthday/data). Links: ?d=1980-10-26 (or 10-26) &t=18:30 &tz=America/Vancouver &ll=49.28,-123.12 &pl=Vancouver
 * &h=equal &p=Q6294 (compare with that person). Everything is computed in the browser; nothing is stored or sent. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("zd");
	if (!root || !window.ZD || !window.Astronomy || !window.BD) return;
	var L = BD.loader("/birthday/data/"), LOCAL = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
	var now = new Date(), TODAY = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
	var ME = null, CHART = null, CMP = null;
	var EL_COL = { Fire: "#c2410c", Earth: "#237a36", Air: "#946200", Water: "#1864ab" };   // >= 4.5:1 on white
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("zd-toast"); if (!t) { t = document.createElement("div"); t.id = "zd-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function timeAt(ms, tz) {
		var o = { hour: "numeric", minute: "2-digit", weekday: "short", month: "short", day: "numeric" }, fo = ZD.fixedOffset(tz);
		if (fo !== null) { var d = new Date(ms + fo * 60000); o.timeZone = "UTC"; return new Intl.DateTimeFormat(undefined, o).format(d) + " (" + tz + ")"; }
		try { o.timeZone = tz; o.timeZoneName = "short"; return new Intl.DateTimeFormat(undefined, o).format(new Date(ms)); } catch (e) { return new Date(ms).toUTCString(); }
	}

	/* ---------- form ---------- */
	(function zones() {
		var list = []; try { list = Intl.supportedValuesOf("timeZone"); } catch (e) { list = CK.POPULAR; }
		$("zd-zones").innerHTML = list.map(function (z) { return '<option value="' + esc(z) + '">'; }).join("");
	})();
	var placeSel = -1, PLACES = [];
	function showPlaces() {
		var q = $("zd-place").value, box = $("zd-places");
		PLACES = ZD.findCities(q, 8); placeSel = -1;
		if (!q.trim() || !PLACES.length || (PLACES.length === 1 && PLACES[0].name + ", " + PLACES[0].country === q)) { box.hidden = true; $("zd-place").setAttribute("aria-expanded", "false"); return; }
		box.innerHTML = PLACES.map(function (c, i) { return '<button type="button" role="option" data-i="' + i + '">' + esc(c.name) + ' <span>' + esc(c.country) + "</span></button>"; }).join("");
		box.hidden = false; $("zd-place").setAttribute("aria-expanded", "true");
	}
	function pickPlace(c) {
		$("zd-place").value = c.name + ", " + c.country;
		$("zd-ll").value = c.lat + ", " + c.lon; $("zd-tz").value = c.tz;
		$("zd-places").hidden = true; $("zd-place").setAttribute("aria-expanded", "false");
		updOffset();
	}
	$("zd-place").addEventListener("input", showPlaces);
	$("zd-place").addEventListener("keydown", function (e) {
		var box = $("zd-places"), b = box.querySelectorAll("button");
		if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (box.hidden) return; e.preventDefault(); placeSel = (placeSel + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length; b.forEach(function (x, i) { x.classList.toggle("zd-sel", i === placeSel); }); }
		else if (e.key === "Enter") { if (!box.hidden && PLACES.length) { e.preventDefault(); pickPlace(PLACES[Math.max(placeSel, 0)]); } else run(); }
		else if (e.key === "Escape") { box.hidden = true; }
	});
	$("zd-places").addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) pickPlace(PLACES[+b.getAttribute("data-i")]); });
	document.addEventListener("click", function (e) { if (!e.target.closest(".zd-placef")) { $("zd-places").hidden = true; $("zd-cres").hidden = true; } });
	function readForm() {
		var dt = ZD.parseDate($("zd-date").value), t = ZD.parseTime($("zd-time").value), ll = ZD.parseLatLon($("zd-ll").value), tz = $("zd-tz").value.trim() || LOCAL;
		return { dt: dt, t: t, ll: ll, tz: tz, houses: $("zd-houses").value };
	}
	function updOffset() {
		var f = readForm(), el = $("zd-offset");
		if (!ZD.validZone(f.tz)) { el.textContent = "Unknown time zone “" + f.tz + "”: type a zone like Europe/London or an offset like +05:30."; return; }
		if (!f.dt || !f.dt.y) { el.textContent = "Time zone: " + f.tz + "."; return; }
		var ms = ZD.wallToUtc(f.dt.y, f.dt.mo, f.dt.d, f.t ? f.t.h : 12, f.t ? f.t.m : 0, f.tz);
		el.textContent = "Time zone " + f.tz + ": " + CK.offsetLabel(ZD.offsetAt(ms, f.tz)) + " on that date" + (f.t ? ", so you were born at " + new Date(ms).toISOString().slice(11, 16) + " UTC." : ".");
	}
	["zd-date", "zd-time", "zd-tz"].forEach(function (id) { $(id).addEventListener("change", updOffset); });
	["zd-date", "zd-ll", "zd-tz"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") run(); }); });
	$("zd-go").addEventListener("click", run);
	$("zd-houses").addEventListener("change", function () { if (CHART) run(); });
	$("zd-clear").addEventListener("click", function () {
		["zd-date", "zd-time", "zd-place", "zd-ll", "zd-tz"].forEach(function (id) { $(id).value = ""; });
		ME = CHART = null; $("zd-out").hidden = true; $("zd-famous").innerHTML = ""; updOffset(); renderCmp(); history.replaceState(null, "", location.pathname + (CMP ? "?p=" + CMP.id : ""));
	});

	/* ---------- chart ---------- */
	function run() {
		var f = readForm();
		if (!f.dt) { toast("Type your birth date, e.g. Oct 26, 1980"); $("zd-date").focus(); return; }
		if (!ZD.validZone(f.tz)) { updOffset(); return; }
		ME = { y: f.dt.y, mo: f.dt.mo, d: f.dt.d };
		if (!f.dt.y) { renderNoYear(f.dt); return; }
		var o = { y: f.dt.y, mo: f.dt.mo, d: f.dt.d, tz: f.tz, houses: f.houses };
		if (f.t) { o.h = f.t.h; o.m = f.t.m; }
		if (f.ll) { o.lat = f.ll.lat; o.lon = f.ll.lon; }
		CHART = ZD.chart(o);
		render(f); updOffset(); renderFamous(); renderCmp(); setUrl(f);
	}
	function setUrl(f) {
		var q = new URLSearchParams();
		if (f.dt) q.set("d", (f.dt.y ? f.dt.y + "-" : "") + BD.pad(f.dt.mo) + "-" + BD.pad(f.dt.d));
		if (f.t) q.set("t", BD.pad(f.t.h) + ":" + BD.pad(f.t.m));
		if ($("zd-tz").value.trim() || f.t) q.set("tz", f.tz);     // a zone typed or picked (not just the browser default) travels with the link
		if (f.ll) q.set("ll", f.ll.lat + "," + f.ll.lon);
		if ($("zd-place").value.trim()) q.set("pl", $("zd-place").value.trim().slice(0, 60));
		if (f.houses === "equal") q.set("h", "equal");
		if (CMP) q.set("p", CMP.id);
		history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
	}
	function bigCard(label, sgn, extra, cls) {
		if (!sgn) return '<div class="tu-card zd-bc zd-bc--none"><div class="zd-bcl">' + label + '</div><div class="zd-bcn">?</div><div class="zd-bcx">' + extra + "</div></div>";
		return '<div class="tu-card zd-bc zd-el-' + sgn.element + " " + (cls || "") + '" style="--el:' + EL_COL[sgn.element] + '"><div class="zd-bcl">' + label + '</div><div class="zd-bcg" aria-hidden="true">' + sgn.glyph + '</div><div class="zd-bcn">' + sgn.name + '</div><div class="zd-bcx">' + extra + "</div></div>";
	}
	function render(f) {
		var c = CHART, sun = c.by.sun, moon = c.by.moon, cn = c.chinese, amb = {};
		c.ambiguous.forEach(function (a) { amb[a.id] = a; });
		$("zd-head").textContent = "Born " + BD.dateText(ME.mo, ME.d, ME.y) + (c.timeKnown ? " at " + CK.timeText({ h: f.t.h, m: f.t.m }, true) : "") + ($("zd-place").value.trim() ? " · " + $("zd-place").value.trim() : "");
		var warn = [];
		if (amb.moon) warn.push("<strong>The Moon changed sign on your birthday</strong>: it was in " + amb.moon.from.name + " until " + esc(timeAt(amb.moon.at, c.tz)) + ", then in " + amb.moon.to.name + ". Add your birth time to know which.");
		if (amb.sun) warn.push("<strong>The Sun changed sign on your birthday</strong> (a cusp): " + amb.sun.from.name + " until " + esc(timeAt(amb.sun.at, c.tz)) + ", then " + amb.sun.to.name + ". Add your birth time to know which.");
		var others = c.ambiguous.filter(function (a) { return a.id !== "moon" && a.id !== "sun"; });
		if (others.length) warn.push(others.map(function (a) { return a.name; }).join(", ") + " also changed sign that day (shown for noon).");
		if (!c.timeKnown) warn.push("No birth time: positions are for noon local time, and the rising sign and houses need a time.");
		else if (c.asc === undefined) warn.push("Add your birth place (city or latitude, longitude) for the rising sign and houses.");
		if (c.polar) warn.push("Born near a pole: the ascendant behaves oddly at high latitudes, read it with care.");
		$("zd-warn").innerHTML = warn.map(function (w) { return "<p>" + w + "</p>"; }).join(""); $("zd-warn").hidden = !warn.length;
		var h = bigCard("Sun sign", amb.sun && !c.timeKnown ? null : sun.sign, amb.sun && !c.timeKnown ? amb.sun.from.name + " or " + amb.sun.to.name : ZD.degText(sun.deg) + " · " + sun.sign.element + ", " + sun.sign.mode, "zd-sun");
		h += bigCard("Moon sign", amb.moon && !c.timeKnown ? null : moon.sign, amb.moon && !c.timeKnown ? amb.moon.from.name + " or " + amb.moon.to.name : ZD.degText(moon.deg) + " · " + moon.sign.element);
		h += c.asc !== undefined ? bigCard("Rising sign", c.ascSign.sign, ZD.degText(c.ascSign.deg) + " ascendant") : bigCard("Rising sign", null, "needs birth time + place");
		h += '<div class="tu-card zd-bc zd-cn"><div class="zd-bcl">Chinese zodiac</div><div class="zd-bcg" aria-hidden="true">' + cn.emoji + '</div><div class="zd-bcn">' + cn.element + " " + cn.animal + '</div><div class="zd-bcx">' + (cn.yin ? "Yin" : "Yang") + " · year of " + cn.year + (cn.year !== ME.y ? " (before Lunar New Year)" : "") + "</div></div>";
		$("zd-big").innerHTML = h;
		// table
		var t = "<thead><tr><th>Body</th><th>Sign</th><th>Degree</th>" + (c.asc !== undefined ? "<th>House</th>" : "") + "<th></th></tr></thead><tbody>";
		c.bodies.forEach(function (b) {
			t += '<tr><td><span class="zd-gl" aria-hidden="true">' + b.glyph + "</span> " + b.name + "</td><td>" + b.sign.glyph + " " + b.sign.name + (amb[b.id] && !c.timeKnown ? " *" : "") + "</td><td>" + ZD.degText(b.deg) + "</td>" +
				(c.asc !== undefined ? "<td>" + b.house + "</td>" : "") + "<td>" + (b.retro ? '<span class="zd-rx" title="Retrograde: moving backwards against the stars, seen from Earth">℞ retrograde</span>' : "") + "</td></tr>";
		});
		if (c.asc !== undefined) t += '<tr class="zd-angle"><td>Ascendant</td><td>' + c.ascSign.sign.glyph + " " + c.ascSign.sign.name + "</td><td>" + ZD.degText(c.ascSign.deg) + "</td><td>1</td><td></td></tr>" +
			'<tr class="zd-angle"><td>Midheaven (MC)</td><td>' + c.mcSign.sign.glyph + " " + c.mcSign.sign.name + "</td><td>" + ZD.degText(c.mcSign.deg) + "</td><td></td><td></td></tr>";
		$("zd-table").innerHTML = t + "</tbody>";
		// element / mode balance
		var el = { Fire: 0, Earth: 0, Air: 0, Water: 0 }, md = { Cardinal: 0, Fixed: 0, Mutable: 0 };
		c.bodies.forEach(function (b) { el[b.sign.element]++; md[b.sign.mode]++; });
		$("zd-balance").innerHTML = '<p class="zd-balt">Sun, Moon and planets by element and mode</p><div class="zd-bars">' + Object.keys(el).map(function (k) { return '<div class="zd-bar"><span>' + k + '</span><i style="width:' + el[k] * 10 + "%;background:" + EL_COL[k] + '"></i><b>' + el[k] + "</b></div>"; }).join("") +
			Object.keys(md).map(function (k) { return '<div class="zd-bar"><span>' + k + '</span><i style="width:' + md[k] * 10 + '%"></i><b>' + md[k] + "</b></div>"; }).join("") + "</div>";
		// moon phase
		var ph = c.phase;
		$("zd-moonc").innerHTML = '<div class="zd-moon"><span class="zd-moone" aria-hidden="true">' + ph.emoji + "</span><div><h3>" + ph.name + " when you were born</h3><p>" + Math.round(ph.illum * 100) + "% of the Moon was lit" +
			(c.timeKnown ? "" : " (at noon)") + ". Your Sun sign traits, as astrology tells it: <em>" + esc(sun.sign.traits) + "</em>; ruled by " + esc(sun.sign.ruler) + ", " + esc(sun.sign.dates) + " most years.</p></div></div>";
		$("zd-wheel").innerHTML = wheel(c);
		$("zd-wheelnote").textContent = c.asc !== undefined ? "Ascendant on the left, " + (c.houseMode === "whole" ? "whole-sign" : "equal") + " houses numbered inside." : "Without a birth time and place, the wheel starts at 0° Aries on the left and has no houses.";
		$("zd-bdlink").href = "/birthday?d=" + BD.iso(ME);
		root.querySelector(".zd-chartrow").hidden = false; $("zd-moonc").hidden = false;
		$("zd-out").hidden = false;
	}
	function renderNoYear(dt) {
		CHART = null;
		var s = ZD.sunSignByDay(dt.mo, dt.d);
		$("zd-head").textContent = "Born " + BD.dateText(dt.mo, dt.d);
		$("zd-warn").innerHTML = "<p>Add the year for the exact Sun sign, the Moon, the planets and the Chinese animal: without it this is the usual sign for the day.</p>"; $("zd-warn").hidden = false;
		$("zd-big").innerHTML = bigCard("Sun sign (usual)", s, s.dates + " · " + s.element + ", " + s.mode, "zd-sun");
		["zd-wheel", "zd-table", "zd-balance", "zd-moonc"].forEach(function (id) { $(id).innerHTML = ""; });
		$("zd-wheelnote").textContent = ""; $("zd-bdlink").href = "/birthday?d=" + BD.pad(dt.mo) + "-" + BD.pad(dt.d);
		$("zd-out").hidden = false; root.querySelector(".zd-chartrow").hidden = true; $("zd-moonc").hidden = true;
		renderFamous(); renderCmp(); setUrl(readForm());
	}

	/* ---------- SVG wheel ---------- */
	function wheel(c) {
		var R = 200, base = c.asc !== undefined ? c.asc : 0, s = "";
		function pt(lon, r) { var a = (180 + lon - base) * Math.PI / 180; return [(R + r * Math.cos(a)).toFixed(1), (R - r * Math.sin(a)).toFixed(1)]; }
		function line(lon, r1, r2, cls) { var a = pt(lon, r1), b = pt(lon, r2); return '<line class="' + cls + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
		for (var i = 0; i < 12; i++) {
			var a0 = i * 30, p1 = pt(a0, 192), p2 = pt(a0 + 30, 192), p3 = pt(a0 + 30, 160), p4 = pt(a0, 160), sg = ZD.SIGNS[i];
			s += '<path class="zd-seg" style="fill:' + EL_COL[sg.element] + '" d="M' + p1 + " A192 192 0 0 0 " + p2 + " L" + p3 + " A160 160 0 0 1 " + p4 + 'Z"><title>' + sg.name + "</title></path>";
			var g = pt(a0 + 15, 176); s += '<text class="zd-sg" x="' + g[0] + '" y="' + g[1] + '">' + sg.glyph + "</text>";
			s += line(a0, 160, 192, "zd-ln");
			for (var k = 5; k < 30; k += 5) s += line(a0 + k, 160, k % 10 ? 164 : 167, "zd-tk");
		}
		s += '<circle class="zd-ring" cx="200" cy="200" r="192"/><circle class="zd-ring" cx="200" cy="200" r="160"/><circle class="zd-ring" cx="200" cy="200" r="62"/>';
		if (c.cusps) {
			c.cusps.forEach(function (cu, j) {
				s += line(cu, 62, 160, j % 3 === 0 && c.houseMode === "equal" ? "zd-hx" : "zd-hl");
				var m = pt(cu + 15, 74); s += '<text class="zd-hn" x="' + m[0] + '" y="' + m[1] + '">' + (j + 1) + "</text>";
			});
			s += line(c.asc, 62, 196, "zd-axis") + line(c.asc + 180, 62, 196, "zd-axis") + line(c.mc, 62, 196, "zd-axis") + line(c.mc + 180, 62, 160, "zd-axis zd-axis2");
			var aL = pt(c.asc, 205), mL = pt(c.mc, 205);
			s += '<text class="zd-axl" x="' + aL[0] + '" y="' + aL[1] + '">AC</text><text class="zd-axl" x="' + mL[0] + '" y="' + mL[1] + '">MC</text>';
		}
		// spread glyphs that would overlap (keep order, at least 9 degrees apart)
		var bs = c.bodies.map(function (b) { return { b: b, at: b.lon }; }).sort(function (x, y) { return x.at - y.at; });
		for (var it = 0; it < 30; it++) {
			var moved = false;
			for (var j = 0; j < bs.length; j++) {
				var nx = bs[(j + 1) % bs.length], gap = ZD.wrap(nx.at - bs[j].at);
				if (bs.length > 1 && gap < 9) { var push = (9 - gap) / 2; bs[j].at = ZD.wrap(bs[j].at - push); nx.at = ZD.wrap(nx.at + push); moved = true; }
			}
			if (!moved) break;
		}
		bs.forEach(function (x) {
			var b = x.b, p = pt(x.at, 136), q = pt(b.lon, 150);
			s += line(b.lon, 154, 160, "zd-pt") + '<line class="zd-lead" x1="' + q[0] + '" y1="' + q[1] + '" x2="' + p[0] + '" y2="' + p[1] + '"/>';
			s += '<g class="zd-body zd-b-' + b.id + '"><title>' + b.name + " " + ZD.degText(b.deg) + " " + b.sign.name + (b.retro ? " (retrograde)" : "") + '</title><circle cx="' + p[0] + '" cy="' + p[1] + '" r="11"/><text x="' + p[0] + '" y="' + p[1] + '">' + b.glyph + "</text>" +
				(b.retro ? '<text class="zd-rxs" x="' + (+p[0] + 12) + '" y="' + (+p[1] + 9) + '">R</text>' : "") + "</g>";
		});
		var title = "Chart wheel: " + c.bodies.map(function (b) { return b.name + " in " + b.sign.name; }).join(", ") + (c.asc !== undefined ? ", ascendant in " + c.ascSign.sign.name : "");
		return '<svg viewBox="-14 -14 428 428" role="img" aria-label="' + esc(title) + '">' + s + "</svg>";
	}

	/* ---------- famous people ---------- */
	function personLink(p) { return '<a href="' + esc(p.link || BD.wikiUrl(p)) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>"; }
	function renderFamous() {
		var box = $("zd-famous"), me = ME; if (!me) { box.innerHTML = ""; return; }
		var sign = CHART ? CHART.by.sun.sign : ZD.sunSignByDay(me.mo, me.d), want = me.mo + "-" + me.d + "-" + me.y;
		box.dataset.want = want;
		Promise.all([L.day(me.mo, me.d), L.range(ZD.signDays(sign.i))]).then(function (r) {
			if (box.dataset.want !== want) return;
			var day = BD.sortBy(r[0], "fame").slice(0, 10), same = me.y ? r[0].filter(function (p) { return p.y === me.y; }) : [];
			var sg = BD.sortBy(r[1].filter(function (p) { var s = ZD.sunSignByDay(p.mo, p.d); return s.i === sign.i && !(p.mo === me.mo && p.d === me.d); }), "fame").slice(0, 12);
			var h = '<div class="zd-fam"><div class="tu-card"><h3>Born on ' + esc(BD.dateText(me.mo, me.d)) + "</h3>" + (same.length ? '<p class="zd-same">Same day and year: ' + same.map(personLink).join(", ") + "</p>" : "") +
				'<ul class="zd-plist">' + day.map(function (p) { return "<li>" + personLink(p) + ' <span>' + p.y + (p.desc ? " · " + esc(p.desc) : "") + "</span></li>"; }).join("") + '</ul><a href="/birthday?d=' + BD.iso(me) + '">Everyone born on ' + esc(BD.dateText(me.mo, me.d)) + " →</a></div>";
			h += '<div class="tu-card"><h3>Famous ' + sign.glyph + " " + sign.name + (sign.name.slice(-1) === "s" ? "" : "s") + "</h3><ul class=\"zd-plist\">" + sg.map(function (p) { return "<li>" + personLink(p) + ' <span>' + esc(BD.dateText(p.mo, p.d, p.y)) + "</span></li>"; }).join("") +
				'</ul><p class="tu-note">' + sign.name + ": " + esc(sign.dates) + " (usual dates).</p></div></div>";
			box.innerHTML = h;
		}).catch(function () { box.innerHTML = ""; });
	}

	/* ---------- compare ---------- */
	var cT;
	$("zd-cq").addEventListener("input", function () {
		clearTimeout(cT); var q = this.value.trim(), box = $("zd-cres");
		if (q.length < 2) { box.hidden = true; return; }
		cT = setTimeout(function () {
			L.index().then(function (idx) {
				var r = BD.search(idx, q, 8);
				box.innerHTML = r.length ? r.map(function (p) { return '<button type="button" data-id="' + esc(p.id) + '" data-dob="' + esc(p.dob) + '">' + esc(p.name) + " <span>" + esc(BD.dobText(p.dob)) + "</span></button>"; }).join("") : '<p class="zd-none">No one by that name in the list.</p>';
				box.hidden = false;
			});
		}, 150);
	});
	$("zd-cq").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = $("zd-cres").querySelector("[data-id]"); if (b) b.click(); } });
	$("zd-cres").addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (!b) return; $("zd-cres").hidden = true; $("zd-cq").value = ""; pickCmp(b.getAttribute("data-id"), b.getAttribute("data-dob")); });
	function pickCmp(id, dob) {
		return L.person(id, dob).then(function (p) { if (!p) return; CMP = p; renderCmp(); if (CHART || ME) setUrl(readForm()); else history.replaceState(null, "", location.pathname + "?p=" + id); });
	}
	function renderCmp() {
		var box = $("zd-cmp");
		if (!CMP) { box.innerHTML = ""; return; }
		var p = CMP, q = ZD.quick(p.y, p.mo, p.d), mine = CHART, rows = [];
		function sgn(s, alt) { return s ? s.glyph + " " + s.name + (alt ? " or " + alt.name + ' <span class="zd-flag" title="It changed sign that day; the birth time decides">?</span>' : "") : "—"; }
		var amb = {}; if (mine) mine.ambiguous.forEach(function (a) { amb[a.id] = a; });
		function mySign(id) { if (!mine) return null; if (amb[id] && !mine.timeKnown) return sgn(amb[id].from, amb[id].to); return sgn(mine.by[id].sign); }
		rows.push(["Sun sign", mySign("sun"), sgn(q.sun, q.sunAlt), mine && mine.by.sun.sign.i === q.sun.i && !q.sunAlt]);
		rows.push(["Moon sign", mySign("moon"), sgn(q.moon, q.moonAlt), mine && !amb.moon && !q.moonAlt && mine.by.moon.sign.i === q.moon.i]);
		rows.push(["Sun element", mine ? mine.by.sun.sign.element : null, q.sun.element + (q.sunAlt ? " / " + q.sunAlt.element : ""), mine && mine.by.sun.sign.element === q.sun.element && !q.sunAlt]);
		rows.push(["Chinese zodiac", mine ? mine.chinese.emoji + " " + mine.chinese.element + " " + mine.chinese.animal : null, q.chinese.emoji + " " + q.chinese.element + " " + q.chinese.animal, mine && mine.chinese.animal === q.chinese.animal]);
		rows.push(["Rising sign", mine && mine.asc !== undefined ? sgn(mine.ascSign.sign) : null, "unknown (no birth time)", false]);
		var match = rows.filter(function (r) { return r[3]; }).map(function (r) { return r[0].toLowerCase().replace("chinese", "Chinese"); });
		var h = '<div class="tu-table-wrap"><table class="tu-table zd-ctab"><thead><tr><th></th><th>You' + (ME && ME.y ? " (" + esc(BD.dateText(ME.mo, ME.d, ME.y)) + ")" : "") + "</th><th>" + personLink(p) + " (" + esc(BD.dateText(p.mo, p.d, p.y)) + ")</th></tr></thead><tbody>" +
			rows.map(function (r) { return "<tr" + (r[3] ? ' class="zd-match"' : "") + "><th>" + r[0] + "</th><td>" + (r[1] || '<span class="zd-muted">' + (mine ? "needs your birth time and place" : "type your birthday above") + "</span>") + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>";
		h += mine ? '<p class="zd-cmpsum">' + (match.length ? "You share the same " + match.join(", ").replace(/, ([^,]*)$/, " and $1") + " with " + esc(p.name) + "." : "No sign in common with " + esc(p.name) + ".") + (BD.dayGap(ME.mo, ME.d, p.mo, p.d) === 0 ? " You even share a birthday!" : "") + "</p>" : "";
		h += '<p class="zd-cmplinks"><a href="/birthday?d=' + BD.iso(p) + '">Who else was born on ' + esc(BD.dateText(p.mo, p.d)) + "</a></p>";
		box.innerHTML = h;
	}

	$("zd-copy").addEventListener("click", function () {
		var u = location.href;
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied (it contains the birth details you typed)"); }, function () { prompt("Copy this link:", u); });
	});

	/* ---------- start ---------- */
	var Q = new URLSearchParams(location.search);
	if (Q.get("d")) { var dt = ZD.parseDate(Q.get("d")); if (dt) $("zd-date").value = dt.y ? BD.dateText(dt.mo, dt.d, dt.y) : BD.dateText(dt.mo, dt.d); }
	var tq = ZD.parseTime(Q.get("t") || ""); if (tq) $("zd-time").value = BD.pad(tq.h) + ":" + BD.pad(tq.m);
	if (Q.get("tz") && ZD.validZone(Q.get("tz"))) $("zd-tz").value = Q.get("tz");
	if (Q.get("ll") && ZD.parseLatLon(Q.get("ll"))) $("zd-ll").value = Q.get("ll").replace(",", ", ");
	if (Q.get("pl")) $("zd-place").value = Q.get("pl").slice(0, 60);
	if (Q.get("h") === "equal") $("zd-houses").value = "equal";
	var pId = /^[QX][\w-]{1,60}$/.test(Q.get("p") || "") ? Q.get("p") : null;
	function start() { if ($("zd-date").value) run(); else updOffset(); }
	if (pId) {
		L.index().then(function (idx) { var r = idx.filter(function (x) { return x[0] === pId; })[0]; return r ? pickCmp(r[0], r[2]) : null; }).then(start, start);
	} else start();
})();
