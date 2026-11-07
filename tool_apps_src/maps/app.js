/* MES Maps: projections, globe, countries & capitals, true size, distances, quiz.
   Geometry and projection maths: d3 7.9.0 + d3-geo-projection 4.0.0 + topojson-client 3.1.0 (loaded on start).
   Pure helpers: lib.js (window.MESMaps). */
(function () {
  "use strict";
  var L = window.MESMaps, root = document.getElementById("mp");
  if (!root || !L) return;
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); };
  var D2R = Math.PI / 180, SPHERE = {type: "Sphere"}, d3, topo;
  var LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
    "https://cdn.jsdelivr.net/npm/d3-geo-projection@4.0.0/dist/d3-geo-projection.min.js",
    "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"];
  var DATA = "/maps/data/";
  var KEY = "mes-maps:v1";
  var TABS = ["proj", "globe", "countries", "truesize", "dist", "quiz"];

  /* ---------------- settings ---------------- */
  var S = {tab: "proj", p: "equal-earth", ep: "equal-earth", tp: "mercator", dp: "equal-earth", qp: "ortho", flat: "equirect",
    color: "continent", grat: true, labels: true, caps: true, states: false, night: false, tissot: false, dist: false,
    animate: true, spin: true, speed: 4, unit: "km", qmode: "find", qreg: "World", small: false};
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
  var Q0 = new URLSearchParams(location.search);
  if (TABS.indexOf(Q0.get("tab")) >= 0) S.tab = Q0.get("tab");
  if (Q0.get("p") && L.proj(Q0.get("p"))) S.p = Q0.get("p");
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------------- state ---------------- */
  var data = null;            // {feats110, feats50, mesh110, mesh50, coast50, byId, list}
  var admin1 = null, admin1Loading = false;
  var V = {rot: [-10, 0, 0], z: 1, x: 0, y: 0};
  var curId = "equal-earth";  // projection on screen
  var anim = null;            // morph / view animation
  var sel = null;             // selected country id
  var selA1 = null;           // selected admin-1 feature
  var hover = null;
  var pulses = [];            // [{p:[lon,lat], t0, color}]
  var ghosts = [];            // true size copies
  var DP = {a: [-123.12, 49.28, "Vancouver"], b: [-0.13, 51.51, "London"], next: "a"};
  var quiz = null;
  var cv = $("mp-cv"), ctx = cv.getContext("2d"), W = 800, H = 450, DPR = 1;
  var stars = [];
  var projCache = {}, normCache = {};
  var drag = null, lastFrame = 0, raf = 0, lastUserMove = 0;

  /* ---------------- projection specs ---------------- */
  function clampRaw(raw, lo, hi) {
    var f = function (l, p) { return raw(l, Math.max(lo * D2R, Math.min(hi * D2R, p))); };
    if (raw.invert) f.invert = raw.invert;
    return f;
  }
  function spec(id) {
    switch (id) {
      case "equal-earth": return {raw: d3.geoEqualEarthRaw};
      case "mercator": return {raw: clampRaw(d3.geoMercatorRaw, -85, 85), fit: {type: "MultiPoint", coordinates: [[-179.99, -62], [179.99, 84]]}};
      case "equirect": return {raw: d3.geoEquirectangularRaw};
      case "gall-peters": return {raw: d3.geoCylindricalEqualAreaRaw(45 * D2R)};
      case "miller": return {raw: d3.geoMillerRaw};
      case "robinson": return {raw: d3.geoRobinsonRaw};
      case "winkel3": return {raw: d3.geoWinkel3Raw};
      case "natural-earth": return {raw: d3.geoNaturalEarth1Raw};
      case "mollweide": return {raw: d3.geoMollweideRaw};
      case "sinusoidal": return {raw: d3.geoSinusoidalRaw};
      case "eckert4": return {raw: d3.geoEckert4Raw};
      case "hammer": return {raw: d3.geoHammerRaw(2)};
      case "aitoff": return {raw: d3.geoAitoffRaw};
      case "vandergrinten": return {raw: d3.geoVanDerGrintenRaw};
      case "loximuthal": return {raw: d3.geoLoximuthalRaw(40 * D2R)};
      case "az-north": return {raw: d3.geoAzimuthalEquidistantRaw, clip: 179.5, lat: -90};
      case "az-ea": return {raw: d3.geoAzimuthalEqualAreaRaw, clip: 179.5, free: true};
      case "stereo": return {raw: d3.geoStereographicRaw, clip: 140, free: true};
      case "gnomonic": return {raw: d3.geoGnomonicRaw, clip: 60, free: true};
      case "ortho": return {raw: d3.geoOrthographicRaw, clip: 90, free: true};
      case "albers": return {raw: d3.geoConicEqualAreaRaw(20 * D2R, 50 * D2R)};
      case "lcc": return {raw: clampRaw(d3.geoConicConformalRaw(30 * D2R, 60 * D2R), -60, 89.5)};
      case "bonne": return {raw: d3.geoBonneRaw(45 * D2R)};
      case "homolosine": return {factory: d3.geoInterruptedHomolosine};
      case "butterfly": return {factory: d3.geoPolyhedralWaterman, dl: 20};
      case "peirce": return {factory: d3.geoPeirceQuincuncial, lat: -90, roll: 45};
      case "berghaus": return {factory: d3.geoBerghaus, lat: -90};
    }
    return {raw: d3.geoEqualEarthRaw};
  }
  function available(id) { try { var s = spec(id); return !!(s.raw || (s.factory && s.factory())); } catch (e) { return false; } }
  function rotFor(id, r) {
    var s = spec(id);
    return [r[0] + (s.dl || 0), s.lat != null ? s.lat : (s.free ? r[1] : 0), s.roll || 0];
  }
  function build(id) {
    if (projCache[id]) return projCache[id];
    var s = spec(id), p = s.factory ? s.factory() : d3.geoProjection(s.raw);
    if (s.clip) p.clipAngle(s.clip);
    p.precision(0.4);
    return (projCache[id] = p);
  }
  function box() { var pad = Math.max(10, Math.min(W, H) * 0.03); return [[pad, pad], [W - pad, H - pad]]; }
  function applyView(p, v, globe) {
    var s = p.scale(), t = p.translate(), cx = W / 2, cy = H / 2;
    var z = v.z, px = globe ? 0 : v.x, py = globe ? 0 : v.y;
    p.scale(s * z).translate([cx + z * (t[0] - cx) + px, cy + z * (t[1] - cy) + py]);
    return p;
  }
  function projFor(id, v) {
    var p = build(id);
    p.rotate(rotFor(id, v.rot));
    var sp = spec(id), fo = sp.fit;
    if (fo) fo = {type: "MultiPoint", coordinates: fo.coordinates.map(function (c) { return [c[0] - v.rot[0] + (c[0] < 0 ? 0.02 : -0.02), c[1]]; })};
    p.fitExtent(box(), fo || SPHERE);
    return applyView(p, v, id === "ortho");
  }
  // normalised raw: the sphere's outline fitted into a 2x2 box, so two projections can be blended smoothly
  function normRaw(id) {
    if (normCache[id]) return normCache[id];
    var s = spec(id), p = d3.geoProjection(s.raw).scale(1).translate([0, 0]);
    if (s.clip) p.clipAngle(s.clip);
    var b = d3.geoPath(p).bounds(SPHERE);
    var cx = (b[0][0] + b[1][0]) / 2, cy = -(b[0][1] + b[1][1]) / 2, k = 2 / Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
    var raw = s.raw, f = function (l, q) { var r = raw(l, q); return [(r[0] - cx) * k, (r[1] - cy) * k]; };
    return (normCache[id] = f);
  }
  function lerpAng(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }
  function morphProj(a, b, t, va, vb) {
    var ra = normRaw(a), rb = normRaw(b);
    var m = d3.geoProjectionMutator(function (tt) { return function (l, q) { var p = ra(l, q), r = rb(l, q); return [p[0] + (r[0] - p[0]) * tt, p[1] + (r[1] - p[1]) * tt]; }; });
    var p = m(t);
    var ca = spec(a).clip, cb = spec(b).clip;
    if (ca || cb) { var c = (ca || 180) + ((cb || 180) - (ca || 180)) * t; p.clipAngle(c >= 179.6 ? 179.6 : c); }
    var r0 = rotFor(a, va.rot), r1 = rotFor(b, vb.rot);
    p.rotate([lerpAng(r0[0], r1[0], t), r0[1] + (r1[1] - r0[1]) * t, r0[2] + (r1[2] - r0[2]) * t]).precision(0.8);
    p.fitExtent(box(), SPHERE);
    var v = {z: va.z + (vb.z - va.z) * t, x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t};
    return applyView(p, v, false);
  }
  function morphable(id) { return !spec(id).factory; }

  /* ---------------- colours ---------------- */
  function dark() { return document.body.classList.contains("dark-mode"); }
  var CONT = {"Africa": "#e8b04b", "Asia": "#e07a5f", "Europe": "#7fb59b", "North America": "#6c9fd1", "South America": "#b98bd6", "Oceania": "#47b5a8", "Antarctica": "#e3eaf0", "Seven seas (open ocean)": "#b9b9b9"};
  var CONT_D = {"Africa": "#b9893a", "Asia": "#b45f49", "Europe": "#5f8d78", "North America": "#517ca6", "South America": "#8d68a6", "Oceania": "#368a80", "Antarctica": "#8796a3", "Seven seas (open ocean)": "#777"};
  var SEQ = ["#fff7d6", "#fde49c", "#fdc35a", "#f99a3e", "#ea6c31", "#cf4528", "#a32a24", "#6e1a1f"];
  var SEQ_D = ["#3b3a2a", "#5c5530", "#8a7431", "#b0832f", "#cf6f2c", "#d9502b", "#e5463f", "#ff6b6b"];
  var MODES = {
    density: {t: [5, 25, 50, 100, 200, 400, 1000], f: function (m, a) { return m.p && a ? m.p / a : null; }, lab: "People per km²", fmt: function (x) { return L.fmtInt(x); }},
    population: {t: [1e6, 5e6, 1e7, 3e7, 6e7, 1e8, 3e8], f: function (m) { return m.p || null; }, lab: "Population (2019 est.)", fmt: function (x) { return x >= 1e6 ? (x / 1e6) + "M" : L.fmtInt(x); }},
    gdppc: {t: [1000, 2500, 5000, 10000, 20000, 40000, 60000], f: function (m) { return m.p && m.g ? m.g * 1e6 / m.p : null; }, lab: "GDP per person, US$ (2019)", fmt: function (x) { return "$" + (x >= 1000 ? (x / 1000) + "k" : x); }},
    area: {t: [1e4, 5e4, 1e5, 3e5, 1e6, 3e6, 1e7], f: function (m, a) { return a || null; }, lab: "Area, km²", fmt: function (x) { return x >= 1e6 ? (x / 1e6) + "M" : (x / 1e3) + "k"; }}
  };
  function pal() {
    var d = dark();
    return {d: d, ocean0: d ? "#14324a" : "#dff1fb", ocean1: d ? "#0a1c2b" : "#a8d4ef", grat: d ? "rgba(160,200,230,.16)" : "rgba(40,90,140,.18)",
      border: d ? "rgba(10,14,20,.85)" : "rgba(255,255,255,.95)", coast: d ? "rgba(140,190,220,.35)" : "rgba(30,70,110,.35)",
      land: d ? "#56616b" : "#d9d3c4", txt: d ? "#f1f4f7" : "#1d2733", halo: d ? "rgba(10,15,22,.85)" : "rgba(255,255,255,.9)",
      sel: d ? "#ffd166" : "#d6336c", hov: d ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.45)", rim: d ? "rgba(150,200,240,.6)" : "rgba(40,90,140,.55)",
      cont: d ? CONT_D : CONT, seq: d ? SEQ_D : SEQ, nodata: d ? "#3a3f45" : "#e6e6e6"};
  }
  function fillFor(f, P) {
    var m = f.m;
    if (S.color === "continent") return P.cont[m.c] || P.land;
    if (S.color === "plain") return P.land;
    var M = MODES[S.color]; if (!M) return P.land;
    var v = M.f(m, f.area); if (v == null) return P.nodata;
    var i = 0; while (i < M.t.length && v >= M.t[i]) i++;
    return P.seq[i];
  }

  /* ---------------- loading ---------------- */
  function loadScript(u) { return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = function () { no(new Error("Could not load " + u)); }; document.head.appendChild(s); }); }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  function idOf(g) { return g.id || ("x" + L.norm(g.properties.name).replace(/ /g, "")); }
  function prep(features, meta) {
    return features.map(function (f) {
      var id = idOf(f), m = meta[id] || {n: f.properties.name};
      var big = f.geometry, best = 0;
      if (f.geometry && f.geometry.type === "MultiPolygon") {
        f.geometry.coordinates.forEach(function (pg) { var a = d3.geoArea({type: "Polygon", coordinates: pg}); if (a > best) { best = a; big = {type: "Polygon", coordinates: pg}; } });
      }
      return {type: "Feature", id: id, geometry: f.geometry, m: m, b: d3.geoBounds(f), lab: d3.geoCentroid(big), big: big, area: d3.geoArea(f) * L.R * L.R};
    });
  }
  function start() {
    setLoading("Loading map tools…");
    var chain = Promise.resolve();
    LIBS.forEach(function (u) { chain = chain.then(function () { return loadScript(u); }); });
    chain.then(function () {
      d3 = window.d3; topo = window.topojson;
      setLoading("Loading countries…");
      return Promise.all([getJSON(DATA + "countries-110m.json"), getJSON(DATA + "countries-50m.json"), getJSON(DATA + "countries.json")]);
    }).then(function (r) {
      var c110 = r[0], c50 = r[1], meta = r[2];
      var f110 = prep(topo.feature(c110, c110.objects.countries).features, meta);
      var f50 = prep(topo.feature(c50, c50.objects.countries).features, meta);
      // areas from the detailed outline
      var area = {}; f50.forEach(function (f) { area[f.id] = f.area; });
      f110.forEach(function (f) { if (area[f.id]) f.area = area[f.id]; });
      var byId = {}; f50.forEach(function (f) { byId[f.id] = f; });
      var by110 = {}; f110.forEach(function (f) { by110[f.id] = f; });
      data = {feats110: f110, feats50: f50, byId: byId, by110: by110,
        mesh110: topo.mesh(c110, c110.objects.countries, function (a, b) { return a !== b; }),
        mesh50: topo.mesh(c50, c50.objects.countries, function (a, b) { return a !== b; }),
        coast110: topo.mesh(c110, c110.objects.countries, function (a, b) { return a === b; }),
        coast50: topo.mesh(c50, c50.objects.countries, function (a, b) { return a === b; }),
        list: f50.filter(function (f) { return f.m && f.m.a3; }).sort(function (a, b) { return a.m.n.localeCompare(b.m.n); })};
      PROJ_OK = L.PROJ.filter(function (p) { return available(p.id); });
      setLoading("");
      initUI();
      if (S.states) loadAdmin1();
      var c = Q0.get("c");
      if (c) { var f = data.list.filter(function (x) { return x.m.a3 === c.toUpperCase(); })[0]; if (f) select(f.id, true); }
      setTab(S.tab, true);
    }).catch(function (e) { setLoading("Sorry, the map could not load: " + e.message + ". Check your connection and reload the page."); });
  }
  var PROJ_OK = [];
  function setLoading(t) { var el = $("mp-loading"); el.textContent = t; el.hidden = !t; }
  function loadAdmin1() {
    if (admin1 || admin1Loading) return;
    admin1Loading = true; toast("Loading states and provinces…");
    getJSON(DATA + "admin1.json").then(function (j) {
      admin1 = j.f.map(function (r) {
        var coords = L.decodeRings(r.g).map(function (pg) {
          if (d3.geoArea({type: "Polygon", coordinates: pg}) > 2 * Math.PI) pg = pg.map(function (ring) { return ring.slice().reverse(); });
          return pg;
        });
        var f = {type: "Feature", geometry: {type: "MultiPolygon", coordinates: coords}, m: r, country: j.countries[r.a3]};
        f.b = d3.geoBounds(f); f.lab = d3.geoCentroid(f);
        return f;
      });
      admin1Countries = j.countries;
      admin1Loading = false; renderInfo(); redraw();
    }).catch(function () { admin1Loading = false; toast("Could not load the states and provinces."); });
  }
  var admin1Countries = {};

  /* ---------------- sizing ---------------- */
  function resize() {
    var wrap = $("mp-stage"), r = wrap.getBoundingClientRect();
    var fill = root.classList.contains("mp-filled") || document.fullscreenElement === $("mp-stagewrap");
    W = Math.max(280, Math.round(r.width));
    if (fill) H = Math.max(240, Math.round(r.height));
    else {
      var narrow = W < 560, globe = S.tab === "globe" || curId === "ortho" || (S.tab === "quiz" && S.qp === "ortho");
      var ideal = globe ? W * (narrow ? 0.95 : 0.72) : W * (narrow ? 0.62 : 0.56);
      H = Math.round(Math.max(narrow ? 220 : 300, Math.min(ideal, window.innerHeight * 0.78)));
      wrap.style.height = H + "px";
    }
    DPR = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    stars = []; var rnd = L.rng(42);
    for (var i = 0; i < 260; i++) stars.push([rnd() * W, rnd() * H, rnd() * 1.3 + 0.2, rnd()]);
    redraw();
  }

  /* ---------------- drawing ---------------- */
  var needDraw = false, frameT = 0;
  function redraw() { needDraw = true; loop(); }
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    var dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0; lastFrame = t; frameT = t;
    var busy = false;
    if (anim) { busy = true; stepAnim(t); }
    if (S.spin && curId === "ortho" && S.tab === "globe" && !drag && !anim && t - lastUserMove > 2500) { V.rot[0] += S.speed * dt; busy = true; needDraw = true; }
    if (drag && drag.vx == null) {} // nothing
    if (inertia && !drag) { V.rot[0] += inertia[0] * dt; V.rot[1] = Math.max(-89, Math.min(89, V.rot[1] + inertia[1] * dt)); inertia[0] *= Math.pow(0.04, dt); inertia[1] *= Math.pow(0.04, dt); if (Math.abs(inertia[0]) + Math.abs(inertia[1]) < 1) inertia = null; busy = true; needDraw = true; syncSliders(); }
    pulses = pulses.filter(function (p) { return t - p.t0 < 1800; });
    if (pulses.length) { busy = true; needDraw = true; }
    if (needDraw || busy) { needDraw = false; draw(t); }
    if (busy) loop(); else lastFrame = 0;
  }
  var inertia = null;
  var curProj = null, crossSnap = null;

  function draw(t) {
    if (!data) return;
    var P = pal(), fast = !!(anim || (drag && drag.moved) || inertia);
    var spinning = !fast && S.spin && S.tab === "globe" && curId === "ortho";
    var proj;
    if (anim && anim.kind === "morph") proj = morphProj(anim.a, anim.b, ease(anim.k), anim.va, anim.vb);
    else proj = projFor(curId, V);
    curProj = (anim && anim.kind === "morph") ? null : proj;
    var lite = fast || spinning;
    var feats = lite ? data.feats110 : data.feats50;
    var g = ctx; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
    var path = d3.geoPath(proj, g);
    var isGlobe = curId === "ortho" || (anim && anim.kind === "morph" && (anim.a === "ortho" || anim.b === "ortho"));
    // space background for the globe
    if (isGlobe && curId === "ortho" && !anim) {
      var sp = g.createLinearGradient(0, 0, 0, H); sp.addColorStop(0, P.d ? "#05070d" : "#0b1730"); sp.addColorStop(1, P.d ? "#0a1020" : "#1c2f55");
      g.fillStyle = sp; g.fillRect(0, 0, W, H);
      stars.forEach(function (s) { g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 1300 + s[3] * 9)); g.fillStyle = "#fff"; g.fillRect(s[0], s[1], s[2], s[2]); });
      g.globalAlpha = 1;
      var c = proj.translate(), rr = proj.scale();
      var glow = g.createRadialGradient(c[0], c[1], rr * 0.98, c[0], c[1], rr * 1.18);
      glow.addColorStop(0, "rgba(120,190,255,.55)"); glow.addColorStop(1, "rgba(120,190,255,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(c[0], c[1], rr * 1.18, 0, 7); g.fill();
    }
    // ocean
    g.beginPath(); path(SPHERE);
    var oc;
    if (curId === "ortho" && !anim) { var c2 = proj.translate(), r2 = proj.scale(); oc = g.createRadialGradient(c2[0] - r2 * 0.35, c2[1] - r2 * 0.4, r2 * 0.1, c2[0], c2[1], r2); oc.addColorStop(0, P.d ? "#2a5d84" : "#bfe3fa"); oc.addColorStop(1, P.d ? "#0c2236" : "#5fa4d6"); }
    else { oc = g.createLinearGradient(0, 0, 0, H); oc.addColorStop(0, P.ocean0); oc.addColorStop(0.5, P.ocean1); oc.addColorStop(1, P.ocean0); }
    g.fillStyle = oc; g.fill();
    // graticule
    if (S.grat) { g.beginPath(); path(d3.geoGraticule10()); g.strokeStyle = P.grat; g.lineWidth = 0.7; g.stroke(); }
    // land, grouped by colour
    var groups = {};
    var dimOthers = S.tab === "truesize";
    feats.forEach(function (f) { var c = dimOthers ? P.land : fillFor(f, P); (groups[c] = groups[c] || []).push(f); });
    for (var col in groups) { g.beginPath(); groups[col].forEach(function (f) { path(f); }); g.fillStyle = col; g.fill(); }
    if (S.dist && S.tab === "proj" && !anim) drawDistortion(g, path, proj);
    // states / provinces
    if (S.states && admin1 && !fast) {
      g.beginPath(); admin1.forEach(function (f) { path(f); }); g.strokeStyle = P.d ? "rgba(255,255,255,.28)" : "rgba(60,60,60,.35)"; g.lineWidth = 0.6; g.stroke();
    }
    // borders and coast
    g.beginPath(); path(lite ? data.mesh110 : data.mesh50); g.strokeStyle = P.border; g.lineWidth = lite ? 0.6 : 0.8; g.stroke();
    g.beginPath(); path(lite ? data.coast110 : data.coast50); g.strokeStyle = P.coast; g.lineWidth = 0.6; g.stroke();
    // globe shading (3D feel)
    if (curId === "ortho" && !anim) {
      var c3 = proj.translate(), r3 = proj.scale(), sh = g.createRadialGradient(c3[0] - r3 * 0.3, c3[1] - r3 * 0.35, r3 * 0.2, c3[0], c3[1], r3 * 1.02);
      sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(0.7, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,10,30,.35)");
      g.beginPath(); path(SPHERE); g.fillStyle = sh; g.fill();
    }
    // day / night
    if (S.night) drawNight(g, path);
    // Tissot circles
    if (S.tissot && S.tab === "proj") drawTissot(g, path);
    // hover + selection
    if (hover && hover.geometry && !fast) { g.beginPath(); path(hover); g.fillStyle = P.hov; g.fill(); }
    var sf = sel && (lite ? data.by110[sel] || data.byId[sel] : data.byId[sel]);
    if (sf && S.tab !== "truesize") { g.beginPath(); path(sf); g.fillStyle = P.d ? "rgba(255,209,102,.28)" : "rgba(214,51,108,.22)"; g.fill(); g.strokeStyle = P.sel; g.lineWidth = 2.2; g.stroke(); }
    if (selA1) { g.beginPath(); path(selA1); g.strokeStyle = P.d ? "#9be7ff" : "#1864ab"; g.lineWidth = 2; g.stroke(); }
    if (quiz && quiz.mark) quiz.mark.forEach(function (mk) { var f = data.byId[mk.id]; if (!f) return; g.beginPath(); path(f); g.fillStyle = mk.c; g.globalAlpha = 0.75; g.fill(); g.globalAlpha = 1; g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke(); });
    // tab overlays
    if (S.tab === "truesize") drawGhosts(g, path, proj, P);
    if (S.tab === "dist") drawRoute(g, path, proj, P);
    // sphere rim
    g.beginPath(); path(SPHERE); g.strokeStyle = P.rim; g.lineWidth = 1.2; g.stroke();
    // labels
    var quizHide = quiz && quiz.live;
    if (!fast && !quizHide) drawLabels(g, path, proj, P);
    // pulses
    pulses.forEach(function (pu) {
      var xy = visible(proj, pu.p); if (!xy) return;
      var k = (t - pu.t0) / 1800;
      for (var i = 0; i < 2; i++) { var kk = (k + i * 0.35) % 1; g.beginPath(); g.arc(xy[0], xy[1], 6 + kk * 40, 0, 7); g.strokeStyle = pu.c; g.globalAlpha = (1 - kk) * 0.9; g.lineWidth = 2.5; g.stroke(); }
      g.globalAlpha = 1;
    });
    if (crossSnap && anim && anim.kind === "fade") { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 - ease(anim.k); g.drawImage(crossSnap, 0, 0); g.globalAlpha = 1; }
    updateBadge();
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function visible(proj, p) {
    var r = proj.rotate();
    if (curId === "ortho" || spec(curId).clip) { var cl = (spec(curId).clip || 90) * D2R; if (d3.geoDistance(p, [-r[0], -r[1]]) > cl - 0.02) return null; }
    var xy = proj(p); if (!xy || !isFinite(xy[0])) return null;
    if (xy[0] < -40 || xy[1] < -40 || xy[0] > W + 40 || xy[1] > H + 40) return null;
    return xy;
  }
  function drawNight(g, path) {
    var s = L.subsolar(new Date()), anti = [s[0] + 180, -s[1]];
    [90, 84, 78, 72].forEach(function (r, i) {
      g.beginPath(); path(d3.geoCircle().center(anti).radius(r)()); g.fillStyle = "rgba(4,10,30," + (i === 0 ? 0.18 : 0.1) + ")"; g.fill();
    });
    var xy = visible(curProj || projFor(curId, V), s);
    if (xy) { g.beginPath(); g.arc(xy[0], xy[1], 7, 0, 7); g.fillStyle = "#ffd43b"; g.fill(); g.strokeStyle = "#f08c00"; g.lineWidth = 2; g.stroke(); }
  }
  function drawTissot(g, path) {
    g.beginPath();
    for (var lat = -75; lat <= 75; lat += 25) for (var lon = -165; lon <= 165; lon += 30) path(d3.geoCircle().center([lon, lat]).radius(4.2).precision(10)());
    g.fillStyle = "rgba(230,50,70,.45)"; g.fill(); g.strokeStyle = "rgba(160,20,40,.8)"; g.lineWidth = 0.8; g.stroke();
  }
  var distCells = null;
  function drawDistortion(g, path, proj) {
    if (!distCells) {
      distCells = [];
      for (var la = -85; la < 85; la += 10) for (var lo = -180; lo < 180; lo += 10) {
        var top = Math.min(85, la + 10), ring = [[lo, la], [lo, top], [lo + 10, top], [lo + 10, la], [lo, la]];
        var poly = {type: "Polygon", coordinates: [ring]};
        if (d3.geoArea(poly) > 2 * Math.PI) poly = {type: "Polygon", coordinates: [ring.slice().reverse()]};
        distCells.push({g: poly, a: d3.geoArea(poly), lat: la + 5});
      }
    }
    var pp = d3.geoPath(proj), ref = 0, cnt = 0;
    distCells.forEach(function (c) { c.pa = pp.area(c.g); if (Math.abs(c.lat) < 20 && c.pa > 0) { ref += c.pa / c.a; cnt++; } });
    ref = cnt ? ref / cnt : 1;
    distCells.forEach(function (c) {
      if (!(c.pa > 0)) return;
      var k = Math.log2((c.pa / c.a) / ref), x = Math.max(-1, Math.min(1, k / 3));
      var col = x > 0 ? "rgba(220,40,60," + (0.06 + x * 0.6) + ")" : "rgba(40,90,220," + (0.06 - x * 0.6) + ")";
      g.beginPath(); path(c.g); g.fillStyle = col; g.fill();
    });
  }
  function textBox(g, txt, x, y, size, P, weight, placed) {
    g.font = (weight || 600) + " " + size + "px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    var w = g.measureText(txt).width, h = size;
    var r = [x - w / 2 - 2, y - h / 2 - 1, w + 4, h + 2];
    for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]) return false; }
    placed.push(r);
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.strokeStyle = P.halo; g.lineWidth = 3; g.strokeText(txt, x, y);
    g.fillStyle = P.txt; g.fillText(txt, x, y);
    return true;
  }
  function drawLabels(g, path, proj, P) {
    var placed = [];
    var pp = d3.geoPath(proj);
    // selected first
    if (sel && data.byId[sel]) { var sf = data.byId[sel], xy = visible(proj, sf.lab); if (xy) textBox(g, sf.m.n, xy[0], xy[1] - (S.caps ? 12 : 0), 14, P, 700, placed); }
    // national capitals
    var caps = [], showCaps = S.caps && S.tab !== "truesize" && S.tab !== "dist";
    if (showCaps) {
      data.list.forEach(function (f) { if (f.m.cap) caps.push({c: f.m.cap, f: f}); });
      caps.sort(function (a, b) { return (b.c[3] || 0) - (a.c[3] || 0); });
      caps.forEach(function (o) {
        var xy = visible(proj, [o.c[1], o.c[2]]); if (!xy) return;
        o.xy = xy;
        g.beginPath(); star(g, xy[0], xy[1], 4.2); g.fillStyle = P.d ? "#ffd166" : "#c92a2a"; g.fill(); g.strokeStyle = P.halo; g.lineWidth = 1; g.stroke();
      });
    }
    // state capitals
    if (S.states && admin1) {
      admin1.forEach(function (f) {
        if (!f.m.cap) return; var xy = visible(proj, [f.m.cap[1], f.m.cap[2]]); if (!xy) return;
        g.beginPath(); g.arc(xy[0], xy[1], 2.6, 0, 7); g.fillStyle = P.d ? "#9be7ff" : "#1864ab"; g.fill();
      });
    }
    if (!S.labels && !showCaps) return;
    // country names (biggest first) if they fit inside the country
    if (S.labels) {
      var order = data.feats50.filter(function (f) { return f.m.a3; }).sort(function (a, b) { return b.area - a.area; });
      order.forEach(function (f) {
        if (f.id === sel) return;
        var xy = visible(proj, f.lab); if (!xy) return;
        var b = pp.bounds(f.big), bw = b[1][0] - b[0][0];
        if (!(bw > 0) || bw > W * 1.5) return;
        var size = Math.max(10, Math.min(15, bw / 9));
        g.font = "600 " + size + "px system-ui,sans-serif";
        var tw = g.measureText(f.m.n).width;
        if (tw > bw * 0.95 || bw > W * 0.6) return;
        if (pp.area(f.big) < tw * size * 1.1) return;
        textBox(g, f.m.n, xy[0], xy[1], size, P, 600, placed);
      });
    }
    if (showCaps) caps.forEach(function (o) { if (o.xy) textBox(g, o.c[0], o.xy[0], o.xy[1] + 11, 11, P, 500, placed); });
    if (S.states && admin1) {
      admin1.forEach(function (f) {
        var xy = visible(proj, f.lab); if (!xy) return;
        var b = pp.bounds(f), bw = b[1][0] - b[0][0];
        g.font = "italic 500 10.5px system-ui,sans-serif";
        if (g.measureText(f.m.n).width < bw * 0.9) textBox(g, f.m.n, xy[0], xy[1], 10.5, P, "italic 500", placed);
        if (f.m.cap) { var c = visible(proj, [f.m.cap[1], f.m.cap[2]]); if (c) textBox(g, f.m.cap[0], c[0], c[1] + 9, 9.5, P, 400, placed); }
      });
    }
  }
  function star(g, x, y, r) {
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath();
  }

  /* ---------------- animation ---------------- */
  function stepAnim(t) {
    var k = Math.min(1, (t - anim.t0) / anim.dur); anim.k = k;
    if (anim.kind === "view") {
      var e = ease(k), a = anim.va, b = anim.vb;
      V.rot = [lerpAng(a.rot[0], b.rot[0], e), a.rot[1] + (b.rot[1] - a.rot[1]) * e, 0];
      V.z = a.z + (b.z - a.z) * e; V.x = a.x + (b.x - a.x) * e; V.y = a.y + (b.y - a.y) * e;
    }
    if (k >= 1) {
      var done = anim; anim = null;
      if (done.kind === "morph") { curId = done.b; V = clone(done.vb); }
      if (done.kind === "fade") crossSnap = null;
      resizeIfNeeded();
      if (done.then) done.then();
      syncSliders();
    }
  }
  function clone(v) { return {rot: v.rot.slice(), z: v.z, x: v.x, y: v.y}; }
  function goProj(id, opt) {
    opt = opt || {};
    if (!data) return;
    var vb = opt.view ? opt.view : {rot: V.rot.slice(), z: 1, x: 0, y: 0};
    if (spec(id).lat != null) vb.rot[1] = 0;
    if (!spec(id).free && !opt.view) vb.rot[1] = 0;
    if (id === curId && !anim) { animateView(vb, 500, opt.then); return; }
    if (anim) { if (anim.kind === "morph") { curId = anim.b; V = clone(anim.vb); } anim = null; crossSnap = null; }
    var dur = opt.dur || 1400;
    if (!S.animate && !opt.force) { curId = id; V = vb; resizeIfNeeded(); redraw(); if (opt.then) opt.then(); syncSliders(); return; }
    if (morphable(id) && morphable(curId)) {
      anim = {kind: "morph", a: curId, b: id, va: clone(V), vb: vb, t0: performance.now(), dur: dur, k: 0, then: opt.then};
    } else {
      crossSnap = document.createElement("canvas"); crossSnap.width = cv.width; crossSnap.height = cv.height; crossSnap.getContext("2d").drawImage(cv, 0, 0);
      curId = id; V = vb; resizeIfNeeded();
      anim = {kind: "fade", t0: performance.now(), dur: 650, k: 0, then: opt.then};
    }
    loop();
  }
  function animateView(vb, ms, then) {
    if (!S.animate) { V = clone(vb); redraw(); syncSliders(); if (then) then(); return; }
    anim = {kind: "view", va: clone(V), vb: clone(vb), t0: performance.now(), dur: ms || 900, k: 0, then: then}; loop();
  }
  var lastH = 0;
  function resizeIfNeeded() { var want = S.tab === "globe" || curId === "ortho"; if (want !== lastH) { lastH = want; resize(); } }
  function focusFeature(f, zoomIn) {
    if (!f) return;
    var c = f.lab, vb = {rot: [-c[0], spec(curId).free ? -c[1] : V.rot[1], 0], z: 1, x: 0, y: 0};
    if (zoomIn) {
      var tmp = projFor(curId, vb), b = d3.geoPath(tmp).bounds(f.big || f), bw = b[1][0] - b[0][0], bh = b[1][1] - b[0][1];
      if (bw > 0 && bh > 0) {
        var z = Math.max(1, Math.min(curId === "ortho" ? 4 : 6, Math.min(W * 0.32 / bw, H * 0.32 / bh)));
        var ctr = tmp(c) || [W / 2, H / 2];
        vb.z = z;
        if (curId !== "ortho") { vb.x = (W / 2 - ctr[0]) * z; vb.y = (H / 2 - ctr[1]) * z; }
      }
    }
    animateView(vb, 1100);
  }

  /* ---------------- picking ---------------- */
  function geoAt(x, y) {
    if (!curProj || !curProj.invert) return null;
    var p = curProj.invert([x, y]); if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
    var back = curProj(p); if (!back || Math.abs(back[0] - x) > 2 || Math.abs(back[1] - y) > 2) return null;
    if (spec(curId).clip) { var r = curProj.rotate(); if (d3.geoDistance(p, [-r[0], -r[1]]) > spec(curId).clip * D2R) return null; }
    return p;
  }
  function inBounds(b, p) {
    if (p[1] < b[0][1] - 0.01 || p[1] > b[1][1] + 0.01) return false;
    if (b[0][0] <= b[1][0]) return p[0] >= b[0][0] - 0.01 && p[0] <= b[1][0] + 0.01;
    return p[0] >= b[0][0] || p[0] <= b[1][0];
  }
  function countryAt(p) {
    if (!p) return null;
    for (var i = 0; i < data.feats50.length; i++) { var f = data.feats50[i]; if (inBounds(f.b, p) && d3.geoContains(f, p)) return f; }
    return null;
  }
  function admin1At(p) {
    if (!p || !admin1 || !S.states) return null;
    for (var i = 0; i < admin1.length; i++) { var f = admin1[i]; if (inBounds(f.b, p) && d3.geoContains(f, p)) return f; }
    return null;
  }

  /* ---------------- pointer ---------------- */
  var ptrs = {};
  function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function onDown(e) {
    if (!data) return;
    cv.setPointerCapture(e.pointerId);
    var p = pos(e); ptrs[e.pointerId] = p;
    lastUserMove = performance.now(); inertia = null;
    if (anim && anim.kind === "view") anim = null;
    var ids = Object.keys(ptrs);
    if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; drag = {pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: V.z, x0: V.x, y0: V.y, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}; return; }
    drag = {s: p, last: p, moved: false, rot0: V.rot.slice(), x0: V.x, y0: V.y, t: performance.now(), vx: 0, vy: 0};
    var g = geoAt(p[0], p[1]);
    if (S.tab === "truesize" && g) {
      for (var i = ghosts.length - 1; i >= 0; i--) if (d3.geoContains(ghosts[i].geo, g)) { drag.ghost = ghosts[i]; drag.goff = [ghosts[i].at[0] - g[0], ghosts[i].at[1] - g[1]]; ghosts.push(ghosts.splice(i, 1)[0]); break; }
    }
    if (S.tab === "dist" && curProj) {
      ["a", "b"].forEach(function (k) { var xy = curProj([DP[k][0], DP[k][1]]); if (xy && Math.hypot(xy[0] - p[0], xy[1] - p[1]) < 16) drag.pt = k; });
    }
  }
  function onMove(e) {
    var p = pos(e);
    if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
    if (!drag) { hoverAt(p); return; }
    lastUserMove = performance.now();
    if (drag.pinch) {
      var ids = Object.keys(ptrs); if (ids.length < 2) return;
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomTo(drag.z0 * d / drag.pinch, drag.mid, {z: drag.z0, x: drag.x0, y: drag.y0}); return;
    }
    var dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    if (Math.hypot(p[0] - drag.s[0], p[1] - drag.s[1]) > 4) drag.moved = true;
    if (!drag.moved) return;
    var now = performance.now(), dtt = Math.max(1, now - drag.t);
    drag.t = now; drag.last = p;
    if (drag.ghost) { var gg = geoAt(p[0], p[1]); if (gg) { moveGhost(drag.ghost, [gg[0] + drag.goff[0], Math.max(-80, Math.min(80, gg[1] + drag.goff[1]))]); redraw(); } return; }
    if (drag.pt) { var gp = geoAt(p[0], p[1]); if (gp) { DP[drag.pt] = [gp[0], gp[1], ""]; renderDist(); redraw(); } return; }
    hideTip();
    var globe = curId === "ortho";
    if (!globe && V.z > 1.05) { V.x += dx; V.y += dy; redraw(); return; }
    var k = 180 / (curProj ? curProj.scale() * Math.PI : 300) * (globe ? 1 : 1.2);
    V.rot[0] += dx * k * (globe ? 1 : 1);
    if (spec(curId).free) V.rot[1] = Math.max(-89, Math.min(89, V.rot[1] - dy * k));
    drag.vx = dx * k / dtt * 1000; drag.vy = (spec(curId).free ? -dy * k : 0) / dtt * 1000;
    syncSliders(); redraw();
  }
  function onUp(e) {
    delete ptrs[e.pointerId];
    if (!drag) return;
    var d = drag; drag = null;
    if (d.pinch) { redraw(); return; }
    if (!d.moved) click(pos(e));
    else if (!d.ghost && !d.pt && curId === "ortho" && performance.now() - d.t < 80 && Math.hypot(d.vx, d.vy) > 20) { inertia = [d.vx, d.vy]; loop(); }
    if (d.ghost) renderGhosts();
    if (d.pt) renderDist();
    redraw();
  }
  function zoomTo(z, at, base) {
    base = base || V;
    z = Math.max(0.6, Math.min(curId === "ortho" ? 8 : 24, z));
    var cx = W / 2, cy = H / 2;
    if (curId !== "ortho") { V.x = at[0] - cx - z * (at[0] - cx - base.x) / base.z; V.y = at[1] - cy - z * (at[1] - cy - base.y) / base.z; }
    V.z = z;
    if (V.z <= 1.001 && curId !== "ortho") { V.x = 0; V.y = 0; }
    redraw();
  }
  function onWheel(e) {
    if (!data) return;
    var fill = root.classList.contains("mp-filled") || document.fullscreenElement;
    if (!fill && !e.ctrlKey && !e.metaKey) { showNote("Hold Ctrl (or ⌘) and scroll to zoom, or use + / −"); return; }
    e.preventDefault(); lastUserMove = performance.now();
    zoomTo(V.z * Math.exp(-e.deltaY * 0.0022), pos(e));
  }
  function hoverAt(p) {
    if (!curProj || anim) return;
    var g = geoAt(p[0], p[1]);
    var a1 = admin1At(g), f = countryAt(g);
    var h = a1 || f;
    if (h !== hover) { hover = h; redraw(); }
    if (!h || (quiz && quiz.live)) { hideTip(); cv.style.cursor = drag ? "grabbing" : "grab"; return; }
    cv.style.cursor = "pointer";
    var tip = $("mp-tip"), m = h.m, html;
    if (a1) html = "<b>" + esc(m.n) + "</b> <small>" + esc(m.t || "") + ", " + esc(h.country || "") + "</small>" + (m.cap ? "<br>Capital: " + esc(m.cap[0]) : "");
    else html = "<b>" + L.flag(m.a2) + " " + esc(m.n) + "</b>" + (m.cap ? "<br>Capital: " + esc(m.cap[0]) : "") + (m.p ? "<br>" + L.fmtBig(m.p) + " people" : "");
    if (S.tab === "truesize") html += "<br><small>Click to add a copy you can drag</small>";
    tip.innerHTML = html; tip.hidden = false;
    var tx = Math.min(W - tip.offsetWidth - 6, p[0] + 14), ty = p[1] + 16;
    if (ty + tip.offsetHeight > H) ty = p[1] - tip.offsetHeight - 10;
    tip.style.left = Math.max(4, tx) + "px"; tip.style.top = Math.max(4, ty) + "px";
  }
  function hideTip() { $("mp-tip").hidden = true; }
  function click(p) {
    var g = geoAt(p[0], p[1]);
    if (S.tab === "dist") { if (g) { DP[DP.next] = [g[0], g[1], ""]; DP.next = DP.next === "a" ? "b" : "a"; renderDist(); redraw(); } return; }
    var a1 = admin1At(g), f = countryAt(g);
    if (quiz && quiz.live && quiz.q && quiz.q.kind === "find") { if (f) answerFind(f); return; }
    if (S.tab === "truesize") { if (f) addGhost(f.id); return; }
    if (a1) { selA1 = a1; select(countryIdByA3(a1.m.a3)); return; }
    selA1 = null;
    if (f) select(f.id); else { sel = null; renderInfo(); redraw(); }
  }
  function countryIdByA3(a3) { var f = data.list.filter(function (x) { return x.m.a3 === a3; })[0]; return f ? f.id : null; }

  /* ---------------- selection + info card ---------------- */
  function select(id, fly) {
    sel = id; var f = data.byId[id];
    if (f) { pulses.push({p: f.m.cap ? [f.m.cap[1], f.m.cap[2]] : f.lab, t0: performance.now(), c: pal().sel}); }
    renderInfo(); redraw();
    if (fly && f) focusFeature(f, S.tab !== "proj");
    qa(".mp-crow").forEach(function (r) { r.classList.toggle("on", r.dataset.id === id); });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
  function stat(k, v) { return "<div class='mp-stat'><span>" + k + "</span><b>" + v + "</b></div>"; }
  function renderInfo() {
    var box = $("mp-info");
    if (!sel || !data.byId[sel] || S.tab === "truesize" || S.tab === "dist" || (quiz && quiz.live)) { box.hidden = true; return; }
    var f = data.byId[sel], m = f.m, u = S.unit === "mi" ? "mi" : "km";
    var dens = m.p && f.area ? m.p / (u === "mi" ? f.area / 2.589988 : f.area) : 0;
    var h = "<button type='button' class='mp-x' id='mp-infox' aria-label='Close'>×</button>";
    h += "<div class='mp-ihead'><span class='mp-flag'>" + L.flag(m.a2) + "</span><div><h3>" + esc(m.n) + "</h3>" + (m.ln && m.ln !== m.n ? "<small>" + esc(m.ln) + "</small>" : "") + "</div></div>";
    h += "<div class='mp-stats'>";
    if (m.cap) {
      var day = L.isDay([m.cap[1], m.cap[2]], new Date());
      h += stat("Capital", esc(m.cap[0]) + (m.alt ? " <small>(also " + m.alt.map(function (a) { return esc(a[0]); }).join(", ") + ")</small>" : "") + " <small title='At the capital right now'>" + (day ? "☀️ day now" : "🌙 night now") + "</small>");
    }
    if (m.p) h += stat("Population (2019 est.)", L.fmtInt(m.p));
    if (f.area) h += stat("Area (from the map outline)", "≈ " + L.fmtArea(f.area, u));
    if (dens) h += stat("People per " + u + "²", L.fmtInt(dens));
    if (m.c) h += stat("Continent / region", esc(m.c) + (m.s ? " · " + esc(m.s) : ""));
    if (m.g) h += stat("GDP (2019)", "US$ " + L.fmtBig(m.g * 1e6) + (m.p ? " <small>($" + L.fmtInt(m.g * 1e6 / m.p) + " per person)</small>" : ""));
    if (m.cap) h += stat("Capital coordinates", Math.abs(m.cap[2]).toFixed(2) + "°" + (m.cap[2] >= 0 ? "N" : "S") + ", " + Math.abs(m.cap[1]).toFixed(2) + "°" + (m.cap[1] >= 0 ? "E" : "W"));
    if (m.a3) h += stat("Codes", esc(m.a2 || "") + " · " + esc(m.a3));
    h += "</div>";
    // states / provinces
    var a3 = m.a3, has = Object.keys(admin1Countries).length ? !!admin1Countries[a3] : ["USA", "CAN", "AUS", "BRA", "CHN", "IND", "IDN", "RUS", "ZAF"].indexOf(a3) >= 0;
    if (has) {
      if (!admin1) h += "<p class='mp-imore'><button type='button' class='mp-btn' id='mp-ishow'>Show its states / provinces and their capitals</button></p>";
      else {
        var rows = admin1.filter(function (x) { return x.m.a3 === a3; });
        h += "<details class='mp-subs'" + (selA1 ? " open" : "") + "><summary>" + rows.length + " states / provinces / regions and their capitals</summary><div class='mp-sublist'>";
        rows.forEach(function (x, i) { h += "<button type='button' data-a1='" + admin1.indexOf(x) + "'" + (x === selA1 ? " class='on'" : "") + "><b>" + esc(x.m.n) + "</b><span>" + esc(x.m.cap ? x.m.cap[0] : "") + "</span></button>"; });
        h += "</div></details>";
      }
    }
    h += "<p class='mp-ilinks'><a href='https://en.wikipedia.org/wiki/" + encodeURIComponent(m.n.replace(/ /g, "_")) + "' target='_blank' rel='noopener'>Wikipedia ↗</a> · <button type='button' class='mp-lnk' id='mp-ifly'>Zoom to it</button> · <button type='button' class='mp-lnk' id='mp-ilink'>Copy link</button>" + (S.tab !== "truesize" ? " · <button type='button' class='mp-lnk' id='mp-its'>Compare its true size</button>" : "") + "</p>";
    box.innerHTML = h; box.hidden = false;
    $("mp-infox").onclick = function () { sel = null; selA1 = null; renderInfo(); redraw(); };
    $("mp-ifly").onclick = function () { focusFeature(f, true); };
    $("mp-ilink").onclick = function () { copyLink({c: m.a3}); };
    if ($("mp-its")) $("mp-its").onclick = function () { setTab("truesize"); addGhost(f.id); };
    if ($("mp-ishow")) $("mp-ishow").onclick = function () { S.states = true; $("mp-o-states").checked = true; save(); loadAdmin1(); };
    qa("[data-a1]", box).forEach(function (b) { b.onclick = function () { selA1 = admin1[+b.dataset.a1]; renderInfo(); redraw(); if (selA1.m.cap) pulses.push({p: [selA1.m.cap[1], selA1.m.cap[2]], t0: performance.now(), c: "#1c7ed6"}); focusFeature(selA1, true); loop(); }; });
  }

  /* ---------------- true size ---------------- */
  var GHOST_COL = ["#e8590c", "#7048e8", "#0ca678", "#d6336c", "#1c7ed6", "#f59f00", "#ae3ec9", "#2f9e44"];
  function addGhost(id, at) {
    var f = data.byId[id]; if (!f) return;
    var home = f.lab.slice();
    var gh = {id: id, home: home, at: home.slice(), col: GHOST_COL[ghosts.length % GHOST_COL.length], f: f};
    moveGhost(gh, at || [home[0] + 12, Math.max(-60, Math.min(60, home[1] * 0.5))]);
    ghosts.push(gh); renderGhosts(); redraw();
  }
  function moveGhost(gh, at) { gh.at = at; gh.geo = {type: "Feature", geometry: L.mapCoords(gh.f.geometry, L.mover(gh.home, at))}; }
  function drawGhosts(g, path, proj, P) {
    ghosts.forEach(function (gh) {
      var home = data.byId[gh.id];
      g.beginPath(); path(home); g.setLineDash([4, 3]); g.strokeStyle = gh.col; g.lineWidth = 1.4; g.stroke(); g.setLineDash([]);
      g.beginPath(); path(gh.geo); g.fillStyle = gh.col; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; g.strokeStyle = gh.col; g.lineWidth = 2; g.stroke();
      var gb = d3.geoPath(proj).bounds(gh.geo), xy = visible(proj, gh.at);
      if (xy && isFinite(gb[1][1]) && gb[1][1] - gb[0][1] < H * 0.8) xy = [xy[0], Math.min(H - 16, gb[1][1] + 16)];
      if (xy) {
        var k = curId === "mercator" ? L.mercArea(gh.at[1]) / L.mercArea(gh.home[1]) : 1;
        var lab = gh.f.m.n + (curId === "mercator" ? " · drawn " + (k >= 1 ? k.toFixed(k < 10 ? 1 : 0) + "×" : "1/" + (1 / k).toFixed(1 / k < 10 ? 1 : 0)) + " vs home" : "");
        g.font = "700 12.5px system-ui,sans-serif"; var w = g.measureText(lab).width;
        g.fillStyle = P.d ? "rgba(15,20,28,.85)" : "rgba(255,255,255,.92)"; roundRect(g, xy[0] - w / 2 - 7, xy[1] - 11, w + 14, 22, 11); g.fill();
        g.strokeStyle = gh.col; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = P.txt; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(lab, xy[0], xy[1]);
      }
    });
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function renderGhosts() {
    var box = $("mp-tslist"); if (!box) return;
    if (!ghosts.length) { box.innerHTML = "<p class='tu-note'>No copies yet. Click a country on the map, pick one above or try an example.</p>"; return; }
    box.innerHTML = ghosts.map(function (gh, i) {
      var m = gh.f.m, kHome = L.mercArea(gh.home[1]), kHere = L.mercArea(gh.at[1]);
      return "<div class='mp-ghost'><span class='mp-sw' style='background:" + gh.col + "'></span><div><b>" + L.flag(m.a2) + " " + esc(m.n) + "</b> <small>real area ≈ " + L.fmtArea(gh.f.area, S.unit === "mi" ? "mi" : "km") + "</small><br><small>On Mercator: drawn " + kHome.toFixed(1) + "× too big at home (" + Math.abs(gh.home[1]).toFixed(0) + "°" + (gh.home[1] >= 0 ? "N" : "S") + "), " + kHere.toFixed(1) + "× where it is now (" + Math.abs(gh.at[1]).toFixed(0) + "°" + (gh.at[1] >= 0 ? "N" : "S") + ")</small></div><button type='button' class='mp-x' data-rm='" + i + "' aria-label='Remove " + esc(m.n) + "'>×</button></div>";
    }).join("");
    qa("[data-rm]", box).forEach(function (b) { b.onclick = function () { ghosts.splice(+b.dataset.rm, 1); renderGhosts(); redraw(); }; });
  }
  var TS_PRE = [
    ["Greenland vs Africa", [["304", [20, 3]]]],
    ["Russia at the equator", [["643", [95, 0]]]],
    ["Canada vs USA", [["124", [-100, 30]]]],
    ["Antarctica? Australia at the pole", [["036", [0, 72]]]],
    ["UK at the equator", [["826", [15, 0]]]],
    ["DR Congo over Europe", [["180", [12, 50]]]],
    ["Brazil over Russia", [["076", [90, 58]]]],
    ["India over the USA", [["356", [-98, 40]]]]
  ];

  /* ---------------- distances ---------------- */
  function drawRoute(g, path, proj, P) {
    var a = [DP.a[0], DP.a[1]], b = [DP.b[0], DP.b[1]];
    g.beginPath(); path({type: "LineString", coordinates: L.rhumbPoints(a, b, 240)}); g.setLineDash([7, 5]); g.strokeStyle = P.d ? "#ffa94d" : "#e8590c"; g.lineWidth = 2.4; g.stroke(); g.setLineDash([]);
    g.beginPath(); path({type: "LineString", coordinates: [a, b]}); g.strokeStyle = P.d ? "#74c0fc" : "#1971c2"; g.lineWidth = 3.2; g.stroke();
    // moving plane dot along the great circle
    var ip = d3.geoInterpolate(a, b), tt = (frameT / 4000) % 1, pt = visible(proj, ip(tt));
    if (pt) { g.beginPath(); g.arc(pt[0], pt[1], 4.5, 0, 7); g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "#1971c2"; g.lineWidth = 2; g.stroke(); needDraw = true; loop(); }
    [["A", a, DP.a[2]], ["B", b, DP.b[2]]].forEach(function (o) {
      var xy = visible(proj, o[1]); if (!xy) return;
      g.beginPath(); g.arc(xy[0], xy[1], 9, 0, 7); g.fillStyle = o[0] === "A" ? "#2f9e44" : "#c92a2a"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#fff"; g.font = "700 11px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(o[0], xy[0], xy[1] + 0.5);
      if (o[2]) textBox(g, o[2], xy[0], xy[1] - 18, 12, P, 700, []);
    });
  }
  function fmtLL(p) { return Math.abs(p[1]).toFixed(2) + "°" + (p[1] >= 0 ? "N" : "S") + " " + Math.abs(p[0]).toFixed(2) + "°" + (p[0] >= 0 ? "E" : "W"); }
  function renderDist() {
    var out = $("mp-dout"); if (!out) return;
    var a = [DP.a[0], DP.a[1]], b = [DP.b[0], DP.b[1]], u = S.unit;
    var gc = L.dist(a, b), rh = L.rhumb(a, b), brg = L.bearing(a, b);
    var hrs = gc / 880 + 0.5;
    $("mp-da").value = DP.a[2] || fmtLL(a); $("mp-db").value = DP.b[2] || fmtLL(b);
    out.innerHTML = "<div class='mp-dres'><div class='mp-dcard mp-gc'><span>Great circle (shortest)</span><b>" + L.fmtKm(gc, u) + "</b><small>Start heading " + brg.toFixed(0) + "° " + L.compass(brg) + "</small></div>" +
      "<div class='mp-dcard mp-rh'><span>Rhumb line (constant compass heading)</span><b>" + L.fmtKm(rh.km, u) + "</b><small>Heading " + rh.bearing.toFixed(0) + "° " + L.compass(rh.bearing) + " all the way · " + (gc > 1 ? "+" + ((rh.km / gc - 1) * 100).toFixed(1) + "%" : "") + "</small></div>" +
      "<div class='mp-dcard'><span>Flight time (about 880 km/h + 30 min)</span><b>" + Math.floor(hrs) + " h " + Math.round((hrs % 1) * 60) + " min</b><small>Antipode of A: " + fmtLL([a[0] > 0 ? a[0] - 180 : a[0] + 180, -a[1]]) + "</small></div></div>" +
      "<p class='tu-note'>The <b style='color:#1971c2'>solid line</b> is the great circle, the <b style='color:#e8590c'>dashed line</b> the rhumb line. On Mercator the rhumb line is straight; on the gnomonic map the great circle is straight; on the globe you can see the great circle really is the shorter one.</p>";
  }
  function cityLookup(txt) {
    var q = L.norm(txt); if (!q) return null;
    var best = null;
    data.list.forEach(function (f) {
      var m = f.m; if (!m.cap) return;
      if (L.norm(m.cap[0]) === q || L.norm(m.cap[0] + ", " + m.n) === q) best = best || [m.cap[1], m.cap[2], m.cap[0]];
    });
    if (!best && admin1) admin1.forEach(function (f) { if (f.m.cap && L.norm(f.m.cap[0]) === q) best = best || [f.m.cap[1], f.m.cap[2], f.m.cap[0]]; });
    if (!best) data.list.forEach(function (f) { var m = f.m; if (m.cap && L.norm(m.n) === q) best = best || [m.cap[1], m.cap[2], m.cap[0]]; });
    if (!best) { var mm = txt.match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[ ,]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?/i); if (mm) { var la = +mm[1] * (/s/i.test(mm[2] || "") ? -1 : 1), lo = +mm[3] * (/w/i.test(mm[4] || "") ? -1 : 1); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) best = [lo, la, ""]; } }
    return best;
  }

  /* ---------------- quiz ---------------- */
  var QREG = ["World", "Africa", "Asia", "Europe", "North America", "South America", "Oceania"];
  function quizPool() {
    return data.list.filter(function (f) {
      var m = f.m; if (!m.cap || !m.p || m.c === "Antarctica" || m.c === "Seven seas (open ocean)") return false;
      if (S.qreg !== "World" && m.c !== S.qreg) return false;
      if (S.qmode === "find" && !S.small && f.area < 9000) return false;
      if (m.p < 60000) return false;
      return true;
    });
  }
  function startQuiz() {
    if (S.qmode === "scap" && !admin1) { loadAdmin1(); toast("Loading states and provinces… press Start again in a moment."); return; }
    var r = L.rng((Date.now() % 1e9) + 7), pool;
    if (S.qmode === "scap") pool = admin1.filter(function (f) { return f.m.cap && (S.qreg === "World" || f.m.a3 === S.qreg); });
    else pool = quizPool();
    if (pool.length < 4) { toast("Not enough places in that region."); return; }
    quiz = {live: true, r: r, pool: pool, list: L.shuffle(pool, r).slice(0, 10), i: 0, score: 0, streak: 0, best: 0, mark: [], answered: false};
    sel = null; selA1 = null; renderInfo();
    if (S.qp === "ortho") goProj("ortho"); else goProj(S.qp);
    nextQ();
  }
  function nextQ() {
    var Qd = quiz; Qd.mark = []; Qd.answered = false;
    if (Qd.i >= Qd.list.length) { endQuiz(); return; }
    var f = Qd.list[Qd.i], kind = S.qmode, q = {kind: kind, f: f};
    var sameReg = function (x) { return x.m.c === f.m.c || x.m.a3 === f.m.a3; };
    if (kind === "capital") { q.text = "What is the capital of " + L.flag(f.m.a2) + " <b>" + esc(f.m.n) + "</b>?"; q.opts = L.choices(f, Qd.pool, 4, Qd.r, sameReg).map(function (x) { return {f: x, t: x.m.cap[0]}; }); }
    else if (kind === "which") { q.text = "Which country is highlighted?"; q.opts = L.choices(f, Qd.pool, 4, Qd.r, sameReg).map(function (x) { return {f: x, t: L.flag(x.m.a2) + " " + x.m.n}; }); Qd.mark = [{id: f.id, c: "#f59f00"}]; focusFeature(f, true); }
    else if (kind === "scap") { q.text = "What is the capital of <b>" + esc(f.m.n) + "</b> <small>(" + esc(f.country) + ")</small>?"; q.opts = L.choices(f, Qd.pool, 4, Qd.r, function (x) { return x.m.a3 === f.m.a3; }).map(function (x) { return {f: x, t: x.m.cap[0]}; }); selA1 = f; focusFeature(f, true); }
    else { q.text = "Where is " + L.flag(f.m.a2) + " <b>" + esc(f.m.n) + "</b>? Click it on the map."; }
    Qd.q = q; renderQuiz(); redraw();
  }
  function renderQuiz() {
    var box = $("mp-qbox"), Qd = quiz;
    if (!Qd) { box.innerHTML = "<p class='tu-note'>Pick a game and a region, then press <b>Start</b>. 10 questions a round; your best score is kept on this device.</p>"; return; }
    if (!Qd.live) return;
    var q = Qd.q, h = "<div class='mp-qtop'><span>Question " + (Qd.i + 1) + " of " + Qd.list.length + "</span><span>Score " + Qd.score + (Qd.streak > 1 ? " · 🔥 " + Qd.streak + " in a row" : "") + "</span></div><p class='mp-qtext'>" + q.text + "</p>";
    if (q.opts) h += "<div class='mp-qopts'>" + q.opts.map(function (o, i) { return "<button type='button' data-o='" + i + "'>" + esc(o.t).replace(/&lt;/g, "<") + "</button>"; }).join("") + "</div>";
    h += "<div class='mp-qfb' id='mp-qfb' aria-live='polite'></div><div class='mp-qact'><button type='button' class='mp-btn' id='mp-qskip'>" + (Qd.answered ? "Next →" : "Skip") + "</button> <button type='button' class='mp-lnk' id='mp-qstop'>Stop</button></div>";
    box.innerHTML = h;
    qa("[data-o]", box).forEach(function (b) { b.onclick = function () { answerOpt(+b.dataset.o, b); }; });
    $("mp-qskip").onclick = function () { if (!Qd.answered) { reveal(false); } else { Qd.i++; nextQ(); } };
    $("mp-qstop").onclick = function () { quiz = null; selA1 = null; renderQuiz(); renderInfo(); redraw(); };
  }
  function feedback(ok, txt) {
    var Qd = quiz; Qd.answered = true;
    if (ok) { Qd.score++; Qd.streak++; } else Qd.streak = 0;
    var fb = $("mp-qfb"); fb.className = "mp-qfb " + (ok ? "ok" : "no"); fb.innerHTML = txt;
    $("mp-qskip").textContent = Qd.i + 1 >= Qd.list.length ? "See my score →" : "Next →";
    if (ok) setTimeout(function () { if (quiz === Qd && Qd.answered && Qd.live) { Qd.i++; nextQ(); } }, 1400);
  }
  function answerFind(f) {
    var Qd = quiz; if (Qd.answered) return;
    var right = Qd.q.f, ok = f.id === right.id;
    Qd.mark = [{id: right.id, c: "#2f9e44"}]; if (!ok) Qd.mark.push({id: f.id, c: "#e03131"});
    pulses.push({p: right.lab, t0: performance.now(), c: "#2f9e44"});
    var km = L.dist(f.lab, right.lab);
    feedback(ok, ok ? "✓ Yes! That is " + esc(right.m.n) + "." : "✗ That is " + esc(f.m.n) + ". " + esc(right.m.n) + " is the green one, about " + L.fmtKm(km, S.unit) + " away.");
    if (!ok) focusFeature(right, false);
    redraw();
  }
  function answerOpt(i, btn) {
    var Qd = quiz; if (Qd.answered) return;
    var o = Qd.q.opts[i], right = Qd.q.f, ok = o.f === right;
    qa("[data-o]").forEach(function (b, j) { b.disabled = true; if (Qd.q.opts[j].f === right) b.classList.add("ok"); });
    if (!ok) btn.classList.add("no");
    if (S.qmode === "which") Qd.mark = [{id: right.id, c: "#2f9e44"}];
    if (S.qmode === "capital") { Qd.mark = [{id: right.id, c: "#2f9e44"}]; pulses.push({p: [right.m.cap[1], right.m.cap[2]], t0: performance.now(), c: "#2f9e44"}); focusFeature(right, true); }
    var name = S.qmode === "scap" ? right.m.cap[0] : (S.qmode === "which" ? right.m.n : right.m.cap[0]);
    feedback(ok, ok ? "✓ Right: " + esc(name) + "." : "✗ It is " + esc(name) + ".");
    redraw();
  }
  function reveal() {
    var Qd = quiz, right = Qd.q.f;
    if (Qd.q.kind === "find") { Qd.mark = [{id: right.id, c: "#2f9e44"}]; focusFeature(right, false); pulses.push({p: right.lab, t0: performance.now(), c: "#2f9e44"}); feedback(false, "It is the green one: " + esc(right.m.n) + "."); }
    else { var j = Qd.q.opts.map(function (o) { return o.f; }).indexOf(right); answerOpt(j, qa("[data-o]")[j]); }
    redraw();
  }
  function endQuiz() {
    var Qd = quiz; Qd.live = false; Qd.mark = []; selA1 = null;
    var key = KEY + ":best:" + S.qmode + ":" + S.qreg, best = 0;
    try { best = +localStorage.getItem(key) || 0; if (Qd.score > best) localStorage.setItem(key, Qd.score); } catch (e) {}
    var msg = Qd.score === 10 ? "Perfect! 🌍" : Qd.score >= 8 ? "Excellent!" : Qd.score >= 5 ? "Good going!" : "Keep practising!";
    $("mp-qbox").innerHTML = "<div class='mp-qend'><b>" + Qd.score + " / " + Qd.list.length + "</b><p>" + msg + (Qd.score > best ? " New best for this game." : " Best: " + best + " / 10.") + "</p><button type='button' class='mp-btn mp-pri' id='mp-qagain'>Play again</button></div>";
    $("mp-qagain").onclick = startQuiz;
    redraw();
  }

  /* ---------------- UI ---------------- */
  function toast(t) { var el = $("mp-toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }
  function showNote(t) { var el = $("mp-note"); el.textContent = t; el.classList.add("on"); clearTimeout(showNote.t); showNote.t = setTimeout(function () { el.classList.remove("on"); }, 1600); }
  function copyLink(extra) {
    var u = new URL(location.origin + location.pathname);
    u.searchParams.set("tab", S.tab); if (S.tab === "proj") u.searchParams.set("p", S.p);
    if (extra && extra.c) u.searchParams.set("c", extra.c);
    var s = u.toString();
    (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", s); });
  }
  function updateBadge() {
    var b = $("mp-badge"), id = anim && anim.kind === "morph" ? anim.b : curId, p = L.proj(id);
    var txt = p ? p.n : "";
    if (anim && anim.kind === "morph") txt = (L.proj(anim.a) || {}).n + " → " + txt;
    if (b.textContent !== txt) b.textContent = txt;
  }
  function syncSliders() {
    var lo = $("mp-lon"), la = $("mp-lat");
    if (lo) { var v = ((-V.rot[0] + 540) % 360) - 180; lo.value = Math.round(v); $("mp-lonv").textContent = Math.round(v) + "°"; }
    if (la) { la.value = Math.round(-V.rot[1]); $("mp-latv").textContent = Math.round(-V.rot[1]) + "°"; la.disabled = !spec(curId).free; }
  }
  function tabProj(tab) { return tab === "globe" ? "ortho" : tab === "countries" ? S.ep : tab === "truesize" ? S.tp : tab === "dist" ? S.dp : tab === "quiz" ? S.qp : S.p; }
  function setTab(tab, first) {
    if (TABS.indexOf(tab) < 0) tab = "proj";
    S.tab = tab; save();
    qa(".mp-tabs [data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false"); });
    qa("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
    if (tab !== "quiz" && quiz) { quiz = null; renderQuiz(); }
    if (tab === "proj") buildThumbs();
    if (tab === "countries") renderTable();
    if (tab === "truesize") renderGhosts();
    if (tab === "dist") renderDist();
    if (tab === "quiz") renderQuiz();
    renderInfo(); renderLegend();
    var id = tabProj(tab), vb = {rot: V.rot.slice(), z: 1, x: 0, y: 0};
    if (tab === "truesize" && !ghosts.length && first !== "keep") { addGhost("304", [20, 3]); }
    if (tab === "globe" && Math.abs(vb.rot[1]) < 1) vb.rot[1] = -18;
    if (tab === "dist") { var mid = d3.geoInterpolate([DP.a[0], DP.a[1]], [DP.b[0], DP.b[1]])(0.5); vb.rot = [-mid[0], spec(id).free ? -mid[1] : 0, 0]; }
    if (first === true) { curId = id; V = vb; lastH = !lastH; resizeIfNeeded(); syncSliders(); redraw(); return; }
    goProj(id, {view: vb});
    lastH = null; setTimeout(resizeIfNeeded, 0);
  }
  var thumbsBuilt = false;
  function buildThumbs() {
    var grid = $("mp-pgrid");
    if (!thumbsBuilt) {
      thumbsBuilt = true;
      var fams = ["pcyl", "cyl", "comp", "az", "conic", "poly"];
      grid.innerHTML = fams.map(function (fam) {
        var items = PROJ_OK.filter(function (p) { return p.fam === fam; }); if (!items.length) return "";
        return "<div class='mp-fam'><h4>" + L.FAM[fam] + "</h4><div class='mp-thumbs'>" + items.map(function (p) {
          return "<button type='button' class='mp-th' data-p='" + p.id + "' title='" + esc(p.n) + "'><canvas width='176' height='100' aria-hidden='true'></canvas><span>" + esc(p.n.replace(/ \(.*\)/, "")) + "</span><i class='mp-k mp-k-" + p.keeps + "'>" + ({conformal: "angles", "equal-area": "area", equidistant: "distance", compromise: "balance", gnomonic: "routes", none: "view"})[p.keeps] + "</i></button>";
        }).join("") + "</div></div>";
      }).join("");
      qa(".mp-th", grid).forEach(function (b) { b.onclick = function () { stopTour(); pickProj(b.dataset.p); }; });
      // draw thumbnails progressively
      var list = qa(".mp-th canvas", grid), i = 0;
      (function next() { if (i >= list.length) return; drawThumb(list[i], list[i].parentNode.dataset.p); i++; setTimeout(next, 16); })();
    }
    qa(".mp-th", grid).forEach(function (b) { b.classList.toggle("on", b.dataset.p === S.p); b.setAttribute("aria-pressed", b.dataset.p === S.p ? "true" : "false"); });
    renderProjInfo();
  }
  function drawThumb(c, id) {
    var g = c.getContext("2d"), P = pal(), p = build(id), w = c.width, h = c.height;
    var r = rotFor(id, [0, 0, 0]); p.rotate(r).fitExtent([[4, 4], [w - 4, h - 4]], SPHERE);
    var path = d3.geoPath(p, g); g.clearRect(0, 0, w, h);
    g.beginPath(); path(SPHERE); g.fillStyle = P.ocean1; g.fill();
    g.beginPath(); path(d3.geoGraticule().step([30, 30])()); g.strokeStyle = P.grat; g.lineWidth = 0.5; g.stroke();
    g.beginPath(); data.feats110.forEach(function (f) { path(f); }); g.fillStyle = P.d ? "#9aa5ae" : "#7f9a6e"; g.fill();
    g.beginPath(); path(SPHERE); g.strokeStyle = P.rim; g.lineWidth = 1; g.stroke();
    projCache[id] = null; delete projCache[id]; // thumbnails used their own fit
  }
  function pickProj(id) {
    S.p = id; save();
    qa(".mp-th").forEach(function (b) { b.classList.toggle("on", b.dataset.p === id); b.setAttribute("aria-pressed", b.dataset.p === id ? "true" : "false"); });
    renderProjInfo();
    var vb = {rot: [V.rot[0], spec(id).free ? V.rot[1] : 0, 0], z: 1, x: 0, y: 0};
    if (id === "albers" || id === "lcc") vb.rot[0] = 96;
    goProj(id, {view: vb});
  }
  function renderProjInfo() {
    var p = L.proj(S.p), box = $("mp-pinfo"); if (!p || !box) return;
    var yr = p.y < 0 ? (-p.y) + " BC" : (p.y < 1500 ? "about " + p.y : p.y);
    var h = "<h3>" + esc(p.n) + "</h3><p class='mp-pmeta'><span class='mp-k mp-k-" + p.keeps + "'>" + esc(L.KEEPS[p.keeps]) + "</span> <span class='mp-tag'>" + esc(L.FAM[p.fam]) + "</span> <span class='mp-tag'>" + esc(p.by) + ", " + yr + "</span></p>";
    h += "<p>" + esc(p.note) + "</p><p><b>Good for:</b> " + esc(p.use) + "</p>";
    var gr = greenland(p.id); if (gr) h += "<p class='mp-gr'>On this map <b>Greenland is drawn " + gr + "</b> the size of Africa. On the globe it is <b>7%</b> (2.2 vs 30.3 million km²).</p>";
    box.innerHTML = h;
  }
  var grCache = {};
  function greenland(id) {
    if (grCache[id]) return grCache[id];
    try {
      var p = build(id); p.rotate(rotFor(id, [0, 0, 0])).fitExtent([[0, 0], [1000, 600]], SPHERE);
      var pp = d3.geoPath(p), gA = pp.area(data.by110["304"]), aA = 0;
      data.feats110.forEach(function (f) { if (f.m.c === "Africa") aA += pp.area(f); });
      projCache[id] = null; delete projCache[id];
      if (!(gA > 0 && aA > 0)) return "";
      return (grCache[id] = Math.round(gA / aA * 100) + "%");
    } catch (e) { return ""; }
  }
  var tour = null;
  function startTour() {
    if (tour) { stopTour(); return; }
    var ids = PROJ_OK.map(function (p) { return p.id; }), i = Math.max(0, ids.indexOf(S.p));
    $("mp-tour").textContent = "■ Stop tour"; $("mp-tour").setAttribute("aria-pressed", "true");
    function next() { i = (i + 1) % ids.length; pickProj(ids[i]); tour = setTimeout(next, 3600); }
    tour = setTimeout(next, 200);
  }
  function stopTour() { if (!tour) return; clearTimeout(tour); tour = null; var b = $("mp-tour"); b.textContent = "▶ Tour all projections"; b.setAttribute("aria-pressed", "false"); }
  function renderLegend() {
    var el = $("mp-legend"), P = pal();
    var parts = [];
    if (S.tab !== "truesize") {
      if (S.color === "continent") parts.push(Object.keys(P.cont).slice(0, 7).map(function (k) { return "<span><i style='background:" + P.cont[k] + "'></i>" + k + "</span>"; }).join(""));
      else if (MODES[S.color]) { var M = MODES[S.color]; parts.push("<b>" + M.lab + "</b> " + P.seq.map(function (c, i) { return "<span><i style='background:" + c + "'></i>" + (i ? "≥" + M.fmt(M.t[i - 1]) : "<" + M.fmt(M.t[0])) + "</span>"; }).join("")); }
    }
    if (S.dist && S.tab === "proj") parts.push("<b>Area drawn</b> <span><i style='background:rgba(40,90,220,.6)'></i>smaller</span><span><i style='background:rgba(230,230,230,.6)'></i>true</span><span><i style='background:rgba(220,40,60,.6)'></i>bigger (×8 = darkest)</span>");
    if (S.caps) parts.push("<span><i class='mp-star'>★</i>capital</span>");
    el.innerHTML = parts.map(function (p) { return "<div>" + p + "</div>"; }).join("");
    el.hidden = !parts.length || $("mp-o-legend") && !$("mp-o-legend").checked;
  }
  var sortKey = "n";
  function renderTable() {
    var tb = $("mp-ctable"); if (!tb || !data) return;
    var q = $("mp-csearch").value, cont = S.ccont || "All", u = S.unit === "mi" ? "mi" : "km";
    var rows = data.list.filter(function (f) { var m = f.m; return (cont === "All" || m.c === cont) && L.matches(q, [m.n, m.ln || "", m.cap ? m.cap[0] : "", m.a3 || "", (m.alt || []).map(function (a) { return a[0]; }).join(" ")]); });
    var dens = function (f) { return f.m.p && f.area ? f.m.p / f.area : 0; };
    var cmp = {n: function (a, b) { return a.m.n.localeCompare(b.m.n); }, cap: function (a, b) { return (a.m.cap ? a.m.cap[0] : "~").localeCompare(b.m.cap ? b.m.cap[0] : "~"); }, p: function (a, b) { return (b.m.p || 0) - (a.m.p || 0); }, a: function (a, b) { return b.area - a.area; }, d: function (a, b) { return dens(b) - dens(a); }}[sortKey];
    rows.sort(cmp);
    $("mp-ccount").textContent = rows.length + " countries and territories";
    tb.innerHTML = rows.map(function (f, i) {
      var m = f.m;
      return "<tr class='mp-crow" + (f.id === sel ? " on" : "") + "' data-id='" + f.id + "' tabindex='0'><td>" + (i + 1) + "</td><td><span class='mp-fl'>" + L.flag(m.a2) + "</span> " + esc(m.n) + "</td><td>" + esc(m.cap ? m.cap[0] : "–") + "</td><td class='r'>" + (m.p ? L.fmtBig(m.p).replace(" million", "M").replace(" billion", "B") : "–") + "</td><td class='r'>" + L.fmtInt(u === "mi" ? f.area / 2.589988 : f.area) + "</td><td class='r'>" + (dens(f) ? L.fmtInt(u === "mi" ? dens(f) * 2.589988 : dens(f)) : "–") + "</td></tr>";
    }).join("");
    qa(".mp-crow", tb).forEach(function (r) {
      r.onclick = function () { selA1 = null; select(r.dataset.id, true); };
      r.onkeydown = function (e) { if (e.key === "Enter") r.onclick(); };
    });
    qa("#mp-cthead th[data-s]").forEach(function (th) { th.setAttribute("aria-sort", th.dataset.s === sortKey ? (sortKey === "n" || sortKey === "cap" ? "ascending" : "descending") : "none"); });
  }
  function fillCountryList() {
    var dl = $("mp-clist"); dl.innerHTML = data.list.map(function (f) { return "<option value='" + esc(f.m.n) + "'>"; }).join("");
    var dc = $("mp-cities"); dc.innerHTML = data.list.filter(function (f) { return f.m.cap; }).map(function (f) { return "<option value='" + esc(f.m.cap[0] + ", " + f.m.n) + "'>"; }).join("");
  }
  function findCountry(txt) {
    var q = L.norm(txt); if (!q) return null;
    var exact = data.list.filter(function (f) { return L.norm(f.m.n) === q || L.norm(f.m.ln || "") === q || L.norm(f.m.a3) === q; })[0];
    return exact || data.list.filter(function (f) { return L.matches(txt, [f.m.n, f.m.ln || ""]); })[0] || null;
  }
  function seg(id, key, onChange) {
    var el = $(id); if (!el) return;
    qa("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.v === String(S[key]) ? "true" : "false");
      b.onclick = function () { S[key] = b.dataset.v; save(); qa("button", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); if (onChange) onChange(b.dataset.v); };
    });
  }
  function check(id, key, onChange) {
    var el = $(id); if (!el) return; el.checked = !!S[key];
    el.onchange = function () { S[key] = el.checked; save(); if (onChange) onChange(); renderLegend(); redraw(); };
  }
  function fillSel(el, items, val) { el.innerHTML = items.map(function (p) { return "<option value='" + p.id + "'" + (p.id === val ? " selected" : "") + ">" + esc(p.n) + "</option>"; }).join(""); }

  function initUI() {
    // tabs
    qa(".mp-tabs [data-tab]").forEach(function (b) {
      b.onclick = function () { setTab(b.dataset.tab); };
      b.onkeydown = function (e) { var t = qa(".mp-tabs [data-tab]"), i = t.indexOf(b); if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var n = t[(i + (e.key === "ArrowRight" ? 1 : t.length - 1)) % t.length]; n.focus(); n.click(); } };
    });
    // canvas events
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", function () { if (!drag) { hover = null; hideTip(); redraw(); } });
    cv.addEventListener("wheel", onWheel, {passive: false});
    cv.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 20 : 5, k = e.key;
      if (k === "ArrowLeft") V.rot[0] += step; else if (k === "ArrowRight") V.rot[0] -= step;
      else if (k === "ArrowUp" && spec(curId).free) V.rot[1] = Math.max(-89, V.rot[1] - step);
      else if (k === "ArrowDown" && spec(curId).free) V.rot[1] = Math.min(89, V.rot[1] + step);
      else if (k === "+" || k === "=") zoomTo(V.z * 1.3, [W / 2, H / 2]); else if (k === "-") zoomTo(V.z / 1.3, [W / 2, H / 2]);
      else return;
      e.preventDefault(); lastUserMove = performance.now(); syncSliders(); redraw();
    });
    // toolbar
    $("mp-zin").onclick = function () { zoomTo(V.z * 1.5, [W / 2, H / 2]); };
    $("mp-zout").onclick = function () { zoomTo(V.z / 1.5, [W / 2, H / 2]); };
    $("mp-zreset").onclick = function () { animateView({rot: [V.rot[0], spec(curId).free && curId !== "ortho" ? V.rot[1] : (curId === "ortho" ? -20 : 0), 0], z: 1, x: 0, y: 0}, 600); };
    $("mp-png").onclick = function () { draw(performance.now()); cv.toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "mes-map-" + curId + ".png"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }); };
    $("mp-fill").onclick = function () { setFill(!root.classList.contains("mp-filled")); };
    $("mp-fs").onclick = function () { var w = $("mp-stagewrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };
    document.addEventListener("fullscreenchange", function () { setTimeout(resize, 60); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("mp-filled")) setFill(false); });
    // layers
    var cs = $("mp-color"); cs.value = S.color; cs.onchange = function () { S.color = cs.value; save(); renderLegend(); redraw(); };
    check("mp-o-labels", "labels"); check("mp-o-caps", "caps"); check("mp-o-grat", "grat"); check("mp-o-night", "night");
    check("mp-o-states", "states", function () { if (S.states) loadAdmin1(); });
    $("mp-o-legend").onchange = renderLegend;
    var us = $("mp-unit"); us.value = S.unit; us.onchange = function () { S.unit = us.value; save(); renderInfo(); renderTable(); renderDist(); renderGhosts(); };
    $("mp-link").onclick = function () { copyLink(sel ? {c: data.byId[sel].m.a3} : null); };
    // projections tab
    check("mp-o-tissot", "tissot"); check("mp-o-dist", "dist");
    check("mp-animate", "animate");
    $("mp-tour").onclick = startTour;
    $("mp-lon").oninput = function () { V.rot[0] = -(+this.value); $("mp-lonv").textContent = this.value + "°"; lastUserMove = performance.now(); redraw(); };
    $("mp-lat").oninput = function () { V.rot[1] = -(+this.value); $("mp-latv").textContent = this.value + "°"; redraw(); };
    $("mp-toglobe").onclick = function () { stopTour(); S.flat = curId === "ortho" ? S.flat : curId; save(); goProj("ortho", {dur: 1800, view: {rot: [V.rot[0], -20, 0], z: 1, x: 0, y: 0}, then: function () { setTab("globe", "keep"); }}); };
    // globe tab
    var spinB = $("mp-spin"); function spinLab() { spinB.textContent = S.spin ? "⏸ Stop spinning" : "▶ Spin"; spinB.setAttribute("aria-pressed", S.spin ? "true" : "false"); }
    spinLab(); spinB.onclick = function () { S.spin = !S.spin; save(); spinLab(); lastUserMove = 0; loop(); };
    var sp = $("mp-speed"); sp.value = S.speed; sp.oninput = function () { S.speed = +sp.value; save(); };
    var flat = PROJ_OK.filter(function (p) { return morphable(p.id) && p.id !== "ortho"; });
    fillSel($("mp-unrollto"), flat, S.flat); $("mp-unrollto").onchange = function () { S.flat = this.value; save(); };
    $("mp-unroll").onclick = function () { var to = $("mp-unrollto").value; S.p = to; save(); goProj(to, {dur: 2200, force: true, view: {rot: [V.rot[0], 0, 0], z: 1, x: 0, y: 0}, then: function () { setTab("proj", "keep"); }}); };
    $("mp-gform").onsubmit = function (e) { e.preventDefault(); var f = findCountry($("mp-gsearch").value); if (f) { S.spin = false; spinLab(); save(); selA1 = null; select(f.id, true); } else toast("No country called that"); };
    $("mp-gnight").onclick = function () { S.night = true; $("mp-o-night").checked = true; save(); var s = L.subsolar(new Date()); animateView({rot: [-s[0] - 90, -s[1] * 0.6, 0], z: 1, x: 0, y: 0}, 1200); renderLegend(); };
    // countries tab
    fillSel($("mp-eproj"), PROJ_OK.filter(function (p) { return ["equal-earth", "ortho", "winkel3", "robinson", "mercator", "natural-earth", "mollweide"].indexOf(p.id) >= 0; }), S.ep);
    $("mp-eproj").onchange = function () { S.ep = this.value; save(); goProj(S.ep); };
    $("mp-csearch").oninput = renderTable;
    var conts = ["All", "Africa", "Asia", "Europe", "North America", "South America", "Oceania"];
    $("mp-cchips").innerHTML = conts.map(function (c) { return "<button type='button' data-c='" + c + "' aria-pressed='" + ((S.ccont || "All") === c) + "'>" + c + "</button>"; }).join("");
    qa("[data-c]", $("mp-cchips")).forEach(function (b) { b.onclick = function () { S.ccont = b.dataset.c; qa("[data-c]", $("mp-cchips")).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); renderTable(); }; });
    qa("#mp-cthead th[data-s]").forEach(function (th) { th.onclick = function () { sortKey = th.dataset.s; renderTable(); }; th.onkeydown = function (e) { if (e.key === "Enter") th.onclick(); }; });
    // true size
    seg("mp-tsproj", "tp", function (v) { goProj(v); });
    $("mp-tsform").onsubmit = function (e) { e.preventDefault(); var f = findCountry($("mp-tsadd").value); if (f) { addGhost(f.id); $("mp-tsadd").value = ""; } else toast("No country called that"); };
    $("mp-tspre").innerHTML = TS_PRE.map(function (p, i) { return "<button type='button' data-ts='" + i + "'>" + esc(p[0]) + "</button>"; }).join("");
    qa("[data-ts]").forEach(function (b) { b.onclick = function () { ghosts = []; TS_PRE[+b.dataset.ts][1].forEach(function (x) { addGhost(x[0], x[1]); }); if (S.tp !== "mercator") { S.tp = "mercator"; save(); seg("mp-tsproj", "tp", function (v) { goProj(v); }); goProj("mercator"); } }; });
    $("mp-tsclear").onclick = function () { ghosts = []; renderGhosts(); redraw(); };
    // distances
    fillSel($("mp-dproj"), PROJ_OK.filter(function (p) { return ["equal-earth", "mercator", "gnomonic", "ortho", "az-north", "equirect", "winkel3"].indexOf(p.id) >= 0; }), S.dp);
    $("mp-dproj").onchange = function () { S.dp = this.value; save(); var mid = d3.geoInterpolate([DP.a[0], DP.a[1]], [DP.b[0], DP.b[1]])(0.5); goProj(S.dp, {view: {rot: [-mid[0], spec(S.dp).free ? -mid[1] : 0, 0], z: 1, x: 0, y: 0}}); };
    $("mp-dform").onsubmit = function (e) {
      e.preventDefault();
      var a = cityLookup($("mp-da").value.split(",")[0]) || cityLookup($("mp-da").value), b = cityLookup($("mp-db").value.split(",")[0]) || cityLookup($("mp-db").value);
      if (!a || !b) { toast("Type a capital city (e.g. Tokyo) or coordinates like 49.3 N, 123.1 W"); return; }
      DP.a = a; DP.b = b; renderDist(); $("mp-dproj").onchange();
    };
    $("mp-dswap").onclick = function () { var t = DP.a; DP.a = DP.b; DP.b = t; renderDist(); redraw(); };
    // quiz
    seg("mp-qmode", "qmode", function () { fillQreg(); });
    function fillQreg() {
      var el = $("mp-qreg"), opts = S.qmode === "scap" ? [["World", "All 9 countries"]].concat(Object.keys(admin1Countries).length ? Object.keys(admin1Countries).map(function (k) { return [k, admin1Countries[k]]; }) : [["USA", "United States"], ["CAN", "Canada"], ["AUS", "Australia"], ["BRA", "Brazil"], ["IND", "India"], ["CHN", "China"], ["RUS", "Russia"], ["IDN", "Indonesia"], ["ZAF", "South Africa"]]) : QREG.map(function (r) { return [r, r]; });
      if (!opts.some(function (o) { return o[0] === S.qreg; })) S.qreg = opts[0][0];
      el.innerHTML = opts.map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === S.qreg ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("");
    }
    fillQreg(); $("mp-qreg").onchange = function () { S.qreg = this.value; save(); };
    seg("mp-qmap", "qp", function (v) { goProj(v); });
    check("mp-qsmall", "small");
    $("mp-qstart").onclick = startQuiz;
    fillCountryList();
    // dark mode follows the page
    new MutationObserver(function () { thumbsBuilt = false; if (S.tab === "proj") buildThumbs(); renderLegend(); redraw(); }).observe(document.body, {attributes: true, attributeFilter: ["class"]});
    if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 60); }).observe($("mp-stage"));
    window.addEventListener("resize", function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 80); });
    setInterval(function () { if (S.night) redraw(); }, 60000);
    resize(); setTimeout(resize, 400); window.addEventListener("load", function () { setTimeout(resize, 50); });
  }
  function setFill(on) {
    root.classList.toggle("mp-filled", on);
    document.body.classList.toggle("mp-filling", on);
    $("mp-fill").setAttribute("aria-pressed", on ? "true" : "false");
    $("mp-fill").title = on ? "Back to the page (Esc)" : "Fill window";
    if (!on) $("mp-stage").style.height = "";
    setTimeout(resize, 30);
  }

  window.MESMapsDebug = {S: S, get V() { return V; }, get anim() { return anim; }, get data() { return data; }, draw: function () { draw(performance.now()); }, goProj: goProj, setTab: setTab, select: select, get cur() { return curId; }, stepAll: function () { while (anim) { anim.t0 -= anim.dur; stepAnim(performance.now()); } draw(performance.now()); }};
  start();
})();
