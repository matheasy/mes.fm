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
