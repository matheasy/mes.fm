/* MESFlights: pure helpers for mes.fm/flights (live air traffic). Used by the page AND by the Vercel function
   mes.fm/api/flights.js, which requires a BYTE-IDENTICAL copy at mes.fm/api/_flights-lib.js (cp after editing; the tests check).
   Data: adsb.lol (ODbL). Positions come through our function (adsb.lol allows 500 calls a day per address without a key and
   sends no CORS headers), so the area asked for is snapped to a fixed grid: everybody looking at roughly the same place shares
   one cached upstream call. Usual routes come straight from adsb.lol's static route files (vrs-standing-data.adsb.lol, CORS open,
   no quota). No DOM, no network here. */
(function (root) {
  'use strict';
  var F = {};
  var NM = 1852, D2R = Math.PI / 180;

  /* ---- area cells: radius buckets (nautical miles) and the grid each bucket's centre is snapped to (degrees) ---- */
  F.RADII = [25, 50, 100, 175, 250];
  F.GRID = { 25: 0.25, 50: 0.5, 100: 1, 175: 1.5, 250: 2 };
  F.MAX_R = 250;
  var fix = function (x, g) { var d = g < 1 ? 2 : (g % 1 ? 1 : 0); return (Math.round(x / g) * g).toFixed(d); };
  F.wrapLon = function (lon) { lon = ((lon + 180) % 360 + 360) % 360 - 180; return lon === -180 ? 180 : lon; };
  // smallest cell whose circle still covers a circle of `needNm` around (lat, lon) after snapping; partial = the view is bigger than 250 nm
  F.cellFor = function (lat, lon, needNm) {
    lat = Math.max(-89, Math.min(89, +lat || 0)); lon = F.wrapLon(+lon || 0); needNm = Math.max(1, +needNm || 1);
    for (var i = 0; i < F.RADII.length; i++) {
      var r = F.RADII[i], g = F.GRID[r], err = g * 60 * 0.71; // worst-case snap distance (north-south ~60 nm per degree)
      if (r >= needNm + err) return F.cell(lat, lon, r, false);
    }
    return F.cell(lat, lon, F.MAX_R, true);
  };
  F.cell = function (lat, lon, r, partial) {
    var g = F.GRID[r], la = fix(Math.max(-88, Math.min(88, lat)), g), lo = fix(F.wrapLon(lon), g);
    if (Math.abs(+la) > 88) la = fix(+la - (+la > 0 ? g : -g), g);
    if (+lo === -180) lo = fix(180, g);
    if (+la === 0) la = fix(0, g); if (+lo === 0) lo = fix(0, g); // no "-0.00"
    return { lat: la, lon: lo, r: r, partial: !!partial, key: la + ',' + lo + ',' + r };
  };
  // server side: accept only cells exactly on the grid (so the function cannot be used as a general proxy, and caches are shared)
  F.validCell = function (lat, lon, r) {
    r = +r; if (F.RADII.indexOf(r) < 0) return null;
    if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(String(lat)) || !/^-?\d{1,3}(\.\d{1,2})?$/.test(String(lon))) return null;
    var la = +lat, lo = +lon, g = F.GRID[r];
    if (!(la >= -88 && la <= 88 && lo >= -180 && lo <= 180)) return null;
    var c = F.cell(la, lo, r, false);
    return (+c.lat === la && +c.lon === lo && c.lat === String(lat) && c.lon === String(lon)) ? c : null;
  };

  /* ---- geometry ---- */
  F.distNm = function (la1, lo1, la2, lo2) {
    var a = Math.sin((la2 - la1) * D2R / 2), b = Math.sin((lo2 - lo1) * D2R / 2);
    var h = a * a + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * b * b;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h))) / NM;
  };
  // radius (nm) that covers a view whose corners are given: distance from the centre to the farthest corner
  F.viewNeed = function (cLat, cLon, corners) {
    var m = 0; (corners || []).forEach(function (p) { m = Math.max(m, F.distNm(cLat, cLon, p[0], p[1])); }); return m;
  };
  // move a plane forward along its track for dt seconds at its ground speed (great-circle step); dt capped at 90 s
  F.project = function (lat, lon, gsKt, trackDeg, dt) {
    if (!(gsKt > 0) || trackDeg == null || !(dt > 0)) return [lat, lon];
    dt = Math.min(dt, 90);
    var d = gsKt * NM * dt / 3600 / 6371008.8, th = trackDeg * D2R, p1 = lat * D2R, l1 = lon * D2R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
    var l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / D2R, F.wrapLon(l2 / D2R)];
  };

  /* ---- aircraft ---- */
  var HELI = /^(H\d{2}|EC\d{2}|AS\d{2}|AS3B|AS32|AS65|R22|R44|R66|B06|B06T|B47G|B105|B212|B222|B230|B407|B412|B429|B430|B505|BK17|S76|S92|S61|S64|A109|A119|A129|A139|A149|A169|A189|AW09|EH10|NH90|MI8|MI17|MI24|MI26|MI28|KA27|KA32|KA52|UH1|UH60|CH47|CH53|AH64|AH1|TIGR|GAZL|ALO3|LYNX|PUMA|SUCO|H500|MD52|MD60|EXPL|CDUS|G2CA|HUCO|LAMA|EN28|EN48|S300|S330|BSTP|V22|V280)$/;
  F.isHeli = function (cat, type) { return cat === 'A7' || HELI.test(String(type || '').toUpperCase()); };
  // adsb.lol "ac" record -> compact plane. g=1 on the ground, m=1 military (dbFlags bit 1), x=1 "interesting" (bit 2), l=1 LADD, p=1 PIA
  F.slim = function (a) {
    if (!a || typeof a.lat !== 'number' || typeof a.lon !== 'number' || !/^~?[0-9a-f]{6}$/i.test(String(a.hex || ''))) return null;
    var o = { h: String(a.hex).toLowerCase(), la: Math.round(a.lat * 1e5) / 1e5, lo: Math.round(a.lon * 1e5) / 1e5 };
    var f = String(a.flight || '').trim(); if (f) o.f = f.slice(0, 10);
    if (a.r) o.r = String(a.r).slice(0, 12);
    if (a.t) o.t = String(a.t).slice(0, 6);
    if (a.desc) o.d = String(a.desc).slice(0, 60);
    if (a.alt_baro === 'ground') o.g = 1; else if (typeof a.alt_baro === 'number') o.a = Math.round(a.alt_baro);
    else if (typeof a.alt_geom === 'number') o.a = Math.round(a.alt_geom);
    if (typeof a.gs === 'number') o.gs = Math.round(a.gs * 10) / 10;
    var tr = typeof a.track === 'number' ? a.track : typeof a.true_heading === 'number' ? a.true_heading : typeof a.mag_heading === 'number' ? a.mag_heading : null;
    if (tr != null) o.tr = Math.round(tr * 10) / 10;
    var vr = typeof a.baro_rate === 'number' ? a.baro_rate : typeof a.geom_rate === 'number' ? a.geom_rate : null;
    if (vr != null) o.vr = Math.round(vr);
    if (a.squawk && /^\d{4}$/.test(a.squawk)) o.sq = a.squawk;
    if (a.category && /^[A-D]\d$/.test(a.category)) o.c = a.category;
    if (a.emergency && a.emergency !== 'none') o.e = String(a.emergency).slice(0, 12);
    var db = +a.dbFlags || 0; if (db & 1) o.m = 1; if (db & 2) o.x = 1; if (db & 4) o.p = 1; if (db & 8) o.l = 1;
    if (typeof a.seen_pos === 'number') o.s = Math.round(a.seen_pos * 10) / 10; else if (typeof a.seen === 'number') o.s = Math.round(a.seen * 10) / 10;
    if (a.type && /mlat/.test(a.type)) o.src = 'mlat'; else if (a.type && /tisb/.test(a.type)) o.src = 'tisb'; else if (a.type && /adsr|adsc/.test(a.type)) o.src = 'other';
    if (typeof a.mach === 'number') o.mh = a.mach;
    if (typeof a.nav_altitude_mcp === 'number') o.sel = a.nav_altitude_mcp;
    return o;
  };
  // whole adsb.lol answer -> { now (ms), ac: [...] }; drops positions older than 60 s
  F.parseAc = function (j) {
    if (!j || !Array.isArray(j.ac)) throw new Error('no aircraft list');
    var now = typeof j.now === 'number' ? (j.now > 1e12 ? j.now : j.now * 1000) : Date.now(), out = [];
    j.ac.forEach(function (a) { var o = F.slim(a); if (o && !(o.s > 60)) out.push(o); });
    return { now: Math.round(now), ac: out };
  };

  /* ---- altitude colours (hue stops after tar1090, the map most ADS-B sites use) ---- */
  var HUE = [[0, 20], [2000, 32.5], [4000, 43], [6000, 54], [8000, 72], [9000, 85], [11000, 140], [40000, 300]];
  F.altHue = function (ft) {
    if (!(ft > 0)) return HUE[0][1];
    for (var i = 1; i < HUE.length; i++) if (ft <= HUE[i][0]) { var a = HUE[i - 1], b = HUE[i]; return a[1] + (b[1] - a[1]) * (ft - a[0]) / (b[0] - a[0]); }
    return HUE[HUE.length - 1][1];
  };
  F.altColor = function (p) { if (!p) return '#888888'; if (p.g) return '#8a8f98'; if (p.a == null) return '#9aa0a6'; return 'hsl(' + Math.round(F.altHue(p.a)) + ',88%,48%)'; };
  F.LEGEND = [0, 2000, 4000, 6000, 8000, 10000, 20000, 30000, 40000];

  /* ---- filters ---- */
  F.DEFAULT_FILTER = { minAlt: 0, maxAlt: 50000, ground: true, heli: true, onlyMil: false, onlyHeli: false, onlyEmerg: false, q: '' };
  F.matchText = function (p, q) {
    q = String(q || '').trim().toUpperCase().replace(/\s+/g, ''); if (!q) return true;
    return [p.f, p.r, p.h, p.t, p.sq].some(function (v) { return v && String(v).toUpperCase().replace(/-/g, '').indexOf(q.replace(/-/g, '')) === 0; });
  };
  F.isEmerg = function (p) { return !!(p.e || p.sq === '7500' || p.sq === '7600' || p.sq === '7700'); };
  F.keep = function (p, o) {
    o = o || F.DEFAULT_FILTER;
    var heli = F.isHeli(p.c, p.t);
    if (p.g) { if (!o.ground) return false; } else {
      var a = p.a == null ? 0 : p.a;
      if (a < (o.minAlt || 0) || (o.maxAlt < 50000 && a > o.maxAlt)) return false;
    }
    if (!o.heli && heli) return false;
    if (o.onlyMil && !p.m) return false;
    if (o.onlyHeli && !heli) return false;
    if (o.onlyEmerg && !F.isEmerg(p)) return false;
    return F.matchText(p, o.q);
  };
  F.filter = function (list, o) { return (list || []).filter(function (p) { return F.keep(p, o); }); };
  F.sortKey = function (p, col) {
    switch (col) { case 'alt': return p.g ? -1 : (p.a == null ? -2 : p.a); case 'gs': return p.gs || 0; case 'vr': return p.vr || 0;
      case 'type': return p.t || '~'; case 'reg': return p.r || '~'; default: return p.f || p.r || p.h; }
  };
  F.sort = function (list, col, dir) {
    var s = dir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) { var x = F.sortKey(a, col), y = F.sortKey(b, col); return (x < y ? -1 : x > y ? 1 : 0) * s; });
  };

  /* ---- search: what kind of thing was typed ---- */
  F.findKind = function (q) {
    q = String(q || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!q || q.length > 10) return null;
    if (/^~?[0-9A-F]{6}$/.test(q) && /\d/.test(q) && !/^[A-Z]{3}\d/.test(q)) return { kind: 'hex', v: q.toLowerCase() };
    if (q.indexOf('-') > 0 && /^[A-Z0-9]{1,3}-[A-Z0-9]{1,6}$/.test(q)) return { kind: 'reg', v: q };
    if (/^N[1-9][0-9A-Z]{0,4}$/.test(q)) return { kind: 'reg', v: q };
    if (/^[A-Z0-9]{2,8}$/.test(q)) return { kind: 'callsign', v: q };
    return null;
  };

  /* ---- usual routes (vrs-standing-data.adsb.lol: community route data, can be wrong) ---- */
  F.ROUTE_BASE = 'https://vrs-standing-data.adsb.lol/routes/';
  // airline callsigns only (3 letters + number); the file name drops leading zeros of the number (KAL032 -> KA/KAL32.json)
  F.routeUrl = function (cs) {
    var m = /^([A-Z]{3})0*(\d[0-9A-Z]{0,4})$/.exec(String(cs || '').trim().toUpperCase());
    return m ? F.ROUTE_BASE + m[1].slice(0, 2) + '/' + m[1] + m[2] + '.json' : null;
  };
  F.parseRoute = function (j) {
    if (!j || !Array.isArray(j._airports) || j._airports.length < 2) return null;
    return { cs: String(j.callsign || ''), airline: String(j.airline_code || ''), airports: j._airports.slice(0, 6).map(function (a) {
      return { name: String(a.name || ''), icao: String(a.icao || ''), iata: String(a.iata || ''), city: String(a.location || ''), cc: String(a.countryiso2 || ''), lat: +a.lat, lon: +a.lon };
    }) };
  };
  // is the plane anywhere near one of the route's legs? (a callsign is sometimes reused for another route)
  F.routePlausible = function (rt, lat, lon) {
    if (!rt || !rt.airports || rt.airports.length < 2) return false;
    for (var i = 1; i < rt.airports.length; i++) {
      var A = rt.airports[i - 1], B = rt.airports[i], ab = F.distNm(A.lat, A.lon, B.lat, B.lon);
      if (F.distNm(A.lat, A.lon, lat, lon) + F.distNm(lat, lon, B.lat, B.lon) <= ab * 1.25 + 120) return true;
    }
    return false;
  };
  F.routeProgress = function (rt, lat, lon) { // share of the last leg flown, 0..1 (for the progress bar)
    if (!rt || rt.airports.length < 2) return null;
    var A = rt.airports[rt.airports.length - 2], B = rt.airports[rt.airports.length - 1];
    var a = F.distNm(A.lat, A.lon, lat, lon), b = F.distNm(lat, lon, B.lat, B.lon);
    return a + b > 0 ? Math.max(0, Math.min(1, a / (a + b))) : null;
  };

  /* ---- trails: adsb.lol /1/trace/recent answer -> [[t ms, lat, lon, alt or -1 ground]] ---- */
  F.parseTrace = function (j) {
    if (!j || !Array.isArray(j.trace) || typeof j.timestamp !== 'number') throw new Error('no trace');
    var t0 = j.timestamp * 1000, pts = [];
    j.trace.forEach(function (r) {
      if (!Array.isArray(r) || typeof r[1] !== 'number' || typeof r[2] !== 'number') return;
      pts.push([Math.round(t0 + r[0] * 1000), Math.round(r[1] * 1e5) / 1e5, Math.round(r[2] * 1e5) / 1e5, r[3] === 'ground' ? -1 : (typeof r[3] === 'number' ? Math.round(r[3]) : null)]);
    });
    if (pts.length > 1500) { var step = Math.ceil(pts.length / 1500); pts = pts.filter(function (p, i) { return i % step === 0 || i === pts.length - 1; }); }
    return { hex: String(j.icao || ''), r: j.r ? String(j.r) : '', t: j.t ? String(j.t) : '', d: j.desc ? String(j.desc) : '', pts: pts };
  };

  /* ---- formatting ---- */
  F.UNITS = { aviation: 'Aviation (ft, knots)', metric: 'Metric (m, km/h)', imperial: 'Imperial (ft, mph)' };
  var grp = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  F.fmtAlt = function (p, u) {
    if (!p) return '–'; if (p.g) return 'On the ground'; if (p.a == null) return '–';
    return u === 'metric' ? grp(p.a * 0.3048) + ' m' : grp(p.a) + ' ft';
  };
  F.fmtSpeed = function (kt, u) {
    if (kt == null) return '–';
    return u === 'metric' ? grp(kt * 1.852) + ' km/h' : u === 'imperial' ? grp(kt * 1.15078) + ' mph' : grp(kt) + ' kt';
  };
  F.fmtVr = function (fpm, u) {
    if (fpm == null) return '–'; if (Math.abs(fpm) <= 64) return 'Level';
    var s = fpm > 0 ? '↑ ' : '↓ ';
    return s + (u === 'metric' ? grp(Math.abs(fpm) * 0.3048) + ' m/min' : grp(Math.abs(fpm)) + ' ft/min');
  };
  F.fmtDist = function (nm, u) { return u === 'metric' ? grp(nm * 1.852) + ' km' : u === 'imperial' ? grp(nm * 1.15078) + ' mi' : grp(nm) + ' nm'; };
  F.compass = function (deg) { if (deg == null) return ''; return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; };
  F.SQUAWK = { '7500': 'Hijack (7500)', '7600': 'Radio failure (7600)', '7700': 'Emergency (7700)' };
  F.CATEGORY = { A1: 'Light plane', A2: 'Small plane', A3: 'Large plane', A4: 'Large plane (757 type)', A5: 'Heavy jet', A6: 'High performance', A7: 'Helicopter',
    B1: 'Glider', B2: 'Balloon / airship', B4: 'Ultralight', B6: 'Drone', B7: 'Spacecraft', C1: 'Emergency vehicle', C2: 'Service vehicle', C3: 'Obstacle' };
  F.label = function (p) { return (p && (p.f || p.r || p.h.toUpperCase())) || ''; };

  /* ---- default place from the visitor's time zone (nothing is asked for; no location used until they press "Near me") ---- */
  F.TZ_PLACES = {
    'America/Vancouver': [49.2, -123.1], 'America/Los_Angeles': [34.0, -118.3], 'America/Denver': [39.7, -105.0], 'America/Phoenix': [33.4, -112.0],
    'America/Chicago': [41.9, -87.7], 'America/New_York': [40.7, -74.0], 'America/Toronto': [43.7, -79.4], 'America/Edmonton': [51.0, -114.1],
    'America/Halifax': [44.7, -63.6], 'America/Mexico_City': [19.4, -99.1], 'America/Sao_Paulo': [-23.5, -46.6], 'America/Bogota': [4.7, -74.1],
    'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'Europe/London': [51.5, -0.3], 'Europe/Dublin': [53.4, -6.3], 'Europe/Paris': [48.9, 2.4],
    'Europe/Berlin': [50.1, 8.6], 'Europe/Amsterdam': [52.3, 4.8], 'Europe/Madrid': [40.4, -3.6], 'Europe/Rome': [41.9, 12.5], 'Europe/Istanbul': [41.0, 28.9],
    'Europe/Moscow': [55.8, 37.6], 'Asia/Dubai': [25.2, 55.4], 'Asia/Kolkata': [28.6, 77.1], 'Asia/Singapore': [1.35, 103.9], 'Asia/Ho_Chi_Minh': [10.8, 106.7],
    'Asia/Bangkok': [13.7, 100.7], 'Asia/Hong_Kong': [22.3, 114.0], 'Asia/Shanghai': [31.2, 121.5], 'Asia/Tokyo': [35.6, 139.8], 'Asia/Seoul': [37.5, 126.8],
    'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 144.9], 'Pacific/Auckland': [-36.9, 174.8], 'Africa/Johannesburg': [-26.1, 28.2], 'Africa/Cairo': [30.1, 31.4]
  };
  F.placeFor = function (tz) {
    if (F.TZ_PLACES[tz]) return F.TZ_PLACES[tz];
    var reg = String(tz || '').split('/')[0];
    return ({ Europe: [50.1, 8.6], America: [40.7, -74.0], Asia: [1.35, 103.9], Australia: [-33.9, 151.2], Africa: [-26.1, 28.2], Pacific: [-36.9, 174.8] })[reg] || [51.5, -0.3];
  };
  // ?ll=lat,lon&z=zoom&icao=hex
  F.parseQuery = function (search) {
    var q = {}, m; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    var out = {};
    if (q.ll && (m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(q.ll)) && Math.abs(+m[1]) <= 89 && Math.abs(+m[2]) <= 180) out.ll = [+m[1], +m[2]];
    if (q.z && /^\d{1,2}(\.\d+)?$/.test(q.z) && +q.z <= 18) out.z = +q.z;
    if (q.icao && /^~?[0-9a-f]{6}$/i.test(q.icao)) out.icao = q.icao.toLowerCase();
    if (q.q && q.q.length <= 10) out.q = q.q;
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = F; else root.MESFlights = F;
})(this);

/* MES Flight Tracker (mes.fm/flights): live air traffic on a MapLibre GL map (OpenFreeMap tiles).
   Positions: /api/flights (adsb.lol through our cached function), asked every 10 s for the grid cell covering the view; planes glide
   along their track between answers (F.project). Usual routes: straight from vrs-standing-data.adsb.lol (CORS open, no quota).
   Local previews (127.0.0.1 / localhost) and ?mock=1 read mes.fm/flights/data/sample.json instead (no /api there).
   Settings: localStorage mes-flights:v1. Debug hook: window.MESFlightsDebug. */
(function () {
	'use strict';
	var F = window.MESFlights, root = document.getElementById('fl');
	if (!F || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var qs = new URLSearchParams(location.search);
	var MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	var ML = ['https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.1/dist/', 'https://unpkg.com/maplibre-gl@5.24.1/dist/'];
	var KEY = 'mes-flights:v1', POLL_MS = 10000, MIL_MS = 30000, IDLE_MS = 15 * 60000;
	var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

	var S = { style: 'auto', units: 'aviation', labels: true, globe: false, mil: false, sort: 'alt', dir: 'desc', filter: Object.assign({}, F.DEFAULT_FILTER), view: null };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.keys(S).forEach(function (k) { if (sv[k] != null) S[k] = k === 'filter' ? Object.assign({}, F.DEFAULT_FILTER, sv[k], { q: '' }) : sv[k]; }); } catch (e) { /* defaults */ }
	var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
	var Q = F.parseQuery(location.search);

	var map = null, ready = false;
	var cellAc = [], milAc = [], found = {};      // latest planes from the cell, the military layer, and searched-for planes (kept 3 min)
	var recv = 0, cellAge = 0, milRecv = 0, milAge = 0, lastCell = null, lastOk = 0, limited = '', errMsg = '';
	var trails = {};                             // hex -> [[lon, lat, alt]] seen live (plus the loaded trace for the selected plane)
	var sel = null, follow = false, routes = {}, traces = {}, showTrail = true;
	var paused = false, autoPaused = false, lastAct = Date.now(), pollT = 0, milT = 0, busy = false;
	var sample = null;

	/* ---------- loading MapLibre ---------- */
	function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
	function loadCss(href) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
	async function loadML() {
		for (var i = 0; i < ML.length; i++) {
			try { loadCss(ML[i] + 'maplibre-gl.css'); await loadScript(ML[i] + 'maplibre-gl.js'); if (window.maplibregl) return; } catch (e) { /* next */ }
		}
		throw new Error('map library');
	}
	var isDark = function () { return document.body.classList.contains('dark-mode'); };
	var styleName = function () { return S.style === 'auto' ? (isDark() ? 'dark' : 'positron') : S.style; };
	var styleUrl = function () { return 'https://tiles.openfreemap.org/styles/' + styleName(); };
	var darkMap = function () { return styleName() === 'dark'; };

	/* ---------- plane icons (white silhouettes, drawn as SDF so each plane takes its altitude colour) ---------- */
	function icon(kind) {
		var n = 64, c = document.createElement('canvas'); c.width = c.height = n; var g = c.getContext('2d');
		g.fillStyle = '#fff'; g.translate(n / 2, n / 2);
		if (kind === 'heli') {
			g.beginPath(); g.ellipse(0, 4, 9, 13, 0, 0, Math.PI * 2); g.fill();
			g.fillRect(-2, 14, 4, 16); g.fillRect(-7, 27, 14, 3);
			g.save(); g.rotate(Math.PI / 4); g.fillRect(-27, -2, 54, 4); g.rotate(Math.PI / 2); g.fillRect(-27, -2, 54, 4); g.restore();
		} else if (kind === 'small') {
			g.beginPath(); g.moveTo(0, -24); g.lineTo(3, -16); g.lineTo(3, -6); g.lineTo(25, -3); g.lineTo(25, 2); g.lineTo(3, 3); g.lineTo(2, 17); g.lineTo(10, 20); g.lineTo(10, 24);
			g.lineTo(-10, 24); g.lineTo(-10, 20); g.lineTo(-2, 17); g.lineTo(-3, 3); g.lineTo(-25, 2); g.lineTo(-25, -3); g.lineTo(-3, -6); g.lineTo(-3, -16); g.closePath(); g.fill();
		} else {
			g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(4.5, -24, 4.5, -16); g.lineTo(4.5, -6); g.lineTo(28, 6); g.lineTo(28, 10); g.lineTo(4.5, 4); g.lineTo(3.5, 18);
			g.lineTo(12, 24); g.lineTo(12, 27); g.lineTo(0, 24); g.lineTo(-12, 27); g.lineTo(-12, 24); g.lineTo(-3.5, 18); g.lineTo(-4.5, 4); g.lineTo(-28, 10); g.lineTo(-28, 6);
			g.lineTo(-4.5, -6); g.lineTo(-4.5, -16); g.quadraticCurveTo(-4.5, -24, 0, -28); g.closePath(); g.fill();
		}
		return g.getImageData(0, 0, n, n);
	}
	function iconFor(p) { if (F.isHeli(p.c, p.t)) return 'fl-heli'; if (p.c === 'A1' || p.c === 'B1' || p.c === 'B4') return 'fl-small'; return 'fl-jet'; }

	/* ---------- the merged plane list ---------- */
	function allPlanes() {
		var now = Date.now(), seen = {}, out = [];
		var add = function (p, age, at) { if (seen[p.h]) return; seen[p.h] = 1; out.push({ p: p, base: at - ((p.s || 0) + age) * 1000 }); };
		cellAc.forEach(function (p) { add(p, cellAge, recv); });
		if (S.mil) milAc.forEach(function (p) { add(p, milAge, milRecv); });
		Object.keys(found).forEach(function (h) { var x = found[h]; if (now - x.at > 180000) delete found[h]; else add(x.p, x.age, x.at); });
		return out;
	}
	function posOf(x) { // where the plane is now: last fix moved forward along its track
		var dt = (Date.now() - x.base) / 1000;
		if (x.p.g && !(x.p.gs > 3)) return [x.p.la, x.p.lo];
		return F.project(x.p.la, x.p.lo, x.p.gs, x.p.tr, dt);
	}
	function findX(h) { var a = allPlanes(); for (var i = 0; i < a.length; i++) if (a[i].p.h === h) return a[i]; return null; }
	var shown = function () { return allPlanes().filter(function (x) { return F.keep(x.p, S.filter) || x.p.h === sel; }); };

	/* ---------- map layers ---------- */
	var FC = function (f) { return { type: 'FeatureCollection', features: f || [] }; };
	function addLayers() {
		if (!map) return;
		[['fl-jet', 'jet'], ['fl-small', 'small'], ['fl-heli', 'heli']].forEach(function (i) { if (!map.hasImage(i[0])) map.addImage(i[0], icon(i[1]), { sdf: true, pixelRatio: 2 }); });
		var src = function (id) { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: FC() }); };
		['fl-cov', 'fl-trail', 'fl-route', 'fl-planes', 'fl-apts'].forEach(src);
		var dk = darkMap();
		if (!map.getLayer('fl-cov')) map.addLayer({ id: 'fl-cov', type: 'line', source: 'fl-cov', paint: { 'line-color': dk ? '#9cc4ff' : '#1d6fd1', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.7 } });
		if (!map.getLayer('fl-route')) map.addLayer({ id: 'fl-route', type: 'line', source: 'fl-route', paint: { 'line-color': dk ? '#e6e6e6' : '#4b5563', 'line-width': 1.6, 'line-dasharray': [2, 2.5], 'line-opacity': 0.8 } });
		if (!map.getLayer('fl-trail')) map.addLayer({ id: 'fl-trail', type: 'line', source: 'fl-trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': 3 } });
		if (!map.getLayer('fl-apts')) map.addLayer({ id: 'fl-apts', type: 'circle', source: 'fl-apts', paint: { 'circle-radius': 5, 'circle-color': dk ? '#111' : '#fff', 'circle-stroke-color': dk ? '#e6e6e6' : '#374151', 'circle-stroke-width': 2 } });
		if (!map.getLayer('fl-sel')) map.addLayer({ id: 'fl-sel', type: 'circle', source: 'fl-planes', filter: ['==', ['get', 'h'], ''], paint: { 'circle-radius': 17, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2.5, 'circle-stroke-color': dk ? '#fde047' : '#111827' } });
		if (!map.getLayer('fl-pl')) map.addLayer({ id: 'fl-pl', type: 'symbol', source: 'fl-planes',
			layout: { 'icon-image': ['get', 'ic'], 'icon-rotate': ['get', 'tr'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
				'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.42, 7, 0.62, 11, 0.85],
				'text-field': S.labels ? ['step', ['zoom'], '', 7, ['get', 'lb']] : '', 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true },
			paint: { 'icon-color': ['get', 'col'], 'icon-halo-color': dk ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)', 'icon-halo-width': 1.4,
				'text-color': dk ? '#f1f5f9' : '#111827', 'text-halo-color': dk ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 } });
		try { map.setProjection({ type: S.globe ? 'globe' : 'mercator' }); } catch (e) { /* older engine */ }
		ready = true; draw(); drawCover(); drawSel();
	}
	function draw() {
		if (!ready) return;
		var feats = shown().map(function (x) {
			var p = x.p, pos = posOf(x), emerg = F.isEmerg(p);
			return { type: 'Feature', geometry: { type: 'Point', coordinates: [pos[1], pos[0]] },
				properties: { h: p.h, ic: iconFor(p), col: emerg ? '#e11d48' : F.altColor(p), tr: p.tr || 0, lb: F.label(p) } };
		});
		var s = map.getSource('fl-planes'); if (s) s.setData(FC(feats));
		if (sel) {
			var x = findX(sel);
			if (x && showTrail) { var pos = posOf(x), t = (trails[sel] || []).concat([[pos[1], pos[0], x.p.g ? -1 : x.p.a]]); setTrail(t); }
			if (x && follow) map.easeTo({ center: [posOf(x)[1], posOf(x)[0]], offset: offs(), duration: 900, easing: function (k) { return k; } });
		}
	}
	function setTrail(pts) {
		var f = [];
		for (var i = 1; i < pts.length; i++) {
			var a = pts[i - 1], b = pts[i]; if (Math.abs(a[0] - b[0]) > 180) continue;
			f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a[0], a[1]], [b[0], b[1]]] }, properties: { col: F.altColor(b[2] === -1 ? { g: 1 } : { a: b[2] }) } });
		}
		var s = map && map.getSource('fl-trail'); if (s) s.setData(FC(f));
	}
	function circle(lat, lon, rNm) {
		var c = [], n = 96;
		for (var i = 0; i <= n; i++) {
			var th = 360 * i / n, la1 = lat * Math.PI / 180, d = rNm * 1852 / 6371008.8, tt = th * Math.PI / 180;
			var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(tt));
			var lo2 = lon + Math.atan2(Math.sin(tt) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2)) * 180 / Math.PI;
			c.push([lo2, la2 * 180 / Math.PI]);
		}
		return c;
	}
	function drawCover() {
		if (!ready) return; var s = map.getSource('fl-cov'); if (!s) return;
		var c = want();
		s.setData(FC(c.partial ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: circle(+c.lat, +c.lon, c.r) }, properties: {} }] : []));
	}
	function drawSel() { if (ready && map.getLayer('fl-sel')) map.setFilter('fl-sel', ['==', ['get', 'h'], sel || '']); }

	/* ---------- which area to ask for ---------- */
	function want() {
		if (!map) { var v = S.view || {}; return F.cellFor(v.lat || 0, v.lon || 0, 100); }
		var c = map.getCenter(), b = map.getBounds();
		var corners = [[b.getNorth(), b.getWest()], [b.getNorth(), b.getEast()], [b.getSouth(), b.getWest()], [b.getSouth(), b.getEast()]];
		return F.cellFor(c.lat, c.lng, F.viewNeed(c.lat, c.lng, corners));
	}

	/* ---------- fetching ---------- */
	async function getSample() {
		if (!sample) sample = await fetch('/flights/data/sample.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
		return sample;
	}
	var mockT0 = Date.now();
	async function api(q) {
		if (MOCK) {
			var s = await getSample(), age = (Date.now() - mockT0) / 1000;
			if (q.mil) return Object.assign({}, s.mil, { age: age });
			if (q.trace) return s.trace && s.trace.hex === q.trace ? s.trace : { pts: [] };
			if (q.find) { var k = F.findKind(q.find), list = s.cell.ac.concat(s.mil.ac); return { age: age, ac: list.filter(function (p) { return k && ((k.kind === 'hex' && p.h === k.v) || (k.kind === 'callsign' && p.f === k.v) || (k.kind === 'reg' && (p.r || '').replace(/-/g, '') === k.v.replace(/-/g, ''))); }) }; }
			return Object.assign({}, s.cell, { age: age });
		}
		var u = '/api/flights?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
		var r = await fetch(u), j = await r.json().catch(function () { return {}; });
		if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.retry = j.retry; throw e; }
		return j;
	}
	async function poll(force) {
		clearTimeout(pollT);
		if (paused || document.hidden) return;
		if (Date.now() - lastAct > IDLE_MS) { setPaused(true, true); return; }
		if (busy && !force) { pollT = setTimeout(poll, 1500); return; }
		var c = want(); busy = true;
		try {
			var j = await api({ lat: c.lat, lon: c.lon, r: c.r });
			cellAc = j.ac || []; cellAge = j.age || 0; recv = Date.now(); lastCell = c.key; lastOk = Date.now();
			limited = j.limited || ''; errMsg = '';
			cellAc.forEach(function (p) { if (!p.g || p.gs > 3) { var t = trails[p.h] || (trails[p.h] = []), last = t[t.length - 1]; if (!last || last[0] !== p.lo || last[1] !== p.la) { t.push([p.lo, p.la, p.g ? -1 : p.a]); if (t.length > 400) t.shift(); } } });
			if (sel && !findX(sel)) await refind(sel);
		} catch (e) {
			errMsg = String(e.message || e); limited = '';
		} finally { busy = false; }
		pruneTrails(); draw(); drawCover(); status(); table(); info();
		pollT = setTimeout(poll, limited ? Math.max(POLL_MS, 30000) : POLL_MS);
	}
	async function pollMil() {
		clearTimeout(milT);
		if (!S.mil || paused || document.hidden) return;
		try { var j = await api({ mil: 1 }); milAc = j.ac || []; milAge = j.age || 0; milRecv = Date.now(); } catch (e) { /* keep the old list */ }
		draw(); status(); table();
		milT = setTimeout(pollMil, MIL_MS);
	}
	function pruneTrails() { var keep = {}; allPlanes().forEach(function (x) { keep[x.p.h] = 1; }); Object.keys(trails).forEach(function (h) { if (!keep[h] && h !== sel) delete trails[h]; }); }
	async function refind(h) { // the selected plane left the loaded area: look it up by its code
		try { var j = await api({ find: h }); if (j.ac && j.ac[0]) found[h] = { p: j.ac[0], age: j.age || 0, at: Date.now() }; } catch (e) { /* gone */ }
	}

	/* ---------- status, legend, messages ---------- */
	function status() {
		var all = allPlanes(), vis = shown().length, el = $('fl-count');
		var ago = lastOk ? Math.round((Date.now() - lastOk) / 1000 + (MOCK ? 0 : cellAge)) : null;
		var txt = all.length ? vis + (vis !== all.length ? ' of ' + all.length : '') + ' planes' : (lastOk ? 'No planes here' : 'Loading…');
		var live = paused ? 'Paused' : errMsg ? 'Not updating' : limited ? 'Feed busy' : ago != null ? 'Live · ' + (ago < 3 ? 'just now' : ago + ' s ago') : '';
		el.innerHTML = '<b>' + esc(txt) + '</b>' + (live ? ' <span class="fl-live' + (paused || errMsg || limited ? ' is-off' : '') + '">' + esc(live) + '</span>' : '') + (MOCK ? ' <span class="fl-live is-off">sample data</span>' : '');
		var msg = '', c = want();
		if (errMsg) msg = 'The planes could not be loaded: ' + errMsg + ' Trying again every few seconds.';
		else if (limited) msg = limited;
		else if (c.partial) msg = 'Zoomed far out: planes are loaded within 250 nautical miles of the middle of the map (the dashed circle). Zoom in, or drag the map, to load another area.';
		var m = $('fl-msg'); m.hidden = !msg; m.textContent = msg;
	}
	function legend() {
		var u = S.units === 'metric', stops = [0, 2000, 4000, 6000, 8000, 10000, 20000, 30000, 40000], g = stops.map(function (a, i) { return 'hsl(' + Math.round(F.altHue(a)) + ',88%,48%) ' + Math.round(i / (stops.length - 1) * 100) + '%'; }).join(',');
		var lab = (u ? ['0', '3k', '6k', '9k', '12k m'] : ['0', '10k', '20k', '30k', '40k ft']);
		$('fl-legend').innerHTML = '<div class="fl-lgbar" style="background:linear-gradient(90deg,' + g + ')"></div><div class="fl-lglab">' + lab.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div><div class="fl-lgg"><i></i>on the ground <i class="fl-lge"></i>emergency</div>';
	}

	/* ---------- the info panel ---------- */
	function info() {
		var box = $('fl-info');
		if (!sel) { box.hidden = true; return; }
		var x = findX(sel);
		if (!x) { box.hidden = false; box.innerHTML = '<div class="fl-ihead"><b class="fl-ics">' + esc(sel.toUpperCase()) + '</b><button type="button" class="fl-ix" data-a="close" aria-label="Close">&times;</button></div><p class="fl-inote">This aircraft is not being heard right now (out of range of the receivers, or it has landed).</p>'; return; }
		var p = x.p, u = S.units, pos = posOf(x), tr = traces[p.h], cs = p.f || '';
		var desc = p.d || (tr && tr.d) || '';
		var rt = routes[cs], rHtml = '';
		if (cs && F.routeUrl(cs)) {
			if (rt === undefined) { rHtml = '<p class="fl-inote">Looking up the usual route…</p>'; getRoute(cs); }
			else if (!rt) rHtml = '<p class="fl-inote">Usual route not known for ' + esc(cs) + '.</p>';
			else {
				var a = rt.airports, plaus = F.routePlausible(rt, pos[0], pos[1]), prog = plaus ? F.routeProgress(rt, pos[0], pos[1]) : null;
				rHtml = '<div class="fl-route"><div class="fl-rapts">' + a.map(function (ap, i) { return (i ? '<span class="fl-rarr">→</span>' : '') + '<span class="fl-rap"><b>' + esc(ap.iata || ap.icao) + '</b><small>' + esc(ap.city || ap.name) + '</small></span>'; }).join('') + '</div>' +
					(prog != null ? '<div class="fl-prog" role="img" aria-label="' + Math.round(prog * 100) + '% of the way"><i style="width:' + Math.round(prog * 100) + '%"></i></div>' : '') +
					'<p class="fl-inote">' + (plaus ? 'Usual route for this flight number (community data, can be wrong).' : 'This flight number usually flies ' + esc(a[0].iata || a[0].icao) + ' → ' + esc(a[a.length - 1].iata || a[a.length - 1].icao) + ', but the plane is far from that route, so today it is probably flying something else.') + '</p></div>';
			}
		}
		var row = function (k, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
		var sq = p.sq ? esc(p.sq) + (F.SQUAWK[p.sq] ? ' · ' + esc(F.SQUAWK[p.sq]) : '') : '–';
		var seen = Math.max(0, Math.round((Date.now() - x.base) / 1000));
		var tags = (p.m ? '<span class="fl-tag">Military</span>' : '') + (F.isEmerg(p) ? '<span class="fl-tag is-e">' + esc(p.e && p.e !== 'general' ? 'Emergency: ' + p.e : 'Emergency') + '</span>' : '') + (p.src === 'mlat' ? '<span class="fl-tag is-s">MLAT</span>' : '');
		box.hidden = false;
		box.innerHTML = '<div class="fl-ihead"><div><b class="fl-ics">' + esc(F.label(p)) + '</b><span class="fl-itype">' + esc([p.t, desc].filter(Boolean).join(' · ') || (F.CATEGORY[p.c] || 'Aircraft')) + '</span></div><button type="button" class="fl-ix" data-a="close" aria-label="Close">&times;</button></div>' +
			(tags ? '<div class="fl-tags">' + tags + '</div>' : '') + rHtml +
			'<dl class="fl-grid">' + row('Altitude', esc(F.fmtAlt(p, u))) + row('Speed', esc(F.fmtSpeed(p.gs, u))) + row('Climb', esc(F.fmtVr(p.vr, u))) +
			row('Heading', p.tr != null ? Math.round(p.tr) + '° ' + F.compass(p.tr) : '–') + row('Squawk', sq, F.SQUAWK[p.sq] ? 'is-e' : '') + row('Registration', esc(p.r || '–')) +
			row('ICAO code', esc(p.h.toUpperCase())) + row('Kind', esc(F.CATEGORY[p.c] || '–')) +
			(p.sel != null ? row('Autopilot set to', esc(F.fmtAlt({ a: p.sel }, u))) : '') +
			row('Position', pos[0].toFixed(3) + ', ' + pos[1].toFixed(3)) + row('Last heard', seen < 2 ? 'just now' : seen + ' s ago') + '</dl>' +
			'<div class="fl-iact"><button type="button" class="tu-btn' + (follow ? '' : ' tu-btn--ghost') + '" data-a="follow" aria-pressed="' + follow + '">' + (follow ? '◉ Following' : '◎ Follow') + '</button>' +
			'<button type="button" class="tu-btn tu-btn--ghost" data-a="trail" aria-pressed="' + showTrail + '">' + (showTrail ? 'Hide trail' : 'Show trail') + '</button>' +
			'<button type="button" class="tu-btn tu-btn--ghost" data-a="link">Copy link</button>' +
			'<a class="tu-btn tu-btn--ghost" href="https://adsb.lol/?icao=' + encodeURIComponent(p.h) + '" target="_blank" rel="noopener">adsb.lol ↗</a></div>';
	}
	async function getRoute(cs) {
		if (routes[cs] !== undefined || getRoute[cs]) return; getRoute[cs] = 1;
		try { var r = await fetch(F.routeUrl(cs)); routes[cs] = r.ok ? F.parseRoute(await r.json()) : null; } catch (e) { routes[cs] = null; }
		if (sel && (findX(sel) || {}).p && findX(sel).p.f === cs) { info(); drawRoute(); }
	}
	function drawRoute() {
		var s = map && map.getSource('fl-route'), a = map && map.getSource('fl-apts'); if (!s) return;
		var x = sel && findX(sel), rt = x && x.p.f && routes[x.p.f], pos = x && posOf(x);
		if (!rt || !F.routePlausible(rt, pos[0], pos[1])) { s.setData(FC()); a.setData(FC()); return; }
		var line = [], ap = rt.airports;
		for (var i = 1; i < ap.length; i++) line = line.concat(gc(ap[i - 1], ap[i]));
		for (var j = 1; j < line.length; j++) { while (line[j][0] - line[j - 1][0] > 180) line[j][0] -= 360; while (line[j][0] - line[j - 1][0] < -180) line[j][0] += 360; }
		s.setData(FC([{ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: {} }]));
		a.setData(FC(ap.map(function (q) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [q.lon, q.lat] }, properties: {} }; })));
	}
	function gc(A, B) { // great-circle points
		var r = Math.PI / 180, p1 = A.lat * r, l1 = A.lon * r, p2 = B.lat * r, l2 = B.lon * r, out = [];
		var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
		if (!d) return [[A.lon, A.lat]];
		for (var i = 0; i <= 64; i++) {
			var f = i / 64, a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
			var x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2), y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2), z = a * Math.sin(p1) + b * Math.sin(p2);
			out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x * x + y * y)) / r]);
		}
		return out;
	}
	async function loadTrace(h) {
		if (traces[h]) return;
		traces[h] = { pts: [] };
		try {
			var t = await api({ trace: h }); traces[h] = t;
			if (t.pts && t.pts.length) {
				var live = trails[h] || [], first = live.length ? live[0] : null, older = t.pts.map(function (q) { return [q[2], q[1], q[3]]; });
				trails[h] = older.concat(live).slice(-1600); if (first) { /* the live points carry on from the trace */ }
			}
		} catch (e) { /* no trail */ }
		if (sel === h) { draw(); info(); }
	}
	function select(h, fly) {
		sel = h; follow = false;
		if (!h) { setTrail([]); drawRoute(); drawSel(); info(); urlSync(); return; }
		var x = findX(h);
		if (x && x.p.f && F.routeUrl(x.p.f)) getRoute(x.p.f);
		loadTrace(h); drawSel(); drawRoute(); info(); draw(); urlSync();
		if (x && fly) map.flyTo({ center: [posOf(x)[1], posOf(x)[0]], offset: offsFor(), zoom: Math.max(map.getZoom(), 7), speed: 1.6 });
		if (x && !fly) { // keep the plane out from under the info panel
			var pt = map.project([posOf(x)[1], posOf(x)[0]]), r = $('fl-info').getBoundingClientRect(), s0 = $('fl-stage').getBoundingClientRect();
			if (pt.x + s0.left >= r.left - 20 && pt.x + s0.left <= r.right + 20 && pt.y + s0.top >= r.top - 20 && pt.y + s0.top <= r.bottom + 20) map.easeTo({ center: [posOf(x)[1], posOf(x)[0]], offset: offsFor(), duration: 600 });
		}
	}
	// where the followed plane should sit: in the middle of the part of the map the info panel does not cover
	function offsFor() {
		var b = $('fl-info'); if (!b || b.hidden) b = null;
		var w = b ? b.offsetWidth : 0, h = b ? b.offsetHeight : 0;
		if (window.innerWidth <= 640) return [0, -Math.round(h / 2)];
		return [Math.round(w / 2), 0];
	}
	function offs() { return offsFor(); }

	/* ---------- the table under the map ---------- */
	function table() {
		if (!map) return;
		var b = map.getBounds(), list = shown().filter(function (x) { var pos = posOf(x); return b.contains([pos[1], pos[0]]); }).map(function (x) { return x.p; });
		var sorted = F.sort(list, S.sort, S.dir), max = 200, u = S.units;
		$('fl-tbody').innerHTML = sorted.slice(0, max).map(function (p) {
			return '<tr data-h="' + p.h + '"' + (p.h === sel ? ' class="is-sel"' : '') + '><td><i class="fl-dot" style="background:' + (F.isEmerg(p) ? '#e11d48' : F.altColor(p)) + '"></i>' + esc(F.label(p)) + (p.m ? ' <span class="fl-mini">MIL</span>' : '') + '</td><td>' + esc(p.t || '–') + '</td><td>' + esc(p.r || '–') + '</td><td>' + esc(F.fmtAlt(p, u)) + '</td><td>' + esc(F.fmtSpeed(p.gs, u)) + '</td><td>' + esc(F.fmtVr(p.vr, u)) + '</td></tr>';
		}).join('') || '<tr><td colspan="6" class="fl-empty">No planes in view with these filters.</td></tr>';
		$('fl-lcount').textContent = list.length ? '(' + list.length + ')' : '';
		$('fl-lnote').textContent = list.length > max ? 'Showing ' + max + ' of ' + list.length + '. Zoom in or sort by another column to see others.' : 'Click a row to show that plane on the map.';
		Array.prototype.forEach.call(document.querySelectorAll('#fl-table th button'), function (bt) { bt.setAttribute('aria-sort', bt.dataset.s === S.sort ? (S.dir === 'desc' ? 'descending' : 'ascending') : 'none'); bt.parentNode.setAttribute('aria-sort', bt.dataset.s === S.sort ? (S.dir === 'desc' ? 'descending' : 'ascending') : 'none'); });
	}

	/* ---------- pause / idle ---------- */
	function setPaused(on, auto) {
		paused = on; autoPaused = !!(on && auto);
		var b = $('fl-pause'); b.setAttribute('aria-pressed', String(on)); b.innerHTML = on ? '▶&#xFE0E; Resume' : '⏸&#xFE0E; Pause';
		$('fl-pausebox').hidden = !on;
		$('fl-pausetext').textContent = auto ? 'Paused after 15 minutes without a click, to share the free flight data feed fairly. Press Resume to carry on.' : 'Paused: the planes stop updating.';
		if (!on) { lastAct = Date.now(); poll(true); pollMil(); }
		status();
	}
	['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
	document.addEventListener('visibilitychange', function () { if (!document.hidden && !paused) { poll(true); pollMil(); } });

	/* ---------- URL ---------- */
	var urlT = 0;
	function urlSync() {
		clearTimeout(urlT);
		urlT = setTimeout(function () {
			if (!map) return; var c = map.getCenter(), p = new URLSearchParams(location.search);
			p.set('ll', c.lat.toFixed(3) + ',' + c.lng.toFixed(3)); p.set('z', map.getZoom().toFixed(1)); if (sel) p.set('icao', sel); else p.delete('icao'); p.delete('q');
			history.replaceState(null, '', location.pathname + '?' + p.toString());
			S.view = { lat: +c.lat.toFixed(3), lon: +c.lng.toFixed(3), z: +map.getZoom().toFixed(1) }; save();
		}, 500);
	}

	/* ---------- search ---------- */
	async function search(q) {
		q = String(q || '').trim(); if (!q) return;
		var up = q.toUpperCase().replace(/[\s-]/g, '');
		var hit = allPlanes().filter(function (x) { var p = x.p; return [p.f, (p.r || '').replace(/-/g, ''), p.h.toUpperCase()].indexOf(up) >= 0; })[0]
			|| allPlanes().filter(function (x) { return F.matchText(x.p, q); })[0];
		if (hit) { select(hit.p.h, true); toast(''); return; }
		var k = F.findKind(q);
		if (!k) { toast('Type a callsign (ACA855), a registration (C-GHAZ) or a 6-character ICAO code.'); return; }
		toast('Looking for ' + q.toUpperCase() + '…');
		try {
			var j = await api({ find: q });
			if (j.ac && j.ac[0]) { var p = j.ac[0]; found[p.h] = { p: p, age: j.age || 0, at: Date.now() }; map.jumpTo({ center: [p.lo, p.la], zoom: Math.max(map.getZoom(), 7) }); select(p.h, false); toast(''); poll(true); }
			else toast(q.toUpperCase() + ' is not being heard right now. It may be on the ground, outside receiver range, or spelled differently.');
		} catch (e) { toast('Could not search right now: ' + (e.message || e)); }
	}
	var toastT = 0;
	function toast(t) { clearTimeout(toastT); var m = $('fl-msg'); if (!t) { status(); return; } m.hidden = false; m.textContent = t; toastT = setTimeout(status, 7000); }

	/* ---------- filters + map settings UI ---------- */
	function fUI() {
		var f = S.filter, u = S.units === 'metric';
		var fa = function (v) { return u ? Math.round(v * 0.3048).toLocaleString('en-US') + ' m' : v.toLocaleString('en-US') + ' ft'; };
		$('fl-amin').value = f.minAlt; $('fl-amax').value = f.maxAlt;
		$('fl-amin-v').textContent = fa(f.minAlt); $('fl-amax-v').textContent = f.maxAlt >= 50000 ? 'any' : fa(f.maxAlt);
		$('fl-ground').checked = f.ground; $('fl-heli').checked = f.heli; $('fl-onlyheli').checked = f.onlyHeli; $('fl-onlymil').checked = f.onlyMil; $('fl-onlyemerg').checked = f.onlyEmerg;
		var n = (f.minAlt > 0) + (f.maxAlt < 50000) + !f.ground + !f.heli + f.onlyHeli + f.onlyMil + f.onlyEmerg, bd = $('fl-fbadge');
		bd.hidden = !n; bd.textContent = n;
		$('fl-style').value = S.style; $('fl-units').value = S.units; $('fl-labels').checked = S.labels; $('fl-globe').checked = S.globe; $('fl-mil').checked = S.mil;
	}
	function fChange() {
		var f = S.filter;
		f.minAlt = +$('fl-amin').value; f.maxAlt = +$('fl-amax').value; if (f.maxAlt <= f.minAlt) { f.maxAlt = Math.min(50000, f.minAlt + 1000); }
		f.ground = $('fl-ground').checked; f.heli = $('fl-heli').checked; f.onlyHeli = $('fl-onlyheli').checked; f.onlyMil = $('fl-onlymil').checked; f.onlyEmerg = $('fl-onlyemerg').checked;
		if (f.onlyHeli) f.heli = true;
		save(); fUI(); draw(); status(); table();
	}
	['fl-amin', 'fl-amax', 'fl-ground', 'fl-heli', 'fl-onlyheli', 'fl-onlymil', 'fl-onlyemerg'].forEach(function (id) { $(id).addEventListener('input', fChange); });
	$('fl-freset').addEventListener('click', function () { S.filter = Object.assign({}, F.DEFAULT_FILTER); save(); fUI(); draw(); status(); table(); });
	$('fl-style').addEventListener('change', function () { S.style = this.value; save(); restyle(); });
	$('fl-units').addEventListener('change', function () { S.units = this.value; save(); fUI(); legend(); info(); table(); });
	$('fl-labels').addEventListener('change', function () { S.labels = this.checked; save(); if (ready) map.setLayoutProperty('fl-pl', 'text-field', S.labels ? ['step', ['zoom'], '', 7, ['get', 'lb']] : ''); });
	$('fl-globe').addEventListener('change', function () { S.globe = this.checked; save(); try { map.setProjection({ type: S.globe ? 'globe' : 'mercator' }); } catch (e) { /* none */ } });
	$('fl-mil').addEventListener('change', function () { S.mil = this.checked; save(); if (S.mil) pollMil(); else { milAc = []; draw(); status(); table(); } });
	$('fl-pause').addEventListener('click', function () { setPaused(!paused, false); });
	$('fl-resume').addEventListener('click', function () { setPaused(false); });
	$('fl-sform').addEventListener('submit', function (e) { e.preventDefault(); search($('fl-q').value); });
	$('fl-q').addEventListener('input', function () { S.filter.q = ''; });
	$('fl-near').addEventListener('click', function () {
		if (!navigator.geolocation) { toast('This browser cannot share its location.'); return; }
		toast('Finding where you are…');
		navigator.geolocation.getCurrentPosition(function (g) { toast(''); map.flyTo({ center: [g.coords.longitude, g.coords.latitude], zoom: 8.5 }); }, function () { toast('Location was not shared, so the map stays where it is.'); }, { timeout: 12000, maximumAge: 600000 });
	});
	$('fl-info').addEventListener('click', function (e) {
		var b = e.target.closest('[data-a]'); if (!b) return;
		var a = b.dataset.a;
		if (a === 'close') select(null);
		else if (a === 'follow') { follow = !follow; info(); draw(); }
		else if (a === 'trail') { showTrail = !showTrail; if (!showTrail) setTrail([]); info(); draw(); }
		else if (a === 'link') { urlSync(); setTimeout(function () { var u = location.origin + location.pathname + '?icao=' + sel + '&' + 'll=' + map.getCenter().lat.toFixed(3) + ',' + map.getCenter().lng.toFixed(3) + '&z=' + map.getZoom().toFixed(1); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { b.textContent = 'Copied ✓'; }, function () { window.prompt('Copy this link:', u); }); }, 50); }
	});
	$('fl-tbody').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-h]'); if (tr) { select(tr.dataset.h, true); $('fl-stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } });
	document.querySelector('#fl-table thead').addEventListener('click', function (e) {
		var b = e.target.closest('button[data-s]'); if (!b) return;
		if (S.sort === b.dataset.s) S.dir = S.dir === 'desc' ? 'asc' : 'desc'; else { S.sort = b.dataset.s; S.dir = (b.dataset.s === 'cs' || b.dataset.s === 'type' || b.dataset.s === 'reg') ? 'asc' : 'desc'; }
		save(); table();
	});
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sel && !document.querySelector('.mes-pfill')) select(null); });

	function restyle() { if (!map) return; ready = false; map.setStyle(styleUrl()); }
	new MutationObserver(function () { if (S.style === 'auto' && map) { var want = isDark() ? 'dark' : 'positron'; if (want !== restyle.cur) { restyle.cur = want; restyle(); } } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* ---------- start ---------- */
	async function start() {
		fUI(); legend();
		try { await loadML(); } catch (e) { $('fl-load').textContent = 'The map could not be loaded (check your connection or an ad blocker), then reload the page.'; return; }
		if (MOCK) { try { await getSample(); } catch (e) { /* fine */ } }
		var v = Q.ll ? { lat: Q.ll[0], lon: Q.ll[1], z: Q.z || 8 } : S.view || null;
		if (!v) { var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* none */ } var pl = MOCK && sample ? [+sample.cell.cell.lat, +sample.cell.cell.lon] : F.placeFor(tz); v = { lat: pl[0], lon: pl[1], z: 7.5 }; }
		restyle.cur = styleName();
		map = new maplibregl.Map({ container: 'fl-map', style: styleUrl(), center: [v.lon, v.lat], zoom: v.z || 7.5, maxZoom: 16, minZoom: 1.5, dragRotate: false, pitchWithRotate: false,
			attributionControl: { compact: true, customAttribution: 'Planes: <a href="https://adsb.lol/" target="_blank" rel="noopener">adsb.lol</a> (ODbL)' } });
		map.touchZoomRotate.disableRotation();
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
		map.on('style.load', addLayers);
		map.on('load', function () { $('fl-load').hidden = true; });
		map.on('error', function (e) { if (!ready && e && e.error && /style/i.test(String(e.error.message))) $('fl-load').textContent = 'The map style could not be loaded. Try another look in the Map menu.'; });
		var moveT = 0;
		map.on('moveend', function () { clearTimeout(moveT); moveT = setTimeout(function () { drawCover(); status(); table(); urlSync(); if (want().key !== lastCell) poll(true); }, 600); });
		map.on('dragstart', function (e) { if (e.originalEvent && follow) { follow = false; info(); } });
		var pick = function (pt) { var f = map.queryRenderedFeatures([[pt.x - 12, pt.y - 12], [pt.x + 12, pt.y + 12]], { layers: ['fl-pl'] }); return f.length ? f[0].properties.h : null; };
		map.on('click', function (e) { if (!ready) return; var h = pick(e.point); if (h) select(h, false); else if (sel && !follow) select(null); });
		map.on('mousemove', function (e) { if (ready) map.getCanvas().style.cursor = pick(e.point) ? 'pointer' : ''; });
		if (window.MESPanel) window.MESPanel.add($('fl-view'), { bar: $('fl-vbtns'), stage: $('fl-stage'), onChange: function () { setTimeout(function () { map.resize(); }, 60); } });
		if (window.ResizeObserver) new ResizeObserver(function () { map.resize(); }).observe($('fl-stage'));
		setInterval(function () { if (!paused && !document.hidden && ready) { draw(); } }, 1000);
		setInterval(function () { if (!document.hidden) { status(); if (sel) info(); } }, 5000);
		await poll(true);
		if (S.mil) pollMil();
		if (Q.icao) { if (!findX(Q.icao)) await refind(Q.icao); select(Q.icao, !Q.ll); }
		if (Q.q) { $('fl-q').value = Q.q; search(Q.q); }
	}
	window.MESFlightsDebug = { S: S, map: function () { return map; }, planes: allPlanes, select: select, poll: poll, F: F };
	start();
})();
