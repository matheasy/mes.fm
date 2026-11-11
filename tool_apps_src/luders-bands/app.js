/* MES Lüders Band Simulator: the page (uses window.MESLuders from lib.js). Canvas drawing of the bar, the stress-strain curve, the
   space-time map, the dislocation picture and the front-angle figure. Settings in localStorage mes-luders:v1; links ?m=&eL=&uy=&k=&v=&sc=&r=&g=&n= */
(function () {
  "use strict";
  var L = window.MESLuders, root = document.getElementById("lu");
  if (!L || !root) return;
  function $(id) { return document.getElementById(id); }
  var KEY = "mes-luders:v1";
  var S = { m: "a36", eL: null, uy: null, k: 3, v: 5, sc: 0.5, r: 1, g: null, look: "polish", units: "mpa", thin: true, ghost: true, speed: 1, notches: [] };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var kk in sv) if (kk in S) S[kk] = sv[kk]; } catch (e) {}
  var Q = L.fromQuery(location.search);
  if (Q.m) { S.m = Q.m; S.eL = null; S.uy = null; S.g = null; }
  ["eL", "uy", "k", "v", "sc", "r", "g"].forEach(function (k) { if (Q[k] != null) S[k] = Q[k]; });
  if (Q.n) S.notches = Q.n.split(",").map(parseFloat).filter(function (x) { return x > 0.02 && x < 0.98; }).slice(0, 6);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---- slider mappings ---- */
  var K_MIN = 0.3, K_MAX = 30, V_MIN = 0.5, V_MAX = 50;
  function kFromPos(p) { return K_MIN * Math.pow(K_MAX / K_MIN, p / 100); }
  function posFromK(k) { return 100 * Math.log(k / K_MIN) / Math.log(K_MAX / K_MIN); }
  function vFromPos(p) { var v = V_MIN * Math.pow(V_MAX / V_MIN, p / 100); return v < 2 ? Math.round(v * 10) / 10 : Math.round(v); }
  function posFromV(v) { return 100 * Math.log(v / V_MIN) / Math.log(V_MAX / V_MIN); }

  function matObj() { return L.mat(S.m); }
  function eff() {
    var m = matObj(), g = S.g != null ? S.g : m.grain, sL = m.sL, eL = m.eL;
    if (m.steel && !m.noYP && S.g != null && S.g !== m.grain) { sL = Math.round(m.sL + L.hallPetch(g) - L.hallPetch(m.grain)); eL = L.ludersFromGrain(g) * m.eL / L.ludersFromGrain(m.grain); }
    if (S.eL != null && !m.noYP) eL = S.eL;
    return { m: m, sL: sL, eL: m.noYP ? 0 : eL, uy: m.noYP ? 1 : (S.uy != null ? S.uy : m.uy), g: g };
  }

  /* ---- the simulation ---- */
  var sim, running = false, ghost = null, kymo = [], lastFr = { t: 0, f: 0 }, vMeas = null, frontsN = 0, selIdx = -1, seq = null, endStrain = 0.06;
  function newSim(keepGhost) {
    if (keepGhost !== false && sim && S.ghost && sim.curve.length > 10) ghost = { pts: sim.curve.slice(), label: ghostLabel };
    var e = eff();
    sim = new L.Sim({ mat: e.m, sL: e.sL, eL: e.eL, uy: e.uy, k: S.k, V: S.v, scatter: S.sc, r: S.r, notches: S.notches, seed: 7 });
    endStrain = Math.max(0.04, (e.eL || 0) + 0.035);
    kymo = []; lastFr = { t: 0, f: 0 }; vMeas = null; frontsN = 0; agedNote = "";
    ghostLabel = e.m.name.split(" (")[0] + ", k " + fmtK(S.k);
    setRun(false); $("lu-unload").disabled = true; $("lu-reload").disabled = true; $("lu-agemsg").textContent = "";
    pushKymo(); drawAll(); say();
  }
  var ghostLabel = "", agedNote = "";

  function setRun(on) { running = on; var b = $("lu-go"); b.textContent = on ? "❚❚ Pause" : (sim && sim.t > 0 && !sim.done ? "▶ Go on" : sim && sim.done ? "▶ Pull further" : "▶ Start"); b.setAttribute("aria-pressed", on ? "true" : "false"); }

  function pushKymo() {
    var N = sim.p.N, row = new Float32Array(N), rr = new Uint8Array(N);
    for (var i = 0; i < N; i++) { row[i] = sim.ep[i]; rr[i] = Math.min(255, Math.round(255 * Math.min(1, sim.rate[i] * 400))); }
    kymo.push({ t: sim.t, row: row, rate: rr });
    if (kymo.length > 900) { var k2 = []; for (var j = 0; j < kymo.length; j += 2) k2.push(kymo[j]); kymo = k2; }
  }

  var lastT = 0, kymoAcc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dtR = lastT ? Math.min(0.1, (ts - lastT) / 1000) : 0; lastT = ts;
    if (!running || !sim) return;
    var dt = dtR * S.speed, V = sim.p.V / 60, du = V * dt, sub = Math.max(1, Math.ceil(du / (sim.p.Lg * 2e-5)));
    if (sub > 600) sub = 600;
    for (var i = 0; i < sub; i++) {
      var ev = sim.step(du / sub, dt / sub);
      for (var j = 0; j < ev.length; j++) onEvent(ev[j]);
      if (sim.strain() >= endStrain) { running = false; sim.done = true; break; }
    }
    measureSpeed();
    kymoAcc += dt; if (kymoAcc > Math.max(0.03, estTotal() / 600)) { kymoAcc = 0; pushKymo(); }
    if (!running) { setRun(false); afterStop(); }
    drawAll(); say();
  }
  function estTotal() { var V = sim.p.V / 60; return endStrain * sim.p.Lg * (1 + 1 / sim.p.k * 0.2) / V; }
  function onEvent(e) {
    if (e.type === "nucleate") { var where = e.x < 0.06 ? "the left shoulder" : e.x > 0.94 ? "the right shoulder" : (Math.round(e.x * sim.p.Lg) + " mm along the bar" + (nearNotch(e.x) ? ", at the notch" : "")); toast("Band " + e.band + " starts at " + where + " (" + fS(e.s) + ")"); }
    if (e.type === "end") toast("The fronts have crossed the whole bar: now it hardens evenly.");
  }
  function nearNotch(x) { for (var i = 0; i < S.notches.length; i++) if (Math.abs(S.notches[i] - x) < 0.03) return true; return false; }
  function measureSpeed() {
    var f = sim.fronts(), n = f.length; frontsN = n;
    var yf = sim.yieldedFraction();
    if (sim.phase === "luders" && n > 0) {
      if (sim.t - lastFr.t > 0.4) { var v = (yf - lastFr.f) * sim.p.Lg / (sim.t - lastFr.t) / n; if (lastFr.t > 0 && v > 0) vMeas = vMeas == null ? v : vMeas * 0.6 + v * 0.4; lastFr = { t: sim.t, f: yf }; }
    } else lastFr = { t: sim.t, f: yf };
  }
  function afterStop() {
    $("lu-unload").disabled = !(sim.s > 1);
    if (seq) seq();
  }

  /* ---- units / formats ---- */
  function fS(s) { return S.units === "ksi" ? (s * L.MPA_KSI).toFixed(1) + " ksi" : Math.round(s) + " MPa"; }
  function fK(s) { return S.units === "ksi" ? (s * L.MPA_KSI).toFixed(0) : Math.round(s); }
  function fmtK(k) { return k < 1 ? k.toFixed(2) : k < 10 ? k.toFixed(1) : Math.round(k); }
  function fT(t) { return t < 60 ? t.toFixed(1) + " s" : Math.floor(t / 60) + " min " + Math.round(t % 60) + " s"; }

  /* ---- canvases ---- */
  var DPR = 1;
  function fit(cv, cssH) {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(200, cv.parentNode.clientWidth), h = cssH;
    if (cv.__w !== w || cv.__h !== h || cv.__d !== DPR) { cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); cv.style.height = h + "px"; cv.__w = w; cv.__h = h; cv.__d = DPR; }
    var c = cv.getContext("2d"); c.setTransform(DPR, 0, 0, DPR, 0, 0); return { c: c, w: w, h: h };
  }
  /* text size: the header A- / A+ sets font-size on #main-content (in em); drawings follow it (capped so the plots keep room) */
  function TXS() { var m = document.getElementById("main-content"), v = m ? parseFloat(m.style.fontSize) : NaN; return v > 0 ? Math.min(1.8, Math.max(0.75, v)) : 1; }
  function fnt(n, bold) { return (bold ? "bold " : "") + Math.round(n * TXS()) + "px system-ui, sans-serif"; }
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim() || "#888"; }
  function isDark() { return document.body.classList.contains("dark-mode"); }

  /* hash noise for surface textures */
  function hsh(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ---- the bar ---- */
  var geo = null, specImg = null;
  function drawSpec() {
    var cv = $("lu-spec"), stageH = stageHeight();
    var W0 = cv.parentNode.clientWidth, H0 = stageH ? Math.max(170, Math.min(stageH * 0.4, W0 * 0.34)) : Math.max(130, Math.min(330, W0 * (W0 < 560 ? 0.4 : 0.3)));
    var F = fit(cv, Math.round(H0)), c = F.c, w = F.w, h = F.h, p = sim.p, N = p.N;
    c.clearRect(0, 0, w, h);
    var dark = isDark();
    /* layout: grips | shoulder | gauge | shoulder | grip */
    var gripW = Math.max(22, w * 0.07), shW = Math.max(16, w * 0.06), pad = w < 500 ? 4 : 10;
    var stretchPx = 0, gaugeW0 = w - 2 * pad - 2 * gripW - 2 * shW - 30;
    var scale = gaugeW0 / p.Lg;                                       // px per mm
    var yc = h * 0.53, gh = Math.min(h * 0.46, gaugeW0 * 0.2), sh = Math.min(h * 0.72, gh * 1.6);
    var nuW = S.r / (1 + S.r), thinMul = S.thin ? 15 : 1;
    var elastic = sim.s / p.E;
    /* cumulative positions of slice edges */
    var pos = new Float64Array(N + 1), x0 = pad + gripW + shW; pos[0] = x0;
    for (var i = 0; i < N; i++) pos[i + 1] = pos[i] + sim.dx * (1 + sim.ep[i] + elastic) * scale;
    var x1 = pos[N];
    geo = { pos: pos, yc: yc, gh: gh, x0: x0, x1: x1, w: w, h: h };
    /* frame + grips */
    var steelHi = dark ? [205, 211, 219] : [214, 220, 228], look = S.look;
    c.fillStyle = css("--lu-frame"); c.fillRect(0, yc - sh / 2 - 26, w, 8); c.fillRect(0, yc + sh / 2 + 18, w, 8);
    function grip(x, wd) { c.fillStyle = css("--lu-grip"); c.fillRect(x, yc - sh / 2 - 10, wd, sh + 20); c.strokeStyle = css("--lu-gripl"); c.lineWidth = 1; for (var t = 6; t < sh + 14; t += 6) { c.beginPath(); c.moveTo(x + 3, yc - sh / 2 - 7 + t); c.lineTo(x + wd - 3, yc - sh / 2 - 7 + t - 3); c.stroke(); } }
    /* shoulders (plain metal) */
    var baseCol = look === "scale" ? "#3a414d" : look === "strain" ? rgbStr(L.viridisish(0)) : look === "rate" ? "#141821" : rgbStr(steelHi);
    function shoulder(xa, xb, flip) {
      var r = (sh - gh) / 2;
      c.beginPath();
      if (!flip) { c.moveTo(xa, yc - sh / 2); c.lineTo(xb - r, yc - sh / 2); c.quadraticCurveTo(xb, yc - sh / 2, xb, yc - gh / 2); c.lineTo(xb, yc + gh / 2); c.quadraticCurveTo(xb, yc + sh / 2, xb - r, yc + sh / 2); c.lineTo(xa, yc + sh / 2); }
      else { c.moveTo(xb, yc - sh / 2); c.lineTo(xa + r, yc - sh / 2); c.quadraticCurveTo(xa, yc - sh / 2, xa, yc - gh / 2); c.lineTo(xa, yc + gh / 2); c.quadraticCurveTo(xa, yc + sh / 2, xa + r, yc + sh / 2); c.lineTo(xb, yc + sh / 2); }
      c.closePath(); c.fillStyle = baseCol; c.fill(); c.strokeStyle = css("--lu-edge"); c.lineWidth = 1; c.stroke();
    }
    shoulder(pad + gripW - 8, x0 + 1, false);
    shoulder(x1 - 1, x1 + shW + 8, true);
    grip(pad, gripW); grip(x1 + shW, gripW);
    /* gauge pixels */
    var gx0 = Math.floor(x0), gx1 = Math.ceil(x1), gy0 = Math.floor(yc - gh / 2) - 1, gy1 = Math.ceil(yc + gh / 2) + 1;
    var pw = Math.round((gx1 - gx0) * DPR), ph = Math.round((gy1 - gy0) * DPR);
    if (pw > 0 && ph > 0) {
      var img = c.createImageData(pw, ph), d = img.data;
      var cot = 1 / Math.tan(L.frontAngle(S.r) * Math.PI / 180);
      var cellOfX = new Int32Array(pw), j = 0;
      for (var px = 0; px < pw; px++) { var X = gx0 + px / DPR; while (j < N - 1 && pos[j + 1] < X) j++; cellOfX[px] = j; }
      var mxE = Math.max(sim.p.eL * 1.6, 0.012);
      /* lean direction per slice = that of the nearest band (slices no band has reached lean like the closest one) */
      var dirF = new Int8Array(N), lastD = 0, firstD = 0;
      for (var q = 0; q < N; q++) { if (sim.dir[q]) { lastD = sim.dir[q]; if (!firstD) firstD = lastD; } dirF[q] = lastD; }
      for (q = 0; q < N && !dirF[q]; q++) dirF[q] = firstD || 1;
      for (px = 0; px < pw; px++) {
        var X2 = gx0 + px / DPR, cc = cellOfX[px], dir = dirF[cc] || 1;
        for (var py = 0; py < ph; py++) {
          var Y = gy0 + py / DPR, dy = Y - yc;
          /* lean: look up the slice along the front direction */
          var Xs = X2 - dy * cot * dir, k = cc;
          if (Xs < pos[k]) { while (k > 0 && Xs < pos[k]) k--; } else { while (k < N - 1 && Xs > pos[k + 1]) k++; }
          var hw = gh / 2 * (1 - nuW * sim.ep[k] * thinMul * 0.5);
          var o = (py * pw + px) * 4;
          if (Math.abs(dy) > hw) { d[o + 3] = 0; continue; }
          var st = sim.st[k], f = sim.tgt[k] > 0 ? Math.min(1, sim.ep[k] / Math.max(1e-9, sim.tgt[k])) : (st === 3 ? 1 : 0), col;
          if (sim.p.noYP && !sim.agedTimes) f = Math.min(1, sim.ep[k] / 0.02);
          var nz = hsh(px, py), edge = Math.abs(dy) / (gh / 2);
          if (look === "polish") {
            var spec = 1 - Math.pow(Math.abs(dy / (gh / 2) + 0.25), 2) * 0.35, brush = (hsh(px >> 3, py) - 0.5) * 10;
            var a0 = steelHi[0] * spec + brush, a1 = steelHi[1] * spec + brush, a2 = steelHi[2] * spec + brush;
            var mat = (dark ? 128 : 150) + (nz - 0.5) * 46 - Math.min(20, (sim.ep[k] - sim.p.eL) * 300 > 0 ? (sim.ep[k] - sim.p.eL) * 300 : 0);
            col = [a0 + (mat - a0) * f, a1 + (mat - 2 - a1) * f, a2 + (mat + 2 - a2) * f];
          } else if (look === "scale") {
            var cu = Math.floor((Xs - gx0) * DPR / 5), cv2 = Math.floor((dy + gh) * DPR / 3 + (hsh(cu, 7) * 6)), flake = hsh(cu, cv2 >> 1) < f * 0.82;
            col = flake ? [176 + nz * 30, 170 + nz * 28, 160 + nz * 22] : [50 + nz * 18, 56 + nz * 18, 68 + nz * 20];
          } else if (look === "strain") {
            col = L.viridisish(sim.ep[k] / mxE);
          } else {
            var rr = Math.min(1, sim.rate[k] * 400);
            col = [20 + 235 * rr, 24 + 140 * rr * rr, 33 + 30 * rr];
          }
          var sh2 = 1 - Math.pow(edge, 6) * 0.25;
          d[o] = col[0] * sh2; d[o + 1] = col[1] * sh2; d[o + 2] = col[2] * sh2; d[o + 3] = 255;
        }
      }
      var oc = specImg && specImg.width === pw && specImg.height === ph ? specImg : (specImg = document.createElement("canvas"));
      oc.width = pw; oc.height = ph; oc.getContext("2d").putImageData(img, 0, 0);
      c.drawImage(oc, gx0, gy0, gx1 - gx0, gy1 - gy0);
    }
    /* notches */
    c.fillStyle = css("--lu-bg");
    S.notches.forEach(function (nx) { var xi = pos[0] + (pos[N] - pos[0]) * nx; c.beginPath(); c.moveTo(xi - 5, yc - gh / 2 - 1); c.lineTo(xi + 5, yc - gh / 2 - 1); c.lineTo(xi, yc - gh / 2 + 7); c.closePath(); c.fill(); c.strokeStyle = css("--lu-edge"); c.stroke(); c.beginPath(); c.moveTo(xi - 5, yc + gh / 2 + 1); c.lineTo(xi + 5, yc + gh / 2 + 1); c.lineTo(xi, yc + gh / 2 - 7); c.closePath(); c.fill(); c.stroke(); });
    /* gauge marks */
    c.fillStyle = css("--lu-mut"); c.font = fnt(11); c.textAlign = "center";
    c.fillRect(x0, yc + sh / 2 + 4, 1, 8); c.fillRect(x1 - 1, yc + sh / 2 + 4, 1, 8);
    c.textAlign = S.thin && sim.P > 0 ? "left" : "center"; c.fillText("gauge length " + p.Lg + " mm", S.thin && sim.P > 0 ? x0 + 4 : (x0 + x1) / 2, yc + sh / 2 + 14 * TXS());
    /* crosshead arrow */
    c.strokeStyle = css("--lu-arrow"); c.fillStyle = css("--lu-arrow"); c.lineWidth = 2.5;
    var ax = Math.min(w - 8, x1 + shW + gripW + 4);
    c.beginPath(); c.moveTo(ax - 18, yc - sh / 2 - 22); c.lineTo(ax, yc - sh / 2 - 22); c.stroke();
    c.beginPath(); c.moveTo(ax + 2, yc - sh / 2 - 22); c.lineTo(ax - 6, yc - sh / 2 - 27); c.lineTo(ax - 6, yc - sh / 2 - 17); c.closePath(); c.fill();
    c.textAlign = "right"; c.fillText((sim.unloadedNow ? "unloaded" : "V = " + S.v + " mm/min"), ax - 22, yc - sh / 2 - 18);
    c.textAlign = "left"; c.fillStyle = css("--lu-mut"); c.fillText("fixed", pad, yc - sh / 2 - 18);
    /* front markers */
    var fr = sim.fronts();
    if (sim.phase === "luders" || (fr.length && fr.length < 6)) {
      c.font = fnt(11, 1); c.textAlign = "center";
      fr.forEach(function (f) {
        var fx = pos[0] + (pos[N] - pos[0]) * f.x, ty = yc - gh / 2 - 10;
        c.fillStyle = css("--lu-front"); c.strokeStyle = css("--lu-front"); c.lineWidth = 2;
        c.beginPath(); c.moveTo(fx, ty); c.lineTo(fx + f.moving * 12, ty); c.stroke();
        c.beginPath(); c.moveTo(fx + f.moving * 16, ty); c.lineTo(fx + f.moving * 9, ty - 4); c.lineTo(fx + f.moving * 9, ty + 4); c.closePath(); c.fill();
        c.fillText("front", fx, ty - 7);
      });
    }
    /* selected slice */
    var si = microIdx();
    if (si >= 0) { var sx = (pos[si] + pos[si + 1]) / 2, sy = yc + gh / 2 + 3; c.fillStyle = css("--lu-sel"); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 6, sy + 9); c.lineTo(sx + 6, sy + 9); c.closePath(); c.fill(); }
    if (S.thin && sim.P > 0) { c.font = fnt(10); c.textAlign = "left"; c.fillStyle = css("--lu-mut"); c.textAlign = "right"; c.fillText("thinning drawn ×15", x1, yc + sh / 2 + 14 * TXS()); }
  }
  function rgbStr(a) { return "rgb(" + a[0] + "," + a[1] + "," + a[2] + ")"; }

  /* ---- stress-strain chart ---- */
  var chartGeo = null, hoverE = null;
  function drawChart() {
    var cv = $("lu-chart"), stageH = stageHeight(), hh = stageH ? Math.max(170, stageH * 0.42) : 260;
    var F = fit(cv, Math.round(hh)), c = F.c, w = F.w, h = F.h;
    c.clearRect(0, 0, w, h);
    var mL = Math.round(48 * TXS()), mR = 12, mT = 12, mB = Math.round(34 * TXS()), pw = w - mL - mR, ph = h - mT - mB;
    var xMax = Math.max(endStrain, sim.strain() * 1.02), yMax = Math.max(sim.p.sL * sim.p.uy * 1.12, sim.maxS * 1.08, 50);
    if (ghost) ghost.pts.forEach(function (pt) { if (pt[0] > xMax) xMax = pt[0]; if (pt[1] * 1.05 > yMax) yMax = pt[1] * 1.05; });
    var X = function (e) { return mL + e / xMax * pw; }, Y = function (s) { return mT + ph - s / yMax * ph; };
    chartGeo = { X: X, Y: Y, mL: mL, mT: mT, pw: pw, ph: ph, xMax: xMax, yMax: yMax, w: w, h: h };
    /* grid */
    c.strokeStyle = css("--lu-grid"); c.lineWidth = 1; c.font = fnt(11); c.fillStyle = css("--lu-mut");
    var ys = niceStep(S.units === "ksi" ? yMax * L.MPA_KSI : yMax, 5), u = S.units === "ksi" ? 1 / L.MPA_KSI : 1;
    c.textAlign = "right";
    for (var v = 0; v * u <= yMax + 1e-9; v += ys) { var yy = Y(v * u); c.beginPath(); c.moveTo(mL, yy); c.lineTo(mL + pw, yy); c.stroke(); c.fillText(v, mL - 5, yy + 4); }
    var xs = niceStep(xMax * 100, 6); c.textAlign = "center";
    for (v = 0; v / 100 <= xMax + 1e-9; v += xs) { var xx = X(v / 100); c.beginPath(); c.moveTo(xx, mT); c.lineTo(xx, mT + ph); c.stroke(); c.fillText(+v.toFixed(2) + "%", xx, mT + ph + 14 * TXS()); }
    c.fillText("strain (extensometer on the gauge length)", mL + pw / 2, h - 3);
    c.save(); c.translate(11, mT + ph / 2); c.rotate(-Math.PI / 2); c.fillText("stress, " + (S.units === "ksi" ? "ksi" : "MPa"), 0, 0); c.restore();
    /* ghost */
    if (ghost && S.ghost) { c.strokeStyle = css("--lu-ghost"); c.lineWidth = 1.5; c.setLineDash([4, 3]); line(c, ghost.pts, X, Y); c.setLineDash([]); c.fillStyle = css("--lu-ghost"); c.textAlign = "right"; c.fillText("last: " + ghost.label, mL + pw - 4, mT + 12); }
    /* annotations */
    var up = sim.upper, sm = sim.summary();
    if (sim.phase !== "elastic" && !sim.p.noYP && !sim.agedTimes) {
      c.strokeStyle = css("--lu-lower"); c.setLineDash([5, 4]); c.lineWidth = 1; var ly = Y(sim.p.sL); c.beginPath(); c.moveTo(mL, ly); c.lineTo(mL + pw, ly); c.stroke(); c.setLineDash([]);
      c.fillStyle = css("--lu-lower"); c.textAlign = "right"; c.fillText("lower yield ≈ " + fS(sim.p.sL), mL + pw - 4, ly - 6);
    }
    if (sm.ludersStrain && up) {
      var by = Y(sm.plateau || sim.p.sL) + 22, xa = X(up.strain), xb = X(sim.ludersEnd.strain);
      c.strokeStyle = css("--lu-front"); c.fillStyle = css("--lu-front"); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(xa, by - 4); c.lineTo(xa, by); c.lineTo(xb, by); c.lineTo(xb, by - 4); c.stroke();
      c.textAlign = "center"; c.font = fnt(11, 1); c.fillText("Lüders plateau: εL ≈ " + L.pct(sm.ludersStrain, 2), Math.max(mL + 80, (xa + xb) / 2), by + 14);
    }
    /* curve */
    c.strokeStyle = css("--lu-curve"); c.lineWidth = 2.2; line(c, sim.curve, X, Y);
    if (up) { c.fillStyle = css("--lu-upper"); c.beginPath(); c.arc(X(up.strain), Y(up.s), 4, 0, 7); c.fill(); c.textAlign = "left"; c.font = fnt(11); c.fillText("upper yield " + fS(up.s), X(up.strain) + 7, Y(up.s) - 2); }
    var e = sim.strain(); c.fillStyle = css("--lu-curve"); c.beginPath(); c.arc(X(e), Y(sim.s), 4.5, 0, 7); c.fill();
    /* hover */
    if (hoverE != null) {
      var best = null; sim.curve.forEach(function (pt) { if (!best || Math.abs(pt[0] - hoverE) < Math.abs(best[0] - hoverE)) best = pt; });
      if (best) { c.strokeStyle = css("--lu-mut"); c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(best[0]), mT); c.lineTo(X(best[0]), mT + ph); c.stroke(); c.setLineDash([]); var tx = L.pct(best[0], 2) + "  ·  " + fS(best[1]); c.font = fnt(11, 1); var tw = c.measureText(tx).width + 10, bx = Math.min(mL + pw - tw, Math.max(mL, X(best[0]) + 6)); c.fillStyle = css("--lu-tipbg"); c.fillRect(bx, mT + 18, tw, 18); c.fillStyle = css("--lu-ink"); c.textAlign = "left"; c.fillText(tx, bx + 5, mT + 31); }
    }
  }
  function line(c, pts, X, Y) { c.beginPath(); for (var i = 0; i < pts.length; i++) { var x = X(pts[i][0]), y = Y(pts[i][1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
  function niceStep(range, n) { var r = range / n, p = Math.pow(10, Math.floor(Math.log10(r))), q = r / p; return (q < 1.5 ? 1 : q < 3.5 ? 2 : q < 7.5 ? 5 : 10) * p; }

  /* ---- space-time map ---- */
  var kc = null;
  function drawKymo() {
    var cv = $("lu-kymo"), stageH = stageHeight(), hh = stageH ? Math.max(170, stageH * 0.42) : 260;
    var F = fit(cv, Math.round(hh)), c = F.c, w = F.w, h = F.h;
    c.clearRect(0, 0, w, h);
    var mL = Math.round(40 * TXS()), mR = 10, mT = 8, mB = Math.round(30 * TXS()), pw = w - mL - mR, ph = h - mT - mB, N = sim.p.N;
    var tMax = Math.max(estTotal(), sim.t * 1.02, 1);
    c.fillStyle = isDark() ? "#11151c" : "#eef2f6"; c.fillRect(mL, mT, pw, ph);
    if (kymo.length > 1) {
      var rows = kymo.length;
      if (!kc) kc = document.createElement("canvas");
      kc.width = N; kc.height = rows;
      var kx = kc.getContext("2d"), img = kx.createImageData(N, rows), d = img.data, useRate = S.look === "rate", kmx = Math.max(sim.p.eL * 1.25, 0.004);
      for (var r0 = 0; r0 < rows; r0++) for (var i0 = 0; i0 < N; i0++) if (kymo[r0].row[i0] > kmx) kmx = kymo[r0].row[i0];
      for (var r = 0; r < rows; r++) { var row = useRate ? kymo[r].rate : kymo[r].row; for (var i = 0; i < N; i++) { var col = useRate ? [20 + row[i] * 0.92, 24 + row[i] * 0.55 * row[i] / 255, 33] : L.viridisish(row[i] / kmx), o = (r * N + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; } }
      kx.putImageData(img, 0, 0);
      c.imageSmoothingEnabled = false;
      var hUsed = ph * (kymo[rows - 1].t / tMax);
      c.drawImage(kc, mL, mT, pw, Math.max(1, hUsed));
      c.imageSmoothingEnabled = true;
    }
    c.strokeStyle = css("--lu-grid"); c.strokeRect(mL + 0.5, mT + 0.5, pw - 1, ph - 1);
    c.fillStyle = css("--lu-mut"); c.font = fnt(11); c.textAlign = "right";
    var ts = niceStep(tMax, 5);
    for (var t = 0; t <= tMax; t += ts) { var y = mT + ph * t / tMax; c.fillText(t >= 60 ? (t / 60).toFixed(1) + "m" : Math.round(t) + "s", mL - 4, y + 4); }
    c.textAlign = "center"; c.fillText("0", mL, mT + ph + 14 * TXS()); c.fillText(sim.p.Lg + " mm", mL + pw - 12, mT + ph + 14 * TXS()); c.fillText("position along the gauge length", mL + pw / 2, h - 3);
    /* predicted slope line for the first band */
    if (sim.events.length && sim.events[0].type === "nucleate" && !sim.agedTimes) {
      var e0 = sim.events[0], vth = L.bandSpeed(sim.p.V / 60, sim.p.eL, e0.x > 0.06 && e0.x < 0.94 ? 2 : 1), xs = mL + pw * e0.x, ys = mT + ph * e0.t / tMax;
      c.strokeStyle = css("--lu-front"); c.setLineDash([4, 4]); c.lineWidth = 1.2;
      [1, -1].forEach(function (dirn) { if ((dirn > 0 && e0.x > 0.94) || (dirn < 0 && e0.x < 0.06)) return; var dist = dirn > 0 ? (1 - e0.x) * sim.p.Lg : e0.x * sim.p.Lg, dtt = dist / vth; c.beginPath(); c.moveTo(xs, ys); c.lineTo(xs + dirn * pw * dist / sim.p.Lg, ys + ph * dtt / tMax); c.stroke(); });
      c.setLineDash([]);
      c.fillStyle = css("--lu-front"); c.textAlign = "left"; c.font = fnt(11, 1);
      c.fillText("dashed: v = V ÷ (fronts × εL)", mL + 6, mT + ph - 8);
    }
    var nowY = mT + ph * sim.t / tMax; c.strokeStyle = css("--lu-curve"); c.lineWidth = 1; c.beginPath(); c.moveTo(mL, nowY); c.lineTo(mL + pw, nowY); c.stroke();
  }

  /* ---- inside the metal ---- */
  function microIdx() {
    if (selIdx >= 0 && !$("lu-follow").checked) return selIdx;
    if (!$("lu-follow").checked) return selIdx;
    /* follow: the next not-yet-yielded slice ahead of a moving front, else the middle */
    var N = sim.p.N, i;
    /* lock onto a slice a little ahead of a moving front, keep it until it has yielded (and a moment after), then take the next one */
    if (followIdx >= 0 && followIdx < N && followSim === sim && !(sim.st[followIdx] === 3 && sim.t - sim.yt[followIdx] > 0.5 * Math.max(1, S.speed))) return followIdx;
    var fr = sim.fronts();
    if (fr.length && sim.phase === "luders") {
      var f = fr[0], at = Math.round(f.x * N), ahead = f.moving > 0 ? at + 5 : at - 6;
      if (ahead >= 0 && ahead < N && sim.st[ahead] !== 3) { followIdx = ahead; followSim = sim; return ahead; }
    }
    followIdx = -1;
    for (i = 0; i < N; i++) if (sim.st[i] === 1 || sim.st[i] === 2) return i;
    if (selIdx >= 0) return selIdx;
    if (sim.phase === "elastic") { var lo = 0, bt = Infinity; for (i = 0; i < N; i++) if (sim.sU[i] < bt && sim.st[i] === 0) { bt = sim.sU[i]; lo = i; } return lo; }
    return Math.floor(N / 2);
  }
  var followIdx = -1, followSim = null;
  var mT0 = 0, mState = { glide: 0, last: -1, lastSt: -1, free: 0 };
  function drawMicro(ts) {
    var cv = $("lu-mcv"); if (!cv || !sim) return;
    var F = fit(cv, Math.max(170, Math.min(240, cv.parentNode.clientWidth * 0.32))), c = F.c, w = F.w, h = F.h;
    var i = microIdx(); if (i < 0) i = 0;
    var st = sim.st[i], dark = isDark();
    c.fillStyle = dark ? "#151a22" : "#f6f8fb"; c.fillRect(0, 0, w, h);
    /* lattice */
    var a = 16; c.fillStyle = dark ? "rgba(160,175,195,0.20)" : "rgba(90,105,125,0.18)";
    for (var y = a / 2; y < h; y += a) for (var x = a / 2; x < w; x += a) { c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    var yLine = h * 0.5, pins = [], np = 9;
    for (var k = 0; k < np; k++) pins.push(w * (0.08 + 0.84 * k / (np - 1)));
    var thr = sim.threshold(i), sig = sim.s, ratio = st === 0 ? Math.min(1, sig / Math.max(1, sim.sU[i])) : 1;
    if (i !== mState.last) { mState.last = i; mState.glide = 0; }
    var running2 = running ? 1 : 0;
    if (st === 2 || st === 3) mState.glide += (st === 2 ? 2.2 : 0.6) * running2 * Math.max(0.3, S.speed);
    var ink = dark ? "#7fb2ff" : "#1d4ed8", carbon = dark ? "#f5a524" : "#b45309";
    /* carbon atoms */
    var fArr = sim.tgt[i] > 0 ? Math.min(1, sim.ep[i] / sim.tgt[i]) : 1;
    var R = L.rng(i * 31 + 5);
    for (k = 0; k < 46; k++) {
      var cx = R() * w, cy0 = yLine + (R() - 0.5) * 10, cyFree = R() * h;
      var bound = st === 0 ? 1 : st === 3 && sim.agedTimes ? 0.2 : Math.max(0, 1 - fArr * 1.3);
      var cy = cy0 * bound + cyFree * (1 - bound);
      c.fillStyle = carbon; c.beginPath(); c.arc(cx, cy, 3.1, 0, 7); c.fill();
    }
    c.strokeStyle = ink; c.lineWidth = 3; c.lineCap = "round";
    if (st === 0 || st === 1) {
      /* pinned line, bowing between pins as the stress rises */
      var bow = Math.pow(ratio, 2) * 22 * (st === 1 ? 1.15 : 1);
      c.beginPath(); c.moveTo(pins[0], yLine);
      for (k = 1; k < np; k++) { var mx = (pins[k - 1] + pins[k]) / 2; c.quadraticCurveTo(mx, yLine - bow * 2, pins[k], yLine); }
      c.stroke();
      c.fillStyle = carbon; pins.forEach(function (px) { c.beginPath(); c.arc(px, yLine, 4.5, 0, 7); c.fill(); });
    } else {
      /* free lines gliding up the slip plane, more of them as the slice stretches (dislocations multiply) */
      var nLines = Math.min(9, 1 + Math.round(8 * Math.min(1, sim.ep[i] / Math.max(0.004, sim.p.eL)) + (st === 3 ? Math.min(4, (sim.ep[i] - sim.tgt[i]) * 200) : 0)));
      for (k = 0; k < nLines; k++) {
        var yy = ((yLine - mState.glide - k * h / nLines) % h + h) % h, wob = 6;
        c.globalAlpha = 0.55 + 0.45 * (k === 0 ? 1 : 0.6);
        c.beginPath(); c.moveTo(w * 0.04, yy);
        for (var xq = w * 0.04; xq <= w * 0.96; xq += 18) c.lineTo(xq, yy + Math.sin(xq * 0.04 + k + mState.glide * 0.05) * wob);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    /* caption */
    var cap, xmm = Math.round((i + 0.5) / sim.p.N * sim.p.Lg);
    if (st === 0) cap = "Slice at " + xmm + " mm: <b>pinned.</b> Carbon atoms (orange) sit along the dislocation (blue) and hold it. The line bows as the stress rises (" + fS(sig) + " of the " + fS(sim.sU[i]) + " it needs to break away). " + (sig > sim.p.sL && sim.phase === "elastic" ? "It is already above the lower yield but it cannot move yet." : "");
    else if (st === 1) cap = "Slice at " + xmm + " mm: <b>the front is next door.</b> The stretched slice beside it pulls on it hard (the front is a stress concentration), so it lets go at about the lower yield, " + fS(sim.sF[i]) + ".";
    else if (st === 2) cap = "Slice at " + xmm + " mm: <b>breaking free.</b> The lines have torn away from their carbon atoms. Free dislocations need less stress to move than pinned ones, and they multiply, so this slice suddenly stretches by the whole Lüders strain (" + L.pct(sim.tgt[i] - (sim.agedTimes ? 0 : 0), 1) + ").";
    else cap = "Slice at " + xmm + " mm: <b>yielded</b> (" + L.pct(sim.ep[i], 2) + " plastic strain). Its dislocations are free and tangled; from here it work-hardens like any metal." + (sim.agedTimes ? "" : " Leave it a few weeks, or bake it, and the carbon atoms gather on the dislocations again (strain ageing).");
    if (sim.p.noYP && !sim.agedTimes) cap = "Slice at " + xmm + " mm: interstitial-free steel. Titanium / niobium have locked every carbon and nitrogen atom into tiny carbides, so nothing pins the dislocations: they start moving gradually everywhere at once. No upper yield point, no band.";
    var mc = $("lu-mcap"); if (mc.__h !== cap) { mc.innerHTML = cap; mc.__h = cap; }
  }

  /* ---- narration ---- */
  function say() {
    var el = $("lu-say"), p = sim.p, t, fr = sim.fronts().length;
    if (sim.t === 0) t = p.noYP ? "Interstitial-free steel: press Start. Watch for the difference: the whole bar yields at once." : "Press <b>Start</b>. The machine pulls the right grip at " + S.v + " mm/min. Watch the force and the bar.";
    else if (sim.unloadedNow) t = "Unloaded: the bar keeps its permanent stretch (" + L.pct(sim.P / p.Lg, 2) + "). Choose what happens before you pull it again.";
    else if (p.noYP && !sim.agedTimes) t = "<b>No yield point.</b> The whole gauge yields at the same time and hardens smoothly; the surface stays the same all over. This is why car makers press visible panels from IF steel.";
    else if (sim.phase === "elastic") t = sim.agedTimes && !sim.bands ? "Pulling again: elastic, the line goes straight back up." : "<b>Elastic.</b> The whole bar stretches evenly by " + L.pct(sim.s / p.E, 3) + ". Nothing is permanent yet. " + (sim.s > p.sL ? "Already past the lower yield (" + fS(p.sL) + ") but still holding: the dislocations are pinned." : "");
    else if (sim.phase === "luders") t = "<b>Lüders plateau.</b> " + fr + " front" + (fr === 1 ? "" : "s") + " crossing the bar at " + (vMeas ? vMeas.toFixed(1) : "…") + " mm/s. Behind a front the steel has stretched " + L.pct(p.eL, 1) + "; ahead of it, not at all. The force stays flat because all the machine's travel goes into moving the front" + (fr > 1 ? "s" : "") + ". The front leans at " + L.frontAngle(S.r).toFixed(1) + "° to the pull.";
    else if (sim.phase === "hardening") t = sim.agedTimes && !sim.bands ? "Pulled again straight away: no yield point, no new band, it just carries on hardening from where it was." : "<b>Work hardening.</b> The fronts have met. The whole gauge now stretches evenly and gets stronger as it goes (" + fS(sim.s) + ")." + (sim.done ? " Unload it below, or see the whole curve to fracture in the Tensile Test Simulator." : "");
    if (el.__h !== t) { el.innerHTML = t; el.__h = t; }
  }

  function readouts() {
    $("lu-r-s").textContent = fS(sim.s);
    $("lu-r-e").textContent = L.pct(sim.strain(), 3);
    $("lu-r-t").textContent = fT(sim.t);
    $("lu-r-y").textContent = Math.round(sim.yieldedFraction() * 100) + "%";
    var n = sim.fronts().length; $("lu-r-f").textContent = sim.phase === "luders" ? n : "0";
    var vth = n ? L.bandSpeed(sim.p.V / 60, sim.p.eL, n) : null;
    $("lu-r-v").textContent = sim.phase === "luders" && vMeas ? vMeas.toFixed(2) + " mm/s (formula " + vth.toFixed(2) + ")" : vth && sim.phase === "luders" ? "… (formula " + vth.toFixed(2) + ")" : "–";
  }

  function drawAll() { if (!sim) return; drawSpec(); drawChart(); drawKymo(); readouts(); }
  function microLoop(ts) { requestAnimationFrame(microLoop); drawMicro(ts); }

  function stageHeight() { var v = $("lu-view"); return v.classList.contains("mes-pfill") ? $("lu-stage").clientHeight || window.innerHeight * 0.8 : 0; }

  /* ---- settings UI ---- */
  var matSel = $("lu-mat");
  L.MATS.forEach(function (m) { var o = document.createElement("option"); o.value = m.id; o.textContent = m.name; matSel.appendChild(o); });
  function syncUI() {
    var e = eff(), m = e.m;
    matSel.value = m.id;
    $("lu-matnote").textContent = (m.note || "") + " Lower yield " + fS(e.sL) + (m.noYP ? "." : ", upper yield ≈ " + fS(e.sL * e.uy) + ".");
    $("lu-gw").hidden = !(m.steel && !m.noYP);
    $("lu-g").value = e.g; $("lu-gv").textContent = e.g + " µm";
    $("lu-eL").value = e.eL || 0.004; $("lu-eLv").textContent = m.noYP ? "none" : L.pct(e.eL, 1);
    $("lu-eL").disabled = $("lu-uy").disabled = !!m.noYP;
    $("lu-uy").value = e.uy; $("lu-uyv").textContent = e.uy.toFixed(3) + (e.uy > 1 ? " (+" + Math.round((e.uy - 1) * 100) + "%)" : "");
    $("lu-k").value = posFromK(S.k); $("lu-kv").textContent = (S.k < 1 ? "soft" : S.k > 8 ? "stiff" : "medium") + " (×" + fmtK(S.k) + " the bar)";
    $("lu-v").value = posFromV(S.v); $("lu-vv").textContent = S.v + " mm/min";
    $("lu-sc").value = S.sc; $("lu-scv").textContent = S.sc < 0.15 ? "perfectly even" : S.sc < 0.6 ? "normal" : "patchy";
    $("lu-r").value = S.r; $("lu-rv").textContent = S.r.toFixed(2) + " → " + L.frontAngle(S.r).toFixed(1) + "°";
    $("lu-thin").checked = S.thin; $("lu-ghost").checked = S.ghost; $("lu-speed").value = String(S.speed);
    seg("lu-look", S.look); seg("lu-units", S.units);
    var af = ageSel(); $("lu-agef").textContent = af.h === 0 ? "no time for ageing" : "≈ " + Math.round(L.ageFraction(af.h, af.T) * 100) + "% of the full yield point returns";
  }
  function seg(id, v) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === v ? "true" : "false"); }); }
  function ageSel() { var a = $("lu-agesel").value.split(","); return { h: parseFloat(a[0]), T: parseFloat(a[1]) }; }

  function changed(restart) { save(); syncUI(); if (restart) newSim(); }
  matSel.addEventListener("change", function () { S.m = matSel.value; S.eL = null; S.uy = null; S.g = null; changed(true); });
  $("lu-g").addEventListener("input", function () { S.g = +this.value; S.eL = null; changed(true); });
  $("lu-eL").addEventListener("input", function () { S.eL = +this.value; changed(true); });
  $("lu-uy").addEventListener("input", function () { S.uy = +this.value; changed(true); });
  $("lu-k").addEventListener("input", function () { S.k = Math.round(kFromPos(+this.value) * 100) / 100; changed(true); });
  $("lu-v").addEventListener("input", function () { S.v = vFromPos(+this.value); changed(false); if (sim) { sim.p.V = S.v; } drawAll(); say(); });
  $("lu-sc").addEventListener("input", function () { S.sc = +this.value; changed(true); });
  $("lu-r").addEventListener("input", function () { S.r = +this.value; changed(false); $("lu-ar").value = S.r; drawAll(); drawAngle(); say(); });
  $("lu-thin").addEventListener("change", function () { S.thin = this.checked; save(); drawAll(); });
  $("lu-ghost").addEventListener("change", function () { S.ghost = this.checked; save(); drawAll(); });
  $("lu-speed").addEventListener("change", function () { S.speed = +this.value; save(); });
  $("lu-look").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.look = b.getAttribute("data-v"); save(); syncUI(); drawAll(); });
  $("lu-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.units = b.getAttribute("data-v"); save(); syncUI(); drawAll(); say(); });
  $("lu-agesel").addEventListener("change", syncUI);
  $("lu-clrnotch").addEventListener("click", function () { S.notches = []; changed(true); });
  $("lu-link").addEventListener("click", function () {
    var q = L.toQuery({ m: S.m, eL: S.eL, uy: S.uy, k: S.k, v: S.v, sc: S.sc, r: S.r, g: S.g, n: S.notches.length ? S.notches.map(function (x) { return x.toFixed(3); }).join(",") : null });
    var url = location.origin + location.pathname + (q ? "?" + q : "");
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
  });

  /* ---- run controls ---- */
  $("lu-go").addEventListener("click", function () {
    seq = null;
    if (running) { setRun(false); afterStop(); return; }
    if (sim.done) { endStrain = sim.strain() + 0.025; sim.done = false; }
    sim.unloadedNow = false;
    $("lu-unload").disabled = true; $("lu-reload").disabled = true;
    setRun(true);
  });
  $("lu-reset").addEventListener("click", function () { seq = null; newSim(); });
  $("lu-unload").addEventListener("click", function () { doUnload(); });
  $("lu-reload").addEventListener("click", function () { doReload(); });
  function doUnload() {
    setRun(false); sim.unload(); sim.unloadedNow = true; sim.done = false;
    $("lu-unload").disabled = true; $("lu-reload").disabled = false; pushKymo(); drawAll(); say();
    $("lu-agemsg").textContent = "Unloaded with " + L.pct(sim.P / sim.p.Lg, 2) + " permanent stretch. Pick a waiting time and press Pull again.";
  }
  function doReload() {
    var a = ageSel(), f = sim.age(a.h, a.T);
    if (S.ghost) ghost = { pts: sim.curve.slice(), label: "before ageing" };
    sim.unloadedNow = false;
    var fs0 = sim.s; endStrain = sim.strain() + Math.max(0.03, sim.p.eL + 0.02);
    $("lu-reload").disabled = true;
    $("lu-agemsg").textContent = f > 0.02 ? "Aged: " + Math.round(f * 100) + "% of the yield point is back (" + (a.h < 1 ? Math.round(a.h * 60) + " min" : a.h < 48 ? a.h + " h" : Math.round(a.h / 24) + " days") + " at " + a.T + " °C ≈ " + humanEq(L.ageEquivalentHours(a.h, a.T)) + " at room temperature)." : "No time for the carbon atoms to move: the dislocations are still free.";
    setRun(true);
  }
  function humanEq(h) { return h < 48 ? Math.round(h) + " hours" : h < 24 * 60 ? Math.round(h / 24) + " days" : h < 24 * 730 ? Math.round(h / 24 / 30) + " months" : Math.round(h / 24 / 365) + " years"; }

  /* ---- "Try this" ---- */
  $("lu-try").addEventListener("click", function (e) {
    var b = e.target.closest("[data-try]"); if (!b) return;
    var t = b.getAttribute("data-try"); seq = null;
    var base = { m: "a36", eL: null, uy: null, k: 3, sc: 0.5, g: null, notches: [] };
    if (t === "notch") { Object.assign(S, base, { notches: [0.5] }); }
    if (t === "soft") { Object.assign(S, base, { k: 0.4 }); }
    if (t === "stiff") { Object.assign(S, base, { k: 25 }); }
    if (t === "fine") { Object.assign(S, base, { m: "fine" }); }
    if (t === "if") { Object.assign(S, base, { m: "if" }); }
    if (t === "almg") { Object.assign(S, base, { m: "almg" }); }
    if (t === "age") { Object.assign(S, base); $("lu-agesel").value = "0.333,170"; }
    save(); syncUI(); newSim(); if (S.speed < 1) S.speed = 1;
    if (t === "age") {
      var stage = 0;
      seq = function () { if (stage === 0 && sim.done) { stage = 1; setTimeout(function () { if (!seq) return; doUnload(); setTimeout(function () { if (!seq) return; stage = 2; doReload(); seq = null; }, 1400); }, 700); } };
      endStrain = 0.04;
    }
    setRun(true);
    $("lu-view").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---- pointer on the bar ---- */
  var spec = $("lu-spec"), tip = $("lu-tip");
  function sliceAt(ev) { if (!geo) return -1; var r = spec.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; if (x < geo.x0 || x > geo.x1 || Math.abs(y - geo.yc) > geo.gh) return -1; for (var i = 0; i < sim.p.N; i++) if (x < geo.pos[i + 1]) return i; return sim.p.N - 1; }
  spec.addEventListener("click", function (ev) {
    var i = sliceAt(ev); if (i < 0) return;
    if ($("lu-notchmode").checked) {
      var x = (i + 0.5) / sim.p.N, hit = -1;
      S.notches.forEach(function (n, k) { if (Math.abs(n - x) < 0.04) hit = k; });
      if (hit >= 0) S.notches.splice(hit, 1); else if (S.notches.length < 6) S.notches.push(Math.round(x * 1000) / 1000);
      changed(true); toast(hit >= 0 ? "Notch removed: new bar" : "Notch added: new bar");
      return;
    }
    selIdx = i; $("lu-follow").checked = false;
  });
  spec.addEventListener("pointermove", function (ev) {
    var i = sliceAt(ev); if (i < 0) { tip.hidden = true; return; }
    var names = ["pinned (not yielded)", "next to the front", "yielding", "yielded"], r = spec.getBoundingClientRect();
    tip.innerHTML = "<b>" + ((i + 0.5) / sim.p.N * sim.p.Lg).toFixed(1) + " mm</b> · " + names[sim.st[i]] + "<br>plastic strain " + L.pct(sim.ep[i], 2) + ($("lu-notchmode").checked ? "<br><i>click to add / remove a notch</i>" : "<br><i>click to watch it inside</i>");
    tip.hidden = false; tip.style.left = Math.min(r.width - 170, Math.max(0, ev.clientX - r.left + 12)) + "px"; tip.style.top = Math.max(0, ev.clientY - r.top - 50) + "px";
  });
  spec.addEventListener("pointerleave", function () { tip.hidden = true; });
  spec.style.cursor = "crosshair";
  var chart = $("lu-chart");
  chart.addEventListener("pointermove", function (ev) { if (!chartGeo) return; var r = chart.getBoundingClientRect(), x = ev.clientX - r.left; hoverE = (x - chartGeo.mL) / chartGeo.pw * chartGeo.xMax; if (hoverE < 0 || hoverE > chartGeo.xMax) hoverE = null; drawChart(); });
  chart.addEventListener("pointerleave", function () { hoverE = null; drawChart(); });
  $("lu-follow").addEventListener("change", function () { if (this.checked) selIdx = -1; });

  /* keyboard */
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " && root.contains(document.activeElement) || e.key === "s" || e.key === "S") { e.preventDefault(); $("lu-go").click(); }
    else if (e.key === "r" || e.key === "R") $("lu-reset").click();
    else if (e.key === "p" || e.key === "P") { var order = ["polish", "scale", "strain", "rate"]; S.look = order[(order.indexOf(S.look) + 1) % 4]; save(); syncUI(); drawAll(); }
  });

  /* ---- front-angle figure ---- */
  var angDrag = false;
  function drawAngle() {
    var svg = $("lu-ang"), r = +$("lu-ar").value, th = L.frontAngle(r), my = +$("lu-aa").value, k = TXS();
    $("lu-arv").textContent = r.toFixed(2) + " → " + th.toFixed(1) + "°"; $("lu-aav").textContent = my.toFixed(1) + "°";
    var cx = 220, cy = 150, R0 = 90, e = 0.32, ax = R0 * (1 + e), ay = R0 * (1 - e * r / (1 + r));
    function P(deg, len) { var t = deg * Math.PI / 180; return [cx + Math.cos(t) * len, cy - Math.sin(t) * len]; }
    var g = '<rect x="10" y="10" width="420" height="280" rx="10" class="lu-a-sheet"/>';
    g += '<path d="M24,150 h34 M24,150 l8,-6 M24,150 l8,6 M416,150 h-34 M416,150 l-8,-6 M416,150 l-8,6" class="lu-a-pull"/>';
    g += '<text x="41" y="' + (150 - 12) + '" text-anchor="middle" class="lu-a-t2" style="font-size:' + Math.round(13 * k) + 'px">pull</text><text x="399" y="' + (150 - 12) + '" text-anchor="middle" class="lu-a-t2" style="font-size:' + Math.round(13 * k) + 'px">pull</text>';
    g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R0 + '" class="lu-a-circ"/>';
    g += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + ax + '" ry="' + ay + '" class="lu-a-ell"/>';
    [th, -th].forEach(function (d) { var a = P(d, 135), b = P(d + 180, 135); g += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" class="lu-a-band"/>'; });
    [th, -th, 180 - th, 180 + th].forEach(function (d) { var q = P(d, R0); g += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="5" class="lu-a-pt"/>'; });
    var lineE = L.lineStrain(my, r), ok = Math.abs(lineE) < 0.02;
    var h1 = P(my, R0), h0 = P(my + 180, R0);
    g += '<line x1="' + h0[0] + '" y1="' + h0[1] + '" x2="' + h1[0] + '" y2="' + h1[1] + '" class="lu-a-my' + (ok ? ' lu-a-ok' : '') + '"/>';
    g += '<circle cx="' + h1[0] + '" cy="' + h1[1] + '" r="11" class="lu-a-h' + (ok ? ' lu-a-ok' : '') + '" id="lu-ah"/>';
    g += '<path d="M' + (cx + 34) + ',' + cy + ' A34,34 0 0 0 ' + P(th, 34)[0] + ',' + P(th, 34)[1] + '" class="lu-a-arc"/>';
    g += '<text x="24" y="' + Math.round(26 + 12 * k) + '" class="lu-a-t" style="font-size:' + Math.round(15 * k) + 'px">band: ' + th.toFixed(1) + '° from the pull</text>';
    g += '<text x="' + (cx + 40) + '" y="' + (cy - 8) + '" class="lu-a-t lu-a-th" style="font-size:' + Math.round(14 * k) + 'px">θ</text>';
    svg.innerHTML = g;
    /* readout: grows / shrinks, with a centre-zero meter */
    var pc = Math.round(Math.abs(lineE) * 100), w = Math.min(50, Math.abs(lineE) * 50);
    var meter = '<span class="lu-meter" aria-hidden="true"><span class="lu-meter__z"></span><span class="lu-meter__b' + (ok ? ' lu-meter__b--ok' : lineE > 0 ? ' lu-meter__b--up' : ' lu-meter__b--dn') + '" style="left:' + (lineE >= 0 ? 50 : 50 - w) + '%;width:' + Math.max(ok ? 2 : 0, w) + '%"></span></span><span class="lu-meter__k" aria-hidden="true"><span>shrinks</span><span>same length</span><span>grows</span></span>';
    var txt = ok ? "<b class='lu-good'>Same length. This is where the band front can run.</b> It lines up with a dashed line."
      : lineE > 0 ? "the line <b>gets longer</b> (by " + pc + "% of the pull). Too close to the pull direction: turn it more upright."
      : "the line <b>gets shorter</b> (by " + pc + "% of the pull). Too far from the pull direction: turn it back towards the pull.";
    $("lu-angout").innerHTML = meter + '<span class="lu-angtxt">At <b>' + my.toFixed(1) + "°</b> from the pull: " + txt + "</span>";
  }
  $("lu-ar").addEventListener("input", drawAngle);
  $("lu-aa").addEventListener("input", drawAngle);
  var angSvg = $("lu-ang");
  angSvg.addEventListener("pointerdown", function (e) { if (e.target.id === "lu-ah" || e.target.classList.contains("lu-a-my")) { angDrag = true; angSvg.setPointerCapture(e.pointerId); e.preventDefault(); } });
  angSvg.addEventListener("pointermove", function (e) {
    if (!angDrag) return; var r = angSvg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 440 - 220, y = 150 - (e.clientY - r.top) / r.height * 300;
    var d = Math.atan2(y, x) * 180 / Math.PI; if (d < 0) d += 180; if (d > 90) d = 180 - d;
    $("lu-aa").value = Math.round(d * 2) / 2; drawAngle();
  });
  angSvg.addEventListener("pointerup", function () { angDrag = false; });
  $("lu-ar").value = S.r;

  /* ---- video: load on click ---- */
  var yt = $("lu-yt");
  if (yt) yt.addEventListener("click", function () { var f = document.createElement("iframe"); f.src = "https://www.youtube-nocookie.com/embed/" + yt.getAttribute("data-id") + "?autoplay=1&rel=0"; f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.title = "Luders Bands, by Prelude610"; f.className = "lu-ytf"; yt.replaceWith(f); });

  /* ---- photo lightbox ---- */
  $("lu-gal").addEventListener("click", function (e) {
    var a = e.target.closest("a.lu-ph"); if (!a) return; e.preventDefault();
    var box = document.createElement("div"); box.className = "lu-lb"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Photo");
    box.innerHTML = '<button type="button" class="lu-lbx" aria-label="Close">×</button><img alt=""><p></p>';
    box.querySelector("img").src = a.getAttribute("href"); box.querySelector("img").alt = a.querySelector("img").alt; box.querySelector("p").innerHTML = a.parentNode.querySelector("figcaption").innerHTML;
    function close() { box.remove(); document.removeEventListener("keydown", esc); }
    function esc(k) { if (k.key === "Escape") close(); }
    box.addEventListener("click", function (k) { if (k.target === box || k.target.classList.contains("lu-lbx")) close(); });
    document.addEventListener("keydown", esc); document.body.appendChild(box); box.querySelector(".lu-lbx").focus();
  });

  /* ---- toast ---- */
  var tt = null;
  function toast(msg) { var el = $("lu-toast"); el.textContent = msg; el.classList.add("tu-toast--show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 2600); }

  /* ---- fill window / full screen ---- */
  function addPanel() { if (window.MESPanel && !$("lu-view").__mesPanel) { $("lu-view").__mesPanel = 1; window.MESPanel.add($("lu-view"), { bar: $("lu-vbar").querySelector(".lu-vbtns"), stage: $("lu-stage"), onChange: function () { setTimeout(drawAll, 40); } }); } }
  if (document.readyState === "complete") addPanel(); else window.addEventListener("load", addPanel);
  setTimeout(addPanel, 1500);
  var rt = null; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(drawAll, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(drawAll, 60); }).observe(root);
  new MutationObserver(function () { drawAll(); drawAngle(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  var mcEl = document.getElementById("main-content"); if (mcEl) new MutationObserver(function () { drawAll(); drawAngle(); }).observe(mcEl, { attributes: true, attributeFilter: ["style"] });

  syncUI(); newSim(false); drawAngle();
  requestAnimationFrame(frame); requestAnimationFrame(microLoop);
  window.MESLudersDebug = { get sim() { return sim; }, S: S, run: function (sec) { var V = sim.p.V / 60, n = Math.round(sec * 100); for (var i = 0; i < n; i++) { var ev = sim.step(V * 0.01, 0.01); ev.forEach(onEvent); pushKymo(); } drawAll(); say(); drawMicro(); }, draw: drawAll };
})();
