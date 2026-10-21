/* MES "Type it in words" (2026-10-21): a natural-language date / time / time-zone reader that runs entirely in the browser (no AI service,
 * no server, works offline) plus a small input widget that fills a page's own date, time and time-zone fields.
 *   MESWhen.parse("October 28, 2026 Wednesday at 10:00 AM PCT", {now, zone, order, futureOnly})
 *     -> {ok, date:"2026-10-28", time:"10:00", zone:"America/Vancouver", zoneLabel, ms, weekday:{given, actual, ok, suggest}, notes[], confidence}
 *     or {ok:false, error}
 *   MESWhen.parseRange("from Oct 1 to Dec 25 2026") -> {ok, a, b}
 *   MESWhen.attach({anchor, date, time, zone, onApply, ...}) -> the widget (browser only)
 * Node: require('./mes.fm/main_js/when-parse.js'); tests: node tool_apps_src/when-parse-tests.js
 */
(function (root) {
	"use strict";
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	function localZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }
	var FMT = {};
	function validZone(z) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch (e) { return false; } }
	function wallIn(ms, zone) {
		var f = FMT[zone] || (FMT[zone] = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
		var o = {}; f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
		var h = +o.hour; if (h === 24) h = 0;
		return { y: +o.year, mo: +o.month, d: +o.day, h: h, mi: +o.minute, s: +o.second };
	}
	function offsetAt(ms, zone) { var w = wallIn(ms, zone); return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000); }
	// wall clock in zone -> instant; a time in the spring-forward gap moves forward, a repeated one takes the first
	function toInstant(y, mo, d, h, mi, zone) {
		var guess = Date.UTC(y, mo - 1, d, h, mi), c = [guess - offsetAt(guess - 86400000, zone) * 60000, guess - offsetAt(guess + 86400000, zone) * 60000];
		for (var i = 0; i < 2; i++) { var w = wallIn(c[i], zone); if (w.h === h && w.mi === mi && w.d === d) return c[i]; }
		return Math.max(c[0], c[1]);
	}
	function dim(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
	function dayNum(y, mo, d) { return Math.round(Date.UTC(y, mo - 1, d) / 86400000); }
	function fromNum(n) { var x = new Date(n * 86400000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; }
	function wdOf(y, mo, d) { return new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); }
	function addMonths(y, mo, d, n) { var t = (y * 12 + mo - 1) + n, yy = Math.floor(t / 12), mm = t - yy * 12 + 1; return { y: yy, mo: mm, d: Math.min(d, dim(yy, mm)) }; }
	function easter(y) {
		var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
			h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
		return { mo: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
	}
	var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	function dText(y, mo, d) { return DAYS[wdOf(y, mo, d)].slice(0, 3) + " " + d + " " + MONTHS[mo - 1].slice(0, 3) + " " + y; }
	function iso(y, mo, d) { return y + "-" + pad(mo) + "-" + pad(d); }

	/* ---------- time zones ---------- */
	// abbreviation / word -> candidate zones (the visitor's own zone wins when it is one of them), label, and the UTC offsets of the
	// standard ("std") or daylight ("dst") variant, so "PST in October" can be noted
	var NA_P = ["America/Los_Angeles", "America/Vancouver", "America/Tijuana"], NA_M = ["America/Denver", "America/Edmonton", "America/Boise", "America/Phoenix"],
		NA_C = ["America/Chicago", "America/Winnipeg", "America/Mexico_City", "America/Regina"], NA_E = ["America/New_York", "America/Toronto", "America/Detroit"],
		CET = ["Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna", "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen", "Europe/Warsaw", "Europe/Prague", "Europe/Zurich", "Europe/Budapest", "Europe/Belgrade"],
		EET = ["Europe/Athens", "Europe/Helsinki", "Europe/Bucharest", "Europe/Kyiv", "Europe/Kiev", "Europe/Sofia", "Europe/Riga", "Europe/Vilnius", "Europe/Tallinn"],
		AUE = ["Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Australia/Canberra"];
	var Z = {
		pt: [NA_P, "Pacific time"], pct: [NA_P, "Pacific time", null, "PCT read as Pacific time"], pst: [NA_P, "Pacific time", -480], pdt: [NA_P, "Pacific time", -420], pacific: [NA_P, "Pacific time"],
		mt: [NA_M, "Mountain time"], mst: [NA_M, "Mountain time", -420], mdt: [NA_M, "Mountain time", -360], mountain: [NA_M, "Mountain time"],
		ct: [NA_C, "Central time"], cdt: [NA_C, "Central time", -300], central: [NA_C, "Central time"],
		cst: [NA_C, "Central time", -360, "CST read as US / Canada Central time (it can also mean China Standard Time: type Beijing or UTC+8 for that)", ["Asia/Shanghai", "China Standard Time", 480, "CST read as China Standard Time"]],
		et: [NA_E, "Eastern time"], est: [NA_E, "Eastern time", -300], edt: [NA_E, "Eastern time", -240], eastern: [NA_E, "Eastern time"],
		at: null, ast: [["America/Halifax"], "Atlantic time", -240], adt: [["America/Halifax"], "Atlantic time", -180], atlantic: [["America/Halifax"], "Atlantic time"],
		nst: [["America/St_Johns"], "Newfoundland time", -210], ndt: [["America/St_Johns"], "Newfoundland time", -150], newfoundland: [["America/St_Johns"], "Newfoundland time"],
		akt: [["America/Anchorage"], "Alaska time"], akst: [["America/Anchorage"], "Alaska time", -540], akdt: [["America/Anchorage"], "Alaska time", -480], alaska: [["America/Anchorage"], "Alaska time"],
		hst: [["Pacific/Honolulu"], "Hawaii time"], hast: [["Pacific/Honolulu"], "Hawaii time"], hawaii: [["Pacific/Honolulu"], "Hawaii time"], hawaiian: [["Pacific/Honolulu"], "Hawaii time"],
		utc: [["UTC"], "UTC"], gmt: [["UTC"], "GMT (UTC)"], z: [["UTC"], "UTC"], zulu: [["UTC"], "UTC"],
		bst: [["Europe/London"], "UK time", 60, "BST read as British Summer Time (UK)", ["Asia/Dhaka", "Bangladesh time", 360, "BST read as Bangladesh Standard Time"]],
		wet: [["Europe/Lisbon"], "Western European time", 0], west: [["Europe/Lisbon"], "Western European time", 60],
		cet: [CET, "Central European time", 60], cest: [CET, "Central European time", 120], met: [CET, "Central European time", 60],
		eet: [EET, "Eastern European time", 120], eest: [EET, "Eastern European time", 180], msk: [["Europe/Moscow"], "Moscow time"],
		ist: [["Asia/Kolkata"], "India time", 330, "IST read as India Standard Time (it can also mean Irish or Israel time: type Dublin or Jerusalem for those)", ["Europe/Dublin", "Irish time", 60, "IST read as Irish Standard Time"], ["Asia/Jerusalem", "Israel time", 120, "IST read as Israel Standard Time"]],
		pkt: [["Asia/Karachi"], "Pakistan time"], ict: [["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Phnom_Penh", "Asia/Vientiane"], "Indochina time (UTC+7)"],
		wib: [["Asia/Jakarta"], "Western Indonesia time"], sgt: [["Asia/Singapore"], "Singapore time"], hkt: [["Asia/Hong_Kong"], "Hong Kong time"], pht: [["Asia/Manila"], "Philippine time"],
		jst: [["Asia/Tokyo"], "Japan time"], kst: [["Asia/Seoul"], "Korea time"],
		awst: [["Australia/Perth"], "Western Australia time"], acst: [["Australia/Adelaide", "Australia/Darwin"], "Central Australia time", 570], acdt: [["Australia/Adelaide"], "Central Australia time", 630],
		aet: [AUE, "Eastern Australia time"], aest: [AUE.concat(["Australia/Brisbane"]), "Eastern Australia time", 600], aedt: [AUE, "Eastern Australia time", 660],
		nzt: [["Pacific/Auckland"], "New Zealand time"], nzst: [["Pacific/Auckland"], "New Zealand time", 720], nzdt: [["Pacific/Auckland"], "New Zealand time", 780],
		sast: [["Africa/Johannesburg"], "South Africa time"], cat: [["Africa/Maputo"], "Central Africa time"], eat: [["Africa/Nairobi"], "East Africa time"], wat: [["Africa/Lagos"], "West Africa time"],
		brt: [["America/Sao_Paulo"], "Brasília time"], art: [["America/Argentina/Buenos_Aires"], "Argentina time"], gst: [["Asia/Dubai"], "Gulf time"]
	};
	delete Z.at;
	// these are also English words: only read as a zone when typed in capitals
	var CAPS_ONLY = { cat: 1, eat: 1, art: 1, met: 1, west: 1, wet: 1, wat: 1, z: 1, ct: 1, mt: 1, et: 1, ast: 1, central: 0 };
	var ALIAS = {
		nyc: "America/New_York", "new york city": "America/New_York", washington: "America/New_York", dc: "America/New_York", boston: "America/New_York", miami: "America/New_York", atlanta: "America/New_York", philadelphia: "America/New_York",
		montreal: "America/Toronto", ottawa: "America/Toronto", quebec: "America/Toronto", dallas: "America/Chicago", houston: "America/Chicago", austin: "America/Chicago", "st louis": "America/Chicago",
		seattle: "America/Los_Angeles", "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles", portland: "America/Los_Angeles", "san diego": "America/Los_Angeles", "las vegas": "America/Los_Angeles", "silicon valley": "America/Los_Angeles",
		calgary: "America/Edmonton", banff: "America/Edmonton", "salt lake city": "America/Denver", victoria: "America/Vancouver", "bc": "America/Vancouver", "british columbia": "America/Vancouver", surrey: "America/Vancouver", burnaby: "America/Vancouver",
		hanoi: "Asia/Ho_Chi_Minh", saigon: "Asia/Ho_Chi_Minh", hcmc: "Asia/Ho_Chi_Minh", "ho chi minh city": "Asia/Ho_Chi_Minh", vietnam: "Asia/Ho_Chi_Minh", "da nang": "Asia/Ho_Chi_Minh",
		beijing: "Asia/Shanghai", china: "Asia/Shanghai", shenzhen: "Asia/Shanghai", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata", bangalore: "Asia/Kolkata", bengaluru: "Asia/Kolkata", chennai: "Asia/Kolkata", hyderabad: "Asia/Kolkata", india: "Asia/Kolkata",
		osaka: "Asia/Tokyo", kyoto: "Asia/Tokyo", japan: "Asia/Tokyo", korea: "Asia/Seoul", thailand: "Asia/Bangkok", philippines: "Asia/Manila", taiwan: "Asia/Taipei", indonesia: "Asia/Jakarta", bali: "Asia/Makassar",
		kyiv: "Europe/Kyiv", uk: "Europe/London", england: "Europe/London", britain: "Europe/London", scotland: "Europe/London", edinburgh: "Europe/London", manchester: "Europe/London", ireland: "Europe/Dublin",
		france: "Europe/Paris", germany: "Europe/Berlin", munich: "Europe/Berlin", frankfurt: "Europe/Berlin", spain: "Europe/Madrid", barcelona: "Europe/Madrid", italy: "Europe/Rome", milan: "Europe/Rome", netherlands: "Europe/Amsterdam",
		poland: "Europe/Warsaw", sweden: "Europe/Stockholm", norway: "Europe/Oslo", denmark: "Europe/Copenhagen", greece: "Europe/Athens", finland: "Europe/Helsinki", russia: "Europe/Moscow", turkey: "Europe/Istanbul", israel: "Asia/Jerusalem",
		uae: "Asia/Dubai", "abu dhabi": "Asia/Dubai", egypt: "Africa/Cairo", nigeria: "Africa/Lagos", kenya: "Africa/Nairobi", "south africa": "Africa/Johannesburg", "cape town": "Africa/Johannesburg",
		brazil: "America/Sao_Paulo", rio: "America/Sao_Paulo", "rio de janeiro": "America/Sao_Paulo", mexico: "America/Mexico_City", argentina: "America/Argentina/Buenos_Aires", "buenos aires": "America/Argentina/Buenos_Aires",
		"new zealand": "Pacific/Auckland", wellington: "Pacific/Auckland", canberra: "Australia/Sydney", "gold coast": "Australia/Brisbane", hawaii: "Pacific/Honolulu"
	};
	var CITY = null;
	function cities() {
		if (CITY) return CITY;
		CITY = {};
		var all = []; try { all = Intl.supportedValuesOf("timeZone"); } catch (e) {}
		all.forEach(function (z) {
			if (/^(Etc|Antarctica)\/|^America\/(Indiana|Kentucky|North_Dakota)\//.test(z) || z.indexOf("/") < 0) return;
			var c = z.split("/").pop().replace(/_/g, " ").toLowerCase();
			if (/^(wake|easter|midway|factory|chatham|casey|davis|troll|mawson|palmer|vostok|march|may|truk|jersey|guernsey|man|nome|eucla|hope)$/.test(c)) return;
			if (!CITY[c]) CITY[c] = z;
		});
		for (var k in ALIAS) if (validZone(ALIAS[k])) CITY[k] = ALIAS[k];
		return CITY;
	}
	function cityLabel(z) { return z.split("/").pop().replace(/_/g, " "); }
	function offsetZone(sign, h, m) {
		var min = (sign === "-" ? -1 : 1) * (h * 60 + m);
		if (min === 0) return { zone: "UTC", label: "UTC" };
		var label = "UTC" + (min < 0 ? "-" : "+") + h + (m ? ":" + pad(m) : "");
		if (!m && h <= 14) return { zone: "Etc/GMT" + (min < 0 ? "+" : "-") + h, label: label };
		var HALF = { "330": "Asia/Kolkata", "345": "Asia/Kathmandu", "570": "Australia/Darwin", "-210": "America/St_Johns", "210": "Asia/Tehran", "390": "Asia/Yangon", "270": "Asia/Kabul", "-570": "Pacific/Marquesas", "525": "Australia/Eucla", "765": "Pacific/Chatham" };
		if (HALF[String(min)]) return { zone: HALF[String(min)], label: label, note: label + " has no plain zone, so " + cityLabel(HALF[String(min)]) + " time was used" };
		return null;
	}

	/* ---------- the parser ---------- */
	var NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3 };
	var MON_RE = "(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)";
	var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
	function monNum(w) { return MON[w.slice(0, 3)]; }
	var WD_RE = "(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)";
	function wdNum(w) { return { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 }[w.slice(0, 2)]; }
	var FILLER = { on: 1, at: 1, the: 1, of: 1, and: 1, by: 1, around: 1, about: 1, approx: 1, approximately: 1, "@": 1, time: 1, starts: 1, start: 1, starting: 1, begins: 1, begin: 1, beginning: 1, is: 1, "it's": 1, its: 1, will: 1, be: 1, live: 1, livestream: 1, stream: 1, streaming: 1, event: 1, from: 1, in: 1, for: 1, date: 1, day: 1, "o'clock": 1, oclock: 1, local: 1, sharp: 1, please: 1, to: 1, until: 1, standard: 1, daylight: 1, summer: 1, zone: 1, timezone: 1, "-": 1, "+": 1, h: 1, hrs: 1 };
	function detectOrder() {
		try { var p = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(new Date(2026, 10, 28)); for (var i = 0; i < p.length; i++) { if (p[i].type === "day") return "dmy"; if (p[i].type === "month") return "mdy"; } } catch (e) {}
		return "mdy";
	}
	function err(msg) { return { ok: false, error: msg }; }

	function parse(text, opts) {
		opts = opts || {};
		var now = opts.now != null ? +opts.now : Date.now(), vz = opts.zone && validZone(opts.zone) ? opts.zone : localZone(), order = opts.order || detectOrder(), future = opts.futureOnly !== false;
		var o = String(text || "").replace(/[\u2013\u2014]/g, " - ").replace(/[\u2018\u2019]/g, "'").replace(/[,;()!?]/g, " ").replace(/\u00a0/g, " ");
		var s = o.toLowerCase(), caseOk = s.length === o.length;
		if (!s.trim()) return err("Type a date or a time, such as “Oct 28 2026 10 am PT” or “tomorrow at 6 pm”.");
		var R = { y: null, mo: null, d: null, h: null, mi: null, sec: 0, wd: null, wdMode: "", zone: null, zoneLabel: "", notes: [], guess: 0, rel: null, add: null, part: null, dayOnly: null, holiday: null, yearGiven: false, used: false };
		function blank(n) { return new Array(n + 1).join(" "); }
		function eat(re, fn) {
			s = s.replace(re, function () {
				var a = Array.prototype.slice.call(arguments), idx = a[a.length - 2], m = a.slice(0, a.length - 2); m.index = idx;
				var r = fn(m); if (r === false) return m[0]; R.used = true; return blank(m[0].length);
			});
		}
		function setTime(h, mi, ap, src) {
			if (R.h != null) return false;
			h = +h; mi = +(mi || 0);
			if (mi > 59) return false;
			if (ap) { ap = ap.charAt(0); if (h < 1 || h > 12) return false; h = h % 12 + (ap === "p" ? 12 : 0); }
			else if (h > 23) return false;
			R.h = h; R.mi = mi; return true;
		}
		function setDate(y, mo, d) { if (R.mo != null) return false; R.y = y == null ? null : +y; R.mo = +mo; R.d = +d; if (y != null) R.yearGiven = true; return true; }
		function yr(y) { y = +y; return y < 100 ? 2000 + y : y; }

		// 1. ISO date / date-time ("2026-10-28", "2026-10-28T10:00Z", "2026/10/28")
		eat(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[t ]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(a\.m\.|p\.m\.|am|pm)?(z|[+-]\d{2}:?\d{2})?)?(?![\d/a-z])/g, function (m) {
			if (+m[2] < 1 || +m[2] > 12) return false;
			if (!setDate(m[1], m[2], m[3])) return false;
			if (m[4] != null) setTime(m[4], m[5], m[7]);
			if (m[8]) { var zz = m[8] === "z" ? { zone: "UTC", label: "UTC" } : offsetZone(m[8].charAt(0), +m[8].slice(1, 3), +m[8].replace(":", "").slice(3, 5)); if (zz) { R.zone = zz.zone; R.zoneLabel = zz.label; } }
		});
		// 2. UTC / GMT offsets ("UTC+7", "GMT-05:00")
		eat(/\b(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?(?!\d)/g, function (m) {
			if (R.zone) return false;
			var zz = offsetZone(m[1], +m[2], +(m[3] || 0)); if (!zz) { R.notes.push("UTC" + m[1] + m[2] + (m[3] ? ":" + m[3] : "") + " is not a real time zone offset"); return; }
			R.zone = zz.zone; R.zoneLabel = zz.label; if (zz.note) R.notes.push(zz.note);
		});
		// 3. numeric dates ("10/28/2026", "28/10/2026", "28.10.2026", "10/28")
		eat(/(^|[^\d:/.])(\d{1,2})([/.])(\d{1,2})(?:\3(\d{4}|\d{2}))?(?![\d/.:])/g, function (m) {
			if (m[3] === "." && !m[5]) return false;
			if (R.mo != null) return false;
			var a = +m[2], b = +m[4], mo, d;
			if (a > 12 && b <= 12) { d = a; mo = b; }
			else if (b > 12 && a <= 12) { mo = a; d = b; }
			else if (a <= 12 && b <= 12) {
				if (order === "dmy") { d = a; mo = b; } else { mo = a; d = b; }
				if (a !== b) { R.guess++; R.notes.push("Read " + m[2] + m[3] + m[4] + " as " + d + " " + MONTHS[mo - 1] + (order === "dmy" ? " (day first" : " (month first") + ", as is usual where you are). Type the month's name if you meant " + MONTHS[d - 1] + " " + mo + "."); }
			} else return false;
			setDate(m[5] ? yr(m[5]) : null, mo, d);
		});
		// 4. times: "half past 6 pm", "quarter to 7", "10:00 AM", "10am", "22:30", "10h30", "noon", "midnight"
		eat(/\b(half|quarter|\d{1,2})\s+(past|after|to|before|til)\s+(\d{1,2})(?:\s*(a\.?m\.?|p\.?m\.?))?(?![\w:])/g, function (m) {
			var mins = m[1] === "half" ? 30 : m[1] === "quarter" ? 15 : +m[1];
			if (mins > 59 || (m[1] === "half" && /to|before|til/.test(m[2]))) return false;
			var h = +m[3]; if (h < 1 || h > 12 && !m[4]) { if (h > 23) return false; }
			var tot = h * 60 + (/past|after/.test(m[2]) ? mins : -mins); var hh = Math.floor(((tot % 1440) + 1440) % 1440 / 60), mm = ((tot % 60) + 60) % 60;
			if (m[4]) { var base = h % 12 + (m[4].charAt(0) === "p" ? 12 : 0); tot = base * 60 + (/past|after/.test(m[2]) ? mins : -mins); hh = Math.floor(((tot % 1440) + 1440) % 1440 / 60); mm = ((tot % 60) + 60) % 60; R.h = hh; R.mi = mm; return; }
			if (h <= 12) { R.bare = { h: hh, mi: mm, txt: m[0].trim() }; return; }
			R.h = hh; R.mi = mm;
		});
		eat(/\b(?:12\s*)?(noon|midday|midnight)\b/g, function (m) {
			if (R.h != null) return false;
			if (m[1] === "midnight") { R.h = 0; R.mi = 0; R.midnight = true; } else { R.h = 12; R.mi = 0; }
		});
		eat(/(^|[^\d:/.\w])(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm|a|p)?(?![\w:])/g, function (m) { if (!setTime(m[2], m[3], m[5])) return false; });
		eat(/\b(\d{1,2})[.h](\d{2})\s*(a\.m\.|p\.m\.|am|pm|a|p)?(?![\w:.])/g, function (m) { if (!m[3] && m[0].indexOf("h") < 0) return false; if (!setTime(m[1], m[2], m[3])) return false; });
		eat(/\b(\d{1,2})\s*(a\.m\.|p\.m\.|am|pm)(?![a-z])|\b(\d{1,2})(a|p)\b/g, function (m) { if (!setTime(m[1] || m[3], 0, m[2] || m[4])) return false; });
		eat(/\b([01]\d|2[0-3])([0-5]\d)\s*(?:h|hrs|hours)\b/g, function (m) { if (!setTime(m[1], m[2])) return false; });
		// 5. relative amounts: "in 3 days", "in 2 hours", "in half an hour", "3 days from now", "2 weeks ago"
		function unitAdd(n, u, sign) {
			u = u.charAt(0) === "m" && /^mo/.test(u) ? "mo" : u.charAt(0);
			n = n * sign;
			if (u === "m") return { min: n }; if (u === "h") return { min: n * 60 }; if (u === "d") return { days: n }; if (u === "w") return { days: n * 7 }; if (u === "mo") return { months: n }; return { months: n * 12 };
		}
		function num(w) { return /^\d/.test(w) ? parseFloat(w) : NUMW[w]; }
		eat(/\bin\s+half\s+an?\s+hour\b/g, function () { if (R.add) return false; R.add = { min: 30 }; });
		eat(/\bin\s+(an?|\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|couple of|a few)\s*(?:and\s+a\s+half\s+)?(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)\b(\s+and\s+a\s+half)?/g, function (m) {
			if (R.add) return false; var n = num(m[1].replace(/^a |of$/g, "").replace(/ of$/, "").trim().split(" ").pop()); if (n == null || isNaN(n)) return false;
			if (/and a half/.test(m[0])) n += 0.5; R.add = unitAdd(n, m[2], 1);
		});
		eat(/\b(an?|\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|years?|yrs?)\s+(from now|from today|later|ago|before now)\b/g, function (m) {
			if (R.add) return false; var n = num(m[1]); if (n == null) return false; R.add = unitAdd(n, m[2], /ago|before/.test(m[3]) ? -1 : 1);
		});
		// 6. holidays (next one when no year is given)
		var HOL = { "christmas eve": [12, 24], christmas: [12, 25], xmas: [12, 25], "christmas day": [12, 25], "new year's eve": [12, 31], "new years eve": [12, 31], "new year's day": [1, 1], "new years day": [1, 1], "new year's": [1, 1], "new years": [1, 1], "new year": [1, 1], halloween: [10, 31], "valentine's day": [2, 14], "valentines day": [2, 14], "valentine's": [2, 14], valentines: [2, 14], "canada day": [7, 1], "boxing day": [12, 26], "independence day": [7, 4], "fourth of july": [7, 4], "july 4th": [7, 4], "st patrick's day": [3, 17], "st. patrick's day": [3, 17], "st patricks day": [3, 17], "remembrance day": [11, 11], "veterans day": [11, 11] };
		eat(/\b(christmas eve|christmas day|christmas|xmas|new year'?s eve|new year'?s day|new year'?s|new year|halloween|valentine'?s day|valentine'?s|canada day|boxing day|independence day|fourth of july|st\.? patrick'?s day|remembrance day|veterans day|easter(?: sunday)?)\b/g, function (m) {
			if (R.mo != null || R.holiday) return false;
			if (/^easter/.test(m[1])) { R.holiday = "easter"; return; }
			var h = HOL[m[1]]; if (!h) return false; R.holiday = m[1]; R.mo = h[0]; R.d = h[1];
		});
		// 7. month-name dates
		eat(new RegExp("\\b(\\d{4})\\s+" + MON_RE + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b", "g"), function (m) { if (!setDate(m[1], monNum(m[2]), m[3])) return false; });
		eat(new RegExp("\\b" + MON_RE + "\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:\\s+(\\d{4}))?(?![\\d:])", "g"), function (m) {
			if (+m[2] < 1 || +m[2] > 31) return false; if (!setDate(m[3] || null, monNum(m[1]), m[2])) return false;
		});
		eat(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + MON_RE + "\\b\\.?(?:\\s+(\\d{4}))?(?![\\d:])", "g"), function (m) {
			if (+m[1] < 1 || +m[1] > 31) return false; if (!setDate(m[3] || null, monNum(m[2]), m[1])) return false;
		});
		eat(new RegExp("\\b" + MON_RE + "\\.?\\s+(\\d{4})\\b", "g"), function (m) {
			if (R.mo != null) return false; setDate(m[2], monNum(m[1]), 1); R.notes.push("No day given: used the 1st of " + MONTHS[R.mo - 1]); R.guess++;
		});
		// a year on its own ("Oct 28 ... 2026", "Easter 2027")
		eat(/\b(1[89]\d{2}|2\d{3})\b/g, function (m) { if (R.y != null) return false; R.y = +m[1]; R.yearGiven = true; });
		// "the 28th"
		eat(/\b(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b(?!\s*(?:century))/g, function (m) { if (R.mo != null || R.dayOnly) return false; if (+m[1] < 1 || +m[1] > 31) return false; R.dayOnly = +m[1]; });
		// 8. weekdays ("Wednesday", "next Fri", "this Saturday", "Monday after next")
		eat(new RegExp("\\b(next|this|coming|last|on)?\\s*" + WD_RE + "\\b\\.?(\\s+after\\s+next)?", "g"), function (m) {
			if (R.wd != null) return false; R.wd = wdNum(m[2]); R.wdMode = m[3] ? "afternext" : (m[1] === "on" ? "" : m[1] || ""); R.wdText = DAYS[R.wd];
		});
		// 9. relative day words and parts of the day
		eat(/\b(day after tomorrow|today|tonight|tonite|tomorrow|tomorow|tmrw|tmr|tmrw|yesterday|now|next week|next month|next year|this weekend|weekend|this week)\b/g, function (m) {
			if (R.rel) return false; R.rel = m[1];
			if (m[1] === "tonight" || m[1] === "tonite") R.part = R.part || "tonight";
		});
		eat(/\b(this\s+)?(morning|afternoon|evening|night|noonish|lunchtime|lunch)\b/g, function (m) { if (R.part && R.part !== "tonight") return false; R.part = m[2]; });
		// 10. a bare hour: "at 6", "6 o'clock", "@ 7"
		eat(/(?:\bat|@|\bby|\baround|\babout)\s*(\d{1,2})(?:\s*o'?clock)?(?![\d:\w])|\b(\d{1,2})\s*o'?clock\b/g, function (m) {
			if (R.h != null || R.bare) return false; var h = +(m[1] || m[2]); if (h > 23) return false;
			if (h > 12 || h === 0) { R.h = h; R.mi = 0; return; }
			R.bare = { h: h, mi: 0, txt: m[0].trim() };
		});
		// 11. time zones: abbreviations / words, then city names in what is left
		var zoneHit = null;
		function takeZone(key, origWord) {
			var e = Z[key]; if (!e) return false;
			if (CAPS_ONLY[key] && caseOk && origWord !== origWord.toUpperCase()) return false;
			var pick = e, alts = e.slice(4);
			for (var i = 0; i < alts.length; i++) if (alts[i][0] === vz) pick = [[alts[i][0]], alts[i][1], alts[i][2], alts[i][3]];
			var zs = pick[0], z = zs.indexOf(vz) >= 0 ? vz : zs[0];
			if (!validZone(z)) z = zs.filter(validZone)[0]; if (!z) return false;
			zoneHit = { zone: z, label: pick[1], std: pick[2], note: pick[3], key: key, cands: zs.filter(validZone) };
			return true;
		}
		if (!R.zone) eat(/(^|[^\w])(pacific|mountain|central|eastern|atlantic|alaska|hawaiian|hawaii|newfoundland)(?:\s+(?:standard|daylight))?\s+time\b|(^|[^\w])(pacific|mountain|eastern|atlantic|alaska|hawaii|newfoundland)\b/g, function (m) {
			if (zoneHit) return false; if (!takeZone(m[2] || m[4], m[2] || m[4])) return false;
		});
		if (!R.zone && !zoneHit) eat(/\b([a-z]{1,5})\b/g, function (m) {
			if (zoneHit || !Z[m[1]]) return false;
			var ow = caseOk ? o.substr(m.index, m[0].length) : m[1];
			if (!takeZone(m[1], ow)) return false;
		});
		if (zoneHit) { R.zone = zoneHit.zone; R.zoneLabel = zoneHit.label; R.zoneStd = zoneHit.std; R.zoneKey = zoneHit.key; R.zoneCands = zoneHit.cands; if (zoneHit.note) R.notes.push(zoneHit.note); }
		// leftover words: city names (longest first), then anything unknown
		var words = s.replace(/[.]/g, " ").split(/\s+/).filter(Boolean), ignored = [];
		if (!R.zone) {
			var C = cities();
			for (var n = 4; n >= 1 && !R.zone; n--) {
				for (var i = 0; i + n <= words.length; i++) {
					var ph = words.slice(i, i + n).join(" ");
					if (C[ph]) { R.zone = C[ph]; R.zoneLabel = cityLabel(ph.split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("_")) + " time"; if (ALIAS[ph] && cityLabel(C[ph]).toLowerCase() !== ph) R.zoneLabel = ph.replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/^(Nyc|Uk|Uae|Dc|Sf|Hcmc|Bc)$/, function (x) { return x.toUpperCase(); }) + " time (" + cityLabel(C[ph]) + ")"; words.splice(i, n); R.used = true; break; }
				}
			}
		}
		words.forEach(function (w) { if (!FILLER[w] && !/^[\d:.\-+/]+$/.test(w)) ignored.push(w); else if (/^\d+$/.test(w)) ignored.push(w); });
		if (!R.used) return err("No date or time found. Try something like “Oct 28 2026 10 am PT”, “tomorrow at 6 pm” or “next Friday 19:30 London”.");
		if (ignored.length) { R.notes.push("Not used: " + ignored.map(function (w) { return "“" + w + "”"; }).join(", ")); R.guess += Math.min(ignored.length, 3) * 0.5; }

		/* ---------- resolve ---------- */
		var bz = R.zone || vz, T = wallIn(now, bz), todayN = dayNum(T.y, T.mo, T.d), out = { notes: R.notes };
		var dateN = null, explicitDate = false;
		if (R.bare && R.h == null) {
			var bh = R.bare.h, ap = R.part === "morning" ? "a" : (R.part && R.part !== "lunchtime" && R.part !== "lunch") ? "p" : "";
			if (!ap) { ap = bh === 12 ? "p" : bh <= 7 ? "p" : "a"; R.guess++; R.notes.push("Read “" + R.bare.txt + "” as " + ((bh % 12) || 12) + (R.bare.mi ? ":" + pad(R.bare.mi) : ":00") + (ap === "p" ? " PM" : " AM") + ": add am or pm to be sure"); }
			R.h = bh % 12 + (ap === "p" ? 12 : 0); R.mi = R.bare.mi;
		}
		if (R.add) {
			if (R.add.min != null) {
				var w = wallIn(now + R.add.min * 60000, bz); dateN = dayNum(w.y, w.mo, w.d);
				if (R.h == null) { R.h = w.h; R.mi = w.mi; }
				if (!R.zone) { R.zone = vz; R.zoneLabel = "your time (" + cityLabel(vz) + ")"; }
			} else if (R.add.days != null) dateN = todayN + Math.round(R.add.days);
			else { var am = addMonths(T.y, T.mo, T.d, Math.round(R.add.months)); dateN = dayNum(am.y, am.mo, am.d); }
		}
		if (R.mo != null || R.holiday === "easter") {
			explicitDate = true;
			var y = R.y;
			if (R.holiday === "easter") { var ey = y || T.y, ee = easter(ey); if (!y && dayNum(ey, ee.mo, ee.d) < todayN && future) { ey++; ee = easter(ey); } y = ey; R.mo = ee.mo; R.d = ee.d; }
			if (y == null) {
				y = T.y; if (R.d <= dim(y, R.mo) && dayNum(y, R.mo, R.d) < todayN && future) y++;
				if (R.wd != null) { for (var k = 0; k < 8; k++) { var yy = y + k; if (R.d <= dim(yy, R.mo) && wdOf(yy, R.mo, R.d) === R.wd) { y = yy; break; } } }
				if (y !== T.y) R.notes.push("No year given: used " + y);
			}
			if (R.d < 1 || R.d > dim(y, R.mo)) return err(MONTHS[R.mo - 1] + " " + y + " has only " + dim(y, R.mo) + " days.");
			dateN = dayNum(y, R.mo, R.d);
		} else if (R.dayOnly) {
			explicitDate = true;
			var my = T.y, mm = T.mo; if (R.dayOnly < T.d && future) { mm++; if (mm > 12) { mm = 1; my++; } }
			while (R.dayOnly > dim(my, mm)) { mm++; if (mm > 12) { mm = 1; my++; } }
			dateN = dayNum(my, mm, R.dayOnly);
		}
		if (R.rel && dateN == null) {
			var r = R.rel;
			if (R.zone && R.zone !== vz && /^(today|tonight|tonite|tom|tmr|day after|yesterday)/.test(r)) { var V = wallIn(now, vz); if (dayNum(V.y, V.mo, V.d) !== todayN) R.notes.push("“" + r.replace(/^./, function (c) { return c.toUpperCase(); }) + "” counted from today in " + R.zoneLabel.replace(/ time.*$/, "") + " (" + dText(T.y, T.mo, T.d) + "), which is not today where you are"); }
			if (r === "today" || r === "tonight" || r === "tonite" || r === "now" || r === "this week") dateN = todayN;
			else if (/^tom|^tmr/.test(r)) dateN = todayN + 1;
			else if (r === "day after tomorrow") dateN = todayN + 2;
			else if (r === "yesterday") dateN = todayN - 1;
			else if (r === "next week") { dateN = todayN + 7; if (R.wd == null) R.notes.push("“Next week” read as one week from today"); }
			else if (r === "next month") { var nm = addMonths(T.y, T.mo, T.d, 1); dateN = dayNum(nm.y, nm.mo, nm.d); }
			else if (r === "next year") { var ny = addMonths(T.y, T.mo, T.d, 12); dateN = dayNum(ny.y, ny.mo, ny.d); }
			else if (/weekend/.test(r)) { var wd0 = wdOf(T.y, T.mo, T.d); dateN = todayN + (wd0 === 6 || wd0 === 0 ? 0 : 6 - wd0); }
			if (r === "now" && R.h == null) { R.h = T.h; R.mi = T.mi; if (!R.zone) { R.zone = vz; R.zoneLabel = "your time (" + cityLabel(vz) + ")"; } }
		}
		var wk = null;
		if (R.wd != null) {
			if (dateN != null && (explicitDate || R.rel === "today" || /^tom/.test(R.rel || "") || R.add)) {
				var f = fromNum(dateN), act = wdOf(f.y, f.mo, f.d);
				wk = { given: DAYS[R.wd], actual: DAYS[act], ok: act === R.wd };
				if (!wk.ok) {
					var back = (act - R.wd + 7) % 7, fwd = (R.wd - act + 7) % 7, sn = fwd <= back ? dateN + fwd : dateN - back, sf = fromNum(sn);
					wk.suggest = iso(sf.y, sf.mo, sf.d); wk.suggestText = dText(sf.y, sf.mo, sf.d);
					R.notes.unshift(dText(f.y, f.mo, f.d) + " is a " + DAYS[act] + ", not a " + DAYS[R.wd] + ". The nearest " + DAYS[R.wd] + " is " + wk.suggestText + ".");
					R.guess += 2;
				}
			} else {
				var base = dateN != null ? dateN : todayN, bw = (fromNum(base), wdOf(fromNum(base).y, fromNum(base).mo, fromNum(base).d)), diff = (R.wd - bw + 7) % 7;
				if (R.wdMode === "last") { diff = diff - 7; if (diff === 0) diff = -7; }
				else if (diff === 0 && dateN == null) {
					var tm = R.h != null ? R.h * 60 + R.mi : null;
					if (R.wdMode === "next" || (future && tm != null && tm <= T.h * 60 + T.mi)) diff = 7;
				} else if (diff === 0 && R.wdMode === "next") diff = 7;
				if (R.wdMode === "afternext") diff += 7;
				dateN = base + diff;
				if (R.wdMode === "next" && R.rel !== "next week") R.notes.push("“Next " + DAYS[R.wd] + "” read as the coming one: type “" + DAYS[R.wd] + " after next” for the one after");
				wk = { given: DAYS[R.wd], actual: DAYS[R.wd], ok: true };
			}
		}
		if (dateN == null && R.h != null) {
			dateN = todayN;
			if (future && R.h * 60 + R.mi <= T.h * 60 + T.mi && !R.zoneOnly) { dateN++; R.notes.push("That time has passed today, so tomorrow was used"); }
		}
		if (R.h == null && R.part) { var P = { morning: 9, afternoon: 15, evening: 19, night: 21, tonight: 20, lunchtime: 12, lunch: 12, noonish: 12 }; R.h = P[R.part]; R.mi = 0; R.notes.push("No time given: used " + ((R.h % 12) || 12) + ":00 " + (R.h < 12 ? "AM" : "PM") + " for “" + R.part + "”"); R.guess++; }
		if (dateN == null && R.zone) { dateN = todayN; R.notes.push("Only a time zone was found"); R.guess += 2; }
		if (dateN == null) return err("No date or time found. Try something like “Oct 28 2026 10 am PT” or “tomorrow at 6 pm”.");
		var D = fromNum(dateN);
		if (R.midnight) R.notes.push("Midnight read as 00:00 at the start of " + dText(D.y, D.mo, D.d));
		out.ok = true; out.date = iso(D.y, D.mo, D.d); out.y = D.y; out.mo = D.mo; out.d = D.d;
		out.time = R.h != null ? pad(R.h) + ":" + pad(R.mi) : null;
		out.zone = R.zone || null; out.zoneLabel = R.zone ? R.zoneLabel : ""; out.zoneGiven = !!R.zone;
		out.weekday = wk || { given: null, actual: DAYS[wdOf(D.y, D.mo, D.d)], ok: true };
		out.dateText = dText(D.y, D.mo, D.d);
		if (out.time != null) {
			out.ms = toInstant(D.y, D.mo, D.d, R.h, R.mi, R.zone || vz);
			var back2 = wallIn(out.ms, R.zone || vz); if (back2.h !== R.h || back2.mi !== R.mi) R.notes.push(pad(R.h) + ":" + pad(R.mi) + " does not exist that day (the clocks spring forward): " + pad(back2.h) + ":" + pad(back2.mi) + " was used");
			// e.g. B.C. keeps UTC-7 all year from Nov 2026 while the US Pacific coast goes back to UTC-8: say which one was used
			var split = false;
			if (R.zoneCands && R.zoneCands.length > 1) {
				var other = R.zoneCands[0] === R.zone ? R.zoneCands[1] : R.zoneCands[0], o1 = offsetAt(out.ms, R.zone), o2 = offsetAt(out.ms, other);
				if (o1 !== o2) { split = true; R.notes.push("On " + out.dateText + " " + cityLabel(R.zone) + " is " + offLabel(o1) + " but " + cityLabel(other) + " is " + offLabel(o2) + ": used " + cityLabel(R.zone) + (R.zone === vz ? " (your time zone)" : "") + ". Type “" + cityLabel(other) + "” for the other"); R.zoneLabel += " (" + cityLabel(R.zone) + ")"; out.zoneLabel = R.zoneLabel; }
			}
			if (R.zoneStd != null && R.zone && !split) { var off = offsetAt(out.ms, R.zone); if (off !== R.zoneStd) { var k2 = R.zoneKey.toUpperCase(); R.notes.push(k2 + " is " + (Math.abs(off - R.zoneStd) === 60 ? (off > R.zoneStd ? "standard" : "daylight") + " time, but on " + out.dateText + " " + R.zoneLabel.replace(/ \(.*$/, "") + " is on " + (off > R.zoneStd ? "daylight" : "standard") + " time" : "not the offset in use that day") + ": used " + R.zoneLabel.replace(/ \(.*$/, "") + " as it is that day (" + offLabel(off) + ")"); } }
		}
		out.confidence = Math.max(0.1, Math.round((1 - R.guess * 0.15) * 100) / 100);
		return out;
	}
	function offLabel(min) { var a = Math.abs(min); return "UTC" + (min < 0 ? "-" : "+") + Math.floor(a / 60) + (a % 60 ? ":" + pad(a % 60) : ""); }

	// "from X to Y", "X - Y", "between X and Y", "X until Y", "X for 90 days"
	function parseRange(text, opts) {
		var t = String(text || "").replace(/[\u2013\u2014]/g, " - ").trim();
		var forM = /^(.*?)\s+(?:for|plus|\+)\s+(\d+)\s*(days?|weeks?|months?|years?)\s*$/i.exec(t);
		if (forM) {
			var a0 = parse(forM[1].replace(/^\s*(from|starting)\s+/i, ""), opts); if (!a0.ok) return a0;
			var n = +forM[2], u = forM[3].charAt(0).toLowerCase(), dn = dayNum(a0.y, a0.mo, a0.d), b;
			if (u === "d") b = fromNum(dn + n); else if (u === "w") b = fromNum(dn + 7 * n); else b = addMonths(a0.y, a0.mo, a0.d, u === "m" ? n : 12 * n);
			var bo = { ok: true, y: b.y, mo: b.mo, d: b.d, date: iso(b.y, b.mo, b.d), dateText: dText(b.y, b.mo, b.d), time: a0.time, zone: a0.zone, notes: [] };
			return { ok: true, a: a0, b: bo, notes: a0.notes };
		}
		var lead = /^\s*(from|between)\s+/i.exec(t), body = lead ? t.slice(lead[0].length) : t, isBetween = lead && /between/i.test(lead[1]);
		var sep = isBetween ? /\s+(?:and|to|-|&)\s+/gi : /\s+(?:to|until|till|til|through|thru|-|and)\s+/gi, m, best = null;
		while ((m = sep.exec(body))) {
			var A = body.slice(0, m.index), B = body.slice(m.index + m[0].length);
			var pa = parse(A, opts), pb = parse(B, opts);
			if (pa.ok && pb.ok) {
				// "Oct 1 to 25 2026": carry the year / month of the end to the start
				best = { ok: true, a: pa, b: pb, notes: pa.notes.concat(pb.notes) };
				var yb = /\b(1[89]\d{2}|2\d{3})\b/.exec(B), ya = /\b(1[89]\d{2}|2\d{3})\b/.exec(A);
				if (yb && !ya && pa.y !== pb.y) { var pa2 = parse(A + " " + yb[1], opts); if (pa2.ok && dayNum(pa2.y, pa2.mo, pa2.d) <= dayNum(pb.y, pb.mo, pb.d)) { best.a = pa2; best.notes = pa2.notes.concat(pb.notes).filter(function (x) { return !/^No year given/.test(x); }); } }
				break;
			}
		}
		if (best) return best;
		var one = parse(t, opts); if (one.ok) return { ok: true, a: one, b: null, notes: one.notes };
		return err("Type two dates, such as “from Oct 1 to Dec 25 2026” or “today until Christmas”.");
	}

	var API = { parse: parse, parseRange: parseRange, toInstant: toInstant, wallIn: wallIn, offsetAt: offsetAt, easter: easter, cities: cities, version: 1 };
	if (typeof module !== "undefined" && module.exports) { module.exports = API; return; }
	root.MESWhen = API;

	/* ---------- the widget ---------- */
	var CSS = ".mes-when{margin:0 0 0.8em}.mes-when__lab{display:block;font-weight:600;font-size:0.92em;margin:0 0 0.3em;color:#333}.mes-when__lab span{font-weight:400;color:#555}" +
		".mes-when__row{display:flex;gap:0.5em;align-items:stretch}.mes-when .mes-when__in{flex:1 1 auto;min-width:0;font:inherit;font-size:1em;padding:0.55em 0.7em;border:1px solid #b8c0cc;border-radius:0.45em;background:#fff;color:#222;box-sizing:border-box}" +
		".mes-when .mes-when__in:focus{outline:2px solid #277bb6;outline-offset:1px;border-color:#277bb6}.mes-when .mes-when__use{font:inherit;font-weight:600;padding:0.5em 1em;border-radius:0.45em;border:1px solid #1f6aa0;background:#1f6aa0;color:#fff;cursor:pointer;white-space:nowrap}" +
		".mes-when .mes-when__use:disabled{opacity:0.5;cursor:default}.mes-when__out{margin:0.4em 0 0;font-size:0.95em;color:#333;min-height:1.3em}.mes-when__out strong{color:#1a1a1a}.mes-when__key{color:#555}" +
		".mes-when__notes{margin:0.25em 0 0;padding:0 0 0 1.1em;font-size:0.87em;color:#555}.mes-when__notes li{margin:0.1em 0;color:#555}.mes-when__notes li.mes-when--warn{color:#8a4b00}.mes-when__err{color:#b0222a}.mes-when__ok{color:#17663a;font-weight:600}" +
		".mes-when__fix{font:inherit;font-size:0.9em;margin:0.3em 0.4em 0 0;padding:0.3em 0.7em;border-radius:1em;border:1px solid #1f6aa0;background:#fff;color:#1f6aa0;cursor:pointer}" +
		"body.dark-mode .mes-when__lab{color:#e6e6e6}body.dark-mode .mes-when__lab span,body.dark-mode .mes-when__key,body.dark-mode .mes-when__notes,body.dark-mode .mes-when__notes li{color:#b9c0ca}" +
		"body.dark-mode .mes-when .mes-when__in{background:#1e1e1e;color:#eee;border-color:#5a5f66}body.dark-mode .mes-when .mes-when__in::placeholder{color:#9aa1ab}body.dark-mode .mes-when .mes-when__in:focus{outline-color:#6cb6f5;border-color:#6cb6f5}" +
		"body.dark-mode .mes-when .mes-when__use{background:#6cb6f5;border-color:#6cb6f5;color:#111}body.dark-mode .mes-when__out{color:#ddd}body.dark-mode .mes-when__out strong{color:#fff}" +
		"body.dark-mode .mes-when__notes li.mes-when--warn{color:#f3b45d}body.dark-mode .mes-when__err{color:#ff8f8f}body.dark-mode .mes-when__ok{color:#7ddc9c}body.dark-mode .mes-when__fix{background:#1e1e1e;color:#8cc8ff;border-color:#8cc8ff}" +
		"@media (max-width:480px){.mes-when__row{flex-wrap:wrap}.mes-when .mes-when__use{flex:1 1 100%}}";
	function css() { if (document.getElementById("mes-when-css")) return; var st = document.createElement("style"); st.id = "mes-when-css"; st.textContent = CSS; document.head.appendChild(st); }
	function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function el(x) { return typeof x === "string" ? document.getElementById(x) : x; }
	function h24() { try { var v = localStorage.getItem("mes-time24"); if (v === "1") return true; if (v === "0") return false; } catch (e) {} try { return new Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 !== true; } catch (e) { return false; } }
	function tText(t) { if (!t) return ""; var h = +t.slice(0, 2), m = t.slice(3, 5); return h24() ? t : ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM"); }
	function fire(x) { x.dispatchEvent(new Event("input", { bubbles: true })); x.dispatchEvent(new Event("change", { bubbles: true })); }
	function setVal(x, v) {
		x = el(x); if (!x) return;
		if (x.type === "time" && x.step && +x.step < 60 && /^\d{2}:\d{2}$/.test(v)) v += ":00";
		x.value = v; fire(x);
	}
	var uid = 0;
	// cfg: anchor (insert the widget before it) or into (append), date, time, zone (elements or ids), local (no zone field: convert to the
	// visitor's time), range (use parseRange; onApply required), onApply(res, api) (replaces the default filling), futureOnly, placeholder, label
	function attach(cfg) {
		css(); cfg = cfg || {};
		var id = "mes-when-" + (++uid), box = document.createElement("div"); box.className = "mes-when";
		box.innerHTML = '<label class="mes-when__lab" for="' + id + '">' + esc(cfg.label || "Type it in words") + ' <span>(optional)</span></label><div class="mes-when__row"><input id="' + id + '" class="mes-when__in" type="text" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="' + esc(cfg.placeholder || "Oct 28 2026, Wed 10 am PT") + '"><button type="button" class="mes-when__use" disabled>Use</button></div><div class="mes-when__out" aria-live="polite"></div>';
		var a = el(cfg.anchor), af = el(cfg.after), into = el(cfg.into);
		if (a && a.parentNode) a.parentNode.insertBefore(box, a); else if (af && af.parentNode) af.parentNode.insertBefore(box, af.nextSibling); else if (into) into.appendChild(box); else return null;
		var inp = box.querySelector("input"), btn = box.querySelector("button"), out = box.querySelector(".mes-when__out"), cur = null, timer = 0;
		function zoneOf() { var z = cfg.zone && el(cfg.zone); var v = z && z.value; return v && validZone(v) ? v : (cfg.getZone ? cfg.getZone() : localZone()); }
		function opts() { return { zone: cfg.getZone ? cfg.getZone() : cfg.zone ? zoneOf() : localZone(), futureOnly: cfg.futureOnly !== false }; }
		function describe(r, withZone) {
			var s = "<strong>" + esc(r.dateText) + (r.time ? ", " + esc(tText(r.time)) : "") + "</strong>";
			if (withZone && r.zone) s += " " + esc(r.zoneLabel || r.zone);
			return s;
		}
		function rangeText(r) { return r.b ? describe(r.a, true) + " &rarr; " + describe(r.b, true) : '<span class="mes-when__key">' + (cfg.single === "end" ? "End date" : "Start date") + ":</span> " + describe(r.a, true); }
		function localNote(r) {
			if (!r.time || !r.zone || r.ms == null) return "";
			var lz = cfg.zone || cfg.getZone || cfg.noLocal ? null : localZone(); if (!lz || lz === r.zone) return "";
			var w = wallIn(r.ms, lz); return " = <strong>" + esc(dText(w.y, w.mo, w.d) + ", " + tText(pad(w.h) + ":" + pad(w.mi))) + "</strong> your time";
		}
		function render(fixBtn) {
			var t = inp.value.trim(); cur = null; btn.disabled = true;
			if (!t) { out.innerHTML = ""; return; }
			var r = cfg.range ? parseRange(t, opts()) : parse(t, opts());
			if (!r.ok) { out.innerHTML = '<span class="mes-when__err">' + esc(r.error) + "</span>"; return; }
			cur = r; btn.disabled = false;
			var html = cfg.range ? rangeText(r) : describe(r, true) + localNote(r);
			html += ' <span class="mes-when__key">&mdash; press Enter to use it</span>';
			var notes = r.notes || [];
			if (notes.length) html += '<ul class="mes-when__notes">' + notes.map(function (n) { return "<li" + (/ is a \w+day, not a /.test(n) ? ' class="mes-when--warn"' : "") + ">" + esc(n) + "</li>"; }).join("") + "</ul>";
			var wk = !cfg.range && r.weekday && !r.weekday.ok ? r.weekday : null;
			if (wk) html += '<button type="button" class="mes-when__fix">Use ' + esc(wk.suggestText) + ' instead</button>';
			out.innerHTML = html;
			var fb = out.querySelector(".mes-when__fix"); if (fb) fb.addEventListener("click", function () { var r2 = {}; for (var k in cur) r2[k] = cur[k]; var p = wk.suggest.split("-"); r2.date = wk.suggest; r2.y = +p[0]; r2.mo = +p[1]; r2.d = +p[2]; r2.dateText = wk.suggestText; if (r2.time) r2.ms = toInstant(r2.y, r2.mo, r2.d, +r2.time.slice(0, 2), +r2.time.slice(3, 5), r2.zone || opts().zone); apply(r2); });
		}
		function apply(r) {
			r = r || cur; if (!r) { render(); r = cur; } if (!r) return;
			if (cfg.onApply) cfg.onApply(r, api);
			else {
				var date = r.date, time = r.time;
				if (r.zone && !cfg.zone && r.ms != null) { var lz = localZone(), w = wallIn(r.ms, lz); date = iso(w.y, w.mo, w.d); time = pad(w.h) + ":" + pad(w.mi); }
				if (r.zone && cfg.zone) setVal(cfg.zone, r.zone);
				if (cfg.date && date) setVal(cfg.date, date);
				if (cfg.time && time) setVal(cfg.time, time);
			}
			out.innerHTML = '<span class="mes-when__ok">&#10003; ' + esc(cfg.doneText || "Filled in") + ': </span>' + (cfg.range ? rangeText(r) : describe(r, true) + localNote(r));
		}
		inp.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(render, 120); });
		inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); render(); apply(); } else if (e.key === "Escape") { inp.value = ""; render(); } });
		btn.addEventListener("click", function () { clearTimeout(timer); render(); apply(); });
		var api = { el: box, input: inp, render: render, apply: apply, setVal: setVal };
		return api;
	}
	API.attach = attach; API.setVal = setVal;
})(typeof window !== "undefined" ? window : globalThis);
