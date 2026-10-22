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
