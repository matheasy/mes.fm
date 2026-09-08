/* MES Timezone Converter -- mes.fm/timezone
 *
 * Convert one wall-clock time in a chosen IANA zone to any number of other
 * zones, DST-correct, entirely in the browser. No dependencies -- all the
 * heavy lifting is Intl.DateTimeFormat + the standard "wall time -> instant"
 * offset dance.
 */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };
	var STORE = "mes-tz-v1";
	var HOME = "America/Vancouver";               // Richmond, BC shares Vancouver's zone
	var DEFAULT_TARGETS = [
		"America/New_York", "America/Chicago", "America/Toronto",
		"Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata",
		"Asia/Tokyo", "Australia/Sydney", "UTC"
	];
	var POPULAR = [
		"America/Vancouver", "America/Los_Angeles", "America/Denver", "America/Phoenix",
		"America/Chicago", "America/New_York", "America/Toronto", "America/Halifax",
		"America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
		"UTC", "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Madrid",
		"Europe/Berlin", "Europe/Rome", "Europe/Amsterdam", "Europe/Zurich", "Europe/Stockholm",
		"Europe/Athens", "Europe/Istanbul", "Europe/Moscow", "Africa/Casablanca", "Africa/Lagos",
		"Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg", "Asia/Jerusalem", "Asia/Riyadh",
		"Asia/Dubai", "Asia/Tehran", "Asia/Karachi", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka",
		"Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Manila", "Asia/Hong_Kong",
		"Asia/Shanghai", "Asia/Taipei", "Asia/Seoul", "Asia/Tokyo", "Australia/Perth",
		"Australia/Adelaide", "Australia/Brisbane", "Australia/Sydney", "Pacific/Auckland",
		"Pacific/Honolulu", "Pacific/Fiji"
	];
	// last-resort list if Intl.supportedValuesOf is unavailable
	var FALLBACK_ZONES = POPULAR.concat([
		"America/Anchorage", "America/Edmonton", "America/Winnipeg", "America/Regina",
		"America/St_Johns", "America/Lima", "America/Santiago", "America/Caracas",
		"Atlantic/Reykjavik", "Atlantic/Azores", "Europe/Brussels", "Europe/Vienna",
		"Europe/Prague", "Europe/Warsaw", "Europe/Budapest", "Europe/Bucharest",
		"Europe/Helsinki", "Europe/Kyiv", "Asia/Baku", "Asia/Yerevan", "Asia/Tashkent",
		"Asia/Almaty", "Asia/Colombo", "Asia/Yangon", "Asia/Ho_Chi_Minh", "Asia/Kuala_Lumpur",
		"Asia/Novosibirsk", "Asia/Vladivostok", "Australia/Darwin", "Pacific/Guam",
		"Pacific/Port_Moresby", "Pacific/Tongatapu"
	]);

	// country flag for a handful of common zones (cosmetic; "" is fine)
	var FLAG = {
		"America/Vancouver": "🇨🇦", "America/Toronto": "🇨🇦",
		"America/Halifax": "🇨🇦", "America/Edmonton": "🇨🇦",
		"America/Winnipeg": "🇨🇦", "America/St_Johns": "🇨🇦",
		"America/Los_Angeles": "🇺🇸", "America/Denver": "🇺🇸",
		"America/Phoenix": "🇺🇸", "America/Chicago": "🇺🇸",
		"America/New_York": "🇺🇸", "America/Anchorage": "🇺🇸",
		"Pacific/Honolulu": "🇺🇸", "America/Mexico_City": "🇲🇽",
		"America/Bogota": "🇨🇴", "America/Lima": "🇵🇪",
		"America/Sao_Paulo": "🇧🇷", "America/Argentina/Buenos_Aires": "🇦🇷",
		"America/Santiago": "🇨🇱", "UTC": "🌐",
		"Europe/London": "🇬🇧", "Europe/Dublin": "🇮🇪",
		"Europe/Lisbon": "🇵🇹", "Europe/Paris": "🇫🇷",
		"Europe/Madrid": "🇪🇸", "Europe/Berlin": "🇩🇪",
		"Europe/Rome": "🇮🇹", "Europe/Amsterdam": "🇳🇱",
		"Europe/Zurich": "🇨🇭", "Europe/Stockholm": "🇸🇪",
		"Europe/Athens": "🇬🇷", "Europe/Istanbul": "🇹🇷",
		"Europe/Moscow": "🇷🇺", "Europe/Kyiv": "🇺🇦",
		"Africa/Casablanca": "🇲🇦", "Africa/Lagos": "🇳🇬",
		"Africa/Cairo": "🇪🇬", "Africa/Nairobi": "🇰🇪",
		"Africa/Johannesburg": "🇿🇦", "Asia/Jerusalem": "🇮🇱",
		"Asia/Riyadh": "🇸🇦", "Asia/Dubai": "🇦🇪",
		"Asia/Tehran": "🇮🇷", "Asia/Karachi": "🇵🇰",
		"Asia/Kolkata": "🇮🇳", "Asia/Kathmandu": "🇳🇵",
		"Asia/Dhaka": "🇧🇩", "Asia/Bangkok": "🇹🇭",
		"Asia/Jakarta": "🇮🇩", "Asia/Singapore": "🇸🇬",
		"Asia/Manila": "🇵🇭", "Asia/Hong_Kong": "🇭🇰",
		"Asia/Shanghai": "🇨🇳", "Asia/Taipei": "🇹🇼",
		"Asia/Seoul": "🇰🇷", "Asia/Tokyo": "🇯🇵",
		"Australia/Perth": "🇦🇺", "Australia/Adelaide": "🇦🇺",
		"Australia/Brisbane": "🇦🇺", "Australia/Sydney": "🇦🇺",
		"Australia/Darwin": "🇦🇺", "Pacific/Auckland": "🇳🇿",
		"Pacific/Fiji": "🇫🇯"
	};

	/* ---- zone maths ---------------------------------------------------- */

	function isValidZone(z) {
		if (!z) return false;
		try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; }
		catch (e) { return false; }
	}

	function allZones() {
		try {
			if (typeof Intl.supportedValuesOf === "function") {
				var v = Intl.supportedValuesOf("timeZone");
				if (v && v.length) return v.indexOf("UTC") === -1 ? ["UTC"].concat(v) : v;
			}
		} catch (e) {}
		return FALLBACK_ZONES.slice().sort();
	}

	// minutes that `timeZone` is ahead of UTC at `date`
	function offsetMin(timeZone, date) {
		var dtf = new Intl.DateTimeFormat("en-US", {
			timeZone: timeZone, hourCycle: "h23",
			year: "numeric", month: "2-digit", day: "2-digit",
			hour: "2-digit", minute: "2-digit", second: "2-digit"
		});
		var p = {};
		dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
		var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
		return Math.round((asUTC - date.getTime()) / 60000);
	}

	// wall-clock (y,mo,d,h,mi) in timeZone -> the UTC instant it refers to
	function wallToInstant(y, mo, d, h, mi, timeZone) {
		var guess = Date.UTC(y, mo - 1, d, h, mi, 0);
		var o1 = offsetMin(timeZone, new Date(guess));
		var t = guess - o1 * 60000;
		var o2 = offsetMin(timeZone, new Date(t));
		if (o2 !== o1) t = guess - o2 * 60000;
		return new Date(t);
	}

	function fmt(timeZone, instant, opts) {
		opts = opts || {};
		opts.timeZone = timeZone;
		return new Intl.DateTimeFormat("en-US", opts).format(instant);
	}
	function clockStr(timeZone, instant) {
		return fmt(timeZone, instant, { hour: "numeric", minute: "2-digit", hour12: true });
	}
	function dateStr(timeZone, instant) {
		return fmt(timeZone, instant, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
	}
	function ymd(timeZone, instant) {
		// en-CA renders ISO-ish YYYY-MM-DD
		var p = {};
		new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
			.formatToParts(instant).forEach(function (x) { p[x.type] = x.value; });
		return p.year + "-" + p.month + "-" + p.day;
	}
	function dayDelta(a, b) {
		return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
	}
	function zoneName(timeZone, instant, style) {
		try {
			var part = new Intl.DateTimeFormat("en-US", { timeZone: timeZone, timeZoneName: style, hour: "numeric" })
				.formatToParts(instant).find(function (x) { return x.type === "timeZoneName"; });
			return part ? part.value : "";
		} catch (e) { return ""; }
	}
	function offsetStr(timeZone, instant) {
		var m = offsetMin(timeZone, instant);
		var sign = m >= 0 ? "+" : "−";
		m = Math.abs(m);
		var hh = Math.floor(m / 60), mm = m % 60;
		return "UTC" + sign + hh + (mm ? ":" + String(mm).padStart(2, "0") : "");
	}

	function cityOf(z) {
		if (z === "UTC") return "UTC";
		var seg = z.split("/");
		return seg[seg.length - 1].replace(/_/g, " ");
	}
	function regionOf(z) {
		if (z === "UTC") return "Coordinated Universal Time";
		var seg = z.split("/");
		return seg.slice(0, -1).join(" · ").replace(/_/g, " ");
	}
	function labelOf(z) {
		if (z === HOME) return "Richmond / Vancouver, BC (Pacific Time)";
		if (z === "UTC") return "UTC — Coordinated Universal Time";
		return cityOf(z) + " — " + regionOf(z);
	}

	/* ---- state ------------------------------------------------------- */

	var state = { date: "", time: "", from: HOME, targets: DEFAULT_TARGETS.slice() };

	function todayInZone(z) {
		var p = {};
		new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" })
			.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
		return p.year + "-" + p.month + "-" + p.day;
	}
	// current wall-clock "HH:MM" in a zone -- the default the converter opens on
	function nowTimeInZone(z) {
		var p = {};
		new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
			.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
		return p.hour + ":" + p.minute;
	}

	function loadStore() {
		try {
			var s = JSON.parse(localStorage.getItem(STORE) || "null");
			if (s && Array.isArray(s.targets)) return s.targets.filter(isValidZone);
		} catch (e) {}
		return null;
	}
	function saveStore() {
		try { localStorage.setItem(STORE, JSON.stringify({ targets: state.targets })); } catch (e) {}
	}

	function readHash() {
		var h = (location.hash || "").replace(/^#/, "");
		if (!h) return null;
		var q = {};
		h.split("&").forEach(function (kv) {
			var i = kv.indexOf("=");
			if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
		});
		if (!q.t && !q.z && !q.f) return null;
		return q;
	}
	function applyHash(q) {
		if (/^\d{1,2}:\d{2}$/.test(q.t || "")) state.time = q.t;
		if (/^\d{4}-\d{2}-\d{2}$/.test(q.d || "")) state.date = q.d;
		if (isValidZone(q.f)) state.from = q.f;
		if (q.z) {
			var zs = q.z.split(",").map(function (x) { return x.trim(); }).filter(isValidZone);
			if (zs.length) state.targets = zs;
		}
	}
	function linkFor() {
		var base = location.href.split("#")[0];
		return base + "#t=" + encodeURIComponent(state.time) +
			"&d=" + encodeURIComponent(state.date) +
			"&f=" + encodeURIComponent(state.from) +
			"&z=" + encodeURIComponent(state.targets.join(","));
	}

	/* ---- rendering ------------------------------------------------- */

	var fromSel = $("tz-from"), addSel = $("tz-add"), list = $("tz-list");

	function fillFromSelect() {
		var seen = {}, html = "";
		html += '<optgroup label="Popular">';
		POPULAR.forEach(function (z) {
			if (seen[z] || !isValidZone(z)) return;
			seen[z] = 1;
			html += '<option value="' + z + '">' + labelOf(z) + "</option>";
		});
		html += "</optgroup>";
		if (!seen[state.from]) {
			html = '<option value="' + state.from + '">' + labelOf(state.from) + "</option>" + html;
			seen[state.from] = 1;
		}
		html += '<optgroup label="All time zones">';
		allZones().forEach(function (z) {
			if (seen[z]) return;
			seen[z] = 1;
			html += '<option value="' + z + '">' + labelOf(z) + "</option>";
		});
		html += "</optgroup>";
		fromSel.innerHTML = html;
		fromSel.value = state.from;
	}

	function fillAddSelect() {
		var used = {};
		used[state.from] = 1;
		state.targets.forEach(function (z) { used[z] = 1; });
		var groups = {};
		allZones().forEach(function (z) {
			if (used[z]) return;
			var g = z === "UTC" ? "UTC" : z.split("/")[0].replace(/_/g, " ");
			(groups[g] = groups[g] || []).push(z);
		});
		var html = '<option value="">+ Add a city / time zone…</option>';
		Object.keys(groups).sort().forEach(function (g) {
			html += '<optgroup label="' + g + '">';
			groups[g].forEach(function (z) {
				html += '<option value="' + z + '">' + cityOf(z) +
					(z === "UTC" ? "" : " (" + regionOf(z) + ")") + "</option>";
			});
			html += "</optgroup>";
		});
		addSel.innerHTML = html;
	}

	function card(z, instant, isHome) {
		var li = document.createElement("li");
		li.className = "tz__card" + (isHome ? " tz__card--home" : "");
		var delta = dayDelta(ymd(z, instant), state.date);
		var badge = "";
		if (delta !== 0) {
			var cls = delta > 0 ? "tz__card__daydiff--plus" : "tz__card__daydiff--minus";
			var txt = (delta > 0 ? "+" : "−") + Math.abs(delta) + " day" + (Math.abs(delta) > 1 ? "s" : "");
			badge = '<span class="tz__card__daydiff ' + cls + '">' + txt + "</span>";
		}
		var flag = FLAG[z] ? '<span class="tz__flag">' + FLAG[z] + "</span>" : "";
		var abbr = zoneName(z, instant, "short");
		var longNm = zoneName(z, instant, "long");
		var place = z === HOME ? "Richmond / Vancouver, BC" : cityOf(z);
		var metaBits;
		if (z === "UTC") {
			metaBits = ["Coordinated Universal Time · UTC±0"];
		} else {
			metaBits = [regionOf(z), offsetStr(z, instant)];
			// non-US zones often report "GMT+1" as the short name -- redundant with
			// the offset we already show, so only keep a real abbreviation (EDT, JST)
			if (abbr && !/^(GMT|UTC)[+−-]?/.test(abbr) && abbr !== place) metaBits.push(abbr);
			if (longNm && longNm !== abbr) metaBits.push(longNm);
		}

		li.innerHTML =
			'<div class="tz__card__main">' +
				'<div class="tz__card__place">' + flag + place + (isHome ? ' <span class="tz__card__daydiff">start</span>' : badge) + "</div>" +
				'<div class="tz__card__meta">' + metaBits.join(" · ") + "</div>" +
			"</div>" +
			'<div class="tz__card__time">' +
				'<div class="tz__card__clock">' + clockStr(z, instant) + "</div>" +
				'<div class="tz__card__date">' + dateStr(z, instant) + "</div>" +
			"</div>" +
			(isHome ? "" : '<button type="button" class="tz__remove" title="Remove" aria-label="Remove ' + place + '">×</button>');

		if (!isHome) {
			li.querySelector(".tz__remove").addEventListener("click", function () {
				state.targets = state.targets.filter(function (t) { return t !== z; });
				commit();
			});
		}
		return li;
	}

	function render() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) state.date = todayInZone(state.from);
		if (!/^\d{1,2}:\d{2}$/.test(state.time)) state.time = nowTimeInZone(state.from);

		$("tz-date").value = state.date;
		$("tz-time").value = state.time.length === 4 ? "0" + state.time : state.time;
		if (fromSel.value !== state.from) fillFromSelect();

		var dp = state.date.split("-"), tp = state.time.split(":");
		var instant = wallToInstant(+dp[0], +dp[1], +dp[2], +tp[0], +tp[1], state.from);

		list.innerHTML = "";
		list.appendChild(card(state.from, instant, true));
		state.targets.forEach(function (z) { list.appendChild(card(z, instant, false)); });

		var fAbbr = zoneName(state.from, instant, "short");
		var fLong = zoneName(state.from, instant, "long");
		if (fAbbr && /^(GMT|UTC)[+−-]?/.test(fAbbr)) fAbbr = "";
		$("tz-from-note").textContent =
			(fLong ? fLong + " · " : "") + (fAbbr && fAbbr !== fLong ? fAbbr + " · " : "") +
			offsetStr(state.from, instant) + " · " +
			fmt(state.from, instant, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
			", " + clockStr(state.from, instant);

		fillAddSelect();
		// keep the shareable-link box current, but never touch the address bar --
		// the home URL stays a clean /timezone; a #hash link is only produced when
		// the visitor clicks "Copy shareable link" (and honoured when one is opened).
		$("tz-link").value = linkFor();
		saveStore();
	}

	function commit() { render(); }

	/* ---- events --------------------------------------------------- */

	$("tz-date").addEventListener("change", function () { state.date = this.value || state.date; commit(); });
	$("tz-time").addEventListener("change", function () { state.time = this.value || state.time; commit(); });
	fromSel.addEventListener("change", function () { if (isValidZone(this.value)) { state.from = this.value; commit(); } });

	$("tz-add-btn").addEventListener("click", function () {
		var z = addSel.value;
		if (z && isValidZone(z) && state.targets.indexOf(z) === -1 && z !== state.from) {
			state.targets.push(z);
			commit();
		}
	});
	addSel.addEventListener("change", function () { if (this.value) $("tz-add-btn").click(); });

	$("tz-now").addEventListener("click", function () {
		state.date = todayInZone(state.from);
		state.time = nowTimeInZone(state.from);
		commit();
	});

	$("tz-locate").addEventListener("click", function () {
		var z = "";
		try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
		if (!isValidZone(z)) {
			$("tz-from-note").textContent = "Could not read your device's time zone.";
			return;
		}
		state.targets = state.targets.filter(function (t) { return t !== z; });
		state.from = z;
		fillFromSelect();
		commit();
	});

	$("tz-reset").addEventListener("click", function () {
		state.from = HOME;
		state.date = todayInZone(HOME);
		state.time = nowTimeInZone(HOME);
		state.targets = (loadStore() || DEFAULT_TARGETS).slice();
		fillFromSelect();
		commit();
	});

	$("tz-copy").addEventListener("click", function () {
		var link = linkFor();
		$("tz-link").value = link;
		try { history.replaceState(null, "", link); } catch (e) {}   // only on explicit share
		function ok() {
			var c = $("tz-copied");
			c.classList.remove("hide");
			setTimeout(function () { c.classList.add("hide"); }, 1600);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(link).then(ok, function () { $("tz-link").select(); document.execCommand("copy"); ok(); });
		} else {
			$("tz-link").select();
			document.execCommand("copy");
			ok();
		}
	});

	window.addEventListener("hashchange", function () {
		var q = readHash();
		if (q) { applyHash(q); fillFromSelect(); render(); }
	});

	/* ---- boot ---------------------------------------------------- */

	var hash = readHash();
	if (hash) {
		applyHash(hash);
	} else {
		var saved = loadStore();
		if (saved && saved.length) state.targets = saved;
	}
	// no hash -> open on "now" in the starting zone; a shared link keeps its own time
	if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) state.date = todayInZone(state.from);
	if (!/^\d{1,2}:\d{2}$/.test(state.time)) state.time = nowTimeInZone(state.from);

	fillFromSelect();
	render();
})();
