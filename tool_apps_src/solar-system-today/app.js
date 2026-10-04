/* MES Solar System Today -- mes.fm/solar-system-today
 * UI around MESSolarView (view.js: the canvas) and MESSolar (lib.js: Astronomy Engine). Date + playback, selected-world card, "right now"
 * card, coming-up events (jump to any), the table of every world, share links (?d=&v=&b=), localStorage mes-solar-system-today:v1.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ss");
	if (!root) return;
	var S = window.MESSolar, MV = window.MESSolarView;
	var KEY = "mes-solar-system-today:v1", DAY = 86400000;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = "0" + n; return n; }

	if (!window.Astronomy) {
		$("ss-stage").innerHTML = '<p style="padding:2em;color:#e8ecf5;">The astronomy library could not be loaded. Check your connection and reload the page.</p>';
		return;
	}

	var saved = sget(), q = new URLSearchParams(location.search);
	var MIN = Date.UTC(1000, 0, 1), MAX = Date.UTC(3000, 11, 31);
	var date = new Date();
	if (q.get("d")) { var pd = new Date(q.get("d")); if (!isNaN(pd) && +pd >= MIN && +pd <= MAX) date = pd; }
	var fromLink = !!q.get("d");
	var SPEEDS = [["Real time", 1 / 86400], ["1 hour / s", 1 / 24], ["6 hours / s", 0.25], ["1 day / s", 1], ["1 week / s", 7], ["1 month / s", 30.4375], ["1 year / s", 365.25], ["10 years / s", 3652.5], ["100 years / s", 36525]];
	var speedIx = saved.speed != null && saved.speed < SPEEDS.length ? saved.speed : 4;
	$("ss-speed").innerHTML = SPEEDS.map(function (s, i) { return '<option value="' + i + '"' + (i === speedIx ? " selected" : "") + ">" + s[0] + "</option>"; }).join("");
	var playing = 0, lastT = 0;          // playing: 0 stopped, 1 forward, -1 backward
	var mode = q.get("v") === "moon" || q.get("v") === "sky" ? q.get("v") : (saved.view === "moon" || saved.view === "sky") && !fromLink ? saved.view : "orrery";
	var sel = q.get("b") && (S.BYID[q.get("b")] || /^(sun|moon|halley)$/.test(q.get("b"))) ? q.get("b") : (mode === "moon" ? "moon" : saved.sel || "earth");

	var view = MV.create($("ss-canvas"), {
		date: date, mode: mode, fitAU: 36,
		onPick: function (id) { if (id) select(id); },
		onHover: function (id, x, y) { tip(id, x, y); },
		onView: function (V) { syncSliders(V); }
	});
	var V = view.V;
	if (saved.show) for (var sk in saved.show) if (sk in V.show) V.show[sk] = !!saved.show[sk];
	if (saved.compress != null) V.compress = saved.compress;
	if (saved.tilt != null && !q.get("t")) V.tilt = saved.tilt;
	V.sel = sel;

	/* ---------- date helpers ---------- */
	function inputsFrom(d) {
		$("ss-date").value = pad(d.getFullYear(), 4) + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
		$("ss-time").value = pad(d.getHours()) + ":" + pad(d.getMinutes());
	}
	function fromInputs() {
		var dv = $("ss-date").value.split("-"), tv = ($("ss-time").value || "00:00").split(":");
		if (dv.length !== 3 || !+dv[0]) return null;
		var d = new Date(+dv[0], +dv[1] - 1, +dv[2], +tv[0] || 0, +tv[1] || 0);
		if (+dv[0] < 100) d.setFullYear(+dv[0]);
		return isNaN(d) ? null : d;
	}
	function clampDate(d) { return new Date(Math.min(MAX, Math.max(MIN, +d))); }
	function fmtDay(d) { try { return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }); } catch (e) { return d.toDateString(); } }
	function fmtClock(d) { try { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return d.toTimeString().slice(0, 5); } }
	function fmtBig(d) { try { return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return d.toDateString(); } }
	function rel(from, to) {
		var days = (to - from) / DAY, a = Math.abs(days), s;
		if (a < 1 / 24) s = Math.round(a * 1440) + " minutes"; else if (a < 1) s = Math.round(a * 24) + " hours"; else if (a < 60) s = Math.round(a) + (Math.round(a) === 1 ? " day" : " days");
		else if (a < 730) s = Math.round(a / 30.44) + " months"; else s = (a / 365.25).toFixed(a < 3650 ? 1 : 0).replace(/\.0$/, "") + " years";
		return days >= 0 ? "in " + s : s + " ago";
	}
	function doy(d) { var y = d.getFullYear(), s = new Date(y, 0, 1, 12), e = new Date(y, d.getMonth(), d.getDate(), 12); return Math.round((e - s) / DAY) + 1; }
	function yearBounds(d) { var y = d.getFullYear(), a = new Date(2000, 0, 1), b = new Date(2000, 11, 31); a.setFullYear(y); b.setFullYear(y); var n = Math.round((b - a) / DAY); return { y: y, a: a, n: n }; }

	/* ---------- the panels ---------- */
	var lastHeavy = 0, evKey = "", evData = [];
	function seasonOf(d, sn) {
		var lon = S.wrap(sn.sunLon + S.precession(d)), i = Math.floor(lon / 90);
		return [["Northern spring", "autumn"], ["Northern summer", "winter"], ["Northern autumn", "spring"], ["Northern winter", "summer"]][i];
	}
	function km(au) { var m = au * 149.5978707; return m >= 1000 ? Math.round(m).toLocaleString() + " million km" : m >= 100 ? m.toFixed(0) + " million km" : m.toFixed(1) + " million km"; }
	function magText(m) { return (m <= 0 ? "−" : "+") + Math.abs(m).toFixed(1).replace("-", ""); }
	function skyText(v) {
		if (v.elong < 12) return "Too close to the Sun";
		return (v.vis === "evening" ? "Evening sky" : "Morning sky") + " · " + Math.round(v.elong) + "°";
	}
	function nameOf(id) { return id === "sun" ? "Sun" : id === "moon" ? "Moon" : id === "halley" ? "Halley's Comet" : S.BYID[id].name; }

	function cardHtml(sn) {
		var d = V.date, h = "", id = V.sel || "earth", b = S.BYID[id], o = sn.by[id];
		if (id === "sun") {
			var sv = S.sunView(d), e = sn.by.earth;
			return '<h3><span class="ss-dot" style="background:#ffd45a"></span>Sun</h3><p class="tu-note" style="margin-top:0">A star holding 99.8% of the solar system\'s mass. Light leaving it today reaches Earth in ' + S.lightTime(sv.au) + '.</p><dl class="ss-dl">' +
				"<dt>From Earth</dt><dd>" + S.fmtAU(sv.au) + " AU · " + km(sv.au) + "</dd><dt>Constellation</dt><dd>" + sv.con + "</dd><dt>Diameter</dt><dd>1,391,000 km (109 Earths)</dd><dt>Surface</dt><dd>about 5,500 °C</dd><dt>Rotation</dt><dd>about 25 days at the equator</dd></dl>";
		}
		if (id === "moon") {
			var mi = S.moonInfo(d, sn);
			return '<h3><span class="ss-dot" style="background:#d8d8d0"></span>Moon <span class="ss-badge">' + mi.name + "</span></h3>" +
				'<p class="tu-note" style="margin-top:0">Earth\'s only natural satellite. It keeps one face toward us and drifts about 3.8 cm farther away each year.</p><dl class="ss-dl">' +
				"<dt>Lit by the Sun</dt><dd>" + Math.round(mi.frac * 100) + "% · age " + mi.age.toFixed(1) + " days</dd><dt>From Earth</dt><dd>" + Math.round(mi.dist).toLocaleString() + " km" + (mi.orbit ? " · " + mi.orbit : "") + "</dd>" +
				"<dt>Light takes</dt><dd>" + (mi.dist / 299792.458).toFixed(2) + " seconds</dd><dt>Looks</dt><dd>" + mi.arcmin.toFixed(1) + "′ across · in " + mi.con + "</dd>" +
				"<dt>Next new moon</dt><dd>" + (mi.nextNew ? fmtDay(mi.nextNew) : "—") + "</dd><dt>Next full moon</dt><dd>" + (mi.nextFull ? fmtDay(mi.nextFull) : "—") + "</dd>" +
				"<dt>Orbit tilt now</dt><dd>" + mi.lat.toFixed(1) + "° from the ecliptic" + (mi.eclipseWindow ? ' · <span class="ss-badge">eclipse possible</span>' : "") + "</dd></dl>" +
				'<p class="tu-note">An eclipse needs a new or full moon while the Moon crosses the ecliptic plane (near 0°). <a href="/moon">Moon rise, set and phase for your location →</a></p>';
		}
		if (id === "halley") {
			var hq = S.halley(d);
			return '<h3><span class="ss-dot" style="background:#aaf0ea"></span>Halley\'s Comet</h3><p class="tu-note" style="margin-top:0">The most famous comet, seen every ~76 years since at least 240 BC. It last passed the Sun in February 1986 and is due back around mid-2061 (this simple orbit is good to a few months).</p><dl class="ss-dl">' +
				"<dt>From the Sun</dt><dd>" + S.fmtAU(hq.r) + " AU · " + km(hq.r) + "</dd><dt>Orbit</dt><dd>Backwards (retrograde), tilted 162°</dd><dt>Nucleus</dt><dd>about 15 × 8 km</dd></dl>";
		}
		var v = id === "earth" ? null : S.view(id, d), r = o.r, sp = S.speedKms(id, d), tex = [];
		h = '<h3><span class="ss-dot" style="background:rgb(' + b.rgb.join(",") + ')"></span>' + b.name + (v && v.retro ? ' <span class="ss-badge" title="Appears to move backwards against the stars right now">℞ retrograde</span>' : "") + "</h3>" +
			'<p class="tu-note" style="margin-top:0">' + b.note + '</p><dl class="ss-dl"><dt>From the Sun</dt><dd>' + S.fmtAU(r) + " AU · " + km(r) + " · light takes " + S.lightTime(r) + "</dd>";
		if (id !== "earth") h += "<dt>From Earth</dt><dd>" + S.fmtAU(o.gd) + " AU · " + km(o.gd) + " · light takes " + S.lightTime(o.gd) + "</dd>";
		h += "<dt>Orbital speed</dt><dd>" + sp.toFixed(1) + " km/s (" + Math.round(sp * 3600).toLocaleString() + " km/h)</dd>";
		if (v) h += "<dt>In the sky</dt><dd>" + v.con + " · " + skyText(v) + "</dd><dt>Brightness</dt><dd>magnitude " + magText(v.mag) + " · " + Math.round(v.phase * 100) + "% lit</dd>";
		h += "<dt>Diameter</dt><dd>" + b.dia.toLocaleString() + " km" + (id !== "earth" ? " (" + (b.dia / 12742).toFixed(2) + " × Earth)" : "") + "</dd><dt>Day</dt><dd>" + b.day + "</dd><dt>Year</dt><dd>" + b.year + "</dd><dt>Moons</dt><dd>" + b.moons + "</dd><dt>Gravity</dt><dd>" + b.g + "</dd></dl>";
		return h;
	}
	function nowHtml(sn) {
		var d = V.date, e = sn.by.earth, mi = S.moonInfo(d, sn), se = seasonOf(d, sn), sv = S.sunView(d), nextEv = null;
		evData.forEach(function (x) { if (!nextEv && x.kind === "season") nextEv = x; });
		return '<h4>Right now <span class="ss-small">' + esc(fmtDay(d) + " · " + fmtClock(d)) + "</span></h4><dl class=\"ss-dl\" style=\"margin-top:0\">" +
			"<dt>Earth</dt><dd>" + S.fmtAU(e.r) + " AU from the Sun (" + km(e.r) + "), moving at " + S.speedKms("earth", d).toFixed(1) + " km/s</dd>" +
			"<dt>Year</dt><dd>Day " + doy(d) + " of " + (d.getFullYear() % 4 === 0 && (d.getFullYear() % 100 !== 0 || d.getFullYear() % 400 === 0) ? 366 : 365) + " · " + se[0] + " (" + se[1] + " in the south)" + (nextEv ? " · " + nextEv.label.toLowerCase() + " " + rel(d, nextEv.t) : "") + "</dd>" +
			"<dt>Sun</dt><dd>in " + sv.con + " as seen from Earth · light takes " + S.lightTime(sv.au) + "</dd>" +
			"<dt>Moon</dt><dd>" + mi.name + " · " + Math.round(mi.frac * 100) + "% lit · " + Math.round(mi.dist).toLocaleString() + " km away" + (mi.orbit ? " (" + mi.orbit + ")" : "") + "</dd>" +
			"<dt>Next</dt><dd>new moon " + (mi.nextNew ? rel(d, mi.nextNew) : "—") + ", full moon " + (mi.nextFull ? rel(d, mi.nextFull) : "—") + "</dd></dl>" +
			'<p class="tu-note" style="margin-bottom:0">Dates and times here are in your own time zone.</p>';
	}
	function eventsHtml() {
		var d = V.date;
		if (!evData.length) return "<h4>Coming up</h4><p class=\"tu-note\">Working it out…</p>";
		var rows = evData.slice(0, 12).map(function (x, i) {
			return '<li><div class="ss-ev-l"><b>' + esc(x.label) + "</b><span>" + esc(fmtDay(x.t) + " · " + fmtClock(x.t)) + " · " + rel(d, x.t) + '</span></div><button type="button" data-i="' + i + '" title="Jump to this moment">Jump</button></li>';
		}).join("");
		return "<h4>Coming up</h4><ul class=\"ss-ev\">" + rows + "</ul>";
	}
	function tableHtml(sn) {
		var d = V.date, rows = S.BODIES.map(function (b) {
			var o = sn.by[b.id], isE = b.id === "earth", v = isE ? null : S.view(b.id, d), sp = S.speedKms(b.id, d);
			return '<tr data-id="' + b.id + '"' + (V.sel === b.id ? ' class="is-active"' : "") + '><td><span class="ss-sw" style="background:rgb(' + b.rgb.join(",") + ')"></span>' + b.name + (v && v.retro ? ' <span class="ss-retro" title="Retrograde">℞</span>' : "") + "</td>" +
				"<td>" + S.fmtAU(o.r) + " AU</td><td>" + (isE ? "—" : S.fmtAU(o.gd) + " AU") + "</td><td>" + (isE ? "—" : S.lightTime(o.gd)) + "</td><td>" + sp.toFixed(1) + " km/s</td>" +
				"<td>" + (v ? v.con : "—") + "</td><td>" + (v ? skyText(v) : "—") + "</td><td>" + (v ? magText(v.mag) : "—") + "</td></tr>";
		});
		var mi = sn.moon, mv = S.moonInfo(d, sn), sv = S.sunView(d);
		rows.unshift('<tr data-id="sun"' + (V.sel === "sun" ? ' class="is-active"' : "") + '><td><span class="ss-sw" style="background:#ffd45a"></span>Sun</td><td>—</td><td>' + S.fmtAU(sv.au) + ' AU</td><td>' + S.lightTime(sv.au) + '</td><td>—</td><td>' + sv.con + '</td><td>—</td><td>−26.7</td></tr>');
		rows.splice(4, 0, '<tr data-id="moon"' + (V.sel === "moon" ? ' class="is-active"' : "") + '><td><span class="ss-sw" style="background:#d8d8d0"></span>Moon <span class="ss-muted">' + mv.name + '</span></td><td>' + S.fmtAU(sn.by.earth.r) + ' AU</td><td>' + Math.round(mi.dist).toLocaleString() + ' km</td><td>' + (mi.dist / 299792.458).toFixed(2) + ' s</td><td>1.0 km/s</td><td>' + mv.con + '</td><td>' + Math.round(mv.frac * 100) + '% lit</td><td>' + magText(mv.mag) + '</td></tr>');
		return rows.join("");
	}
	function refreshPanels(force) {
		var now = performance.now();
		if (!force && playing && now - lastHeavy < 250) return;
		lastHeavy = now;
		var sn = view.snap();
		$("ss-card").innerHTML = cardHtml(sn);
		$("ss-now-card").innerHTML = nowHtml(sn);
		$("ss-table").tBodies[0].innerHTML = tableHtml(sn);
		$("ss-tbl-date").textContent = fmtDay(V.date) + " · " + fmtClock(V.date);
	}
	var evTimer = 0;
	function refreshEvents() {
		clearTimeout(evTimer);
		if (playing) { evTimer = setTimeout(refreshEvents, 600); return; }
		evTimer = setTimeout(function () {
			var k = Math.round(+V.date / 3600000);
			if (evKey === k && evData.length) return;
			evKey = k; evData = S.events(V.date); $("ss-events").innerHTML = eventsHtml(); refreshPanels(true);
		}, 220);
	}

	/* ---------- time + controls ---------- */
	function paintDate() {
		var d = V.date;
		$("ss-date-big").textContent = fmtBig(d);
		$("ss-date-sub").textContent = fmtClock(d) + " your time · " + d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
		if (document.activeElement !== $("ss-date") && document.activeElement !== $("ss-time")) inputsFrom(d);
		var yb = yearBounds(d), pos = (d - yb.a) / DAY;
		if (document.activeElement !== $("ss-year")) { $("ss-year").max = yb.n; $("ss-year").value = Math.max(0, Math.min(yb.n, pos)); }
		$("ss-yr-left").textContent = "Jan 1 " + yb.y; $("ss-yr-right").textContent = "Dec 31";
	}
	function setDate(d, soft) {
		d = clampDate(d); V.date = d; view.setDate(d); paintDate();
		if (!soft) { refreshPanels(true); refreshEvents(); urlSoon(); }
	}
	function stepDays() { return Math.max(SPEEDS[speedIx][1], 1 / 24); }
	function stepLabel() { var s = SPEEDS[speedIx][1]; $("ss-steplabel").textContent = "Step: " + (s <= 1 / 24 ? "1 hour" : SPEEDS[speedIx][0].replace(" / s", "").replace(/^1 /, "1 ")); }
	/* hide / show the control bar (a phone held sideways has little height to spare): saved, with a mini play button while hidden */
	function paintMin(min) {
		$("ss-wrap").classList.toggle("is-min", min);
		var b = $("ss-collapse"); b.textContent = min ? "▲" : "▼"; b.setAttribute("aria-expanded", String(!min));
		b.title = min ? "Show the controls" : "Hide the controls to see more of the map"; b.setAttribute("aria-label", min ? "Show the controls" : "Hide the controls");
		$("ss-mplay").hidden = !min;
	}
	$("ss-collapse").onclick = function () { var min = !$("ss-wrap").classList.contains("is-min"); paintMin(min); sset({ min: min }); setTimeout(function () { view.resize(); }, 60); };
	$("ss-mplay").onclick = function () { $("ss-play").click(); };
	paintMin(!!saved.min);
	function setPlaying(dir) {
		playing = dir; lastT = 0; V.animate = !!dir;
		$("ss-play").textContent = playing === 1 ? "❚❚ Pause" : "▶ Play"; $("ss-mplay").textContent = playing === 1 ? "❚❚" : "▶"; $("ss-rev").setAttribute("aria-pressed", String(playing === -1));
		$("ss-hint").classList.add("is-gone");
		if (playing) requestAnimationFrame(tick); else { refreshPanels(true); refreshEvents(); urlSoon(); }
	}
	function tick(ts) {
		if (!playing) return;
		if (lastT) {
			var dt = Math.min(0.1, (ts - lastT) / 1000), nd = +V.date + playing * dt * SPEEDS[speedIx][1] * DAY;
			if (nd <= MIN || nd >= MAX) { setDate(new Date(nd <= MIN ? MIN : MAX), true); setPlaying(0); return; }
			setDate(new Date(nd), true); refreshPanels(false);
		}
		lastT = ts; requestAnimationFrame(tick);
	}
	$("ss-play").onclick = function () { setPlaying(playing === 1 ? 0 : 1); };
	$("ss-rev").onclick = function () { setPlaying(playing === -1 ? 0 : -1); };
	$("ss-prev").onclick = function () { setPlaying(0); setDate(new Date(+V.date - stepDays() * DAY)); };
	$("ss-next").onclick = function () { setPlaying(0); setDate(new Date(+V.date + stepDays() * DAY)); };
	$("ss-now").onclick = function () { setPlaying(0); setDate(new Date()); toast("Back to now"); };
	$("ss-speed").onchange = function () { speedIx = +this.value; sset({ speed: speedIx }); stepLabel(); };
	$("ss-date").addEventListener("change", function () { var d = fromInputs(); if (d) { setPlaying(0); setDate(d); } });
	$("ss-time").addEventListener("change", function () { var d = fromInputs(); if (d) { setPlaying(0); setDate(d); } });
	$("ss-year").addEventListener("input", function () {
		setPlaying(0); var yb = yearBounds(V.date), t = V.date, d = new Date(+yb.a + (+this.value) * DAY);
		d.setHours(t.getHours(), t.getMinutes(), 0, 0); setDate(d, true); refreshPanels(false);
	});
	$("ss-year").addEventListener("change", function () { refreshPanels(true); refreshEvents(); urlSoon(); });
	root.querySelector(".ss-jumps").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-y]"); if (!b) return;
		setPlaying(0); var d = new Date(V.date), y = d.getFullYear() + +b.dataset.y;
		d.setFullYear(y); setDate(d);
	});
	$("ss-events").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-i]"); if (!b) return; var x = evData[+b.dataset.i]; if (!x) return;
		setPlaying(0); setDate(x.t); if (x.id) select(x.id); toast("Jumped to " + x.label);
	});
	$("ss-table").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (tr) select(tr.dataset.id); });

	/* ---------- selection + views ---------- */
	function select(id) {
		V.sel = id; sset({ sel: id });
		if (mode === "moon" && id !== "moon" && id !== "earth") { /* stay in the Earth & Moon view, just show the card */ }
		view.render(); refreshPanels(true); urlSoon();
		var c = $("ss-card"); if (window.innerWidth < 860 && c && c.getBoundingClientRect().top > window.innerHeight) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
	function setView(m) {
		mode = m; view.setMode(m); sset({ view: m });
		Array.prototype.forEach.call($("ss-views").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === m)); });
		$("ss-fits").hidden = m !== "orrery"; $("ss-moonopts").hidden = m !== "moon";
		$("ss-hint").textContent = m === "orrery" ? "Drag to rotate · scroll to zoom · click a planet" : m === "moon" ? "Scroll to zoom · click the Moon for details" : "Click the Sun, Moon or a planet";
		if (m === "moon" && V.sel !== "moon" && V.sel !== "earth") select("moon");
		if (m === "orrery") view.fit(fitAU);
		urlSoon();
	}
	var fitAU = 36;
	$("ss-views").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setView(b.dataset.v); });
	$("ss-fits").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.id === "ss-flat") { var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); view.set({ tilt: on ? 0 : 52 }); syncSliders(V); return; }
		fitAU = +b.dataset.au; view.fit(fitAU);
		if (fitAU < 3 && V.compress > 0) { /* the inner planets read best with less squeeze */ }
	});
	$("ss-truescale").onclick = function () { var on = this.getAttribute("aria-pressed") !== "true"; this.setAttribute("aria-pressed", String(on)); view.set({ show: { trueScale: on } }); };

	/* ---------- options ---------- */
	Array.prototype.forEach.call($("ss-checks").querySelectorAll("input"), function (c) {
		c.checked = !!V.show[c.dataset.s];
		c.addEventListener("change", function () { var o = {}; o[c.dataset.s] = c.checked; view.set({ show: o }); sset({ show: V.show }); });
	});
	function syncSliders(Vv) {
		$("ss-compress").value = Math.round(Vv.compress * 100); $("ss-compress-o").textContent = Math.round(Vv.compress * 100) + "%";
		$("ss-tilt").value = Math.round(Vv.tilt); $("ss-tilt-o").textContent = Math.round(Vv.tilt) + "°";
		var yw = ((Math.round(Vv.yaw) + 540) % 360) - 180; $("ss-yaw").value = yw; $("ss-yaw-o").textContent = yw + "°";
		$("ss-flat").setAttribute("aria-pressed", String(Vv.tilt < 1));
	}
	$("ss-compress").addEventListener("input", function () { V.compress = +this.value / 100; view.fit(fitAU); sset({ compress: V.compress }); syncSliders(V); });
	$("ss-tilt").addEventListener("input", function () { V.tilt = +this.value; view.render(); sset({ tilt: V.tilt }); syncSliders(V); });
	$("ss-yaw").addEventListener("input", function () { V.yaw = +this.value; view.render(); syncSliders(V); });
	$("ss-zin").onclick = function () { view.zoomBy(1.35); };
	$("ss-zout").onclick = function () { view.zoomBy(1 / 1.35); };
	$("ss-reset").onclick = function () { view.reset(); fitAU = 36; syncSliders(V); };
	$("ss-png").onclick = function () {
		var a = document.createElement("a"); a.href = view.png(); a.download = "solar-system-" + V.date.toISOString().slice(0, 10) + ".png"; document.body.appendChild(a); a.click(); a.remove();
	};
	$("ss-full").onclick = function () { var w = $("ss-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen(); };
	document.addEventListener("fullscreenchange", function () { setTimeout(function () { view.resize(); }, 60); });
	function paintTheatre() { $("ss-theatre").setAttribute("aria-pressed", String(document.documentElement.classList.contains("page-theatre"))); }
	$("ss-theatre").onclick = function () {
		var on = document.documentElement.classList.toggle("page-theatre");
		try { localStorage.setItem("pageMode", on ? "theatre" : "std"); localStorage.setItem("pageWide", on ? "1" : "0"); } catch (e) {}
		paintTheatre(); setTimeout(function () { view.resize(); }, 80);
	};
	paintTheatre();

	/* ---------- hover tooltip ---------- */
	function tip(id, x, y) {
		var t = $("ss-tip");
		if (!id) { t.hidden = true; return; }
		var sn = view.snap(), txt = "<b>" + esc(nameOf(id)) + "</b>";
		if (S.BYID[id]) { var o = sn.by[id]; txt += "<br>" + S.fmtAU(o.r) + " AU from the Sun" + (id !== "earth" ? "<br>" + S.fmtAU(o.gd) + " AU from Earth" : ""); }
		else if (id === "moon") txt += "<br>" + Math.round(sn.moon.dist).toLocaleString() + " km from Earth";
		else if (id === "sun") txt += "<br>1 AU = 149.6 million km";
		else if (id === "halley") txt += "<br>" + S.fmtAU(S.halley(V.date).r) + " AU from the Sun";
		t.innerHTML = txt; t.hidden = false;
		var W = $("ss-stage").clientWidth; t.style.left = Math.min(W - t.offsetWidth - 6, x + 14) + "px"; t.style.top = Math.max(4, y - t.offsetHeight - 10) + "px";
	}

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || (t && t.isContentEditable) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " " && (t === $("ss-canvas") || t === document.body)) { e.preventDefault(); setPlaying(e.shiftKey ? (playing === -1 ? 0 : -1) : (playing === 1 ? 0 : 1)); }
		else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t === $("ss-canvas")) { e.preventDefault(); setPlaying(0); setDate(new Date(+V.date + (e.key === "ArrowRight" ? 1 : -1) * stepDays() * (e.shiftKey ? 10 : 1) * DAY)); }
		else if ((e.key === "+" || e.key === "=") && t === $("ss-canvas")) view.zoomBy(1.2);
		else if (e.key === "-" && t === $("ss-canvas")) view.zoomBy(1 / 1.2);
		else if (e.key === "0" && t === $("ss-canvas")) { view.reset(); fitAU = 36; syncSliders(V); }
	});

	/* ---------- share link + toast ---------- */
	var toastT;
	function toast(msg) { var t = $("ss-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1600); }
	var urlT;
	function urlSoon() {
		clearTimeout(urlT);
		urlT = setTimeout(function () {
			if (playing) return;
			var p = new URLSearchParams();
			if (Math.abs(V.date - Date.now()) > 90000) p.set("d", V.date.toISOString().slice(0, 16) + "Z");
			if (mode !== "orrery") p.set("v", mode);
			if (V.sel && V.sel !== "earth" && !(mode === "moon" && V.sel === "moon")) p.set("b", V.sel);
			var qs = p.toString();
			try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) {}
		}, 400);
	}

	/* ---------- go ---------- */
	stepLabel(); syncSliders(V); setView(mode);
	if (mode !== "orrery") { V.sel = sel; }
	paintDate(); refreshPanels(true); refreshEvents();
	// keep the clock honest while idle on "now": one repaint a minute
	setInterval(function () { if (!playing && !fromLink && !document.hidden && Math.abs(V.date - Date.now()) < 120000 && document.activeElement !== $("ss-date")) setDate(new Date(), true); }, 60000);
	window.MESSolarApp = { view: view, setDate: setDate, select: select, setView: setView };
})();
