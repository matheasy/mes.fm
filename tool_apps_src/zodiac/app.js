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
		render(f); renderBP(); updOffset(); renderFamous(); renderCmp(); setUrl(f);
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
		renderBP(); renderFamous(); renderCmp(); setUrl(readForm());
	}
	// compact "Your birthday personality" card (BP = mes.fm/birthday-personality's lib, loaded through lib_from)
	function renderBP() {
		var box = $("zd-bp"), s = ME && window.BP && BP.short(ME.mo, ME.d);
		if (!s) { box.hidden = true; return; }
		box.innerHTML = '<p class="bp-mini-k">Your birthday personality <span>for fun</span></p><h3 class="bp-mini-t">' + esc(s.title) + '</h3><p class="bp-mini-p">' + esc(s.text) + '</p><a class="bp-mini-a" href="' + esc(s.url) + (ME.y ? "&amp;y=" + ME.y : "") + '">Read the full profile →</a>';
		box.hidden = false;
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
