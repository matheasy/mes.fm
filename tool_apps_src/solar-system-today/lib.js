/* MES Solar System Today -- the astronomy layer (no DOM). Wraps Astronomy Engine (Don Cross, MIT; /moon/js/astronomy.browser.min.js,
 * global `Astronomy`) so the page and the mes.fm/moon widget share one set of numbers. Exposed as window.MESSolar (and module.exports for tests).
 * Frame: heliocentric ecliptic J2000, AU; x toward the J2000 March equinox, z toward the north ecliptic pole, longitudes increase counter-clockwise from above.
 */
(function (root) {
	"use strict";
	var KM_AU = 149597870.7, DEG = Math.PI / 180;
	function A() { return root.Astronomy; }
	var DAY = 86400000;
	function wrap(d) { d = d % 360; return d < 0 ? d + 360 : d; }

	/* id, name, Astronomy body, colours (base / light / dark rgb), on-screen radius (px at ~700px stage), and facts for the info card */
	var BODIES = [
		{ id: "mercury", name: "Mercury", body: "Mercury", rgb: [176, 170, 160], px: 4.2, dia: 4879, day: "58.6 Earth days", year: "88 days", moons: "none", g: "0.38 g", note: "The smallest planet and the closest to the Sun. Its year is shorter than two of its own days." },
		{ id: "venus", name: "Venus", body: "Venus", rgb: [232, 205, 142], px: 6.4, dia: 12104, day: "243 Earth days (backwards)", year: "225 days", moons: "none", g: "0.9 g", note: "Spins backwards, slowly, under thick clouds. Hotter than Mercury, about 465 °C at the surface." },
		{ id: "earth", name: "Earth", body: "Earth", rgb: [72, 130, 220], px: 6.8, dia: 12742, day: "23 h 56 min", year: "365.25 days", moons: "1 (the Moon)", g: "1 g", note: "Home. The only place we know of with liquid water on the surface and life." },
		{ id: "mars", name: "Mars", body: "Mars", rgb: [201, 100, 62], px: 5.2, dia: 6779, day: "24 h 37 min", year: "687 days", moons: "2", g: "0.38 g", note: "The red planet, with the tallest volcano in the solar system, Olympus Mons." },
		{ id: "jupiter", name: "Jupiter", body: "Jupiter", rgb: [214, 170, 130], px: 13.5, dia: 139820, day: "9 h 56 min", year: "11.9 years", moons: "95+", g: "2.5 g", note: "More massive than all the other planets combined. The Great Red Spot is a storm wider than Earth." },
		{ id: "saturn", name: "Saturn", body: "Saturn", rgb: [226, 200, 142], px: 11.5, dia: 116460, day: "10 h 33 min", year: "29.5 years", moons: "270+", g: "1.1 g", note: "Famous for its rings, made of ice and rock. It would float in water if you could find a big enough bath." },
		{ id: "uranus", name: "Uranus", body: "Uranus", rgb: [142, 214, 224], px: 8.4, dia: 50724, day: "17 h 14 min (backwards)", year: "84 years", moons: "28", g: "0.9 g", note: "Tipped on its side (98°), so it rolls around the Sun. Each pole gets about 42 years of sunlight, then 42 of darkness." },
		{ id: "neptune", name: "Neptune", body: "Neptune", rgb: [70, 100, 220], px: 8.2, dia: 49244, day: "16 h 6 min", year: "165 years", moons: "16", g: "1.1 g", note: "The windiest planet, with gusts over 2,000 km/h. It has completed just one orbit since it was discovered in 1846." },
		{ id: "pluto", name: "Pluto", body: "Pluto", rgb: [205, 180, 150], px: 3.6, dia: 2377, day: "6.4 Earth days (backwards)", year: "248 years", moons: "5", g: "0.06 g", note: "A dwarf planet in the Kuiper belt. Its orbit is tilted 17° and sometimes brings it closer to the Sun than Neptune." }
	];
	var BYID = {};
	BODIES.forEach(function (b, i) { b.i = i; BYID[b.id] = b; });
	var PERIOD_DAYS = { mercury: 87.97, venus: 224.7, earth: 365.256, mars: 687, jupiter: 4332.6, saturn: 10759, uranus: 30688, neptune: 60182, pluto: 90560 };

	function ecl(vec) { var e = A().Ecliptic(vec); return { x: e.vec.x, y: e.vec.y, z: e.vec.z, lon: e.elon, lat: e.elat }; }
	function helio(id, date) { return ecl(A().HelioVector(BYID[id].body, date)); }

	/* Halley's Comet: two-body orbit from its 1986 elements (ignores planetary perturbations, so the date is good to a few months) */
	var HALLEY = { a: 17.8341, e: 0.96714, i: 162.26 * DEG, om: 58.42 * DEG, w: 111.33 * DEG, T: 2446470.95 };
	function halley(date) {
		var jd = date.getTime() / DAY + 2440587.5, h = HALLEY, n = 0.01720209895 / Math.pow(h.a, 1.5);
		var M = ((n * (jd - h.T)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), E = M < Math.PI ? M + h.e * 0.85 : M - h.e * 0.85, k;
		for (k = 0; k < 40; k++) { var d = (E - h.e * Math.sin(E) - M) / (1 - h.e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
		var xo = h.a * (Math.cos(E) - h.e), yo = h.a * Math.sqrt(1 - h.e * h.e) * Math.sin(E);
		var cw = Math.cos(h.w), sw = Math.sin(h.w), co = Math.cos(h.om), so = Math.sin(h.om), ci = Math.cos(h.i), si = Math.sin(h.i);
		var x1 = xo * cw - yo * sw, y1 = xo * sw + yo * cw;
		return { x: x1 * co - y1 * ci * so, y: x1 * so + y1 * ci * co, z: y1 * si, r: Math.sqrt(xo * xo + yo * yo) };
	}
	function halleyOrbit(n) {
		var out = [], h = HALLEY, k;
		for (k = 0; k < n; k++) {
			var E = (k / n) * 2 * Math.PI, xo = h.a * (Math.cos(E) - h.e), yo = h.a * Math.sqrt(1 - h.e * h.e) * Math.sin(E);
			var cw = Math.cos(h.w), sw = Math.sin(h.w), co = Math.cos(h.om), so = Math.sin(h.om), ci = Math.cos(h.i), si = Math.sin(h.i);
			var x1 = xo * cw - yo * sw, y1 = xo * sw + yo * cw;
			out.push({ x: x1 * co - y1 * ci * so, y: x1 * so + y1 * ci * co, z: y1 * si });
		}
		return out;
	}

	/* the whole system at one instant: heliocentric positions + the geocentric view of each body */
	function snapshot(date) {
		var a = A(), out = { date: date, bodies: [], by: {} }, e = helio("earth", date);
		BODIES.forEach(function (b) {
			var p = b.id === "earth" ? e : helio(b.id, date);
			var r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			var gx = p.x - e.x, gy = p.y - e.y, gz = p.z - e.z, gd = Math.sqrt(gx * gx + gy * gy + gz * gz);
			var o = { id: b.id, x: p.x, y: p.y, z: p.z, r: r, lon: p.lon, lat: p.lat, gd: gd, glon: b.id === "earth" ? NaN : wrap(Math.atan2(gy, gx) / DEG), glat: b.id === "earth" ? NaN : Math.asin(gz / (gd || 1)) / DEG };
			out.bodies.push(o); out.by[b.id] = o;
		});
		var m = a.GeoMoon(date), me = ecl(m), md = Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z);
		out.moon = { x: me.x, y: me.y, z: me.z, lon: me.lon, lat: me.lat, dist: md * KM_AU, au: md, phase: a.MoonPhase(date) };
		out.sunLon = wrap(e.lon + 180);          // direction of the Sun seen from Earth (J2000 ecliptic)
		return out;
	}

	/* how Earth sees a planet right now: constellation, elongation, magnitude, retrograde? (costlier, so only when the table is drawn) */
	function view(id, date) {
		var a = A(), b = BYID[id], g = a.GeoVector(b.body, date, true), q = a.EquatorFromVector(g), c = a.Constellation(q.ra, q.dec);
		var el = a.Elongation(b.body, date), il = a.Illumination(b.body, date);
		var d1 = new Date(date.getTime() - DAY / 2), d2 = new Date(date.getTime() + DAY / 2);
		function lon(d) { var v = ecl(a.GeoVector(b.body, d, true)); return v.lon; }
		var dl = wrap(lon(d2) - lon(d1) + 180) - 180;
		return { con: c.name, conSym: c.symbol, elong: el.elongation, vis: el.visibility, mag: il.mag, phase: il.phase_fraction, retro: dl < 0, ra: q.ra, dec: q.dec, ringTilt: il.ring_tilt };
	}
	function sunView(date) {
		var a = A(), g = a.GeoVector("Sun", date, true), q = a.EquatorFromVector(g), c = a.Constellation(q.ra, q.dec);
		return { con: c.name, ra: q.ra, dec: q.dec, au: Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) };
	}

	var PHASES = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
	function phaseName(deg) { return PHASES[Math.floor(((wrap(deg) + 22.5) % 360) / 45)]; }
	function moonInfo(date, snap) {
		var a = A(), s = snap || snapshot(date), il = a.Illumination("Moon", date), prev = a.SearchMoonPhase(0, date, -40), next = a.SearchMoonPhase(0, date, 40);
		var nf = a.SearchMoonPhase(180, date, 40), pf = a.SearchMoonPhase(180, date, -40);
		var q = a.EquatorFromVector(a.GeoMoon(date)), con = a.Constellation(q.ra, q.dec).name;
		var ageD = prev ? (date - prev.date) / DAY : NaN;
		var apog = s.moon.dist > 404000 ? "near apogee (far)" : s.moon.dist < 363000 ? "near perigee (close)" : "";
		var ang = 2 * Math.atan(1737.4 / s.moon.dist) / DEG * 60;     // arcminutes
		return { phase: s.moon.phase, name: phaseName(s.moon.phase), frac: il.phase_fraction, age: ageD, dist: s.moon.dist, lat: s.moon.lat, con: con, mag: il.mag,
			prevNew: prev && prev.date, nextNew: next && next.date, nextFull: nf && nf.date, prevFull: pf && pf.date, orbit: apog, arcmin: ang,
			eclipseWindow: Math.abs(s.moon.lat) < 1.1 };
	}

	/* what is coming up after `date`: a sorted list of { t: Date, label, kind } (each search is a few ms; call once the date settles) */
	function events(date) {
		var a = A(), ev = [], i, q, t;
		function add(d, label, kind, id) { if (d && d > date) ev.push({ t: d, label: label, kind: kind, id: id }); }
		try {
			q = a.SearchMoonQuarter(date);
			for (i = 0; i < 4; i++) {
				add(q.time.date, ["New Moon", "First Quarter Moon", "Full Moon", "Last Quarter Moon"][q.quarter], "moon");
				q = a.NextMoonQuarter(q);
			}
		} catch (e) {}
		try { var le = a.SearchLunarEclipse(date); add(le.peak.date, "Lunar eclipse (" + le.kind + ")", "eclipse"); } catch (e) {}
		try { var se = a.SearchGlobalSolarEclipse(date); add(se.peak.date, "Solar eclipse (" + se.kind + ")", "eclipse"); } catch (e) {}
		try {
			var y = date.getUTCFullYear(), se2;
			[y, y + 1].forEach(function (yy) {
				se2 = a.Seasons(yy);
				add(se2.mar_equinox.date, "March equinox", "season"); add(se2.jun_solstice.date, "June solstice", "season");
				add(se2.sep_equinox.date, "September equinox", "season"); add(se2.dec_solstice.date, "December solstice", "season");
			});
		} catch (e) {}
		try { var ap = a.SearchPlanetApsis("Earth", date); add(ap.time.date, ap.kind === 0 ? "Earth at perihelion (closest to the Sun)" : "Earth at aphelion (farthest from the Sun)", "orbit"); } catch (e) {}
		["Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].forEach(function (n) {
			try { t = a.SearchRelativeLongitude(n, 0, date); add(t.date, n + " at opposition (closest, brightest)", "planet", n.toLowerCase()); } catch (e) {}
		});
		["Mercury", "Venus"].forEach(function (n) {
			try { var me = a.SearchMaxElongation(n, date); add(me.time.date, n + " at greatest elongation (" + me.elongation.toFixed(0) + "°, " + me.visibility + " sky)", "planet", n.toLowerCase()); } catch (e) {}
		});
		ev.sort(function (x, y) { return x.t - y.t; });
		return ev;
	}

	/* the 13 constellations the ecliptic crosses: start of each in J2000 ecliptic longitude (IAU boundaries) */
	var ZODIAC = [["Aries", 28.69], ["Taurus", 53.42], ["Gemini", 90.42], ["Cancer", 118.26], ["Leo", 138.18], ["Virgo", 173.85], ["Libra", 217.8],
		["Scorpius", 241.1], ["Ophiuchus", 247.7], ["Sagittarius", 266.2], ["Capricornus", 299.7], ["Aquarius", 327.5], ["Pisces", 351.6]];
	function zodiacAt(lon) {
		lon = wrap(lon);
		var cur = ZODIAC[ZODIAC.length - 1][0], i;
		for (i = 0; i < ZODIAC.length; i++) if (lon >= ZODIAC[i][1]) cur = ZODIAC[i][0];
		return cur;
	}
	/* general precession in ecliptic longitude since J2000, degrees (add to J2000 longitudes to get "of date", i.e. the zodiac's seasons) */
	function precession(date) { return 1.396971 * ((date.getTime() / DAY + 2440587.5 - 2451545) / 36525); }

	function fmtAU(au) { return au >= 100 ? au.toFixed(0) : au >= 10 ? au.toFixed(2) : au.toFixed(3); }
	function lightTime(au) {                    // "8 min 19 s" / "4 h 10 min"
		var s = au * KM_AU / 299792.458;
		if (s < 90) return Math.round(s) + " s";
		if (s < 5400) return Math.floor(s / 60) + " min " + Math.round(s % 60) + " s";
		return Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min";
	}
	function speedKms(id, date) {               // vis-viva-free: velocity from the ephemeris itself
		var s = A().HelioState(BYID[id].body, date);
		return Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) * KM_AU / 86400;
	}

	var api = { BODIES: BODIES, BYID: BYID, KM_AU: KM_AU, PERIOD_DAYS: PERIOD_DAYS, ZODIAC: ZODIAC, snapshot: snapshot, view: view, sunView: sunView, moonInfo: moonInfo, events: events,
		halley: halley, halleyOrbit: halleyOrbit, helio: helio, zodiacAt: zodiacAt, precession: precession, phaseName: phaseName, fmtAU: fmtAU, lightTime: lightTime, speedKms: speedKms, wrap: wrap };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESSolar = api;
})(typeof window !== "undefined" ? window : globalThis);
