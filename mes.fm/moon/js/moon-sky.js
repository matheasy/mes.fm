/* MES Moon: interactive "Reading the Sky" celestial sphere (mes.fm/moon, #sky3d).
 * Drag to turn the sky-globe; the time slider (hours / days / a whole year) moves the Sun along the ecliptic and the Moon
 * along its path; pick any object (Sun, Moon, planets, bright stars) to see its real right ascension and declination drawn as
 * arcs. The observer (window.MES_MOON_CTX.loc, from the page) adds the local horizon, zenith, local sidereal time and what is
 * above the horizon. Positions: Astronomy Engine (apparent, of date); stars precessed from J2000 to the date shown.
 * Maths: moon-sky-lib.js (MESSky). Theme = body.light / body.dark via the page's --sun / --moon / --equator / --grid / --axis.
 * Settings: localStorage "mes-moon:sky" (camera, options, selected object, time mode).
 */
(function () {
  'use strict';
  var A = window.Astronomy, S = window.MESSky, root = document.getElementById('sky3d');
  if (!A || !S || !root) return;
  var HR = 36e5, DAY = 864e5;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var KEY = 'mes-moon:sky', st = { az: 52, el: 16, sel: 'Sun', mode: 'h', spin: false, hz: true, grid: true, stars: true, mpath: true };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in sv) if (k in st) st[k] = sv[k]; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var MODES = { h: { lab: 'Hours', span: 24 * HR, step: 0.25 * HR, rate: 2 * HR }, d: { lab: 'Days', span: 30 * DAY, step: 6 * HR, rate: 1.5 * DAY },
    y: { lab: 'Year', span: 183 * DAY, step: DAY, rate: 20 * DAY } };
  if (!MODES[st.mode]) st.mode = 'h';
  var off = 0, playing = false, lastT = 0;
  var loc = { lat: 49.17, lon: -123.14, label: 'Richmond, BC' }, tz = 'America/Vancouver';
  var BODIES = [['Sun', '☀', 'var(--sun)', 7], ['Moon', '☾', 'var(--sk-moon)', 6], ['Mercury', '', '#b9b1a6', 3.2], ['Venus', '', '#f3e3a1', 4],
    ['Mars', '', '#e2774f', 3.6], ['Jupiter', '', '#e6c79a', 4], ['Saturn', '', '#e9d38b', 3.6]];

  root.innerHTML =
    '<div class="sk-bar">' +
      '<label class="sk-pick">Show the RA / Dec of <select id="skSel" aria-label="Object to show"></select></label>' +
      '<span class="sk-btns"><button type="button" class="sk-btn" id="skFill" aria-pressed="false">⤢ Fill window</button>' +
      '<button type="button" class="sk-btn" id="skFs" aria-pressed="false">⛶ Full screen</button></span>' +
    '</div>' +
    '<div class="sk-stage" id="skStage"><svg id="skSvg" role="img" tabindex="0" aria-label="Celestial sphere. Drag or use the arrow keys to turn it."></svg>' +
      '<div class="sk-hint" id="skHint">Drag to turn the sky · click an object</div></div>' +
    '<div class="sk-time">' +
      '<span class="vt-seg sk-seg" role="group" aria-label="Time range">' +
        Object.keys(MODES).map(function (m) { return '<button type="button" data-skm="' + m + '">' + MODES[m].lab + '</button>'; }).join('') + '</span>' +
      '<button type="button" class="sk-btn" id="skPlay" aria-pressed="false">▶ Play</button>' +
      '<button type="button" class="sk-btn" id="skNow">Now</button>' +
      '<input type="range" id="skT" aria-label="Time offset from now">' +
      '<span class="sk-when" id="skWhen" role="status"></span>' +
    '</div>' +
    '<div class="sk-info" id="skInfo"></div>' +
    '<div class="sk-up"><span class="sk-uph">Above your horizon at that moment:</span> <span id="skUp"></span></div>' +
    '<div class="sk-opts">' +
      '<label><input type="checkbox" data-sko="hz"> Your horizon</label>' +
      '<label><input type="checkbox" data-sko="spin"> Turn with the Earth</label>' +
      '<label><input type="checkbox" data-sko="grid"> RA / Dec grid</label>' +
      '<label><input type="checkbox" data-sko="stars"> Bright stars</label>' +
      '<label><input type="checkbox" data-sko="mpath"> Moon\'s path</label>' +
      '<button type="button" class="sk-btn" id="skReset" title="Turn the globe so the picked object faces you">Turn to it</button>' +
    '</div>';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('skSvg'), stage = $('skStage'), selEl = $('skSel'), tEl = $('skT');
  selEl.innerHTML = '<optgroup label="Sun, Moon and planets">' + BODIES.map(function (b) { return '<option>' + b[0] + '</option>'; }).join('') + '</optgroup>' +
    '<optgroup label="Bright stars">' + S.STARS.map(function (s) { return '<option>' + s[0] + '</option>'; }).join('') + '</optgroup>';
  if (![].some.call(selEl.options, function (o) { return o.value === st.sel; })) st.sel = 'Sun';
  selEl.value = st.sel;
  root.querySelectorAll('[data-sko]').forEach(function (c) { c.checked = !!st[c.getAttribute('data-sko')]; });

  // ---------- positions ----------
  var cache = { t: null };
  function obs() { return new A.Observer(loc.lat, loc.lon, 0); }
  function positions(t) {
    if (cache.t === +t && cache.lat === loc.lat && cache.lon === loc.lon) return cache.p;
    var ob = obs(), p = {}, time = A.MakeTime(t);
    BODIES.forEach(function (b) { var e = A.Equator(A.Body[b[0]], t, ob, true, true); p[b[0]] = { ra: e.ra, dec: e.dec, kind: 'body', b: b }; });
    var rot = null; try { rot = A.Rotation_EQJ_EQD(time); } catch (e) {}
    S.STARS.forEach(function (s) {
      var ra = s[1], dec = s[2];
      if (rot) { try { var v = S.vec(ra, dec), q = A.RotateVector(rot, new A.Vector(v[0], v[1], v[2], time)), r = S.radec([q.x, q.y, q.z]); ra = r.ra; dec = r.dec; } catch (e) {} }
      p[s[0]] = { ra: ra, dec: dec, kind: 'star', mag: s[3] };
    });
    var g = A.SiderealTime(t);
    p.lst = S.lst(g, loc.lon);
    // the Moon's path: 14 days either side, every 6 hours
    var mp = [];
    for (var i = -56; i <= 56; i++) { var e = A.Equator(A.Body.Moon, new Date(+t + i * 6 * HR), ob, true, true); mp.push(S.vec(e.ra, e.dec)); }
    p.mpath = mp;
    cache = { t: +t, lat: loc.lat, lon: loc.lon, p: p };
    return p;
  }

  // ---------- drawing ----------
  var hits = [], lastBox = { W: 0, H: 0 };
  function fmtWhen(t) {
    return new Date(t).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function compass(az) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16]; }
  function hm(h) { var m = Math.round(Math.abs(h) * 60); return Math.floor(m / 60) + 'h ' + ('0' + m % 60).slice(-2) + 'm'; }
  function draw() {
    var W = Math.max(280, Math.round(stage.clientWidth)), H = Math.max(280, Math.round(stage.clientHeight));
    lastBox = { W: W, H: H };
    var narrow = W < 520, fs = narrow ? 11 : 12.5;
    var t = new Date(Date.now() + off), p = positions(t), LST = p.lst;
    var az = st.spin ? LST * 15 + st.az - 52 : st.az, c = S.cam(az, st.el);
    var r = Math.min(W * (narrow ? 0.4 : 0.36), H * 0.42), cx = W / 2, cy = H / 2 + (narrow ? 4 : 0);
    function P(v) { return S.proj(v, c, cx, cy, r); }
    function path(pts, close) { return 'M' + pts.map(function (q) { return q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join(' L') + (close ? 'Z' : ''); }
    function line(vs, cls, w, frontOnly) {
      var out = '';
      S.runs(vs.map(P)).forEach(function (ru) {
        if (ru.pts.length < 2 || (!ru.front && frontOnly)) return;
        out += '<path class="' + cls + (ru.front ? '' : ' sk-back') + '" d="' + path(ru.pts) + '"' + (w ? ' stroke-width="' + w + '"' : '') + '/>';
      });
      return out;
    }
    var s = '<defs><radialGradient id="skGlobe" cx="40%" cy="35%" r="70%"><stop offset="0" class="sk-g0"/><stop offset="1" class="sk-g1"/></radialGradient></defs>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#skGlobe)" class="sk-rim"/>';
    var hz = S.horizon(LST, loc.lat);
    // ground: the part of the visible hemisphere below the observer's horizon
    if (st.hz) {
      var ring = S.ring(hz.N, hz.E, 180), pr = ring.map(P), front = pr.map(function (q) { return q.z >= 0; });
      var nadirFront = -S.dot(hz.Z, c.F) >= 0, gd = '';
      var nf = front.filter(Boolean).length;
      var rimPath = 'M' + (cx + r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy + 'Z';
      if (nf === pr.length) gd = nadirFront ? path(pr, true) : rimPath + ' ' + path(pr, true);
      else if (nf === 0) gd = nadirFront ? rimPath : '';
      else {
        var i0 = 0; while (!(front[i0] && !front[(i0 - 1 + pr.length) % pr.length])) i0++;
        var arc = []; for (var i = 0; i < pr.length && front[(i0 + i) % pr.length]; i++) arc.push(pr[(i0 + i) % pr.length]);
        var aS = Math.atan2(arc[0].y - cy, arc[0].x - cx), aE = Math.atan2(arc[arc.length - 1].y - cy, arc[arc.length - 1].x - cx);
        // walk the rim from the arc's end back to its start, on the side whose rim points are below the horizon
        var tryDir = function (dir) {
          var d = aS - aE; if (dir > 0) { while (d < 0) d += 2 * Math.PI; } else { while (d > 0) d -= 2 * Math.PI; }
          var mid = aE + d / 2, v = [Math.cos(mid), -Math.sin(mid)];
          var w3 = [c.R[0] * v[0] + c.U[0] * v[1], c.R[1] * v[0] + c.U[1] * v[1], c.R[2] * v[0] + c.U[2] * v[1]];
          return { d: d, below: S.dot(w3, hz.Z) < 0 };
        };
        var o1 = tryDir(1), use = o1.below ? o1 : tryDir(-1), rim = [];
        for (var j = 1; j < 40; j++) { var a = aE + use.d * j / 40; rim.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
        gd = path(arc.concat(rim), true);
      }
      if (gd) s += '<path class="sk-ground" fill-rule="evenodd" d="' + gd + '"/>';
    }
    // grid
    if (st.grid) {
      [-60, -30, 30, 60].forEach(function (d) { s += line(S.parallel(d, 96), 'sk-grid'); });
      for (var hh = 0; hh < 24; hh += 2) s += line(S.meridian(hh, -90, 90, 48), 'sk-grid');
    }
    var pn = P([0, 0, 1]), ps = P([0, 0, -1]);
    s += '<line class="sk-axis" x1="' + pn.x.toFixed(1) + '" y1="' + pn.y.toFixed(1) + '" x2="' + ps.x.toFixed(1) + '" y2="' + ps.y.toFixed(1) + '"/>';
    s += line(S.parallel(0, 144), 'sk-eq', 2);
    var ecl = []; for (var e = 0; e <= 360; e += 3) ecl.push(S.eclVec(e)); s += line(ecl, 'sk-ecl', 2);
    if (st.hz) s += line(S.ring(hz.N, hz.E, 180), 'sk-hz', 2);
    if (st.mpath) s += line(p.mpath, 'sk-mpath', 1.6, false);
    var labels = [], marks = [];
    function lab(v, text, cls, pri, rr, frontOnly) {
      var q = P(v); if (frontOnly && q.z < 0) return null;
      labels.push({ x: q.x, y: q.y, text: text, cls: cls + (q.z < 0 ? ' sk-backt' : ''), size: fs, pri: pri, r: rr || 3 });
      return q;
    }
    // selected object: RA arc along the equator from the March equinox, Dec arc up / down its hour circle
    var so = p[st.sel];
    if (so) {
      s += line(S.raArc(so.ra, Math.max(4, Math.round(so.ra * 8))), 'sk-ra', 4);
      s += line(S.meridian(so.ra, 0, so.dec, 30), 'sk-dec', 4);
      var foot = P(S.vec(so.ra, 0));
      s += '<circle class="sk-foot" cx="' + foot.x.toFixed(1) + '" cy="' + foot.y.toFixed(1) + '" r="3.5"' + (foot.z < 0 ? ' opacity=".45"' : '') + '/>';
      lab(S.vec(so.ra / 2, 0), 'RA ' + S.fmtRA(so.ra).replace(/ \d\ds$/, ''), 'sk-tra', 90, 4);
      lab(S.vec(so.ra, so.dec / 2), 'Dec ' + S.fmtDec(so.dec), 'sk-tdec', 89, 4);
    }
    // the observer: zenith, cardinal points
    if (st.hz) {
      var zq = P(hz.Z);
      marks.push('<circle class="sk-zen" cx="' + zq.x.toFixed(1) + '" cy="' + zq.y.toFixed(1) + '" r="4"' + (zq.z < 0 ? ' opacity=".4"' : '') + '/>');
      lab(hz.Z, 'your zenith', 'sk-thz', 60, 4);
      [['N', hz.N], ['E', hz.E], ['S', hz.S], ['W', hz.W]].forEach(function (cd) { lab(cd[1], cd[0], 'sk-thz sk-card', 55, 2, true); });
    }
    // poles + equinox + solstices
    var np = P([0, 0, 1]), sp = P([0, 0, -1]);
    marks.push('<circle class="sk-pole" cx="' + np.x.toFixed(1) + '" cy="' + np.y.toFixed(1) + '" r="3"/><circle class="sk-pole" cx="' + sp.x.toFixed(1) + '" cy="' + sp.y.toFixed(1) + '" r="3"' + (sp.z < 0 ? ' opacity=".4"' : '') + '/>');
    lab([0, 0, 1], narrow ? 'N pole' : 'north celestial pole', 'sk-tax', 50); lab([0, 0, -1], narrow ? 'S pole' : 'south celestial pole', 'sk-tax', 49);
    var vq = P([1, 0, 0]); marks.push('<circle class="sk-vern" cx="' + vq.x.toFixed(1) + '" cy="' + vq.y.toFixed(1) + '" r="4.5"' + (vq.z < 0 ? ' opacity=".45"' : '') + '/>');
    lab([1, 0, 0], '♈ March equinox · RA 0h', 'sk-tax', 70, 5);
    lab(S.eclVec(90), 'June solstice', 'sk-tecl', 30, 2, true); lab(S.eclVec(180), 'Sept. equinox', 'sk-tecl', 30, 2, true); lab(S.eclVec(270), 'Dec. solstice', 'sk-tecl', 30, 2, true);
    // equator / ecliptic / horizon names on the front
    function frontPick(vs) { var best = null; vs.forEach(function (v) { var q = P(v); if (q.z > 0.25 && (!best || q.y > best.q.y)) best = { v: v, q: q }; }); return best; }
    var fe = frontPick(S.parallel(0, 48).slice(0, 48)); if (fe) lab(fe.v, 'celestial equator', 'sk-teq', 40, 1);
    var fc = frontPick(ecl); if (fc) lab(fc.v, 'ecliptic', 'sk-tecl', 41, 1);
    if (st.hz) { var fh = frontPick(S.ring(hz.N, hz.E, 48)); if (fh) lab(fh.v, 'your horizon', 'sk-thz', 39, 1); }
    // hour labels on the equator
    for (hh = 2; hh < 24; hh += narrow ? 4 : 2) lab(S.vec(hh, 0), hh + 'h', 'sk-thr', 10, 1.5, true);
    // stars and bodies
    hits = [];
    var objs = [];
    if (st.stars) S.STARS.forEach(function (sr) { objs.push([sr[0], p[sr[0]], 'star', Math.max(1.6, 3.4 - sr[3] * 0.9)]); });
    BODIES.forEach(function (b) { objs.push([b[0], p[b[0]], 'body', b[3], b[2]]); });
    if (st.sel && !objs.some(function (o) { return o[0] === st.sel; }) && p[st.sel]) objs.push([st.sel, p[st.sel], 'star', 2.6]);
    objs.forEach(function (o) {
      var v = S.vec(o[1].ra, o[1].dec), q = P(v), up = S.altAz(o[1].ra, o[1].dec, LST, loc.lat).alt > 0, isSel = o[0] === st.sel;
      var col = o[2] === 'star' ? 'var(--sk-star)' : o[4];
      marks.push((isSel ? '<circle class="sk-selring" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + (o[3] + 5) + '"/>' : '') +
        '<circle class="sk-obj' + (q.z < 0 ? ' sk-objback' : '') + (st.hz && !up ? ' sk-down' : '') + '" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + o[3] + '" fill="' + col + '"/>');
      hits.push({ name: o[0], x: q.x, y: q.y, z: q.z });
      if (q.z >= 0 || isSel) labels.push({ x: q.x, y: q.y, text: o[0], cls: (o[2] === 'star' ? 'sk-tstar' : 'sk-tbody') + (isSel ? ' sk-tsel' : '') + (q.z < 0 ? ' sk-backt' : ''), size: fs, pri: isSel ? 100 : o[2] === 'body' ? 80 - BODIES.findIndex(function (b) { return b[0] === o[0]; }) : 20 - o[1].mag, r: o[3] });
    });
    // labels last, so none overlaps another or a marker
    var block = hits.filter(function (h) { return h.z >= 0; }).map(function (h) { return { x0: h.x - 4, y0: h.y - 4, x1: h.x + 4, y1: h.y + 4 }; });
    var placed = S.placeLabels(labels, W, H, block), lt = '';
    placed.forEach(function (L) {
      if (!L.placed) return;
      lt += '<text class="sk-lab ' + L.cls + '" x="' + L.lx.toFixed(1) + '" y="' + L.ly.toFixed(1) + '" text-anchor="' + L.anchor + '" font-size="' + L.size + '">' + esc(L.text) + '</text>';
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = s + marks.join('') + lt;
    info(t, p);
  }
  function info(t, p) {
    var LST = p.lst, so = p[st.sel];
    $('skWhen').textContent = (off === 0 ? 'Now: ' : '') + fmtWhen(+t) + (off !== 0 ? '  (' + (off > 0 ? '+' : '−') + humanOff(Math.abs(off)) + ')' : '');
    if (so) {
      var aa = S.altAz(so.ra, so.dec, LST, loc.lat), ha = S.hourAngle(LST, so.ra);
      var up = aa.alt > 0;
      $('skInfo').innerHTML =
        '<div class="sk-card2"><b>' + esc(st.sel) + '</b><span class="sk-big"><span class="sk-cra">RA ' + S.fmtRA(so.ra) + '</span> · <span class="sk-cdec">Dec ' + S.fmtDec(so.dec) + '</span></span></div>' +
        '<div class="sk-card2"><b>In the sky over ' + esc(loc.label || 'you') + '</b><span>' + (up ? '<span class="sk-ok">' + Math.round(aa.alt) + '° above</span>' : '<span class="sk-no">' + Math.round(-aa.alt) + '° below</span>') +
          ' the horizon, towards the ' + compass(aa.az) + ' (' + Math.round(aa.az) + '°)</span></div>' +
        '<div class="sk-card2"><b>Local sidereal time ' + S.fmtRA(LST).replace(/ \d\ds$/, '') + '</b><span>the RA crossing your meridian now. ' + esc(st.sel) +
          (Math.abs(ha) < 0.05 ? ' is crossing it right now (highest).' : ha < 0 ? ' crosses it in ' + hm(-ha) + ' (sidereal), when it is highest.' : ' crossed it ' + hm(ha) + ' ago.') + '</span></div>';
    }
    var up = [];
    BODIES.forEach(function (b) { var q = p[b[0]], a = S.altAz(q.ra, q.dec, LST, loc.lat).alt; if (a > 0) up.push([b[0], a]); });
    S.STARS.forEach(function (sr) { var q = p[sr[0]], a = S.altAz(q.ra, q.dec, LST, loc.lat).alt; if (a > 10) up.push([sr[0], a]); });
    up.sort(function (a, b) { return b[1] - a[1]; });
    $('skUp').innerHTML = up.length ? up.map(function (u) { return '<button type="button" class="sk-chip' + (u[0] === st.sel ? ' sk-chipon' : '') + '" data-pick="' + esc(u[0]) + '">' + esc(u[0]) + ' <span>' + Math.round(u[1]) + '°</span></button>'; }).join('') : 'nothing bright';
  }
  // turn the globe so the picked object sits just right of centre on the front (short animation)
  var anim = null;
  function face(name, instant) {
    var p = positions(new Date(Date.now() + off)), o = p[name]; if (!o) return;
    var lstAz = st.spin ? p.lst * 15 - 52 : 0;
    var toAz = o.ra * 15 - 30 - lstAz, toEl = Math.max(-60, Math.min(60, o.dec * 0.6 + 12));
    var d = ((toAz - st.az) % 360 + 540) % 360 - 180, a0 = st.az, e0 = st.el, t0 = 0;
    if (instant) { st.az = a0 + d; st.el = toEl; return; }
    if (anim) cancelAnimationFrame(anim);
    (function step(ts) {
      if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / 600), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      st.az = a0 + d * e; st.el = e0 + (toEl - e0) * e; draw();
      if (k < 1) anim = requestAnimationFrame(step); else { anim = null; save(); }
    })(performance.now());
  }
  function pick(name) { st.sel = name; selEl.value = name; save(); face(name); }
  function humanOff(ms) { if (ms < DAY) return hm(ms / HR).replace(' 00m', ''); var d = ms / DAY; return (d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)) + ' days'; }

  // ---------- controls ----------
  function setMode(m) {
    st.mode = m; save();
    var M = MODES[m]; tEl.min = -M.span; tEl.max = M.span; tEl.step = M.step;
    if (Math.abs(off) > M.span) off = 0;
    tEl.value = off;
    root.querySelectorAll('[data-skm]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-skm') === m)); });
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-skm')) { setMode(b.getAttribute('data-skm')); draw(); }
    else if (b.hasAttribute('data-pick')) pick(b.getAttribute('data-pick'));
    else if (b.id === 'skNow') { off = 0; tEl.value = 0; setPlay(false); draw(); }
    else if (b.id === 'skPlay') setPlay(!playing);
    else if (b.id === 'skReset') { face(st.sel); }
    else if (b.id === 'skFill') setFill(!root.classList.contains('sk-fill'));
    else if (b.id === 'skFs') toggleFs();
  });
  root.addEventListener('change', function (e) {
    var x = e.target;
    if (x === selEl) pick(selEl.value);
    else if (x.hasAttribute('data-sko')) { st[x.getAttribute('data-sko')] = x.checked; save(); draw(); }
  });
  tEl.addEventListener('input', function () { off = +tEl.value; draw(); });
  function setPlay(on) {
    playing = on; var b = $('skPlay'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '❚❚ Pause' : '▶ Play';
    if (on) { lastT = 0; requestAnimationFrame(tick); }
  }
  function tick(ts) {
    if (!playing) return;
    if (lastT) {
      var M = MODES[st.mode]; off += M.rate * Math.min(0.1, (ts - lastT) / 1000);
      if (off > M.span) off = -M.span;
      tEl.value = off; draw();
    }
    lastT = ts; requestAnimationFrame(tick);
  }
  // drag to turn, click to pick
  var drag = null;
  svg.addEventListener('pointerdown', function (e) { if (anim) { cancelAnimationFrame(anim); anim = null; } drag = { x: e.clientX, y: e.clientY, az: st.az, el: st.el, moved: false }; svg.setPointerCapture(e.pointerId); $('skHint').classList.add('sk-hid'); });
  svg.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    st.az = drag.az - dx * 0.45; st.el = Math.max(-85, Math.min(85, drag.el + dy * 0.45)); draw();
  });
  svg.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null; save();
    if (d.moved) return;
    var rc = svg.getBoundingClientRect(), x = (e.clientX - rc.left) * lastBox.W / rc.width, y = (e.clientY - rc.top) * lastBox.H / rc.height, best = null;
    hits.forEach(function (h) { var dd = Math.hypot(h.x - x, h.y - y) + (h.z < 0 ? 6 : 0); if (dd < 16 && (!best || dd < best.d)) best = { d: dd, n: h.name }; });
    if (best) pick(best.n);
  });
  svg.addEventListener('pointercancel', function () { drag = null; });
  svg.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft') st.az += 5; else if (k === 'ArrowRight') st.az -= 5;
    else if (k === 'ArrowUp') st.el = Math.min(85, st.el + 5); else if (k === 'ArrowDown') st.el = Math.max(-85, st.el - 5);
    else return;
    e.preventDefault(); save(); draw();
  });
  // Fill window / Full screen
  var fsEl = function () { return document.fullscreenElement || document.webkitFullscreenElement || null; };
  if (!(root.requestFullscreen || root.webkitRequestFullscreen)) $('skFs').hidden = true;
  function setFill(on) {
    root.classList.toggle('sk-fill', on);
    document.documentElement.classList.toggle('sk-fill-on', on);
    var b = $('skFill'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✕ Close' : '⤢ Fill window';
    draw();
  }
  function toggleFs() {
    if (fsEl() === root) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var f = root.requestFullscreen || root.webkitRequestFullscreen; if (f) f.call(root);
  }
  function fsChange() { var on = fsEl() === root; root.classList.toggle('sk-fs', on); var b = $('skFs'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✕ Exit full screen' : '⛶ Full screen'; setTimeout(draw, 60); }
  document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('sk-fill') && fsEl() !== root) setFill(false); });

  // ---------- location from the page ----------
  function fromCtx() {
    var c = window.MES_MOON_CTX;
    if (c && c.loc && isFinite(c.loc.lat)) { loc = { lat: +c.loc.lat, lon: +c.loc.lon, label: c.loc.label || c.loc.name || '' }; tz = c.tz || tz; cache = { t: null }; }
  }
  fromCtx();
  var firstData = true;
  document.addEventListener('moon-data', function () { fromCtx(); if (firstData) { firstData = false; face(st.sel, true); } draw(); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (Math.abs(stage.clientWidth - lastBox.W) > 2 || Math.abs(stage.clientHeight - lastBox.H) > 2) draw(); }).observe(stage);
  else window.addEventListener('resize', draw);
  // theme switch: colours are CSS variables, nothing to redraw; keep "now" fresh
  setInterval(function () { if (!document.hidden && !playing && !drag) draw(); }, 60000);
  setMode(st.mode);
  face(st.sel, true);
  draw();
})();
