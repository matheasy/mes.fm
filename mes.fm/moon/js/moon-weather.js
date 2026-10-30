/* MES Moon Weather + Tonight's Moon for mes.fm/moon.
 *
 * Two sections of the hand-made moon page, filled in here:
 *   #mwTonight  weather-style cards for the viewer's own sky (location + time zone come from the
 *               page's main script through window.MES_MOON_CTX and the 'moon-data' event)
 *   #mw         "Moon Weather": the conditions on the Moon's surface right now at a chosen site:
 *               temperature (thermometer + hot / icy imagery), tiles (sunlight, sunrise / sunset in
 *               Earth days, wind, rain / ice, Earth in the sky, gravity calculator, radiation,
 *               moonquakes), a lunar-day temperature chart and a draggable temperature globe.
 * Maths lives in moon-weather-lib.js (MESMoonWx, node-tested: tool_apps_src/moon-weather-tests.js).
 * Theme: the page uses body.light / body.dark; colours are custom properties in moon-weather.css.
 */
(function () {
  'use strict';
  var A = window.Astronomy, W = window.MESMoonWx;
  var root = document.getElementById('mw'), tonightEl = document.getElementById('mwTonight');
  if (!root || !A || !W) return;

  var KEY = 'mes-moonwx:v1';
  var S = { site: 'a11', unit: 'C', view: 'earth', mode: 'temp', custom: null, kg: 70, wu: 'kg', off: 0 };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) S[k] = sv[k]; } catch (e) {}
  S.off = 0;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ site: S.site, unit: S.unit, view: S.view, mode: S.mode, custom: S.custom, kg: S.kg, wu: S.wu })); } catch (e) {} }

  var DAY = 864e5;
  var ser = null, serT = 0;
  function mk(ms) { return new Date(ms); }
  function ensureSeries(now) {
    if (!ser || Math.abs(now - serT) > DAY) { ser = W.series(A, now, 31, 3, mk); serT = now; }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function site() {
    if (S.site === 'custom' && S.custom) return { id: 'custom', name: 'Picked point', lat: S.custom.lat, lon: S.custom.lon, note: 'A point you picked on the globe.' };
    for (var i = 0; i < W.SITES.length; i++) if (W.SITES[i].id === S.site) return W.SITES[i];
    return W.SITES[0];
  }
  function fmtLat(v) { return Math.abs(v).toFixed(1) + '°' + (v >= 0 ? 'N' : 'S'); }
  function fmtLon(v) { return Math.abs(v).toFixed(1) + '°' + (v >= 0 ? 'E' : 'W'); }
  function tC(K) { return W.kToC(K); }
  function sign(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  function tMain(K) { var c = tC(K); return S.unit === 'F' ? sign(Math.round(W.cToF(c))) + '°F' : sign(Math.round(c)) + '°C'; }
  function tAlt(K) { var c = tC(K); return (S.unit === 'F' ? sign(Math.round(c)) + '°C' : sign(Math.round(W.cToF(c))) + '°F') + ' · ' + Math.round(K) + ' K'; }
  function tUnit(c) { return S.unit === 'F' ? W.cToF(c) : c; }
  function dur(ms) {
    var h = Math.abs(ms) / 36e5, d = Math.floor(h / 24);
    return d ? d + ' d ' + Math.round(h - d * 24) + ' h' : Math.round(h) + ' h';
  }
  var BTZ; try { BTZ = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { BTZ = 'UTC'; }
  function tz() { return (window.MES_MOON_CTX && window.MES_MOON_CTX.tz) || BTZ; }
  function fDate(ms, withTime) {
    var o = { timeZone: tz(), month: 'short', day: 'numeric' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    try { return new Date(ms).toLocaleString('en-US', o); } catch (e) { return new Date(ms).toUTCString(); }
  }
  function fTime(ms) {
    try { return new Date(ms).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  // ---------- small SVG pictures ----------
  function thermo(K, h) {
    h = h || 120;
    var lo = 20, hi = 400, f = Math.max(0, Math.min(1, (K - lo) / (hi - lo)));
    var top = 8, bot = h - 30, fillY = bot - (bot - top) * f, c = W.rgb(W.colorK(K));
    var s = '<svg class="mw-thermo" viewBox="0 0 40 ' + h + '" width="34" height="' + h * 34 / 40 + '" aria-hidden="true">';
    s += '<rect x="13" y="' + (top - 4) + '" width="14" height="' + (bot - top + 12) + '" rx="7" class="mw-th-glass"/>';
    s += '<rect x="16.5" y="' + fillY + '" width="7" height="' + (bot - fillY + 6) + '" rx="3.5" fill="' + c + '"/>';
    s += '<circle cx="20" cy="' + (h - 16) + '" r="12" class="mw-th-glass"/><circle cx="20" cy="' + (h - 16) + '" r="8.5" fill="' + c + '"/>';
    [100, 200, 273, 300, 373].forEach(function (k) {
      var y = bot - (bot - top) * (k - lo) / (hi - lo);
      s += '<line x1="27" x2="' + (k === 273 ? 34 : 31) + '" y1="' + y + '" y2="' + y + '" class="mw-th-tick"/>';
    });
    return s + '</svg>';
  }
  function disc(frac, lit, dark, size, rightLit) {
    // A sphere lit by a fraction `frac`; the lit side is on the right when rightLit.
    var r = size / 2 - 1, cx = size / 2, k = 1 - 2 * frac, rx = Math.abs(k) * r;
    var sx = rightLit ? 1 : 0, x0 = cx, y0 = cx - r, y1 = cx + r;
    var path = 'M' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 0 ' + sx + ' ' + x0 + ' ' + y1 +
      ' A' + rx + ' ' + r + ' 0 0 ' + (k > 0 ? 1 - sx : sx) + ' ' + x0 + ' ' + y0 + 'Z';
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="' + dark + '"/>' +
      (frac > 0.005 ? '<path d="' + path + '" fill="' + lit + '"/>' : '') + '</svg>';
  }
  var IC = {
    sun: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="9" fill="#ffc83d"/><g stroke="#ffb020" stroke-width="3" stroke-linecap="round">' +
      [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { var r = a * Math.PI / 180; return '<line x1="' + (24 + 14 * Math.cos(r)).toFixed(1) + '" y1="' + (24 + 14 * Math.sin(r)).toFixed(1) + '" x2="' + (24 + 20 * Math.cos(r)).toFixed(1) + '" y2="' + (24 + 20 * Math.sin(r)).toFixed(1) + '"/>'; }).join('') + '</g></svg>',
    stars: '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="#e8eefc"><circle cx="10" cy="12" r="1.6"/><circle cx="34" cy="8" r="1.2"/><circle cx="40" cy="26" r="1.8"/><circle cx="20" cy="30" r="1.1"/><circle cx="12" cy="40" r="1.4"/><circle cx="30" cy="40" r="1"/><path d="M24 14l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"/></g></svg>',
    wind: '<svg viewBox="0 0 48 48" aria-hidden="true"><line x1="8" y1="6" x2="8" y2="44" stroke="currentColor" stroke-width="2.5"/><path d="M9 9 L18 11 L17 30 L9 32Z" fill="#e8642c" opacity=".9"/></svg>',
    ice: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#8fd3ff" stroke-width="2.4" stroke-linecap="round"><line x1="24" y1="5" x2="24" y2="43"/><line x1="7.5" y1="14.5" x2="40.5" y2="33.5"/><line x1="7.5" y1="33.5" x2="40.5" y2="14.5"/><path d="M19 9l5 5 5-5M19 39l5-5 5 5" fill="none"/></g></svg>',
    rise: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34a14 14 0 0 1 28 0" fill="#ffc83d"/><line x1="4" y1="35" x2="44" y2="35" stroke="currentColor" stroke-width="2.5"/><path d="M24 6v12M18 12l6-6 6 6" stroke="#ffb020" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 12v13l8 5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    weight: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 18h24l6 24H6z" fill="currentColor" opacity=".8"/><circle cx="24" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
    rad: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#ffd43b"/><g fill="#222"><circle cx="24" cy="24" r="3.5"/><path d="M24 24 L14.5 7.5 A19 19 0 0 1 33.5 7.5Z"/><path d="M24 24 L43 24 A19 19 0 0 1 33.5 40.5Z"/><path d="M24 24 L14.5 40.5 A19 19 0 0 1 5 24Z"/></g><circle cx="24" cy="24" r="6" fill="#ffd43b"/><circle cx="24" cy="24" r="3.5" fill="#222"/></svg>',
    quake: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 26h7l4-12 6 22 6-30 5 26 4-10 3 4h7" fill="none" stroke="#e8642c" stroke-width="2.6" stroke-linejoin="round"/></svg>',
    sky: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="5" width="42" height="38" rx="6" fill="#05070d"/><circle cx="34" cy="16" r="5" fill="#ffc83d"/><g fill="#fff"><circle cx="11" cy="13" r="1"/><circle cx="18" cy="24" r="1.2"/><circle cx="38" cy="31" r="1"/><circle cx="25" cy="12" r=".8"/></g><path d="M3 36 Q14 30 24 35 T45 33 V43 H3Z" fill="#8a8f99"/></svg>'
  };

  // ---------- skeleton ----------
  var opts = W.SITES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') +
    '<option value="custom">Picked point on the globe</option>';
  root.innerHTML =
    '<div class="mw-bar">' +
    '<label class="mw-pick">Place on the Moon <select id="mwSite">' + opts + '</select></label>' +
    '<div class="mw-seg" role="group" aria-label="Temperature unit"><button type="button" data-unit="C">°C</button><button type="button" data-unit="F">°F</button></div>' +
    '</div>' +
    '<div class="mw-hero" id="mwHero"></div>' +
    '<div class="mw-tiles" id="mwTiles"></div>' +
    '<figure class="mw-fig" id="mwChartFig"><div class="mw-figbar"><strong>Temperature through the lunar day</strong>' +
    '<span class="mw-figbtns"><button type="button" class="mw-fb" data-fill>⤢ Fill window</button><button type="button" class="mw-fb" data-fs>⛶ Full screen</button></span></div>' +
    '<div class="mw-chartwrap" id="mwChart"></div><figcaption class="mw-cap" id="mwChartCap"></figcaption></figure>' +
    '<figure class="mw-fig" id="mwGlobeFig"><div class="mw-figbar"><strong>Temperature map of the Moon</strong>' +
    '<span class="mw-figbtns"><button type="button" class="mw-fb" data-fill>⤢ Fill window</button><button type="button" class="mw-fb" data-fs>⛶ Full screen</button></span></div>' +
    '<div class="mw-gctl"><div class="mw-seg mw-views" role="group" aria-label="View">' +
    [['earth', 'From Earth'], ['sun', 'From the Sun'], ['near', 'Near side'], ['far', 'Far side'], ['np', 'North pole'], ['sp', 'South pole']].map(function (v) {
      return '<button type="button" data-view="' + v[0] + '">' + v[1] + '</button>';
    }).join('') + '</div><div class="mw-seg" role="group" aria-label="Colouring"><button type="button" data-mode="temp">Temperature</button><button type="button" data-mode="light">Sunlight</button></div></div>' +
    '<div class="mw-globewrap"><canvas id="mwGlobe" tabindex="0" aria-label="Globe of the Moon coloured by surface temperature. Drag to turn it, click to pick a place, arrow keys turn it."></canvas>' +
    '<div class="mw-legend" id="mwLegend"></div></div>' +
    '<div class="mw-timebar"><label for="mwTime">Time</label><input type="range" id="mwTime" min="-360" max="360" step="1" value="0">' +
    '<span id="mwTimeLbl" class="mw-timelbl">now</span><button type="button" class="mw-fb" id="mwPlay">▶ Play</button><button type="button" class="mw-fb" id="mwNow">Now</button></div>' +
    '<figcaption class="mw-cap">Drag to turn the Moon; click (or tap) anywhere to see the weather there. Colours are the model temperature (scale at the side); the dark patches are a rough sketch of the maria, the dark "seas" you see from Earth. ☀ = Sun overhead, ◉ = Earth overhead.</figcaption></figure>' +
    '<div class="mw-compare" id="mwCompare"></div>';

  var $ = function (id) { return document.getElementById(id); };
  var siteSel = $('mwSite');

  // ---------- hero + tiles ----------
  function render() {
    var now = Date.now();
    ensureSeries(now);
    var st = W.interp(ser, now), s = site();
    var K = W.siteTempK(s, st);
    var se = W.sinElev(s.lat, s.lon, st.sunLat, st.sunLon), elev = Math.asin(Math.max(-1, Math.min(1, se))) * 180 / Math.PI;
    var ev = W.sunEvents(ser, s, now);
    var hr = W.localHour(s.lon, st.sunLon);
    // high / low over the lunation around now
    var hi = -1, lo = 1e9;
    for (var i = 0; i < ser.length; i++) {
      if (Math.abs(ser[i].t - now) > W.SYNODIC * DAY / 2) continue;
      var kk = W.siteTempK(s, ser[i]); if (kk > hi) hi = kk; if (kk < lo) lo = kk;
    }
    var lit = elev > 0 && !s.psrK;
    var cls = s.psrK ? 'frozen' : K > 330 ? 'hot' : K > 290 ? 'warm' : K > 200 ? 'cool' : 'cold';
    var phase = s.psrK ? 'Permanent shadow' : elev > 0
      ? (elev < 8 ? (hr < 12 ? 'Lunar sunrise' : 'Lunar sunset') : hr < 10.5 ? 'Lunar morning' : hr <= 13.5 ? 'Lunar midday' : 'Lunar afternoon')
      : (hr >= 12 ? 'Lunar evening (night)' : hr < 3 || hr > 21 ? 'Lunar midnight' : 'Before lunar dawn');
    if (!s.psrK && elev <= 0 && hr >= 18 && hr < 21) phase = 'Lunar night';
    if (!s.psrK && Math.abs(s.lat) > 80 && elev > 0 && elev < 8) phase = 'Sun skimming the horizon';
    var desc = s.psrK ? 'The Sun has not shone on this crater floor for billions of years.'
      : lit ? 'Sun ' + Math.round(elev) + '° above the horizon, in a black sky.'
        : 'Sun ' + Math.round(-elev) + '° below the horizon.';
    var earthEl = Math.asin(Math.max(-1, Math.min(1, W.sinElev(s.lat, s.lon, st.earthLat, st.earthLon)))) * 180 / Math.PI;
    var icon = lit ? IC.sun : (earthEl > 0 ? disc(st.earthFrac, '#5aa9ff', '#0b1a33', 48, true) : IC.stars);
    var hero = $('mwHero');
    hero.className = 'mw-hero mw-' + cls;
    hero.innerHTML =
      '<div class="mw-fx" aria-hidden="true"></div>' +
      '<div class="mw-hthermo">' + thermo(K, 130) + '</div>' +
      '<div class="mw-hmain"><div class="mw-hsite">' + esc(s.name) + ' <span class="mw-muted">' + fmtLat(s.lat) + ' ' + fmtLon(s.lon) + '</span></div>' +
      '<div class="mw-htemp">' + tMain(K) + '<span class="mw-halt">' + tAlt(K) + '</span></div>' +
      '<div class="mw-hcond">' + phase + ' · ' + desc + '</div>' +
      (s.psrK ? '' : '<div class="mw-hhl">High <b>' + tMain(hi) + '</b> &nbsp; Low <b>' + tMain(lo) + '</b> <span class="mw-muted">this lunar day</span></div>') +
      '<div class="mw-hnote">' + esc(s.note) + '</div></div>' +
      '<div class="mw-hicon">' + icon + '</div>';

    // tiles
    var irr = lit ? 1361 / (st.rAU * st.rAU) * se : 0;
    var nextEv = ev.nextRise && (!ev.nextSet || ev.nextRise < ev.nextSet) ? ['Sunrise', ev.nextRise] : ev.nextSet ? ['Sunset', ev.nextSet] : null;
    var dayLen = ev.nextRise && ev.nextSet ? (ev.nextSet > ev.nextRise ? ev.nextSet - ev.nextRise : ev.nextSet - (ev.prevRise || ev.nextSet)) : null;
    var tiles = [];
    tiles.push(tile('sun', 'Sunlight', lit ? Math.round(irr) + ' W/m²' : 'Dark',
      lit ? 'Earth\'s strongest midday sun at ground level is about 1,000 W/m². UV index: off the scale, there is no ozone or air to block it.'
        : s.psrK ? 'Never any direct sunlight here.' : 'The ground glows only with earthshine (if Earth is up) and starlight.', lit ? 'warm' : 'cold'));
    tiles.push(tile('rise', nextEv ? nextEv[0] : 'Sunrise / sunset', nextEv ? 'in ' + dur(nextEv[1] - now) : 'none',
      nextEv ? fDate(nextEv[1], true) + (dayLen ? '. Daylight lasts ' + dur(dayLen) + ' here.' : '')
        : s.psrK ? 'The Sun never clears the crater wall.' : 'No sunrise or sunset in the next month.'));
    tiles.push('<div class="mw-tile"><div class="mw-ti">' + IC.clock + '</div><div class="mw-tt">Lunar time of day</div>' +
      '<div class="mw-tv">' + (s.psrK ? '—' : Math.floor(hr) + ':' + ('0' + Math.floor((hr % 1) * 60)).slice(-2)) + '</div>' +
      '<div class="mw-dial" aria-hidden="true"><span style="left:' + (hr / 24 * 100).toFixed(1) + '%"></span></div>' +
      '<div class="mw-td">One lunar "day" (noon to noon) lasts 29.5 Earth days, so each lunar hour is about 29.5 Earth hours.</div></div>');
    tiles.push(tile('wind', 'Wind', '0 km/h', 'No wind: the Moon\'s "air" (exosphere) is about 100 trillion times thinner than Earth\'s at sea level. Flags on the Moon were held out by a rod.'));
    tiles.push(tile('ice', 'Rain', '0 mm', 'It never rains or snows. But water ice is trapped in the coldest shadowed craters near the poles: LCROSS found about 5.6% water in the plume it kicked up in Cabeus crater (2009).', 'icy'));
    tiles.push(tile('sky', 'Sky', 'Black', 'No air to scatter light, so the sky is black even at noon and stars are out (if your eyes are shaded from the glare).'));
    tiles.push('<div class="mw-tile"><div class="mw-ti">' + disc(st.earthFrac, '#5aa9ff', '#0b1a33', 40, true) + '</div><div class="mw-tt">Earth in the sky</div>' +
      '<div class="mw-tv">' + (s.psrK ? 'Hidden' : earthEl > -1 ? Math.round(earthEl) + '° up' : 'Never seen') + '</div><div class="mw-td">' +
      (s.psrK ? 'The crater walls hide Earth as well as the Sun from the floor. Earth is now ' + Math.round(st.earthFrac * 100) + '% lit as seen from the near side.' : earthEl > -1 ? 'Earth is ' + Math.round(st.earthFrac * 100) + '% lit (the opposite of the Moon\'s phase). It hardly moves in the sky: it only wobbles a few degrees, so it never really rises or sets here.'
        : earthEl > -10 ? 'Earth sits just below the horizon here and peeks up now and then as the Moon wobbles (libration).'
          : 'This place is on the far side: Earth is always below the horizon. Earth is now ' + Math.round(st.earthFrac * 100) + '% lit as seen from the near side.') +
      '</div></div>');
    var kg = +S.kg || 0, wu = S.wu;
    tiles.push('<div class="mw-tile"><div class="mw-ti">' + IC.weight + '</div><div class="mw-tt">Gravity: 1/6 of Earth</div>' +
      '<div class="mw-wcalc"><label>You weigh <input type="number" id="mwKg" min="0" max="2000" step="any" value="' + kg + '" inputmode="decimal"></label>' +
      '<select id="mwWu" aria-label="Unit"><option value="kg"' + (wu === 'kg' ? ' selected' : '') + '>kg</option><option value="lb"' + (wu === 'lb' ? ' selected' : '') + '>lb</option></select></div>' +
      '<div class="mw-tv" id="mwKgOut">' + (Math.round(W.moonWeight(kg) * 10) / 10) + ' ' + wu + '</div>' +
      '<div class="mw-td">on the Moon (1.62 m/s² vs 9.81 m/s²). You could jump about six times higher.</div></div>');
    tiles.push(tile('rad', 'Radiation', '1.37 mSv/day', 'Measured by Chang\'e 4 on the far side in 2019: about 200 times the natural dose at Earth\'s surface and roughly 2.6 times the ISS. No air or magnetic field shields the ground.', 'warm'));
    tiles.push(tile('quake', 'Moonquakes', 'Up to M5', 'Apollo seismometers (1969-1977) recorded about 12,500 moonquakes. Deep ones repeat with the monthly tide; shallow ones reached magnitude ~5 and the ground rang for over 10 minutes.' + (perigee ? ' Next perigee (strongest tide): ' + fDate(perigee) + '.' : '')));
    $('mwTiles').innerHTML = tiles.join('');
    wireWeight();
    renderCompare(K, s);
    renderChart(now);
    if (!dragging) drawGlobe();
  }
  function tile(ic, title, val, desc, mood) {
    return '<div class="mw-tile' + (mood ? ' mw-t-' + mood : '') + '"><div class="mw-ti">' + IC[ic] + '</div><div class="mw-tt">' + title + '</div>' +
      '<div class="mw-tv">' + val + '</div><div class="mw-td">' + desc + '</div></div>';
  }
  var perigee = null;
  try { var aps = A.SearchLunarApsis(new Date()); for (var g = 0; g < 3 && aps.kind !== 0; g++) aps = A.NextLunarApsis(aps); if (aps.kind === 0) perigee = +aps.time.date; } catch (e) {}

  function wireWeight() {
    var inp = $('mwKg'), u = $('mwWu');
    function upd() {
      S.kg = Math.max(0, parseFloat(inp.value) || 0); S.wu = u.value; save();
      $('mwKgOut').textContent = (Math.round(W.moonWeight(S.kg) * 10) / 10) + ' ' + S.wu;
    }
    inp.addEventListener('input', upd); u.addEventListener('change', upd);
  }

  // ---------- compare with your weather ----------
  function renderCompare(K, s) {
    var ctx = window.MES_MOON_CTX, fc = ctx && ctx.fc, city = ctx && ctx.loc ? ctx.loc.label : 'Your location';
    var rows = [];
    if (fc && fc.ok && fc.curTempF != null) rows.push([city + ' now', (fc.curTempF - 32) / 1.8, 'you']);
    rows.push(['Moon: ' + s.name, tC(K), 'moon']);
    rows.push(['Hottest ever on Earth (Death Valley, 1913)', 56.7, 'ref']);
    rows.push(['Coldest ever on Earth (Vostok, Antarctica, 1983)', -89.2, 'ref']);
    rows.push(['Moon equator at noon', tC(392 / Math.sqrt(1)), 'ref']);
    rows.push(['Coldest crater floors (Hermite)', tC(26), 'ref']);
    var lo = -260, hi = 140;
    function X(c) { return Math.max(0, Math.min(100, (c - lo) / (hi - lo) * 100)); }
    var bar = 'linear-gradient(90deg,' + [20, 60, 100, 160, 230, 273, 320, 360, 400].map(function (k) { return W.rgb(W.colorK(k)) + ' ' + X(tC(k)).toFixed(1) + '%'; }).join(',') + ')';
    var h = '<h3 class="mw-h3">Your weather vs the Moon</h3><div class="mw-scale" style="background:' + bar + '">' +
      [-200, -100, 0, 100].map(function (c) { return '<span style="left:' + X(c) + '%">' + Math.round(tUnit(c)) + '°</span>'; }).join('') + '</div><ul class="mw-cmp">';
    rows.forEach(function (r) {
      h += '<li class="mw-c-' + r[2] + '"><span class="mw-cl">' + esc(r[0]) + '</span><span class="mw-ctrack"><i style="left:' + X(r[1]).toFixed(1) + '%;background:' + W.rgb(W.colorK(r[1] + 273.15)) + '"></i></span>' +
        '<b>' + sign(Math.round(tUnit(r[1]))) + '°' + S.unit + '</b></li>';
    });
    h += '</ul>';
    if (!(fc && fc.ok && fc.curTempF != null)) h += '<p class="mw-muted mw-small">Your local temperature appears here once the page has loaded the weather for your location (set it at the top of the page).</p>';
    else {
      var diff = Math.round(Math.abs(tUnit(tC(K)) - tUnit((fc.curTempF - 32) / 1.8)));
      h += '<p class="mw-small">Right now ' + esc(s.name) + ' is <b>' + diff + '°' + S.unit + ' ' + (tC(K) > (fc.curTempF - 32) / 1.8 ? 'hotter' : 'colder') +
        '</b> than ' + esc(city) + '. <a href="#top" id="mwLocLink">Change your location</a></p>';
    }
    $('mwCompare').innerHTML = h;
    var ll = $('mwLocLink');
    if (ll) ll.addEventListener('click', function (e) { e.preventDefault(); var i = document.getElementById('locInput'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } });
  }

  // ---------- lunar-day temperature chart ----------
  var chartFill = false;
  function renderChart(now) {
    var box = $('mwChart'), s = site();
    var Wd = Math.max(320, box.clientWidth || 640), H = chartFill ? Math.max(260, (box.clientHeight || 400)) : (Wd < 500 ? 240 : 280);
    var mL = 44, mR = 12, mT = 14, mB = 34, pw = Wd - mL - mR, ph = H - mT - mB;
    var span = 15 * DAY, t0 = now - span, t1 = now + span;
    var lo = -260, hi = 140;
    function X(t) { return mL + (t - t0) / (t1 - t0) * pw; }
    function Y(c) { return mT + (hi - c) / (hi - lo) * ph; }
    var pts = [], dark = [], inDark = null;
    for (var t = t0; t <= t1; t += 36e5) {
      var st = W.interp(ser, t), k = W.siteTempK(s, st);
      pts.push([t, k]);
      var up = !s.psrK && W.sinElev(s.lat, s.lon, st.sunLat, st.sunLon) > 0;
      if (!up && inDark === null) inDark = t;
      if (up && inDark !== null) { dark.push([inDark, t]); inDark = null; }
    }
    if (inDark !== null) dark.push([inDark, t1]);
    var gid = 'mwg' + Math.random().toString(36).slice(2, 7);
    var svg = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" width="' + Wd + '" height="' + H + '" role="img" aria-label="Surface temperature at ' + esc(s.name) + ' from 15 days ago to 15 days ahead">';
    svg += '<defs><linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + Y(hi) + '" x2="0" y2="' + Y(lo) + '">' +
      [400, 360, 320, 273, 230, 160, 100, 60, 20].map(function (kk) { return '<stop offset="' + ((hi - tC(kk)) / (hi - lo)).toFixed(3) + '" stop-color="' + W.rgb(W.colorK(kk)) + '"/>'; }).join('') + '</linearGradient></defs>';
    dark.forEach(function (d) { svg += '<rect class="mw-night" x="' + X(d[0]).toFixed(1) + '" y="' + mT + '" width="' + (X(d[1]) - X(d[0])).toFixed(1) + '" height="' + ph + '"/>'; });
    for (var c = -250; c <= 100; c += 50) {
      svg += '<line class="mw-grid" x1="' + mL + '" x2="' + (mL + pw) + '" y1="' + Y(c) + '" y2="' + Y(c) + '"/>' +
        '<text class="mw-ax" x="' + (mL - 5) + '" y="' + (Y(c) + 4) + '" text-anchor="end">' + Math.round(tUnit(c)) + '°</text>';
    }
    var refs = [[100, 'Water boils'], [0, 'Water freezes']];
    var ctx = window.MES_MOON_CTX;
    if (ctx && ctx.fc && ctx.fc.ok && ctx.fc.curTempF != null) refs.push([(ctx.fc.curTempF - 32) / 1.8, (ctx.loc && ctx.loc.label || 'You') + ' now', 'you']);
    refs.forEach(function (r) {
      svg += '<line class="mw-ref' + (r[2] ? ' mw-ref-you' : '') + '" x1="' + mL + '" x2="' + (mL + pw) + '" y1="' + Y(r[0]) + '" y2="' + Y(r[0]) + '"/>' +
        '<text class="mw-reft' + (r[2] ? ' mw-ref-you' : '') + '" x="' + (r[2] ? mL + pw * 0.62 : mL + pw - 4) + '" y="' + (Y(r[0]) + (r[2] ? 13 : -4)) + '" text-anchor="end">' + esc(r[1]) + '</text>';
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(tC(p[1])).toFixed(1); }).join('');
    svg += '<path d="' + line + ' L' + X(t1) + ' ' + Y(lo) + ' L' + X(t0) + ' ' + Y(lo) + 'Z" fill="url(#' + gid + ')" opacity=".22"/>';
    svg += '<path d="' + line + '" fill="none" stroke="url(#' + gid + ')" stroke-width="3.2" stroke-linejoin="round"/>';
    for (var dd = -15; dd <= 15; dd += 5) {
      var tx = X(now + dd * DAY);
      svg += '<text class="mw-ax" x="' + tx + '" y="' + (H - 18) + '" text-anchor="middle">' + (dd === 0 ? 'now' : (dd > 0 ? '+' : '−') + Math.abs(dd) + ' d') + '</text>' +
        '<text class="mw-ax mw-ax2" x="' + tx + '" y="' + (H - 5) + '" text-anchor="middle">' + fDate(now + dd * DAY) + '</text>';
    }
    svg += '<line class="mw-nowl" x1="' + X(now) + '" x2="' + X(now) + '" y1="' + mT + '" y2="' + (mT + ph) + '"/>';
    var kNow = W.siteTempK(s, W.interp(ser, now));
    svg += '<circle cx="' + X(now) + '" cy="' + Y(tC(kNow)) + '" r="5.5" class="mw-nowdot" fill="' + W.rgb(W.colorK(kNow)) + '"/>';
    svg += '<g class="mw-hov" style="display:none"><line class="mw-hovl" y1="' + mT + '" y2="' + (mT + ph) + '"/><circle r="4.5" class="mw-nowdot"/><rect class="mw-tipbg" rx="4" height="20"/><text class="mw-tip" y="0"></text></g>';
    svg += '<rect x="' + mL + '" y="' + mT + '" width="' + pw + '" height="' + ph + '" fill="transparent" class="mw-hit"/></svg>';
    box.innerHTML = svg;
    $('mwChartCap').innerHTML = 'Model surface temperature at ' + esc(s.name) + ', 15 Earth days back and ahead. Shaded = lunar night. ' +
      (s.psrK ? 'In permanent shadow the temperature barely changes.' : 'Days and nights each last about two Earth weeks, which is why the swing is so huge.') + ' Hover or touch for values.';
    var g = box.querySelector('.mw-hov'), hit = box.querySelector('.mw-hit'), svgEl = box.querySelector('svg');
    function hov(e) {
      var r = svgEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * Wd;
      var t = t0 + (x - mL) / pw * (t1 - t0); if (t < t0 || t > t1) return;
      var k = W.siteTempK(s, W.interp(ser, t)), y = Y(tC(k));
      g.style.display = '';
      g.querySelector('line').setAttribute('x1', x); g.querySelector('line').setAttribute('x2', x);
      var cc = g.querySelector('circle'); cc.setAttribute('cx', x); cc.setAttribute('cy', y); cc.setAttribute('fill', W.rgb(W.colorK(k)));
      var tx = g.querySelector('text'); tx.textContent = fDate(t, true) + ': ' + tMain(k);
      var tw = tx.getComputedTextLength ? tx.getComputedTextLength() : 150;
      var bx = Math.min(Math.max(x - tw / 2 - 6, mL), mL + pw - tw - 12);
      tx.setAttribute('x', bx + 6); tx.setAttribute('y', mT + 15);
      var bg = g.querySelector('rect'); bg.setAttribute('x', bx); bg.setAttribute('y', mT + 1); bg.setAttribute('width', tw + 12);
    }
    hit.addEventListener('pointermove', hov); hit.addEventListener('pointerdown', hov);
    hit.addEventListener('pointerleave', function () { g.style.display = 'none'; });
  }

  // ---------- globe ----------
  var cv = $('mwGlobe'), gx = cv.getContext('2d');
  var view = { lat: 0, lon: 0 }, dragging = false, globeFill = false, playT = null;
  function setView(v, keep) {
    S.view = v; if (!keep) save();
    var st = W.interp(ser, Date.now() + S.off * 36e5);
    if (v === 'earth') view = { lat: st.earthLat, lon: st.earthLon };
    else if (v === 'sun') view = { lat: st.sunLat, lon: st.sunLon };
    else if (v === 'near') view = { lat: 0, lon: 0 };
    else if (v === 'far') view = { lat: 0, lon: 180 };
    else if (v === 'np') view = { lat: 90, lon: 0 };
    else if (v === 'sp') view = { lat: -90, lon: 0 };
    syncButtons();
    drawGlobe();
  }
  function globeSize() {
    var wrap = cv.parentNode, lg = $('mwLegend'), w = wrap.clientWidth - (getComputedStyle(wrap).flexDirection === 'row' ? (lg.offsetWidth || 50) + 14 : 0);
    if (globeFill) { var fig = $('mwGlobeFig'); return Math.max(220, Math.min(w, fig.clientHeight - 170)); }
    return Math.max(220, Math.min(w, 520));
  }
  function drawGlobe(fast) {
    var css = globeSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = Math.round(css * dpr * (fast ? 0.45 : 1)); px = Math.min(px, fast ? 300 : 900);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    cv.style.width = css + 'px'; cv.style.height = css + 'px';
    var t = Date.now() + S.off * 36e5, st = W.interp(ser, t);
    var img = gx.createImageData(px, px), d = img.data, R = Math.PI / 180;
    var a = view.lat * R, b = view.lon * R, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    var sLat = st.sunLat * R, sLon = st.sunLon, slS = Math.sin(sLat), slC = Math.cos(sLat), temp = S.mode === 'temp';
    var half = px / 2, inv = 1 / (half - 1);
    for (var j = 0; j < px; j++) {
      var y = (half - j - 0.5) * inv;
      for (var i = 0; i < px; i++) {
        var x = (i + 0.5 - half) * inv, r2 = x * x + y * y;
        if (r2 > 1) continue;
        var z = Math.sqrt(1 - r2);
        var Px = -x * sb - y * sa * cb + z * ca * cb, Py = x * cb - y * sa * sb + z * ca * sb, Pz = y * ca + z * sa;
        var lat = Math.asin(Pz) / R, lon = Math.atan2(Py, Px) / R;
        var ci = Math.sin(lat * R) * slS + Math.cos(lat * R) * slC * Math.cos((lon - sLon) * R);
        var mare = W.mareAt(lat, lon), shade = 0.78 + 0.22 * z, col;
        if (temp) {
          col = W.colorK(W.tempK(lat, lon, st.sunLat, st.sunLon, st.rAU));
          var m = 1 - 0.13 * mare;
          col = [col[0] * m * shade, col[1] * m * shade, col[2] * m * shade];
        } else {
          var alb = 0.62 - 0.3 * mare, l = ci > 0 ? Math.pow(ci, 0.6) : 0, v = 18 + 230 * alb * l;
          col = [v * 1.0, v * 0.99, v * 0.96];
        }
        var o = (j * px + i) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
        d[o + 3] = r2 > 0.985 ? Math.max(0, (1 - r2) / 0.015) * 255 : 255;
      }
    }
    gx.putImageData(img, 0, 0);
    // graticule + markers
    var sc = half - 1;
    function P(lat, lon) { var p = W.project(lat, lon, view.lat, view.lon); return { x: half + p.x * sc, y: half - p.y * sc, f: p.front }; }
    gx.lineWidth = Math.max(1, px / 600); gx.strokeStyle = 'rgba(255,255,255,0.22)';
    function poly(ptsFn, n) {
      gx.beginPath(); var pen = false;
      for (var k = 0; k <= n; k++) { var q = ptsFn(k / n); if (!q.f) { pen = false; continue; } if (pen) gx.lineTo(q.x, q.y); else gx.moveTo(q.x, q.y); pen = true; }
      gx.stroke();
    }
    for (var la = -60; la <= 60; la += 30) poly(function (f) { return P(la, -180 + 360 * f); }, 120);
    for (var lo = -180; lo < 180; lo += 30) poly(function (f) { return P(-90 + 180 * f, lo); }, 60);
    var fs = Math.max(11, px / 38);
    gx.font = '600 ' + fs + 'px Arial, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    var sun = P(st.sunLat, st.sunLon);
    if (sun.f) { gx.fillStyle = '#ffd43b'; gx.strokeStyle = '#7a4a00'; gx.lineWidth = Math.max(1.5, px / 400); gx.beginPath(); gx.arc(sun.x, sun.y, fs * 0.55, 0, 7); gx.fill(); gx.stroke(); }
    var ea = P(st.earthLat, st.earthLon);
    if (ea.f) { gx.fillStyle = '#5aa9ff'; gx.strokeStyle = '#fff'; gx.lineWidth = Math.max(1.5, px / 400); gx.beginPath(); gx.arc(ea.x, ea.y, fs * 0.5, 0, 7); gx.fill(); gx.stroke(); gx.beginPath(); gx.arc(ea.x, ea.y, fs * 0.15, 0, 7); gx.fillStyle = '#fff'; gx.fill(); }
    var cur = site();
    W.SITES.concat(cur.id === 'custom' ? [cur] : []).forEach(function (s) {
      var p = P(s.lat, s.lon); if (!p.f) return;
      var sel = s.id === cur.id;
      gx.beginPath(); gx.arc(p.x, p.y, sel ? fs * 0.42 : fs * 0.22, 0, 7);
      gx.fillStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.85)'; gx.fill();
      gx.lineWidth = Math.max(1.5, px / 450); gx.strokeStyle = '#111'; gx.stroke();
      if (sel) {
        var lab = s.name.replace(/ \(.*\)/, '');
        gx.font = '700 ' + fs + 'px Arial, sans-serif';
        var tw = gx.measureText(lab).width, lx = Math.min(Math.max(p.x, tw / 2 + 4), px - tw / 2 - 4), ly = p.y - fs * 1.25 < fs ? p.y + fs * 1.3 : p.y - fs * 1.25;
        gx.fillStyle = 'rgba(0,0,0,0.65)'; gx.fillRect(lx - tw / 2 - 5, ly - fs * 0.7, tw + 10, fs * 1.4);
        gx.fillStyle = '#fff'; gx.fillText(lab, lx, ly);
      }
    });
    var np = P(89.9, 0); if (np.f) { gx.fillStyle = 'rgba(255,255,255,0.8)'; gx.font = '700 ' + fs + 'px Arial'; gx.fillText('N', np.x, np.y - fs * 0.6 < fs ? np.y + fs * 0.7 : np.y - fs * 0.6); }
    $('mwTimeLbl').textContent = S.off === 0 ? 'now' : (S.off > 0 ? '+' : '−') + dur(Math.abs(S.off) * 36e5) + ' · ' + fDate(t, true);
  }
  function legend() {
    var stops = [400, 360, 320, 273, 230, 160, 100, 60, 20];
    $('mwLegend').innerHTML = '<div class="mw-lgbar" style="background:linear-gradient(180deg,' + stops.map(function (k) { return W.rgb(W.colorK(k)); }).join(',') + ')"></div>' +
      '<div class="mw-lglab">' + stops.filter(function (k, i) { return i % 2 === 0; }).map(function (k) { return '<span>' + sign(Math.round(tUnit(tC(k)))) + '°</span>'; }).join('') + '</div>';
  }
  (function () {
    var p0 = null, moved = false;
    cv.addEventListener('pointerdown', function (e) { p0 = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon }; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!p0) return;
      var dx = e.clientX - p0.x, dy = e.clientY - p0.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; dragging = true;
      var k = 180 / Math.PI / (cv.clientWidth / 2);
      view.lon = W.wrap180(p0.lon - dx * k); view.lat = Math.max(-90, Math.min(90, p0.lat + dy * k));
      S.view = 'free'; syncButtons();
      drawGlobe(true);
    });
    function end(e) {
      if (!p0) return;
      if (!moved) {
        var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2;
        var q = W.unproject(x, y, view.lat, view.lon);
        if (q) { S.custom = { lat: Math.round(q.lat * 100) / 100, lon: Math.round(q.lon * 100) / 100 }; S.site = 'custom'; siteSel.value = 'custom'; save(); render(); }
      }
      p0 = null; dragging = false; if (moved) drawGlobe();
    }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', function () { p0 = null; dragging = false; drawGlobe(); });
    cv.addEventListener('keydown', function (e) {
      var st = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
      if (!st) return; e.preventDefault();
      view.lat = Math.max(-90, Math.min(90, view.lat + st[0])); view.lon = W.wrap180(view.lon + st[1]); S.view = 'free'; syncButtons(); drawGlobe();
    });
  })();
  var timeIn = $('mwTime');
  timeIn.addEventListener('input', function () { S.off = +timeIn.value; if (S.view === 'earth' || S.view === 'sun') setView(S.view, true); else drawGlobe(); });
  $('mwNow').addEventListener('click', function () { stopPlay(); S.off = 0; timeIn.value = 0; setView(S.view === 'free' ? 'earth' : S.view, true); });
  function stopPlay() { if (playT) { clearInterval(playT); playT = null; $('mwPlay').textContent = '▶ Play'; } }
  $('mwPlay').addEventListener('click', function () {
    if (playT) return stopPlay();
    $('mwPlay').textContent = '❚❚ Pause';
    playT = setInterval(function () {
      S.off += 6; if (S.off > 360) S.off = -360; timeIn.value = S.off;
      if (S.view === 'earth' || S.view === 'sun') setView(S.view, true); else drawGlobe(true);
    }, 90);
  });

  // ---------- controls ----------
  function syncButtons() {
    root.querySelectorAll('[data-unit]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-unit') === S.unit)); });
    root.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === S.view)); });
    root.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === S.mode)); });
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-unit')) { S.unit = b.getAttribute('data-unit'); save(); syncButtons(); legend(); render(); renderTonight(); }
    else if (b.hasAttribute('data-view')) setView(b.getAttribute('data-view'));
    else if (b.hasAttribute('data-mode')) { S.mode = b.getAttribute('data-mode'); save(); syncButtons(); $('mwLegend').style.visibility = S.mode === 'temp' ? '' : 'hidden'; drawGlobe(); }
    else if (b.hasAttribute('data-fill')) toggleFill(b.closest('figure'));
    else if (b.hasAttribute('data-fs')) fullScreen(b.closest('figure'));
  });
  siteSel.addEventListener('change', function () {
    S.site = siteSel.value;
    if (S.site === 'custom' && !S.custom) S.custom = { lat: 0, lon: 0 };
    save(); render();
  });

  // ---------- fill window / full screen ----------
  function toggleFill(fig, off) {
    var on = off ? false : !fig.classList.contains('mw-filled');
    fig.classList.toggle('mw-filled', on);
    document.documentElement.classList.toggle('mw-noscroll', !!document.querySelector('.mw-filled'));
    fig.querySelector('[data-fill]').textContent = on ? '✕ Close' : '⤢ Fill window';
    if (fig.id === 'mwGlobeFig') globeFill = on; else chartFill = on;
    relayout();
  }
  function fullScreen(fig) {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (fig.requestFullscreen) fig.requestFullscreen().catch(function () { toggleFill(fig); });
    else toggleFill(fig);
  }
  document.addEventListener('fullscreenchange', function () {
    var f = document.fullscreenElement;
    globeFill = !!(f && f.id === 'mwGlobeFig') || $('mwGlobeFig').classList.contains('mw-filled');
    chartFill = !!(f && f.id === 'mwChartFig') || $('mwChartFig').classList.contains('mw-filled');
    root.querySelectorAll('[data-fs]').forEach(function (b) { b.textContent = f && b.closest('figure') === f ? '✕ Exit full screen' : '⛶ Full screen'; });
    relayout();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    root.querySelectorAll('.mw-filled').forEach(function (f) { toggleFill(f, true); });
  });
  if (!document.fullscreenEnabled) root.querySelectorAll('[data-fs]').forEach(function (b) { b.hidden = true; });
  var rt = null;
  function relayout() { clearTimeout(rt); rt = setTimeout(function () { renderChart(Date.now()); drawGlobe(); }, 60); }
  window.addEventListener('resize', relayout);

  // ---------- Tonight's Moon (viewer's own sky) ----------
  function renderTonight() {
    if (!tonightEl) return;
    var ctx = window.MES_MOON_CTX, loc = ctx && ctx.loc;
    if (!loc) { try { loc = JSON.parse(localStorage.getItem('moon-loc') || 'null'); } catch (e) {} }
    if (!loc) loc = { lat: 49.17, lon: -123.14, elev: 4, label: 'Richmond, BC' };
    var lbl = document.getElementById('mwTonightLoc'); if (lbl) lbl.textContent = loc.label;
    var now = new Date(), ob = new A.Observer(loc.lat, loc.lon, loc.elev || 0);
    function altAt(t) { var eq = A.Equator(A.Body.Moon, t, ob, true, true); return A.Horizon(t, ob, eq.ra, eq.dec, 'normal'); }
    var h = altAt(now), h2 = altAt(new Date(+now + 6e5));
    var ill = A.Illumination(A.Body.Moon, now), elong = A.MoonPhase(now), waxing = elong < 180, frac = ill.phase_fraction;
    var name = frac <= 0.01 ? 'New Moon' : frac >= 0.99 ? 'Full Moon' : Math.abs(frac - 0.5) <= 0.04 ? (waxing ? 'First Quarter' : 'Last Quarter')
      : frac < 0.5 ? (waxing ? 'Waxing Crescent' : 'Waning Crescent') : (waxing ? 'Waxing Gibbous' : 'Waning Gibbous');
    function rs(dir) { try { var r = A.SearchRiseSet(A.Body.Moon, ob, dir, now, 2); return r ? +r.date : null; } catch (e) { return null; } }
    var mr = rs(1), ms = rs(-1);
    var distKm = A.GeoMoon(now); distKm = Math.sqrt(distKm.x * distKm.x + distKm.y * distKm.y + distKm.z * distKm.z) * 149597870.7;
    // best viewing tonight: highest point between the next sunset and the sunrise after it
    var best = null;
    try {
      var ss = A.SearchRiseSet(A.Body.Sun, ob, -1, new Date(+now - 12 * 36e5), 2), sr;
      if (ss && +ss.date < +now) { sr = A.SearchRiseSet(A.Body.Sun, ob, 1, ss.date, 1); if (!sr || +sr.date < +now) ss = A.SearchRiseSet(A.Body.Sun, ob, -1, now, 2); }
      if (ss) {
        sr = A.SearchRiseSet(A.Body.Sun, ob, 1, ss.date, 1);
        var from = Math.max(+ss.date, +now), to = sr ? +sr.date : +ss.date + 12 * 36e5;
        for (var t = from; t <= to; t += 15 * 6e4) { var a = altAt(new Date(t)).altitude; if (!best || a > best.alt) best = { t: t, alt: a }; }
      }
    } catch (e) {}
    var quarters = [], q;
    try { q = A.SearchMoonQuarter(now); for (var i = 0; i < 4; i++) { quarters.push(q); q = A.NextMoonQuarter(q); } } catch (e) {}
    var QN = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'], QF = [0, 0.5, 1, 0.5];
    var cloud = ctx && ctx.fc && ctx.fc.ok ? ctx.fc.cloud : null;
    var cards = [];
    cards.push('<div class="mw-tn mw-tn-phase"><div class="mw-tni">' + disc(frac, '#f1f3f7', '#20263a', 64, waxing) + '</div><div><div class="mw-tt">Phase</div><div class="mw-tv">' + name + '</div>' +
      '<div class="mw-td">' + (frac * 100).toFixed(0) + '% lit, ' + (waxing ? 'growing' : 'shrinking') + '</div></div></div>');
    var up = h.altitude > 0, rising = h2.altitude > h.altitude;
    cards.push('<div class="mw-tn"><div class="mw-tni mw-arrow ' + (rising ? 'up' : 'down') + '">' + (rising ? '↗' : '↘') + '</div><div><div class="mw-tt">Moon now</div><div class="mw-tv">' + (up ? Math.round(h.altitude) + '° up' : 'Below horizon') + '</div>' +
      '<div class="mw-td">' + (up ? 'In the ' + compass16(h.azimuth) + ', ' + (rising ? 'climbing' : 'sinking') : (rising ? 'On its way up' : 'Still setting further')) + '</div></div></div>');
    cards.push('<div class="mw-tn"><div class="mw-tni">' + IC.rise + '</div><div><div class="mw-tt">Moonrise / moonset</div><div class="mw-tv">' +
      '<span class="mw-nw">' + (mr ? '↑ ' + fTime(mr) : '↑ —') + '</span> <span class="mw-nw">' + (ms ? '↓ ' + fTime(ms) : '↓ —') + '</span>' + '</div><div class="mw-td">' +
      (mr ? 'Rises ' + rel(mr) : '') + (mr && ms ? '; ' : '') + (ms ? 'sets ' + rel(ms) : '') + '</div></div></div>');
    if (best && best.alt > 0) cards.push('<div class="mw-tn mw-tn-best"><div class="mw-tni">🔭</div><div><div class="mw-tt">Best time to look tonight</div><div class="mw-tv">' + fTime(best.t) + '</div>' +
      '<div class="mw-td">' + Math.round(best.alt) + '° high' + (cloud != null ? '. Clouds now: ' + Math.round(cloud) + '%' + (cloud > 70 ? ', it may be hidden' : cloud < 30 ? ', looking good' : '') : '') + '</div></div></div>');
    else cards.push('<div class="mw-tn"><div class="mw-tni">🌑</div><div><div class="mw-tt">Tonight</div><div class="mw-tv">Not up after dark</div><div class="mw-td">The Moon is above the horizon mostly in daylight right now.</div></div></div>');
    var pf = Math.max(0, Math.min(1, (distKm - 356400) / (406700 - 356400)));
    cards.push('<div class="mw-tn"><div class="mw-tni">📏</div><div><div class="mw-tt">Distance</div><div class="mw-tv">' + Math.round(distKm).toLocaleString('en-US') + ' km</div>' +
      '<div class="mw-dist"><span style="left:' + (pf * 100).toFixed(1) + '%"></span></div><div class="mw-td mw-distlab"><span>closest 356,400</span><span>farthest 406,700</span></div>' +
      '<div class="mw-td">' + Math.round(distKm * 0.621371).toLocaleString('en-US') + ' miles; light takes ' + (distKm / 299792.458).toFixed(2) + ' s</div></div></div>');
    if (quarters.length) cards.push('<div class="mw-tn mw-tn-next"><div><div class="mw-tt">Next phases</div><ul class="mw-qlist">' + quarters.map(function (qq) {
      return '<li>' + disc(QF[qq.quarter], '#f1f3f7', '#20263a', 22, qq.quarter === 1) + '<span>' + QN[qq.quarter] + '</span><b>' + fDate(+qq.time.date) + '</b><i>' + rel(+qq.time.date) + '</i></li>';
    }).join('') + '</ul></div></div>');
    tonightEl.innerHTML = cards.join('');
  }
  function compass16(az) { var d = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']; return d[Math.round(az / 22.5) % 16]; }
  function rel(ms) {
    var d = ms - Date.now(), hrs = d / 36e5;
    if (hrs < 0) return Math.round(-hrs) + ' h ago';
    if (hrs < 1) return 'in ' + Math.round(d / 6e4) + ' min';
    if (hrs < 36) return 'in ' + Math.round(hrs) + ' h';
    return 'in ' + Math.round(hrs / 24) + ' days';
  }

  // ---------- start ----------
  if (!W.SITES.some(function (s) { return s.id === S.site; }) && S.site !== 'custom') S.site = 'a11';
  siteSel.value = S.site;
  ensureSeries(Date.now());
  syncButtons(); legend();
  $('mwLegend').style.visibility = S.mode === 'temp' ? '' : 'hidden';
  setView(S.view === 'free' ? 'earth' : S.view, true);
  render();
  try { renderTonight(); } catch (e) {}
  document.addEventListener('moon-data', function () { try { renderTonight(); } catch (e) {} render(); });
  setInterval(function () { if (!document.hidden) { render(); try { renderTonight(); } catch (e) {} } }, 60000);
  window.__mwRedraw = function () { render(); };
})();
