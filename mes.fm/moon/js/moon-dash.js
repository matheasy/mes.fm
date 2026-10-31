/* MES Moon: the "Today in <place>" morning dashboard + the Visual | Table switches (mes.fm/moon).
 *
 * The page's main inline script fetches ONE Open-Meteo forecast (current + hourly + daily) and the
 * air-quality feed, then sets window.MES_MOON_CTX = {loc, tz, fc, aq, now} and fires 'moon-data'.
 * This file draws, from that context plus Astronomy Engine (no extra requests):
 *   #dhHero     big current temperature + conditions, today's high / low, rain, wind, cloud, UV, AQI
 *   #dhHourly   the next 24 hours as one SVG strip (icon, temperature line, rain chance)
 *   #dhTimes    a day timeline (daylight band, Moon-up bar, now marker) + sunrise / sunset tiles
 *   #dhPlanets  what is worth seeing tonight (Moon, bright planets, cloud cover after dark)
 *   #dhAir      the US AQI on a coloured scale + pollutant chips
 * and the table forms: hourly forecast, planets tonight, Sun / Moon altitude by hour, the Sun through
 * the year, planets in the solar system right now.
 *
 * Every <div class="vt-block" data-vt="key"> gets a small "Visual | Table" switch; the choice is saved
 * per block in localStorage "mes-moon:vt:<key>". data-vt-auto="tiles" builds the visual from the
 * block's own table (Sun / Moon right now); the Tonight's Moon cards and the Moon Weather tiles
 * (drawn by moon-weather.js) get a generated table the same way. °C / °F: localStorage "mes-moon:unit".
 * Theme classes: body.light / body.dark (colours = custom properties in moon-dash.css).
 */
(function () {
  'use strict';
  var A = window.Astronomy;
  if (!A) return;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var HR = 36e5, DAY = 864e5;

  // ---------- units ----------
  var UKEY = 'mes-moon:unit';
  var unit = lsGet(UKEY);
  if (unit !== 'C' && unit !== 'F') unit = /^en-US/i.test(navigator.language || '') ? 'F' : 'C';
  function tv(f) { return f == null || isNaN(f) ? null : unit === 'F' ? Math.round(f) : Math.round((f - 32) / 1.8); }
  function tS(f) { var v = tv(f); return v == null ? '—' : v + '°'; }
  function tSU(f) { var v = tv(f); return v == null ? '—' : v + '°' + unit; }
  function tOther(f) { if (f == null) return ''; return unit === 'F' ? Math.round((f - 32) / 1.8) + '°C' : Math.round(f) + '°F'; }
  function wind(mph) { if (mph == null) return '—'; return unit === 'F' ? Math.round(mph) + ' mph' : Math.round(mph * 1.609344) + ' km/h'; }

  // ---------- weather words / icons ----------
  var WMO = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, heavy hail' };
  function wText(c) { return c == null ? '—' : WMO[c] || 'Weather code ' + c; }
  function wIcon(c, day) {
    if (c == null) return '·';
    if (c === 0) return day ? '☀️' : '🌙';
    if (c === 1) return day ? '🌤️' : '🌙';
    if (c === 2) return day ? '⛅' : '☁️';
    if (c === 3) return '☁️';
    if (c === 45 || c === 48) return '🌫️';
    if (c >= 51 && c <= 67) return '🌧️';
    if (c >= 71 && c <= 77) return '🌨️';
    if (c >= 80 && c <= 82) return day ? '🌦️' : '🌧️';
    if (c === 85 || c === 86) return '🌨️';
    if (c >= 95) return '⛈️';
    return '🌡️';
  }
  function wSky(c, day) {
    if (c == null) return 'cloud';
    if (c >= 95) return 'storm';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 51) return 'rain';
    if (c === 45 || c === 48) return 'fog';
    if (c === 3) return 'cloud';
    return day ? (c === 2 ? 'partly' : 'clear') : 'night';
  }
  function compass(deg) {
    if (deg == null || isNaN(deg)) return '';
    return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
  }
  function uvCat(v) { return v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very high' : 'Extreme'; }
  var AQI = [[50, 'Good', '#3bb54a'], [100, 'Moderate', '#e7c41c'], [150, 'Unhealthy for sensitive groups', '#f08a24'],
    [200, 'Unhealthy', '#e0393e'], [300, 'Very unhealthy', '#8f3f97'], [500, 'Hazardous', '#7e0023']];
  function aqiBand(v) { for (var i = 0; i < AQI.length; i++) if (v <= AQI[i][0]) return AQI[i]; return AQI[AQI.length - 1]; }

  // ---------- time helpers (in the chosen place's time zone) ----------
  var tz = 'America/Vancouver';
  function parts(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).reduce(function (a, p) { a[p.type] = p.value; return a; }, {});
  }
  function dayStart(d) {
    var f = parts(d), asUTC = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour, +f.minute, +f.second);
    return new Date(Date.UTC(+f.year, +f.month - 1, +f.day) - (asUTC - d.getTime()));
  }
  function clock(d) {
    if (!d) return '—';
    return new Date(+d).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  }
  function clockS(d) { return clock(d).replace(/\s/g, '').replace(':00', '').toLowerCase(); }
  function hm(mins) { if (mins == null) return '—'; mins = Math.round(mins); return Math.floor(mins / 60) + 'h ' + ('0' + (mins % 60)).slice(-2) + 'm'; }
  function inT(ms) {
    var m = Math.round(ms / 6e4);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
  }
  function h12(hh) { hh = +hh; return (hh % 12 || 12) + (hh < 12 ? 'a' : 'p'); }

  // ---------- astronomy helpers ----------
  var ob = null;
  function altAz(body, t) { var e = A.Equator(body, t, ob, true, true); return A.Horizon(t, ob, e.ra, e.dec, 'normal'); }
  function rise(body, dir, from, days) { try { var r = A.SearchRiseSet(body, ob, dir, from, days || 1); return r ? r.date : null; } catch (e) { return null; } }
  function altEv(dir, from, alt) { try { var r = A.SearchAltitude(A.Body.Sun, ob, dir, from, 1, alt); return r ? r.date : null; } catch (e) { return null; } }
  function constOf(body, t) { var j = A.Equator(body, t, ob, false, true); return A.Constellation(j.ra, j.dec).name; }
  function phaseName(f, wax) {
    if (f <= 0.01) return 'New Moon'; if (f >= 0.99) return 'Full Moon';
    if (Math.abs(f - 0.5) <= 0.04) return wax ? 'First Quarter' : 'Last Quarter';
    return f < 0.5 ? (wax ? 'Waxing Crescent' : 'Waning Crescent') : (wax ? 'Waxing Gibbous' : 'Waning Gibbous');
  }
  function brightWord(mag) { return mag < -3 ? 'dazzling' : mag < -1.5 ? 'very bright' : mag < 0.5 ? 'bright' : mag < 1.5 ? 'easy to see' : 'fainter'; }
  var PLANETS = [['Mercury', '#b9b1a6'], ['Venus', '#f3e3a1'], ['Mars', '#e2774f'], ['Jupiter', '#e6c79a'], ['Saturn', '#e9d38b'],
    ['Uranus', '#9fd8e0'], ['Neptune', '#6f8fe8']];

  // ---------- Visual | Table switches ----------
  var blocks = [];
  function vtApply(b) {
    var mode = b.__vt;
    b.classList.toggle('vt-is-table', mode === 'table');
    b.querySelectorAll(':scope > .vt-bar [data-vtm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-vtm') === mode)); });
  }
  function vtInit(b) {
    if (b.__vtDone) return; b.__vtDone = true;
    var key = b.getAttribute('data-vt'), label = b.getAttribute('data-vt-label') || 'this';
    b.__vt = lsGet('mes-moon:vt:' + key) === 'table' ? 'table' : 'visual';
    var bar = document.createElement('div');
    bar.className = 'vt-bar';
    bar.innerHTML = (b.classList.contains('dh-block') ? '<strong class="vt-title">' + esc(label) + '</strong>' : '<span></span>') +
      '<span class="vt-ctl">' + (key === 'now' ? '<span class="vt-seg" role="group" aria-label="Temperature unit"><button type="button" data-unit="C">°C</button><button type="button" data-unit="F">°F</button></span>' : '') +
      '<span class="vt-seg" role="group" aria-label="Show ' + esc(label) + ' as"><button type="button" data-vtm="visual">Visual</button><button type="button" data-vtm="table">Table</button></span></span>';
    b.insertBefore(bar, b.firstChild);
    bar.addEventListener('click', function (e) {
      var x = e.target.closest('button'); if (!x) return;
      if (x.hasAttribute('data-vtm')) {
        b.__vt = x.getAttribute('data-vtm'); lsSet('mes-moon:vt:' + key, b.__vt); vtApply(b);
        if (b.__onShow) b.__onShow();
      } else if (x.hasAttribute('data-unit')) {
        unit = x.getAttribute('data-unit'); lsSet(UKEY, unit); syncUnit(); renderWeather();
      }
    });
    blocks.push(b);
    vtApply(b);
  }
  function syncUnit() { document.querySelectorAll('.vt-bar [data-unit]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-unit') === unit)); }); }

  // Visual = tiles made from the block's own <table> (th = label, td = value).
  var TILE_IC = { Constellation: '✨', Illumination: '🌓', 'Distance from Earth': '📏', 'Distance from Earth (AU)': '🛰️',
    'Right Ascension': '🧭', Declination: '↕️', Magnitude: '💡' };
  function tilesFromTable(b) {
    var vis = b.querySelector(':scope > .vt-visual'), tbl = b.querySelector(':scope > .vt-table table');
    if (!vis || !tbl) return;
    var rows = [].slice.call(tbl.querySelectorAll('tr'));
    var extra = b.__extraTile ? b.__extraTile() : '';
    vis.innerHTML = '<div class="dh-tiles">' + extra + rows.map(function (r) {
      var th = r.querySelector('th'), td = r.querySelector('td'); if (!th || !td) return '';
      var lab = th.textContent.trim();
      return '<div class="dh-tile"><div class="dh-ti" aria-hidden="true">' + (TILE_IC[lab] || '•') + '</div><div class="dh-tt">' + esc(lab) + '</div>' +
        '<div class="dh-tv">' + esc(td.textContent.trim()) + '</div></div>';
    }).join('') + '</div>';
  }
  // Table made from the cards another script draws (Tonight's Moon cards, Moon Weather tiles).
  function cardTable(el, key, label, cardSel) {
    if (!el || el.__vtWrapped) return; el.__vtWrapped = true;
    var b = document.createElement('div');
    b.className = 'vt-block'; b.setAttribute('data-vt', key); b.setAttribute('data-vt-label', label);
    var vis = document.createElement('div'); vis.className = 'vt-visual';
    var tb = document.createElement('div'); tb.className = 'vt-table';
    el.parentNode.insertBefore(b, el);
    vis.appendChild(el); b.appendChild(vis); b.appendChild(tb);
    function build() {
      var rows = [].slice.call(el.querySelectorAll(cardSel)).map(function (c) {
        var t = c.querySelector('.mw-tt'); if (!t) return '';
        var rest = c.cloneNode(true), tt = rest.querySelector('.mw-tt'); if (tt) tt.remove();
        rest.querySelectorAll('li').forEach(function (li) { li.appendChild(document.createTextNode('; ')); });
        rest.querySelectorAll('.mw-tv').forEach(function (v) { v.appendChild(document.createTextNode(' · ')); });
        var txt = rest.textContent.replace(/\s+/g, ' ').replace(/[;·]\s*$/, '').trim();
        return '<tr><th>' + esc(t.textContent.trim()) + '</th><td>' + esc(txt) + '</td></tr>';
      }).join('');
      tb.innerHTML = rows ? '<table class="dh-ctbl"><tbody>' + rows + '</tbody></table>' : '<p class="section-note">Loading…</p>';
    }
    var tmr = null;
    new MutationObserver(function () { if (b.__vt !== 'table') return; clearTimeout(tmr); tmr = setTimeout(build, 80); })
      .observe(el, { childList: true, subtree: true, characterData: true });
    b.__onShow = build;
    vtInit(b);
    if (b.__vt === 'table') build();
  }

  // ---------- weather hero + hourly ----------
  var ctx = null;
  function hourIdx(fc) {
    var h = fc.hourly; if (!h || !h.time) return -1;
    var key = (fc.curTime || '').slice(0, 13);
    for (var i = 0; i < h.time.length; i++) if (h.time[i].slice(0, 13) >= key) return i;
    return 0;
  }
  function renderWeather() {
    if (!ctx) return;
    var fc = ctx.fc || {}, aq = ctx.aq || {}, hero = $('dhHero');
    syncUnit();
    if (!hero) return;
    if (!fc.ok) {
      hero.className = 'dh-hero sky-cloud';
      hero.innerHTML = '<div class="dh-hmain"><div class="dh-hcond">The weather could not be loaded. Press Refresh now, or see ' +
        '<a href="' + esc(($('wxTodayLink') || {}).href || 'https://weather.com') + '" target="_blank" rel="noopener">weather.com</a>.</div></div>';
      $('dhHourly').innerHTML = ''; $('dhHourTbl').innerHTML = '';
      return;
    }
    var day = fc.isDay == null ? true : !!fc.isDay;
    hero.className = 'dh-hero sky-' + wSky(fc.code, day);
    var lo = fc.loF, hi = fc.hiF, cur = fc.curTempF;
    var rng = '';
    if (lo != null && hi != null && cur != null) {
      var l2 = Math.min(lo, cur), h2 = Math.max(hi, cur), pos = h2 > l2 ? (cur - l2) / (h2 - l2) * 100 : 50;
      rng = '<div class="dh-range" aria-hidden="true"><span class="dh-rlo">' + tS(lo) + '</span><span class="dh-rbar"><i style="left:' + pos.toFixed(1) + '%"></i></span><span class="dh-rhi">' + tS(hi) + '</span></div>';
    }
    var chips = [];
    function chip(ic, lab, val, sub, style) {
      chips.push('<div class="dh-chip"' + (style ? ' style="' + style + '"' : '') + '><span class="dh-ci" aria-hidden="true">' + ic + '</span><span class="dh-cl">' + lab +
        '</span><b class="dh-cv">' + val + '</b>' + (sub ? '<span class="dh-cs">' + sub + '</span>' : '') + '</div>');
    }
    chip('💧', 'Rain today', fc.popMax != null ? Math.round(fc.popMax) + '%' : '—',
      fc.precipSum != null ? (unit === 'F' ? (fc.precipSum / 25.4).toFixed(2) + ' in' : fc.precipSum.toFixed(1) + ' mm') + ' expected' : '');
    var arrow = fc.windDir != null ? '<svg class="dh-warr" viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate(' + Math.round(fc.windDir + 180) + 'deg)"><path d="M10 2 L15 15 L10 12 L5 15 Z" fill="currentColor"/></svg>' : '💨';
    chip(arrow, 'Wind', wind(fc.wind), (fc.windDir != null ? 'from the ' + compass(fc.windDir) : '') + (fc.gust != null ? ', gusts ' + wind(fc.gust) : ''));
    chip('☁️', 'Cloud cover', fc.cloud != null ? Math.round(fc.cloud) + '%' : '—', '');
    chip('🌡️', '9 AM', tSU(fc.temp9F), fc.feels9F != null ? 'feels ' + tS(fc.feels9F) : '');
    chip('🕶️', 'UV max', fc.uvMax != null ? fc.uvMax.toFixed(1) : '—', fc.uvMax != null ? uvCat(fc.uvMax) : '');
    chip('💦', 'Humidity', fc.hum != null ? Math.round(fc.hum) + '%' : '—', '');
    if (aq.ok && aq.us != null) { var ab = aqiBand(aq.us); chip('<span class="dh-dot" style="background:' + ab[2] + '"></span>', 'Air quality', Math.round(aq.us) + ' AQI', ab[1]); }
    chip('🧭', 'Pressure', fc.presshPa != null ? Math.round(fc.presshPa) + ' hPa' : '—', fc.presshPa != null ? (fc.presshPa * 0.02953).toFixed(2) + ' inHg' : '');
    hero.innerHTML =
      '<div class="dh-hmain">' +
        '<div class="dh-hicon" aria-hidden="true">' + wIcon(fc.code, day) + '</div>' +
        '<div class="dh-htxt"><div class="dh-htemp">' + tS(cur) + '<span class="dh-hunit">' + unit + '</span><span class="dh-halt">' + tOther(cur) + '</span></div>' +
        '<div class="dh-hcond">' + esc(wText(fc.code)) + (fc.feelsF != null ? ' · feels like ' + tS(fc.feelsF) : '') + '</div>' +
        '<div class="dh-hhl">High <b>' + tS(hi) + '</b> &nbsp; Low <b>' + tS(lo) + '</b></div>' + rng + '</div>' +
      '</div><div class="dh-chips">' + chips.join('') + '</div>';
    renderHourly(fc);
  }
  function renderHourly(fc) {
    var el = $('dhHourly'), tb = $('dhHourTbl'), h = fc.hourly;
    if (!el || !h || !h.time) { if (el) el.innerHTML = ''; return; }
    var i0 = hourIdx(fc), n = Math.min(24, h.time.length - i0);
    if (n <= 1) { el.innerHTML = ''; return; }
    var cw = 52, W = n * cw, H = 156, yT = 66, yB = 104;
    var temps = [], lo = 1e9, hi = -1e9;
    for (var i = 0; i < n; i++) { var v = h.tF[i0 + i]; temps.push(v); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (hi - lo < 4) { var m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    function X(i) { return i * cw + cw / 2; }
    function Y(v) { return yB - (v - lo) / (hi - lo) * (yB - yT); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Hourly forecast for the next ' + n + ' hours">';
    for (i = 0; i < n; i++) {
      var k = i0 + i;
      if (h.day && h.day[k] === 0) s += '<rect class="dh-hnight" x="' + i * cw + '" y="0" width="' + cw + '" height="' + H + '"/>';
    }
    s += '<rect class="dh-hnow" x="1" y="1" width="' + (cw - 2) + '" height="' + (H - 2) + '" rx="8"/>';
    var path = '';
    for (i = 0; i < n; i++) {
      k = i0 + i;
      var hh = h.time[k].slice(11, 13);
      s += '<text class="dh-hlab" x="' + X(i) + '" y="16" text-anchor="middle">' + (i === 0 ? 'Now' : h12(hh)) + '</text>';
      s += '<text x="' + X(i) + '" y="44" text-anchor="middle" font-size="19">' + wIcon(h.code ? h.code[k] : null, !h.day || h.day[k] !== 0) + '</text>';
      if (temps[i] != null) {
        path += (path ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(temps[i]).toFixed(1);
        s += '<text class="dh-htv" x="' + X(i) + '" y="' + (Y(temps[i]) - 7).toFixed(1) + '" text-anchor="middle">' + tS(temps[i]) + '</text>';
      }
      var p = h.pop ? h.pop[k] : null;
      if (p != null) {
        var bh = Math.max(1, p / 100 * 22);
        s += '<rect class="dh-hpop" x="' + (X(i) - 9) + '" y="' + (138 - bh).toFixed(1) + '" width="18" height="' + bh.toFixed(1) + '" rx="2"/>';
        s += '<text class="dh-hpt" x="' + X(i) + '" y="151" text-anchor="middle">' + (p >= 5 ? Math.round(p) + '%' : '') + '</text>';
      }
    }
    s += '<path class="dh-hline" d="' + path + '"/>';
    for (i = 0; i < n; i++) if (temps[i] != null) s += '<circle class="dh-hdot" cx="' + X(i) + '" cy="' + Y(temps[i]).toFixed(1) + '" r="3"/>';
    s += '<text class="dh-hpt" x="4" y="120">rain</text></svg>';
    el.innerHTML = s;
    // table form
    var rows = '';
    for (i = 0; i < n; i++) {
      k = i0 + i;
      rows += '<tr><td>' + (i === 0 ? 'Now' : h12(h.time[k].slice(11, 13))) + '</td><td>' + esc(wText(h.code ? h.code[k] : null)) + '</td><td>' + tSU(h.tF[k]) +
        '</td><td>' + (h.feelsF ? tS(h.feelsF[k]) : '—') + '</td><td>' + (h.pop && h.pop[k] != null ? Math.round(h.pop[k]) + '%' : '—') +
        '</td><td>' + (h.cloud && h.cloud[k] != null ? Math.round(h.cloud[k]) + '%' : '—') + '</td><td>' + (h.wind ? wind(h.wind[k]) + ' ' + compass(h.windDir && h.windDir[k]) : '—') + '</td></tr>';
    }
    tb.innerHTML = '<table class="dh-gtbl"><thead><tr><th>Hour</th><th>Conditions</th><th>Temp</th><th>Feels</th><th>Rain</th><th>Cloud</th><th>Wind</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ---------- sun & moon timeline ----------
  function renderTimes() {
    var el = $('dhTimes'); if (!el || !ob) return;
    var now = new Date(), ds = dayStart(now), t0 = +ds, span = DAY;
    var sr = rise(A.Body.Sun, 1, ds), ss = rise(A.Body.Sun, -1, ds);
    var mr = rise(A.Body.Moon, 1, ds), ms = rise(A.Body.Moon, -1, ds);
    var dawn = altEv(1, ds, -6), dusk = altEv(-1, ds, -6);
    var y0 = new Date(t0 - DAY), ysr = rise(A.Body.Sun, 1, y0), yss = rise(A.Body.Sun, -1, y0);
    var dl = sr && ss && ss > sr ? (ss - sr) / 6e4 : null, ydl = ysr && yss && yss > ysr ? (yss - ysr) / 6e4 : null;
    var W = Math.max(320, Math.min(900, Math.round(el.clientWidth || 720))), H = 150, N = 145, sun = [], moon = [];
    for (var i = 0; i < N; i++) { var t = new Date(t0 + i / (N - 1) * span); sun.push(altAz(A.Body.Sun, t).altitude); moon.push(altAz(A.Body.Moon, t).altitude); }
    function X(ms_) { return (ms_ - t0) / span * W; }
    function skyCol(a) { return a > 6 ? 'dh-c-day' : a > 0 ? 'dh-c-gold' : a > -6 ? 'dh-c-civil' : a > -12 ? 'dh-c-naut' : 'dh-c-night'; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Today: daylight and Moon above the horizon">';
    var segW = W / (N - 1);
    for (i = 0; i < N - 1; i++) s += '<rect class="' + skyCol((sun[i] + sun[i + 1]) / 2) + '" x="' + (i * segW).toFixed(2) + '" y="26" width="' + (segW + 0.6).toFixed(2) + '" height="34"/>';
    s += '<rect class="dh-track" x="0" y="74" width="' + W + '" height="18" rx="9"/>';
    var ill = A.Illumination(A.Body.Moon, now), frac = ill.phase_fraction;
    var segs = [], st = null;
    for (i = 0; i < N; i++) { var up = moon[i] > 0; if (up && st == null) st = i; if ((!up || i === N - 1) && st != null) { segs.push([st, up ? i : i - 1]); st = null; } }
    segs.forEach(function (g) {
      var x1 = g[0] * segW, x2 = g[1] * segW;
      s += '<rect class="dh-moonbar" x="' + x1.toFixed(1) + '" y="74" width="' + Math.max(2, x2 - x1).toFixed(1) + '" height="18" rx="9"/>';
      if (x2 - x1 > 40) s += '<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="88" text-anchor="middle" font-size="12" class="dh-moontxt">Moon up</text>';
    });
    for (var hh = 0, hstep = W < 560 ? 6 : 3; hh <= 24; hh += hstep) {
      var x = hh / 24 * W;
      s += '<line class="dh-tick" x1="' + x + '" y1="60" x2="' + x + '" y2="66"/>';
      if (hh > 0 && hh < 24) s += '<text class="dh-axis" x="' + x + '" y="110" text-anchor="middle">' + h12(hh % 24) + '</text>';
    }
    function lab(d, y, cls, txt) {
      if (!d) return '';
      var x_ = X(+d), anc = x_ > W - 50 ? 'end' : x_ < 50 ? 'start' : 'middle';
      return '<line class="dh-evl ' + cls + '" x1="' + X(+d).toFixed(1) + '" y1="' + (y < 40 ? 22 : 70) + '" x2="' + X(+d).toFixed(1) + '" y2="' + (y < 40 ? 60 : 96) + '"/>' +
        '<text class="dh-evt ' + cls + '" x="' + x_.toFixed(1) + '" y="' + y + '" text-anchor="' + anc + '">' + txt + '</text>';
    }
    function within(d) { return d && +d >= t0 && +d <= t0 + span; }
    if (within(sr)) s += lab(sr, 18, 'dh-sunc', '☀ ↑ ' + clockS(sr));
    if (within(ss)) s += lab(ss, 18, 'dh-sunc', '☀ ↓ ' + clockS(ss));
    if (within(mr)) s += lab(mr, 106 + 16, 'dh-moonc', '☾ ↑ ' + clockS(mr));
    if (within(ms)) s += lab(ms, 106 + 16, 'dh-moonc', '☾ ↓ ' + clockS(ms));
    var nx = X(+now);
    s += '<line class="dh-now" x1="' + nx.toFixed(1) + '" y1="22" x2="' + nx.toFixed(1) + '" y2="130"/>' +
      '<text class="dh-nowt" x="' + nx.toFixed(1) + '" y="144" text-anchor="' + (nx > W - 50 ? 'end' : nx < 50 ? 'start' : 'middle') + '">now ' + clockS(now) + '</text>';
    var sunNow = altAz(A.Body.Sun, now).altitude;
    if (sunNow > -1) s += '<circle class="dh-sundot" cx="' + nx.toFixed(1) + '" cy="43" r="7"/>';
    s += '</svg>';
    // tiles
    var nowMs = +now, tiles = [];
    function tile(ic, lab_, val, sub) { tiles.push('<div class="dh-tile"><div class="dh-ti" aria-hidden="true">' + ic + '</div><div class="dh-tt">' + lab_ + '</div><div class="dh-tv">' + val + '</div>' + (sub ? '<div class="dh-ts">' + sub + '</div>' : '') + '</div>'); }
    function rel(d) { if (!d) return ''; var dd = +d - nowMs; return dd > 0 ? 'in ' + inT(dd) : inT(-dd) + ' ago'; }
    tile('🌅', 'Sunrise', clock(sr), sr ? rel(sr) + (dawn ? ' · first light ' + clockS(dawn) : '') : 'none today');
    tile('🌇', 'Sunset', clock(ss), ss ? rel(ss) + (dusk ? ' · last light ' + clockS(dusk) : '') : 'none today');
    var dd = dl != null && ydl != null ? dl - ydl : null;
    tile('🌞', 'Daylight', hm(dl), dd != null ? (dd >= 0 ? '+' : '−') + Math.abs(dd).toFixed(1) + ' min vs yesterday' : '');
    tile('🌙', 'Moonrise', clock(mr), mr ? rel(mr) : 'none today');
    tile('🌒', 'Moonset', clock(ms), ms ? rel(ms) : 'none today');
    var elong = A.MoonPhase(now);
    tile('<span class="dh-mini">' + phaseSvg(frac, elong < 180, 26) + '</span>', 'Moon phase', phaseName(frac, elong < 180), Math.round(frac * 100) + '% lit');
    el.innerHTML = '<div class="dh-tl">' + s + '</div><div class="dh-legend"><span><i class="dh-c-day"></i>day</span><span><i class="dh-c-gold"></i>golden hour</span><span><i class="dh-c-civil"></i>twilight</span><span><i class="dh-c-night"></i>night</span><span><i class="dh-moonbar"></i>Moon above the horizon</span></div>' +
      '<div class="dh-tiles dh-tiles6">' + tiles.join('') + '</div>';
  }
  function phaseSvg(frac, wax, S) {
    var r = S / 2 - 1, c = S / 2, k = 2 * Math.min(0.9999, Math.max(0.0001, frac)) - 1, rx = Math.abs(k) * r, sw = wax ? 0 : 1, tw = k > 0 ? 1 - sw : sw;
    return '<svg viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '"><circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="#eef1f5"/>' +
      '<path d="M ' + c + ' ' + (c - r) + ' A ' + r + ' ' + r + ' 0 0 ' + sw + ' ' + c + ' ' + (c + r) + ' A ' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + tw + ' ' + c + ' ' + (c - r) + ' Z" fill="#2b3140"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="rgba(128,128,128,.5)"/></svg>';
  }

  // ---------- tonight's sky ----------
  function nightWindow(now) {
    var sunNow = altAz(A.Body.Sun, now).altitude;
    var from, to;
    if (sunNow < -6) { from = now; to = altEv(1, now, -6) || new Date(+now + 10 * HR); }
    else { from = altEv(-1, now, -6) || rise(A.Body.Sun, -1, now) || new Date(+now + 8 * HR); to = altEv(1, from, -6) || new Date(+from + 10 * HR); }
    return [from, to];
  }
  function renderSky() {
    var el = $('dhPlanets'), tb = $('dhPlanetsTbl'); if (!el || !ob) return;
    var now = new Date(), w = nightWindow(now), f0 = +w[0], f1 = +w[1];
    var step = 15 * 6e4, rows = [];
    function best(body) {
      var b = null, first = null, last = null;
      for (var t = f0; t <= f1; t += step) {
        var d = new Date(t), a = altAz(body, d);
        if (a.altitude > 8) { if (first == null) first = t; last = t; if (!b || a.altitude > b.alt) b = { t: t, alt: a.altitude, az: a.azimuth }; }
      }
      if (b) { b.first = first; b.last = last; }
      return b;
    }
    // the Moon
    var ill = A.Illumination(A.Body.Moon, now), elong = A.MoonPhase(now), frac = ill.phase_fraction;
    var mb = best(A.Body.Moon);
    // cloud over the night from the hourly forecast
    var cloud = null, fc = ctx && ctx.fc, h = fc && fc.hourly;
    if (h && h.time && h.cloud) {
      var i0 = hourIdx(fc), sum = 0, cnt = 0, base = Date.now() - (Date.now() % HR);
      for (var i = i0; i < h.time.length; i++) {
        var tt = base + (i - i0) * HR;
        if (tt + HR >= f0 && tt <= f1 && h.cloud[i] != null) { sum += h.cloud[i]; cnt++; }
      }
      if (cnt) cloud = sum / cnt;
    }
    var planets = PLANETS.slice(0, 5).map(function (p) {
      var body = A.Body[p[0]], bb = best(body);
      if (!bb) return null;
      var mag = A.Illumination(body, new Date(bb.t)).mag;
      return { name: p[0], col: p[1], b: bb, mag: mag, con: constOf(body, new Date(bb.t)) };
    }).filter(Boolean).sort(function (a, b) { return a.mag - b.mag; });
    var cards = [];
    var winTxt = (+w[0] <= +now ? 'now' : clockS(w[0])) + ' to ' + clockS(w[1]);
    var verdict = cloud == null ? null : cloud < 30 ? ['Good', 'dh-ok'] : cloud < 65 ? ['Patchy', 'dh-mid'] : ['Poor', 'dh-bad'];
    cards.push('<div class="dh-pcard dh-pnight"><div class="dh-pt">Stargazing tonight</div><div class="dh-pv">' +
      (verdict ? '<span class="dh-badge ' + verdict[1] + '">' + verdict[0] + '</span> ' + Math.round(cloud) + '% cloud' : 'Dark ' + winTxt) + '</div>' +
      '<div class="dh-ps">Dark sky ' + winTxt + (frac > 0.6 && mb ? '. A bright Moon washes out faint stars.' : frac < 0.25 ? '. Little moonlight: good for faint stars.' : '') + '</div></div>');
    cards.push('<div class="dh-pcard"><div class="dh-pt"><span class="dh-mini">' + phaseSvg(frac, elong < 180, 18) + '</span> Moon</div><div class="dh-pv">in ' + esc(constOf(A.Body.Moon, now)) + '</div><div class="dh-ps">' +
      (mb ? 'Best ' + clockS(mb.t) + ', ' + Math.round(mb.alt) + '° up in the ' + compass(mb.az) : 'Not up after dark tonight') + ' · ' + Math.round(frac * 100) + '% lit</div></div>');
    rows.push(['Moon', mb ? clock(mb.t) : '—', mb ? Math.round(mb.alt) + '°' : '—', mb ? compass(mb.az) : '—', constOf(A.Body.Moon, now), A.Illumination(A.Body.Moon, now).mag.toFixed(1), mb ? clockS(mb.first) + '–' + clockS(mb.last) : 'not up after dark']);
    planets.forEach(function (p) {
      cards.push('<div class="dh-pcard"><div class="dh-pt"><span class="dh-pdot" style="background:' + p.col + '"></span> ' + p.name + '</div><div class="dh-pv">' + brightWord(p.mag) + '</div>' +
        '<div class="dh-ps">Best ' + clockS(p.b.t) + ', ' + Math.round(p.b.alt) + '° up in the ' + compass(p.b.az) + ' · in ' + esc(p.con) + '</div></div>');
      rows.push([p.name, clock(p.b.t), Math.round(p.b.alt) + '°', compass(p.b.az), p.con, p.mag.toFixed(1), clockS(p.b.first) + '–' + clockS(p.b.last)]);
    });
    PLANETS.slice(0, 5).forEach(function (p) { if (!planets.some(function (q) { return q.name === p[0]; })) rows.push([p[0], '—', '—', '—', constOf(A.Body[p[0]], now), '', 'too close to the Sun or below the horizon']); });
    if (!planets.length) cards.push('<div class="dh-pcard"><div class="dh-pt">Planets</div><div class="dh-pv">None well placed</div><div class="dh-ps">No bright planet climbs above 8° while it is dark tonight.</div></div>');
    el.innerHTML = '<div class="dh-pgrid">' + cards.join('') + '</div>';
    tb.innerHTML = '<p class="section-note">Dark sky (Sun 6° or more below the horizon): ' + winTxt + (cloud != null ? '; forecast cloud ' + Math.round(cloud) + '%' : '') + '.</p>' +
      '<table class="dh-gtbl"><thead><tr><th>Object</th><th>Best time</th><th>Height</th><th>Direction</th><th>Constellation</th><th>Magnitude</th><th>Above 8° after dark</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  // ---------- air quality ----------
  function renderAir() {
    var el = $('dhAir'); if (!el) return;
    var aq = ctx && ctx.aq;
    if (!aq || !aq.ok || aq.us == null) { el.innerHTML = '<p class="section-note">Air quality is not available for this place right now.</p>'; return; }
    var v = aq.us, band = aqiBand(v), max = 300, pos = Math.min(100, v / max * 100);
    var segs = '', prev = 0;
    AQI.forEach(function (a) { var e = Math.min(a[0], max); if (prev < max) segs += '<span style="width:' + ((e - prev) / max * 100).toFixed(2) + '%;background:' + a[2] + '"></span>'; prev = e; });
    function c(lab, val) { return '<div class="dh-aqc"><span>' + lab + '</span><b>' + val + '</b></div>'; }
    el.innerHTML = '<div class="dh-aq"><div class="dh-aqv"><b style="color:' + band[2] + '">' + Math.round(v) + '</b><span>US AQI · ' + band[1] + '</span></div>' +
      '<div class="dh-aqbar" aria-hidden="true">' + segs + '<i style="left:' + pos.toFixed(1) + '%"></i></div>' +
      '<div class="dh-aqscale" aria-hidden="true"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300+</span></div>' +
      '<div class="dh-aqchips">' +
      c('PM2.5', aq.pm25 != null ? aq.pm25.toFixed(1) + ' µg/m³' : '—') + c('PM10', aq.pm10 != null ? aq.pm10.toFixed(1) + ' µg/m³' : '—') +
      c('Ozone', aq.o3 != null ? Math.round(aq.o3) + ' µg/m³' : '—') + c('NO₂', aq.no2 != null ? aq.no2.toFixed(1) + ' µg/m³' : '—') +
      c('European AQI', aq.eu != null ? Math.round(aq.eu) : '—') + '</div></div>';
  }

  // ---------- tables for the chart sections ----------
  function tbl(el, head, rows, note) {
    if (!el) return;
    el.innerHTML = (note ? '<p class="section-note">' + note + '</p>' : '') + '<table class="dh-gtbl"><thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function deg(a) { return (a < 0 ? '−' : '') + Math.abs(a).toFixed(1) + '°'; }
  function raS(h) { var m = Math.round(h * 60) % 1440; return Math.floor(m / 60) + 'h ' + ('0' + (m % 60)).slice(-2) + 'm'; }
  function renderDayTable() {
    var ds = dayStart(new Date()), rows = [];
    for (var hh = 0; hh < 24; hh++) {
      var t = new Date(+ds + hh * HR), s = altAz(A.Body.Sun, t), m = altAz(A.Body.Moon, t);
      rows.push([h12(hh), deg(s.altitude), compass(s.azimuth), deg(m.altitude), compass(m.azimuth)]);
    }
    tbl($('daySkyTbl'), ['Hour', 'Sun height', 'Sun direction', 'Moon height', 'Moon direction'], rows, 'Height above the horizon (negative = below it) at the start of each hour, local time.');
  }
  function renderYearTable() {
    var y = +parts(new Date()).year, rows = [];
    for (var m = 0; m < 12; m++) {
      var d = new Date(Date.UTC(y, m, 1, 12)), e = A.Equator(A.Body.Sun, d, ob, true, true);
      rows.push([d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }), deg(e.dec), raS(e.ra), constOf(A.Body.Sun, d)]);
    }
    try {
      var se = A.Seasons(y);
      [['mar_equinox', 'March equinox'], ['jun_solstice', 'June solstice'], ['sep_equinox', 'September equinox'], ['dec_solstice', 'December solstice']].forEach(function (s) {
        var d = se[s[0]].date, e = A.Equator(A.Body.Sun, d, ob, true, true);
        rows.push([s[1] + ', ' + d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' }) + ' ' + clockS(d), deg(e.dec), raS(e.ra), constOf(A.Body.Sun, d)]);
      });
    } catch (e) {}
    tbl($('sunYearTbl'), ['Date', 'Declination', 'Right ascension', 'Constellation'], rows, 'The Sun on the 1st of each month of ' + y + ' (noon UTC), then this year\'s equinoxes and solstices.');
  }
  function renderSolarTable() {
    var now = new Date(), rows = [];
    PLANETS.forEach(function (p) {
      var b = A.Body[p[0]], e = A.Equator(b, now, ob, true, true), a = A.Horizon(now, ob, e.ra, e.dec, 'normal');
      rows.push([p[0], A.HelioDistance(b, now).toFixed(3) + ' AU', e.dist.toFixed(3) + ' AU (' + Math.round(e.dist * 149.5978707).toLocaleString('en-US') + ' million km)',
        constOf(b, now), A.Illumination(b, now).mag.toFixed(1), a.altitude > 0 ? Math.round(a.altitude) + '° up, ' + compass(a.azimuth) : 'below']);
    });
    var md = A.Equator(A.Body.Moon, now, ob, true, true).dist;
    rows.unshift(['Moon', '—', Math.round(md * 149597870.7).toLocaleString('en-US') + ' km', constOf(A.Body.Moon, now), A.Illumination(A.Body.Moon, now).mag.toFixed(1),
      (function () { var a = altAz(A.Body.Moon, now); return a.altitude > 0 ? Math.round(a.altitude) + '° up, ' + compass(a.azimuth) : 'below'; })()]);
    tbl($('solarTbl'), ['Body', 'From the Sun', 'From Earth', 'Constellation', 'Magnitude', 'In your sky now'], rows, 'Right now, for ' + esc((ctx && ctx.loc && ctx.loc.label) || 'this place') + '.');
  }

  // ---------- "In your sky now" tile for the Sun / Moon tile sets ----------
  function skyTile(body, name) {
    return function () {
      if (!ob) return '';
      var a = altAz(body, new Date()), up = a.altitude > 0;
      return '<div class="dh-tile dh-tile-hi"><div class="dh-ti" aria-hidden="true">' + (up ? '⬆️' : '⬇️') + '</div><div class="dh-tt">' + name + ' in your sky now</div>' +
        '<div class="dh-tv">' + (up ? Math.round(a.altitude) + '° up' : Math.round(-a.altitude) + '° below the horizon') + '</div><div class="dh-ts">towards the ' + compass(a.azimuth) + ' (' + Math.round(a.azimuth) + '°)</div></div>';
    };
  }

  // ---------- run ----------
  var tileBlocks = [];
  function renderAll() {
    ctx = window.MES_MOON_CTX || ctx;
    if (!ctx || !ctx.loc) return;
    tz = ctx.tz || tz;
    ob = new A.Observer(ctx.loc.lat, ctx.loc.lon, ctx.loc.elev || 0);
    try { renderWeather(); } catch (e) { console.error(e); }
    try { renderTimes(); } catch (e) { console.error(e); }
    try { renderSky(); } catch (e) { console.error(e); }
    try { renderAir(); } catch (e) { console.error(e); }
    try { renderDayTable(); renderYearTable(); renderSolarTable(); } catch (e) { console.error(e); }
    tileBlocks.forEach(tilesFromTable);
  }
  document.querySelectorAll('.vt-block[data-vt]').forEach(function (b) {
    vtInit(b);
    if (b.getAttribute('data-vt-auto') === 'tiles') {
      var key = b.getAttribute('data-vt');
      if (key === 'sun') b.__extraTile = skyTile(A.Body.Sun, 'Sun');
      if (key === 'moon') b.__extraTile = skyTile(A.Body.Moon, 'Moon');
      tileBlocks.push(b);
      tilesFromTable(b);
    }
  });
  // the cards drawn by moon-weather.js
  cardTable($('mwTonight'), 'tonightmoon', "Tonight's Moon", '.mw-tn');
  cardTable($('mwTiles'), 'moonwx', 'Moon weather', '.mw-tile');
  syncUnit();
  if (window.MES_MOON_CTX) renderAll();
  document.addEventListener('moon-data', renderAll);
  var rzT = null, lastW = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { var e = $('dhTimes'); if (e && ob && Math.abs(e.clientWidth - lastW) > 30) { lastW = e.clientWidth; try { renderTimes(); } catch (x) {} } }, 150);
  });
  setInterval(function () { if (!document.hidden && ob) { try { renderTimes(); } catch (e) {} tileBlocks.forEach(tilesFromTable); } }, 60000);
})();
