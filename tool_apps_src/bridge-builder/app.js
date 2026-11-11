/* MES Bridge Builder page: editor, live analysis, test runs, member check, cheapest-design search, challenges. Maths in lib.js (window.MESBridge). */
(function () {
  'use strict';
  var B = window.MESBridge, root = document.getElementById('bz');
  if (!B || !root) return;
  function $(s) { return root.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(root.querySelectorAll(s)); }
  var KEY = 'mes-bridge-builder:v1';
  var DEF = {tool: 'build', mat: 'steel', sz: {road: 3, wroad: 3, steel: 4, wood: 3, cable: 3, conc: 3}, colours: false, span: 30, gap: 12, type: 'pratt', depth: 5, pan: 0,
    veh: 'car', nveh: 4, vgap: 6, speed: 50, wind: 0, gust: 20, vortex: true, pga: 0, qtype: 'shake', qdur: 10, qvert: false, sf: 1.5, slow: 1, stars: {}, level: null, tab: 'build'};
  var S = Object.assign({}, DEF), model = null, ana = null;
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { Object.assign(S, sv.s || {}); S.sz = Object.assign({}, DEF.sz, (sv.s || {}).sz); if (sv.code) model = B.decode(sv.code); } } catch (e) {}
  // a link (#d=...) wins over the saved bridge
  (function () {
    var h = location.hash.replace(/^#/, ''); if (!h) return;
    var q = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (q.d) { var m = B.decode(q.d); if (m) { model = m; S.span = m.span; S.gap = m.gap; S.level = null; } }
    if (q.v) { var v = q.v.split('.'); if (B.VEH[v[0]]) { S.veh = v[0]; S.nveh = +v[1] || 0; S.vgap = +v[2] || 6; S.speed = +v[3] || 50; } }
    if (q.w) { var w = q.w.split('.'); S.wind = +w[0] || 0; S.gust = +w[1] || 0; }
    if (q.q) { var qq = q.q.split('.'); S.pga = +qq[0] || 0; if (B.QUAKES[qq[1]]) S.qtype = qq[1]; S.qdur = +qq[2] || 10; }
    if (q.d || q.v) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  })();
  if (!model) { model = B.autoSize(B.template('pratt', 30, 12, 5), opts()).model; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({s: S, code: B.encode(model)})); } catch (e) {} }
  function opts() { return {traffic: {veh: S.veh, n: S.nveh, gap: S.vgap}, wind: S.wind, quake: S.pga, sf: S.sf}; }
  function dark() { return document.body.classList.contains('dark-mode'); }
  function money(v) { return v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + ' M' : '$' + Math.round(v).toLocaleString('en-US'); }
  function kN(v) { return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' MN' : Math.round(v / 1000).toLocaleString('en-US') + ' kN'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function toast(msg) { var t = document.createElement('div'); t.className = 'tu-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.classList.add('is-on'); }, 10); setTimeout(function () { t.remove(); }, 2600); }

  // ---------- undo ----------
  var undo = [], redo = [];
  function snapshot() { return B.encode(model); }
  function commit(prev) { undo.push(prev); if (undo.length > 200) undo.shift(); redo = []; changed(); }
  function changed() { if (running()) return; reanalyze(); save(); }

  // ---------- analysis ----------
  var anaTimer = 0;
  function reanalyze(now) {
    clearTimeout(anaTimer);
    var run = function () { ana = B.analyze(model, opts()); refresh(); };
    if (now) run(); else anaTimer = setTimeout(run, 60);
  }

  // ---------- canvas / camera ----------
  var stage = $('#bz-stage'), cv = $('#bz-c'), ctx = cv.getContext('2d'), W = 600, H = 360, DPR = 1;
  var cam = {s: 10, cx: 15, cy: 2}, normalH = 320;
  function w2s(x, y) { return [(x - cam.cx) * cam.s + W / 2, H / 2 - (y - cam.cy) * cam.s]; }
  function s2w(px, py) { return [(px - W / 2) / cam.s + cam.cx, cam.cy - (py - H / 2) / cam.s]; }
  function fit() {
    var Sp = model.span, x0 = -0.08 * Sp - 4, x1 = Sp * 1.08 + 4, y0 = -model.gap - 1, y1 = Math.max(5, Sp * 0.12);
    model.nodes.forEach(function (n) { x0 = Math.min(x0, n.x - 3); x1 = Math.max(x1, n.x + 3); y1 = Math.max(y1, n.y + 3); });
    var pad = 0.06, sx = W * (1 - 2 * pad) / (x1 - x0), sy = (H - 70) / (y1 - y0);
    cam.s = Math.min(sx, sy); cam.cx = (x0 + x1) / 2; cam.cy = (y0 + y1) / 2 - 18 / cam.s;
    dirty();
  }
  function resize() {
    var view = $('#bz-view'), full = view.classList.contains('mes-pfill');
    if (!full) { stage.style.minHeight = ''; if (stage.clientHeight > 0) normalH = stage.clientHeight; }
    stage.style.height = full && view.classList.contains('mes-pside') ? (view.clientHeight - 24) + 'px' : '';
    // Fill window must never make the picture smaller than it was on the page
    if (full && !view.classList.contains('mes-pside')) stage.style.minHeight = Math.min(normalH, view.clientHeight - 40) + 'px';
    DPR = Math.min(2, window.devicePixelRatio || 1);
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    var changedSize = Math.abs(w - W) > 1 || Math.abs(h - H) > 1;
    W = w; H = h; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (changedSize) fit();
    dirty();
  }
  var needDraw = true, raf = 0;
  function dirty() { needDraw = true; if (!raf) raf = requestAnimationFrame(frame); }

  // ---------- drawing ----------
  var COL = {};
  function palette() {
    var d = dark();
    COL = d ? {sky1: '#0b1426', sky2: '#25344f', hill: '#1b2a3a', hill2: '#223548', rock: '#4b4239', rock2: '#3b332c', grass: '#2f5a2c', water: 'rgba(40,90,140,0.85)', wave: 'rgba(140,190,240,0.35)',
      grid: 'rgba(255,255,255,0.07)', grid5: 'rgba(255,255,255,0.13)', joint: '#e8ecf3', text: '#e8ecf3', asphalt: '#2a2d33', line: '#e6c84a', anchor: '#c9ced6'}
      : {sky1: '#7fb8f0', sky2: '#e3f1fd', hill: '#9cc2a4', hill2: '#b7d4bb', rock: '#9b8a76', rock2: '#86765f', grass: '#5d9b4a', water: 'rgba(52,120,180,0.82)', wave: 'rgba(255,255,255,0.45)',
      grid: 'rgba(30,50,80,0.07)', grid5: 'rgba(30,50,80,0.14)', joint: '#1d2430', text: '#1d2430', asphalt: '#3b3f46', line: '#f5d64a', anchor: '#56606e'};
  }
  function utilCol(u, a) {
    if (!(u >= 0)) u = 0;
    var stops = [[0, [46, 160, 90]], [0.6, [220, 200, 40]], [0.85, [240, 140, 30]], [1, [220, 40, 40]]], c = stops[stops.length - 1][1];
    for (var i = 1; i < stops.length; i++) if (u <= stops[i][0]) { var t = (u - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]), p = stops[i - 1][1], q = stops[i][1]; c = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]; break; }
    return 'rgba(' + c.map(Math.round).join(',') + ',' + (a == null ? 1 : a) + ')';
  }
  function forceCol(N, cap) { // live: red = pulling, blue = pushing
    var u = Math.min(1, Math.abs(N) / (cap || 1)), k = Math.pow(u, 0.6);
    return N >= 0 ? 'rgb(' + Math.round(200 + 55 * k) + ',' + Math.round(200 - 170 * k) + ',' + Math.round(200 - 170 * k) + ')' : 'rgb(' + Math.round(200 - 170 * k) + ',' + Math.round(205 - 105 * k) + ',' + Math.round(210 + 45 * k) + ')';
  }
  var drag = null, hover = {m: -1, n: -1}, sel = -1, modeAnim = -1, t0 = performance.now(), fx = [];
  function nodePos(i) {
    if (sim) return [sim.x[i], sim.y[i]];
    var n = model.nodes[i];
    if (modeAnim >= 0 && ana && ana.modes && ana.modes[modeAnim]) {
      var sh = ana.modes[modeAnim].shape, a = 0.05 * model.span * Math.sin((performance.now() - t0) / 1000 * 2 * Math.PI * 0.7);
      return [n.x + a * sh[2 * i], n.y + a * sh[2 * i + 1]];
    }
    return [n.x, n.y];
  }
  function draw() {
    palette();
    var c = ctx, Sp = model.span, Gp = model.gap, gu = sim ? sim.gu : 0, gv = sim ? sim.gv : 0;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, COL.sky1); g.addColorStop(1, COL.sky2); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // far hills (parallax)
    c.fillStyle = COL.hill2; c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W; x += 20) { var wx = (x - W / 2) / (cam.s * 0.5) + cam.cx * 0.5; c.lineTo(x, H / 2 - (8 + 6 * Math.sin(wx * 0.05) + 4 * Math.sin(wx * 0.13 + 1) - cam.cy) * cam.s * 0.5 - 30); }
    c.lineTo(W, H); c.fill();
    c.fillStyle = COL.hill; c.beginPath(); c.moveTo(0, H);
    for (x = 0; x <= W; x += 16) { var wx2 = (x - W / 2) / (cam.s * 0.75) + cam.cx * 0.75; c.lineTo(x, H / 2 - (3 + 4 * Math.sin(wx2 * 0.07 + 2) + 2 * Math.sin(wx2 * 0.21) - cam.cy) * cam.s * 0.75); }
    c.lineTo(W, H); c.fill();
    // water
    var wy = B.waterY(model), p1 = w2s(gu, wy), p2 = w2s(Sp + gu, -Gp);
    c.fillStyle = COL.water; c.fillRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
    c.strokeStyle = COL.wave; c.lineWidth = 1.5; c.beginPath();
    var tt = performance.now() / 1000;
    for (x = p1[0]; x < p2[0]; x += 6) { var yy = p1[1] + Math.sin(x * 0.05 + tt * 2) * 1.6; if (x === p1[0]) c.moveTo(x, yy); else c.lineTo(x, yy); }
    c.stroke();
    // terrain
    function rockPoly(pts) { c.beginPath(); pts.forEach(function (p, i) { var s = w2s(p[0] + gu, p[1] + gv); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); }); c.closePath(); }
    var far = Sp * 3 + 200, deep = Gp + 40;
    c.fillStyle = COL.rock;
    rockPoly([[-far, 0], [0, 0], [0, -Gp], [Sp, -Gp], [Sp, 0], [Sp + far, 0], [Sp + far, -deep], [-far, -deep]]); c.fill();
    // rock strata lines
    c.strokeStyle = COL.rock2; c.lineWidth = 1;
    for (var k = 1; k < 8; k++) { var yk = -Gp * k / 8; var a1 = w2s(-far, yk + gv), a2 = w2s(gu, yk + gv), b1 = w2s(Sp + gu, yk + gv), b2 = w2s(Sp + far, yk + gv); c.beginPath(); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.moveTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
    // grass + approach roads
    c.fillStyle = COL.grass; var gl = w2s(-far, gv), gr = w2s(gu, gv), gr2 = w2s(Sp + gu, gv), gr3 = w2s(Sp + far, gv), gh = Math.max(3, 0.35 * cam.s);
    c.fillRect(gl[0], gl[1], gr[0] - gl[0], gh); c.fillRect(gr2[0], gr2[1], gr3[0] - gr2[0], gh);
    c.fillStyle = COL.asphalt; var rh = Math.max(3, 0.3 * cam.s);
    c.fillRect(gl[0], gl[1] - rh, gr[0] - gl[0], rh); c.fillRect(gr2[0], gr2[1] - rh, gr3[0] - gr2[0], rh);
    // grid (build mode)
    if (!sim) {
      var step = cam.s > 14 ? 1 : cam.s > 5 ? 5 : 10, wa = s2w(0, H), wb = s2w(W, 0);
      for (var gx = Math.ceil(wa[0] / step) * step; gx <= wb[0]; gx += step) { var s1 = w2s(gx, 0); c.strokeStyle = gx % (step * 5) === 0 ? COL.grid5 : COL.grid; c.beginPath(); c.moveTo(s1[0], 0); c.lineTo(s1[0], H); c.stroke(); }
      for (var gy = Math.ceil(wa[1] / step) * step; gy <= wb[1]; gy += step) { var s2 = w2s(0, gy); c.strokeStyle = gy % (step * 5) === 0 ? COL.grid5 : COL.grid; c.beginPath(); c.moveTo(0, s2[1]); c.lineTo(W, s2[1]); c.stroke(); }
      // span marks
      c.fillStyle = COL.text; c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center';
      var ma = w2s(0, -Gp * 0.5), mb = w2s(Sp, -Gp * 0.5);
      c.globalAlpha = 0.55; c.setLineDash([5, 5]); c.strokeStyle = COL.text; c.beginPath(); c.moveTo(ma[0] + 6, ma[1]); c.lineTo(mb[0] - 6, mb[1]); c.stroke(); c.setLineDash([]);
      c.fillText(Sp + ' m', (ma[0] + mb[0]) / 2, ma[1] - 6); c.globalAlpha = 1;
    }
    // members
    var E = model.members, br = sim ? sim.e : null;
    var order = E.map(function (e, i) { return i; }).sort(function (a, b) { return (B.MATS[E[a].m].road ? 1 : 0) - (B.MATS[E[b].m].road ? 1 : 0); });
    var drawMember = function (i) {
      var e = E[i], M = B.MATS[e.m], pa = nodePos(e.a), pb = nodePos(e.b), A = w2s(pa[0], pa[1]), Bp = w2s(pb[0], pb[1]);
      var si = B.sizeInfo(e.m, e.s), wpx = M.cable ? Math.max(1.5, si.b * cam.s * 3) : Math.max(2.5, Math.min(22, si.b * cam.s * 1.2));
      if (br && br[i].broken) {
        // a broken member: two stubs
        c.strokeStyle = 'rgba(120,120,120,0.75)'; c.lineWidth = wpx * 0.7; c.lineCap = 'round';
        var mx = (A[0] + Bp[0]) / 2, my = (A[1] + Bp[1]) / 2;
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(A[0] + (mx - A[0]) * 0.8, A[1] + (my - A[1]) * 0.8 + 6); c.moveTo(Bp[0], Bp[1]); c.lineTo(Bp[0] + (mx - Bp[0]) * 0.8, Bp[1] + (my - Bp[1]) * 0.8 + 6); c.stroke();
        return;
      }
      var col = M.color;
      if (br) col = forceCol(br[i].N, br[i].N >= 0 ? br[i].T : br[i].C);
      else if (S.colours && ana && ana.members[i]) col = utilCol(ana.members[i].util);
      if (M.road) {
        var th = Math.max(4, 0.55 * cam.s);
        c.lineCap = 'butt';
        c.strokeStyle = (br || S.colours) ? col : COL.asphalt; c.lineWidth = th;
        var nx = -(Bp[1] - A[1]), ny = (Bp[0] - A[0]), nl = Math.hypot(nx, ny) || 1; nx = nx / nl * th / 2; ny = ny / nl * th / 2; if (ny < 0) { nx = -nx; ny = -ny; }
        c.beginPath(); c.moveTo(A[0] + nx, A[1] + ny); c.lineTo(Bp[0] + nx, Bp[1] + ny); c.stroke();
        if (!br && !S.colours) { c.strokeStyle = M === B.MATS.wroad ? '#8a6038' : '#7d8794'; c.lineWidth = Math.max(2, th * 0.35); c.beginPath(); c.moveTo(A[0] + nx * 2.3, A[1] + ny * 2.3); c.lineTo(Bp[0] + nx * 2.3, Bp[1] + ny * 2.3); c.stroke(); }
        if (cam.s > 6) { c.strokeStyle = COL.line; c.lineWidth = 1.2; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(A[0] + nx * 0.3, A[1] + ny * 0.3); c.lineTo(Bp[0] + nx * 0.3, Bp[1] + ny * 0.3); c.stroke(); c.setLineDash([]); }
      } else {
        c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = wpx;
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bp[0], Bp[1]); c.stroke();
        if (!M.cable && wpx > 6 && !br && !S.colours) { c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = wpx * 0.3; c.beginPath(); c.moveTo(A[0], A[1] - wpx * 0.15); c.lineTo(Bp[0], Bp[1] - wpx * 0.15); c.stroke(); }
      }
      if (!sim && ana && ana.members[i] && ana.members[i].tooLong) { c.strokeStyle = 'rgba(220,30,30,0.9)'; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bp[0], Bp[1]); c.stroke(); c.setLineDash([]); }
      if (i === hover.m || i === sel || i === hlRow) { c.strokeStyle = i === sel ? '#1d6fd1' : 'rgba(29,111,209,0.6)'; c.lineWidth = wpx + 6; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bp[0], Bp[1]); c.stroke(); c.globalAlpha = 1; }
    };
    var isRoad = function (i) { return !!B.MATS[E[i].m].road; };
    order.filter(isRoad).forEach(drawMember);
    if (sim) sim.veh.forEach(function (v) { drawVeh(v); });
    order.filter(function (i) { return !isRoad(i); }).forEach(drawMember);
    // joints
    model.nodes.forEach(function (n, i) {
      var p = nodePos(i), s = w2s(p[0], p[1]), anc = sim ? sim.fixed[i] : B.ground(model, n.x, n.y);
      if (anc) {
        var z = Math.max(7, Math.min(14, cam.s * 0.9));
        c.fillStyle = COL.anchor; c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[0] - z * 0.8, s[1] + z); c.lineTo(s[0] + z * 0.8, s[1] + z); c.closePath(); c.fill();
        c.strokeStyle = COL.anchor; c.lineWidth = 2; c.beginPath(); c.moveTo(s[0] - z, s[1] + z + 2); c.lineTo(s[0] + z, s[1] + z + 2); c.stroke();
      }
      var r = Math.max(3, Math.min(6, cam.s * 0.25));
      c.fillStyle = (ana && ana.err === 'mech' && ana.mechNode === i && !sim) ? '#e33' : COL.joint;
      c.beginPath(); c.arc(s[0], s[1], i === hover.n ? r + 2 : r, 0, 7); c.fill();
      if (ana && ana.err === 'mech' && ana.mechNode === i && !sim) { c.strokeStyle = '#e33'; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], r + 7 + 3 * Math.sin(performance.now() / 150), 0, 7); c.stroke(); }
    });
    // effects
    var nowT = sim ? sim.t : 0;
    fx = sim ? fx.filter(function (f) { return nowT - f.t < 1.4 && nowT >= f.t; }) : [];
    fx.forEach(function (f) {
      var s = w2s(f.x, f.y), age = nowT - f.t;
      if (f.kind === 'snap') { c.strokeStyle = 'rgba(255,200,60,' + (1 - age / 1.4) + ')'; c.lineWidth = 2; for (var q = 0; q < 8; q++) { var an = q * 0.785 + f.r, l = 6 + age * 60; c.beginPath(); c.moveTo(s[0] + Math.cos(an) * l * 0.4, s[1] + Math.sin(an) * l * 0.4); c.lineTo(s[0] + Math.cos(an) * l, s[1] + Math.sin(an) * l); c.stroke(); } }
      else { c.strokeStyle = 'rgba(255,255,255,' + (0.9 - age / 1.6) + ')'; c.lineWidth = 2; for (var r2 = 0; r2 < 3; r2++) { c.beginPath(); c.ellipse(s[0], s[1], (age * 40 + r2 * 10) * Math.max(0.6, cam.s / 12), (age * 9 + r2 * 3), 0, 0, 7); c.stroke(); } }
    });
    // wind streaks
    if (sim && sim.wind) {
      var U = sim.Unow || sim.wind.U; c.strokeStyle = dark() ? 'rgba(220,230,255,0.25)' : 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5;
      for (var st = 0; st < 40; st++) { var sx = ((st * 97.3 + sim.t * U * 9) % (W + 200)) - 100, sy = (st * 53.7) % (H * 0.8) + 8, ln = 20 + U; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + ln, sy + ln * 0.08); c.stroke(); }
    }
    // the member being drawn
    if (drag && drag.kind === 'member' && drag.moved) {
      var M2 = B.MATS[S.mat], a = w2s(drag.ax, drag.ay), b = w2s(drag.bx, drag.by), L = Math.hypot(drag.bx - drag.ax, drag.by - drag.ay);
      c.strokeStyle = 'rgba(29,111,209,0.25)'; c.setLineDash([6, 6]); c.lineWidth = 1.5; c.beginPath(); c.arc(a[0], a[1], M2.maxL * cam.s, 0, 7); c.stroke(); c.setLineDash([]);
      c.strokeStyle = M2.road ? COL.asphalt : M2.color; c.globalAlpha = 0.85; c.lineWidth = M2.road ? Math.max(4, 0.55 * cam.s) : 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = COL.joint; c.beginPath(); c.arc(b[0], b[1], 5, 0, 7); c.fill();
      label(L.toFixed(1) + ' m · ' + money(B.cost({span: Sp, gap: Gp, nodes: [{x: drag.ax, y: drag.ay}, {x: drag.bx, y: drag.by}], members: [{a: 0, b: 1, m: S.mat, s: S.sz[S.mat]}]}).members + B.cost({span: Sp, gap: Gp, nodes: [{x: drag.ax, y: drag.ay}, {x: drag.bx, y: drag.by}], members: [{a: 0, b: 1, m: S.mat, s: S.sz[S.mat]}]}).deck), b[0] + 12, b[1] - 12);
    }
    if (drag && drag.kind === 'move') { var mn = model.nodes[drag.i], ms = w2s(mn.x, mn.y); label('(' + mn.x.toFixed(1) + ', ' + mn.y.toFixed(1) + ') m', ms[0] + 12, ms[1] - 12); }
  }
  function label(txt, x, y) {
    var c = ctx; c.font = '600 12px system-ui, sans-serif'; var w = c.measureText(txt).width + 12;
    x = Math.min(W - w - 4, Math.max(4, x)); y = Math.max(18, Math.min(H - 6, y));
    c.fillStyle = 'rgba(15,20,30,0.82)'; c.fillRect(x, y - 15, w, 20); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(txt, x + 6, y);
  }
  // AI-drawn side-view sprites (img/veh-<type>.png); wheel centres + ground line measured per picture so the wheels sit on the axles
  var SPR = /*SPRITES*/{"car":{"w":600,"h":186,"wheels":[0.205,0.8117],"ground":1.0},"suv":{"w":600,"h":223,"wheels":[0.1958,0.81],"ground":1.0},"bus":{"w":600,"h":192,"wheels":[0.2442,0.7683],"ground":1.0},"fire":{"w":600,"h":221,"wheels":[0.2058,0.8058],"ground":1.0},"truck":{"w":900,"h":231,"wheels":[0.0983,0.1733,0.5478,0.6217,0.9039],"ground":1.0}}/*END*/, sprImg = {};
  Object.keys(SPR).forEach(function (k) { var im = new Image(); im.onload = function () { sprImg[k] = im; dirty(); }; im.src = '/bridge-builder/img/veh-' + k + '.png?v=1'; });
  function drawSprite(v) {
    var sp = SPR[v.type], im = sprImg[v.type]; if (!sp || !im) return false;
    var V = v.V, L = V.L, n = V.axles.length, fx = L / 2 - V.axles[0][0], rx = L / 2 - V.axles[n - 1][0];
    var w0 = sp.wheels[0], w1 = sp.wheels[sp.wheels.length - 1], k = (fx - rx) / ((w1 - w0) * sp.w);
    var left = rx - w0 * sp.w * k, top = sp.ground * sp.h * k;
    ctx.save(); ctx.scale(1, -1); ctx.drawImage(im, left, -top, sp.w * k, sp.h * k); ctx.restore();
    return true;
  }
  function drawVeh(v) {
    var V = v.V, cx, cy, ang;
    if (v.st === 'road') {
      var n = V.axles.length, fa = V.axles[0][0], la = V.axles[n - 1][0], yf = v.ay[0] || 0, yl = v.ay[n - 1] || 0;
      ang = Math.atan2(yf - yl, la - fa); cx = v.x - (fa + la) / 2; cy = (yf + yl) / 2;
      // body centre is half a length behind the front, axles define the slope
      cx = v.x - V.L / 2;
    } else { cx = v.body.x; cy = v.body.y; ang = v.body.ang; }
    if (v.done && v.x - V.L > model.span + 60) return;
    var c = ctx, p = w2s(cx, cy), s = cam.s;
    c.save(); c.translate(p[0], p[1]); c.rotate(-ang); c.scale(s, -s);
    // drawn in metres, x forward from the body centre, y up from the road
    if (drawSprite(v)) { c.restore(); return; }
    var L = V.L, h = V.h, wr = V.m > 9000 ? 0.55 : 0.36;
    c.fillStyle = V.color;
    function rr(x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + hh - r); c.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh); c.lineTo(x + r, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.fill(); }
    var win = dark() ? '#9fc4e8' : '#cfe6fb';
    if (v.type === 'car' || v.type === 'suv') {
      rr(-L / 2, wr, L, h * 0.45, 0.25);
      c.beginPath(); c.moveTo(-L * 0.32, wr + h * 0.42); c.lineTo(-L * 0.22, h); c.lineTo(L * 0.18, h); c.lineTo(L * 0.32, wr + h * 0.42); c.fill();
      c.fillStyle = win; c.beginPath(); c.moveTo(-L * 0.27, wr + h * 0.47); c.lineTo(-L * 0.2, h * 0.93); c.lineTo(L * 0.15, h * 0.93); c.lineTo(L * 0.26, wr + h * 0.47); c.fill();
    } else if (v.type === 'bus') {
      rr(-L / 2, wr * 0.8, L, h - wr * 0.8, 0.4);
      c.fillStyle = win; for (var i = 0; i < 6; i++) c.fillRect(-L / 2 + 1 + i * (L - 2) / 6, h * 0.55, (L - 2) / 6 - 0.3, h * 0.28);
    } else {
      var cab = v.type === 'truck' ? 2.4 : 2.6;
      rr(L / 2 - cab, wr * 0.8, cab, h * 0.85, 0.3);
      c.fillStyle = win; c.fillRect(L / 2 - cab * 0.55, h * 0.48, cab * 0.45, h * 0.28);
      c.fillStyle = v.type === 'truck' ? (dark() ? '#cfd5de' : '#eef1f5') : '#b82b22';
      rr(-L / 2, wr * 1.6, L - cab - 0.3, h - wr * 1.6, 0.15);
      if (v.type === 'fire') { c.fillStyle = '#e8e8e8'; c.fillRect(-L / 2 + 0.5, h - 0.2, L - cab - 1.2, 0.18); }
    }
    c.fillStyle = '#16181c';
    V.axles.forEach(function (a) { c.beginPath(); c.arc(L / 2 - a[0], wr, wr, 0, 7); c.fill(); });
    c.fillStyle = '#9aa3ad'; V.axles.forEach(function (a) { c.beginPath(); c.arc(L / 2 - a[0], wr, wr * 0.45, 0, 7); c.fill(); });
    c.restore();
  }

  // ---------- frame loop ----------
  var sim = null, paused = false, last = 0, hist = [], seenEv = 0, finishedShown = false;
  function running() { return !!sim; }
  function frame(ts) {
    raf = 0;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
    if (sim && !paused) {
      sim.advance(dt * (+S.slow || 1), 14, function () { return performance.now(); });
      for (; seenEv < sim.events.length; seenEv++) {
        var ev = sim.events[seenEv];
        if (ev.k != null) { var q = sim.e[ev.k], mx = (sim.x[q.a] + sim.x[q.b]) / 2, my = (sim.y[q.a] + sim.y[q.b]) / 2; fx.push({kind: 'snap', x: mx, y: my, t: sim.t, r: Math.random()}); }
      }
      sim.veh.forEach(function (v) { if (v.splash && !v.splashed) { v.splashed = true; fx.push({kind: 'splash', x: v.body.x, y: B.waterY(model), t: sim.t}); } });
      if (!hist.length || sim.t - hist[hist.length - 1].t > 0.04) hist.push({t: sim.t, d: sim.midDefl(), a: sim.quake ? sim.quake.a(sim.t) / B.G : 0, u: sim.util || 0});
      liveReadouts();
      if (sim.finished() && !finishedShown) { finishedShown = true; showResult(); }
      needDraw = true;
    }
    if (modeAnim >= 0 || (ana && ana.err === 'mech')) needDraw = true;
    if (needDraw) { needDraw = false; draw(); if (sim) drawChart(); }
    if (sim && !paused || modeAnim >= 0 || (ana && ana.err === 'mech' && !sim)) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  // ---------- pointer ----------
  var pointers = {}, pinch = null, spaceDown = false;
  function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function nearestNode(px, py, rad) {
    var best = -1, bd = rad || 14;
    model.nodes.forEach(function (n, i) { var s = w2s(n.x, n.y), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function nearestMember(px, py) {
    var best = -1, bd = 10;
    model.members.forEach(function (e, i) {
      var a = w2s(model.nodes[e.a].x, model.nodes[e.a].y), b = w2s(model.nodes[e.b].x, model.nodes[e.b].y), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      var t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)), d = Math.hypot(a[0] + t * dx - px, a[1] + t * dy - py);
      var wpx = B.MATS[e.m].road ? 0.3 * cam.s : 0;
      if (d - wpx < bd) { bd = d - wpx; best = i; }
    });
    return best;
  }
  function snapPoint(px, py, free) {
    var ni = nearestNode(px, py);
    if (ni >= 0) return {node: ni, x: model.nodes[ni].x, y: model.nodes[ni].y};
    var w = s2w(px, py), x = w[0], y = w[1];
    if (!free) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    var tol = 10 / cam.s, Sp = model.span, Gp = model.gap;
    if (Math.abs(y) < tol && (x <= 0 || x >= Sp)) y = 0;
    if (Math.abs(x) < tol && y < 0 && y > -Gp) x = 0;
    if (Math.abs(x - Sp) < tol && y < 0 && y > -Gp) x = Sp;
    if (Math.abs(y + Gp) < tol && x > 0 && x < Sp) y = -Gp;
    if (B.inside(model, x, y)) { var o = B.snapOut(model, x, y); x = o.x; y = o.y; }
    return {node: -1, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100};
  }
  function addNode(x, y) {
    for (var i = 0; i < model.nodes.length; i++) if (Math.abs(model.nodes[i].x - x) < 0.05 && Math.abs(model.nodes[i].y - y) < 0.05) return i;
    model.nodes.push({x: x, y: y}); return model.nodes.length - 1;
  }
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId);
    var p = pt(e); pointers[e.pointerId] = p;
    var ids = Object.keys(pointers);
    if (ids.length === 2) { // pinch / two-finger pan
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, s: cam.s, cx: cam.cx, cy: cam.cy};
      drag = null; dirty(); return;
    }
    if (e.button === 1 || e.button === 2 || spaceDown || (sim && e.pointerType !== 'touch') || (sim && e.pointerType === 'touch')) {
      drag = {kind: 'pan', px: p[0], py: p[1], cx: cam.cx, cy: cam.cy}; return;
    }
    modeAnim = -1;
    var tool = S.tool;
    if (tool === 'build') {
      var sp = snapPoint(p[0], p[1], e.shiftKey);
      drag = {kind: 'member', a: sp.node, ax: sp.x, ay: sp.y, bx: sp.x, by: sp.y, px: p[0], py: p[1], moved: false, prev: snapshot()};
    } else if (tool === 'move') {
      var ni = nearestNode(p[0], p[1], 18);
      if (ni >= 0) drag = {kind: 'move', i: ni, prev: snapshot()};
      else drag = {kind: 'pan', px: p[0], py: p[1], cx: cam.cx, cy: cam.cy};
    } else if (tool === 'delete') {
      var prev = snapshot(), nd = nearestNode(p[0], p[1], 12), mm = nd < 0 ? nearestMember(p[0], p[1]) : -1;
      if (nd >= 0) { model.members = model.members.filter(function (q) { return q.a !== nd && q.b !== nd; }); model.nodes[nd] = null; tidy(); commit(prev); sel = -1; }
      else if (mm >= 0) { model.members.splice(mm, 1); tidy(); commit(prev); sel = -1; }
      else drag = {kind: 'pan', px: p[0], py: p[1], cx: cam.cx, cy: cam.cy};
    } else {
      var m2 = nearestMember(p[0], p[1]); select(m2);
      if (m2 < 0) drag = {kind: 'pan', px: p[0], py: p[1], cx: cam.cx, cy: cam.cy};
    }
    dirty();
  });
  function tidy() { // drop null nodes and anything that no longer has a member
    var map = [], nodes = [];
    model.nodes.forEach(function (n, i) { if (n) { map[i] = nodes.length; nodes.push(n); } });
    model.members = model.members.filter(function (q) { return map[q.a] != null && map[q.b] != null; }).map(function (q) { return {a: map[q.a], b: map[q.b], m: q.m, s: q.s}; });
    model.nodes = nodes;
    model = B.clean(model);
  }
  cv.addEventListener('pointermove', function (e) {
    var p = pt(e);
    if (pointers[e.pointerId]) pointers[e.pointerId] = p;
    if (pinch) {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.s = Math.max(0.5, Math.min(200, pinch.s * d / (pinch.d || 1)));
      var w0 = [(pinch.mx - W / 2) / pinch.s + pinch.cx, pinch.cy - (pinch.my - H / 2) / pinch.s];
      cam.cx = w0[0] - (mx - W / 2) / cam.s; cam.cy = w0[1] + (my - H / 2) / cam.s;
      dirty(); return;
    }
    if (!drag) {
      if (!sim && e.pointerType !== 'touch') {
        var hn = S.tool === 'build' || S.tool === 'move' || S.tool === 'delete' ? nearestNode(p[0], p[1]) : -1, hm = hn < 0 && S.tool !== 'build' && S.tool !== 'move' ? nearestMember(p[0], p[1]) : -1;
        if (S.tool === 'build' && hn < 0) hm = -1;
        if (hn !== hover.n || hm !== hover.m) { hover = {n: hn, m: hm}; dirty(); }
        if (hm >= 0 && S.tool === 'select') showTip(hm); else hideTip();
      }
      return;
    }
    if (drag.kind === 'pan') { cam.cx = drag.cx - (p[0] - drag.px) / cam.s; cam.cy = drag.cy + (p[1] - drag.py) / cam.s; dirty(); return; }
    if (drag.kind === 'member') {
      if (Math.hypot(p[0] - drag.px, p[1] - drag.py) > 6) drag.moved = true;
      var sp = snapPoint(p[0], p[1], e.shiftKey), dx = sp.x - drag.ax, dy = sp.y - drag.ay, L = Math.hypot(dx, dy), mx2 = B.MATS[S.mat].maxL;
      if (L > mx2) { var k = mx2 / L; sp = {node: -1, x: Math.round((drag.ax + dx * k) * 100) / 100, y: Math.round((drag.ay + dy * k) * 100) / 100}; if (B.inside(model, sp.x, sp.y)) { var o = B.snapOut(model, sp.x, sp.y); sp.x = o.x; sp.y = o.y; } }
      drag.b = sp.node; drag.bx = sp.x; drag.by = sp.y; dirty(); return;
    }
    if (drag.kind === 'move') {
      var s2 = snapPoint(p[0], p[1], e.shiftKey), n = model.nodes[drag.i];
      if (s2.node >= 0 && s2.node !== drag.i) return;
      var w = s2w(p[0], p[1]); if (!e.shiftKey) { w[0] = Math.round(w[0] * 2) / 2; w[1] = Math.round(w[1] * 2) / 2; }
      if (B.inside(model, w[0], w[1])) { var o2 = B.snapOut(model, w[0], w[1]); w = [o2.x, o2.y]; }
      n.x = w[0]; n.y = w[1]; drag.moved = true; reanalyze(); dirty();
    }
  });
  function endPointer(e) {
    delete pointers[e.pointerId];
    if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
    if (!drag) return;
    var d = drag; drag = null;
    if (d.kind === 'member') {
      if (!d.moved) { var mm = nearestMember(d.px, d.py); select(mm); dirty(); return; }
      if (Math.hypot(d.bx - d.ax, d.by - d.ay) < 0.3) { dirty(); return; }
      var a = d.a >= 0 ? d.a : addNode(d.ax, d.ay), b = d.b >= 0 ? d.b : addNode(d.bx, d.by);
      if (a !== b && !model.members.some(function (q) { return (q.a === a && q.b === b) || (q.a === b && q.b === a); })) {
        model.members.push({a: a, b: b, m: S.mat, s: S.sz[S.mat]});
        model = B.clean(model); commit(d.prev);
      }
    } else if (d.kind === 'move' && d.moved) { model = B.clean(model); commit(d.prev); }
    dirty();
  }
  cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('pointerleave', function () { if (hover.n >= 0 || hover.m >= 0) { hover = {n: -1, m: -1}; dirty(); } hideTip(); });
  cv.addEventListener('wheel', function (e) {
    var full = $('#bz-view').classList.contains('mes-pfill');
    if (!e.ctrlKey && !full) return;
    e.preventDefault();
    zoomAt(pt(e), Math.exp(-e.deltaY * 0.0015));
  }, {passive: false});
  function zoomAt(p, f) {
    var w = s2w(p[0], p[1]); cam.s = Math.max(0.5, Math.min(200, cam.s * f));
    cam.cx = w[0] - (p[0] - W / 2) / cam.s; cam.cy = w[1] + (p[1] - H / 2) / cam.s; dirty();
  }
  $('#bz-zin').onclick = function () { zoomAt([W / 2, H / 2], 1.25); };
  $('#bz-zout').onclick = function () { zoomAt([W / 2, H / 2], 0.8); };
  $('#bz-fit').onclick = fit;
  $('#bz-png').onclick = function () { draw(); cv.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mes-bridge.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }); };
  var tipEl = $('#bz-tip');
  function showTip(i) {
    if (!ana || !ana.members[i]) return hideTip();
    var e = model.members[i], r = ana.members[i];
    tipEl.textContent = '#' + (i + 1) + ' ' + B.MATS[e.m].short + ' · ' + r.L.toFixed(1) + ' m · ' + Math.round(r.util * 100) + '% used';
    tipEl.classList.add('is-on');
  }
  function hideTip() { tipEl.classList.remove('is-on'); }

  // ---------- keyboard ----------
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    if (!root.contains(t) && t !== document.body) return;
    var k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ') { if (tag === 'BUTTON') return; e.preventDefault(); spaceDown = true; if (!e.repeat) { spaceTap = performance.now(); } return; }
    var tools = {b: 'build', m: 'move', s: 'select', d: 'delete'};
    if (tools[k.toLowerCase()] && !sim) { setTool(tools[k.toLowerCase()]); return; }
    if (/^[1-6]$/.test(k) && !sim) { setMat(B.MAT_ORDER[+k - 1]); return; }
    if (k === '[') { stepSize(-1); return; } if (k === ']') { stepSize(1); return; }
    if (k === 'f' || k === 'F') { fit(); return; }
    if ((k === 'Delete' || k === 'Backspace') && sel >= 0 && !sim) { e.preventDefault(); delSel(); return; }
    if (k === 'Escape') { if (sel >= 0) select(-1); modeAnim = -1; dirty(); }
  });
  var spaceTap = 0;
  document.addEventListener('keyup', function (e) {
    if (e.key === ' ' && spaceDown) { spaceDown = false; if (performance.now() - spaceTap < 250 && !drag) { if (sim) stopTest(); else startTest(); } }
  });

  // ---------- toolbar ----------
  function setTool(t) { S.tool = t; $$('#bz-tools button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); }); cv.dataset.tool = t; save(); }
  $$('#bz-tools button').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
  var matsEl = $('#bz-mats');
  B.MAT_ORDER.forEach(function (m, i) {
    var M = B.MATS[m], b = document.createElement('button'); b.type = 'button'; b.dataset.mat = m;
    b.title = M.name + ' (' + (i + 1) + ')' + (M.road ? ': cars drive on it' : M.cable ? ': pulls only, never pushes' : '');
    b.innerHTML = '<i style="background:' + (M.road ? (m === 'wroad' ? '#7a5532' : '#3f4652') : M.color) + '"></i>' + esc(M.short);
    b.onclick = function () { setMat(m); };
    matsEl.appendChild(b);
  });
  function setMat(m) {
    S.mat = m; $$('#bz-mats button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mat === m ? 'true' : 'false'); });
    sizeLabel(); save();
    if (sel >= 0 && S.tool === 'select') { var prev = snapshot(); model.members[sel].m = m; model.members[sel].s = Math.min(S.sz[m], B.MATS[m].sizes.length - 1); commit(prev); }
  }
  function sizeLabel() { var si = B.sizeInfo(S.mat, S.sz[S.mat]); $('#bz-sizel').textContent = 'Size ' + (S.sz[S.mat] + 1) + ' · ' + Math.round(si.A * 1e4) + ' cm²'; }
  function stepSize(d) {
    if (sel >= 0 && !sim) { var e = model.members[sel], prev = snapshot(), ns = Math.max(0, Math.min(B.MATS[e.m].sizes.length - 1, e.s + d)); if (ns !== e.s) { e.s = ns; S.sz[e.m] = ns; commit(prev); sizeLabel(); } return; }
    S.sz[S.mat] = Math.max(0, Math.min(B.MATS[S.mat].sizes.length - 1, S.sz[S.mat] + d)); sizeLabel(); save();
  }
  $('#bz-sminus').onclick = function () { stepSize(-1); };
  $('#bz-splus').onclick = function () { stepSize(1); };
  function doUndo() { if (!undo.length || sim) return; redo.push(snapshot()); model = B.decode(undo.pop()); sel = -1; changed(); dirty(); }
  function doRedo() { if (!redo.length || sim) return; undo.push(snapshot()); model = B.decode(redo.pop()); sel = -1; changed(); dirty(); }
  $('#bz-undo').onclick = doUndo; $('#bz-redo').onclick = doRedo;
  function autoSizeNow() {
    if (sim) return;
    var prev = snapshot(), before = B.cost(model).total, a = B.autoSize(model, opts());
    if (a.res.err) { toast(a.res.err === 'mech' ? 'Fix the loose joint first (it is marked red).' : 'This bridge cannot be analysed yet.'); return; }
    model = a.model; commit(prev);
    var after = a.res.cost.total;
    toast((a.weak.length ? a.weak.length + ' members are too weak even at the biggest size. ' : 'Every member now passes. ') + 'Cost ' + money(before) + ' → ' + money(after) + '.');
    dirty();
  }
  $('#bz-auto').onclick = autoSizeNow; $('#bz-auto2').onclick = autoSizeNow;
  $('#bz-colours').onclick = function () { S.colours = !S.colours; this.setAttribute('aria-pressed', S.colours ? 'true' : 'false'); save(); dirty(); };

  // ---------- member info ----------
  var infoEl = $('#bz-info');
  function select(i) { sel = i; renderInfo(); dirty(); }
  function delSel() { if (sel < 0) return; var prev = snapshot(); model.members.splice(sel, 1); tidy(); sel = -1; renderInfo(); commit(prev); dirty(); }
  function renderInfo() {
    if (sel < 0 || sel >= model.members.length || sim) { infoEl.hidden = true; return; }
    var e = model.members[sel], M = B.MATS[e.m], si = B.sizeInfo(e.m, e.s), L = B.memberLen(model, e), r = ana && ana.members ? ana.members[sel] : null, cap = B.capacity(e.m, e.s, L);
    var opts2 = B.MAT_ORDER.map(function (m) { return '<option value="' + m + '"' + (m === e.m ? ' selected' : '') + '>' + esc(B.MATS[m].short) + '</option>'; }).join('');
    var h = '<div class="bz-ih"><b>Member ' + (sel + 1) + '</b><button type="button" data-a="x" aria-label="Close">✕</button></div>' +
      '<div class="bz-irow"><select data-a="mat" aria-label="Material">' + opts2 + '</select><button type="button" data-a="sm" aria-label="Smaller">−</button><span>Size ' + (e.s + 1) + '/' + M.sizes.length + '</span><button type="button" data-a="sp" aria-label="Bigger">+</button></div>' +
      '<dl><dt>Length</dt><dd>' + L.toFixed(2) + ' m' + (L > M.maxL ? ' <em class="bz-bad">longer than ' + M.maxL + ' m</em>' : '') + '</dd>' +
      '<dt>Section</dt><dd>' + Math.round(si.A * 1e4) + ' cm²' + (M.cable ? ', ' + Math.round(si.b * 1000) + ' mm cable' : ', ' + Math.round(si.b * 1000) + ' mm ' + (M.shape === 'box' ? 'box' : 'square')) + ', ' + Math.round(si.kgm) + ' kg/m</dd>' +
      '<dt>Can pull</dt><dd>' + kN(cap.T) + '</dd><dt>Can push</dt><dd>' + (M.cable ? 'nothing (a cable goes slack)' : kN(cap.C) + ' before it buckles') + '</dd>';
    if (r) h += '<dt>Weight alone</dt><dd>' + (r.Nd >= 0 ? 'pulls ' : 'pushes ') + kN(Math.abs(r.Nd)) + '</dd><dt>Worst pull</dt><dd>' + (r.Tmax > 0 ? kN(r.Tmax) : '–') + '</dd><dt>Worst push</dt><dd>' + (r.Cmax < 0 ? kN(-r.Cmax) : '–') + '</dd>' +
      '<dt>Used</dt><dd><b style="color:' + utilCol(r.util) + '">' + (isFinite(r.util) ? Math.round(r.util * 100) + '%' : 'fails') + '</b> (' + esc(r.gov) + ', safety factor ' + S.sf + ')</dd>';
    h += '<dt>Cost</dt><dd>' + money(M.rho * si.A * L * M.cost + (M.cable ? B.CABLE_PIECE : B.PIECE_COST) + (M.deckCost || 0) * L) + '</dd></dl><button type="button" data-a="del" class="bz-del">🗑 Delete member</button>';
    infoEl.innerHTML = h; infoEl.hidden = false;
  }
  infoEl.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-a]'); if (!a || sel < 0) return;
    var act = a.dataset.a;
    if (act === 'x') select(-1); else if (act === 'sm') stepSize(-1); else if (act === 'sp') stepSize(1); else if (act === 'del') delSel();
  });
  infoEl.addEventListener('change', function (ev) {
    if (ev.target.dataset.a !== 'mat' || sel < 0) return;
    var prev = snapshot(), e = model.members[sel], m = ev.target.value; e.m = m; e.s = Math.min(S.sz[m], B.MATS[m].sizes.length - 1); commit(prev); dirty();
  });

  // ---------- readouts ----------
  var roEl = $('#bz-ro'), badge = $('#bz-badge');
  function ro(items) { roEl.innerHTML = items.map(function (it) { return '<div class="bz-ro' + (it.cls ? ' bz-ro--' + it.cls : '') + '"><span>' + it.k + '</span><b>' + it.v + '</b>' + (it.s ? '<small>' + it.s + '</small>' : '') + '</div>'; }).join(''); }
  function problems() {
    var out = [];
    if (!ana) return out;
    if (ana.err === 'empty') out.push('Drag on the picture to draw your first member, or pick a design below.');
    else if (ana.err === 'noanchor') out.push('Nothing holds it up: put a joint on a bank (it becomes an anchor).');
    else if (ana.err === 'mech') out.push('Joint ' + (ana.mechNode + 1) + ' (red) can still swing about: add a member to make a triangle.');
    (ana.warnings || []).forEach(function (w) {
      if (w.k === 'noroad') out.push('No road yet: draw the deck with a road material (dark steel or timber deck).');
      if (w.k === 'gap') out.push('The road has a gap near ' + w.x.toFixed(0) + ' m: cars would fall in.');
      if (w.k === 'step') out.push('The road does not meet the bank at ' + (w.x ? 'the right' : 'the left') + ' end.');
      if (w.k === 'steep') out.push('Road member ' + (w.i + 1) + ' is steeper than 15 %.');
      if (w.k === 'long') out.push('Member ' + (w.i + 1) + ' is longer than its material allows (dashed red).');
    });
    if (!ana.err && ana.worst > 1) { var nbad = ana.members.filter(function (r) { return r.util > 1; }).length; out.push(nbad + ' member' + (nbad > 1 ? 's are' : ' is') + ' too weak: make ' + (nbad > 1 ? 'them' : 'it') + ' bigger or press ⚡ Auto-size.'); }
    return out;
  }
  function refresh() {
    var c = ana ? ana.cost : B.cost(model), pr = problems();
    var lvl = S.level ? B.LEVELS.filter(function (l) { return l.id === S.level; })[0] : null;
    if (sim) badge.innerHTML = lvl ? '<span class="bz-lvl">🏆 ' + esc(lvl.name) + '</span>' : '';
    else badge.innerHTML = (lvl ? '<span class="bz-lvl">🏆 ' + esc(lvl.name) + ': ' + money(c.total) + ' of ' + money(lvl.budget) + '</span>' : '') + (pr.length ? '<span class="bz-warn">⚠ ' + esc(pr[0]) + (pr.length > 1 ? ' (+' + (pr.length - 1) + ' more)' : '') + '</span>' : (ana && ana.ok ? '<span class="bz-good">✓ Every member passes</span>' : ''));
    if (!sim) {
      var it = [{k: 'Cost', v: money(c.total), s: c.nJoint + ' joints · ' + model.members.length + ' pieces · ' + c.nAnchor + ' anchors', cls: lvl ? (c.total <= lvl.budget ? 'ok' : 'bad') : ''},
        {k: 'Weight', v: (c.mass / 1000).toFixed(1) + ' t', s: 'deck included'}];
      if (ana && !ana.err) {
        var w = ana.members[ana.worstI];
        it.push({k: 'Hardest-working member', v: isFinite(ana.worst) ? Math.round(ana.worst * 100) + '%' : 'fails', s: w ? '#' + (ana.worstI + 1) + ', ' + w.gov + ', ' + (w.mode === 'tension' ? 'pulling' : w.mode === 'slack' ? 'cable pushed' : 'buckling') : '', cls: ana.worst > 1 ? 'bad' : 'ok'});
        if (ana.liveDefl > 0) it.push({k: 'Sag under traffic', v: Math.round(ana.liveDefl * 1000) + ' mm', s: 'span / ' + Math.round(model.span / ana.liveDefl) + ' (aim: span / 400 or less)', cls: ana.liveDefl > ana.deflLimit ? 'bad' : 'ok'});
        if (ana.modes && ana.modes[0]) it.push({k: 'Lowest frequency', v: ana.modes[0].f.toFixed(2) + ' Hz', s: ana.modes[0].py >= ana.modes[0].px ? 'up and down' : 'swaying along'});
      }
      ro(it);
    }
    renderInfo(); renderModes(); if (curTab === 'check') renderCheck(); if (curTab === 'levels') renderLevels();
    dirty();
  }
  function liveReadouts() {
    var s = sim, nv = s.veh.length;
    var it = [{k: 'Time', v: s.t.toFixed(1) + ' s', s: S.slow != 1 ? 'playing at ' + S.slow + '×' : ''}];
    if (nv) it.push({k: 'Vehicles', v: s.crossed + ' / ' + nv + ' across', s: s.fell ? s.fell + ' fell in' : '', cls: s.fell ? 'bad' : ''});
    it.push({k: 'Members now', v: Math.round((s.util || 0) * 100) + '%', s: 'peak ' + Math.round(s.maxUtil * 100) + '% of their strength', cls: s.maxUtil > 1 ? 'bad' : s.maxUtil > 0.8 ? 'warn' : 'ok'});
    if (s.broken) it.push({k: 'Broken', v: s.broken, s: s.events.filter(function (e) { return e.k != null; }).slice(-1).map(function (e) { return '#' + (e.k + 1) + ' ' + e.how + ' at ' + e.t.toFixed(1) + ' s'; })[0] || '', cls: 'bad'});
    it.push({k: 'Mid-span movement', v: Math.round(s.midDefl() * 1000) + ' mm'});
    if (s.quake) it.push({k: 'Ground', v: (s.quake.a(s.t) / B.G).toFixed(2) + ' g', s: 'moved ' + Math.round(s.gu * 100) + ' cm'});
    if (s.wind) it.push({k: 'Wind', v: Math.round(s.Unow || s.wind.U) + ' m/s', s: s.lock ? 'vortices lock on at ' + s.fs.toFixed(2) + ' Hz!' : 'vortices at ' + s.fs.toFixed(2) + ' Hz'});
    ro(it);
  }

  // ---------- test runs ----------
  var resEl = $('#bz-result');
  stage.appendChild(resEl); // the result card floats over the picture, so it never takes height from it
  function startTest() {
    if (sim) stopTest();
    if (!ana) reanalyze(true);
    select(-1); modeAnim = -1;
    var tr = S.nveh > 0 ? {veh: S.veh, n: S.nveh, gap: S.vgap, speed: S.speed} : null;
    sim = new B.Sim(model, {analysis: ana && !ana.err ? ana : null, traffic: tr,
      wind: S.wind > 0 ? {U: S.wind, gust: S.gust / 100, vortex: S.vortex, dur: tr ? 6 : 20} : null,
      quake: S.pga > 0 ? {pga: S.pga, type: S.qtype, dur: S.qdur, vert: S.qvert} : null});
    paused = false; hist = []; seenEv = 0; fx = []; finishedShown = false; last = 0;
    refresh();
    $('#bz-go').hidden = true; $('#bz-stop').hidden = false; $('#bz-pause').hidden = false; $('#bz-pause').setAttribute('aria-pressed', 'false'); $('#bz-pause').textContent = '❚❚ Pause';
    $('#bz-bar').classList.add('is-off'); $('#bz-chartw').hidden = false; resEl.hidden = true;
    resizeChart(); dirty();
  }
  function stopTest() {
    sim = null; paused = false; fx = []; resEl.hidden = true;
    $('#bz-go').hidden = false; $('#bz-stop').hidden = true; $('#bz-pause').hidden = true;
    $('#bz-bar').classList.remove('is-off'); $('#bz-chartw').hidden = true;
    refresh(); dirty();
  }
  $('#bz-go').onclick = startTest; $('#bz-go2').onclick = function () { startTest(); $('#bz-view').scrollIntoView({behavior: 'smooth', block: 'start'}); };
  $('#bz-stop').onclick = stopTest;
  $('#bz-pause').onclick = function () { paused = !paused; this.setAttribute('aria-pressed', paused ? 'true' : 'false'); this.textContent = paused ? '▶ Play' : '❚❚ Pause'; last = 0; dirty(); };
  $('#bz-slow').onchange = function () { S.slow = +this.value; save(); };
  function showResult() {
    var s = sim, nv = s.veh.length, ok = !s.broken && s.fell === 0 && s.crossed === nv;
    var c = B.cost(model), lvl = S.level ? B.LEVELS.filter(function (l) { return l.id === S.level; })[0] : null, starHtml = '';
    if (lvl && settingsMatch(lvl)) {
      var stars = ok ? (c.total <= lvl.budget * 0.75 ? 3 : c.total <= lvl.budget * 0.9 ? 2 : c.total <= lvl.budget ? 1 : 0) : 0;
      if (stars > (S.stars[lvl.id] || 0)) { S.stars[lvl.id] = stars; save(); }
      starHtml = '<p class="bz-stars">' + (stars ? '★★★'.slice(0, stars) + '☆☆☆'.slice(stars) + ' Challenge passed!' : (ok ? 'It holds, but it costs ' + money(c.total) + ': over the ' + money(lvl.budget) + ' budget.' : 'Challenge not passed yet.')) + '</p>';
    }
    var ev = s.events.filter(function (e) { return e.k != null; })[0];
    resEl.className = 'bz-result ' + (ok ? 'is-ok' : 'is-bad');
    resEl.innerHTML = '<b>' + (ok ? '✓ The bridge held.' : '✗ The bridge failed.') + '</b> ' +
      (nv ? s.crossed + ' of ' + nv + ' vehicles made it across' + (s.fell ? ', ' + s.fell + ' fell into the gorge' : '') + '. ' : '') +
      (s.broken ? s.broken + ' member' + (s.broken > 1 ? 's' : '') + ' broke; the first was #' + (ev.k + 1) + ' (' + B.MATS[model.members[ev.k].m].short.toLowerCase() + '), which ' + ev.how + ' at ' + ev.t.toFixed(1) + ' s. ' : '') +
      'The hardest-working member reached ' + Math.round(s.maxUtil * 100) + '% of its strength. ' + starHtml +
      '<span class="bz-rbtn"><button type="button" class="tu-btn" data-r="again">↻ Run again</button><button type="button" class="tu-btn tu-btn--ghost" data-r="back">Back to building</button></span>';
    resEl.hidden = false;
  }
  resEl.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (!b) return; if (b.dataset.r === 'again') startTest(); else stopTest(); });
  function settingsMatch(l) {
    var t = l.traffic;
    return S.span === l.span && S.gap === l.gap && S.veh === t.veh && S.nveh >= t.n && S.speed >= t.speed - 1 && S.wind >= (l.wind ? l.wind.U : 0) && S.pga >= (l.quake ? l.quake.pga : 0);
  }
  // live chart
  var ch = $('#bz-chart'), cctx = ch.getContext('2d'), CW = 600, CH = 120;
  function resizeChart() { CW = ch.parentNode.clientWidth || 600; CH = $('#bz-view').classList.contains('mes-pfill') ? 80 : 120; var d = Math.min(2, window.devicePixelRatio || 1); ch.width = CW * d; ch.height = CH * d; ch.style.height = CH + 'px'; cctx.setTransform(d, 0, 0, d, 0, 0); }
  function drawChart() {
    var c = cctx, dk = dark(); c.clearRect(0, 0, CW, CH);
    c.fillStyle = dk ? '#151a23' : '#f6f8fb'; c.fillRect(0, 0, CW, CH);
    if (hist.length < 2) return;
    var tmax = Math.max(10, hist[hist.length - 1].t), dmax = 0.005, amax = 0.05;
    hist.forEach(function (h) { dmax = Math.max(dmax, Math.abs(h.d)); amax = Math.max(amax, Math.abs(h.a)); });
    var X = function (t) { return 40 + (CW - 50) * t / tmax; };
    c.strokeStyle = dk ? '#2b3240' : '#dde3ea'; c.beginPath(); c.moveTo(40, CH / 2); c.lineTo(CW - 10, CH / 2); c.stroke();
    function line(get, mx, col) { c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); hist.forEach(function (h, i) { var y = CH / 2 - get(h) / mx * (CH / 2 - 14); if (i) c.lineTo(X(h.t), y); else c.moveTo(X(h.t), y); }); c.stroke(); }
    if (sim && sim.quake) line(function (h) { return h.a; }, amax, '#e8833a');
    line(function (h) { return h.d; }, dmax, '#3b82f6');
    c.fillStyle = dk ? '#cdd5e0' : '#3a4352'; c.font = '11px system-ui, sans-serif'; c.textAlign = 'left';
    c.fillText('mid-span ±' + Math.round(dmax * 1000) + ' mm', 44, 12);
    if (sim && sim.quake) { c.fillStyle = '#e8833a'; c.fillText('ground ±' + amax.toFixed(2) + ' g', 180, 12); }
    c.fillStyle = dk ? '#8b95a5' : '#6b7584'; c.textAlign = 'right'; c.fillText(tmax.toFixed(0) + ' s', CW - 10, CH - 4);
  }

  // ---------- tabs ----------
  var curTab = S.tab || 'build';
  function setTab(t) {
    curTab = t; S.tab = t; save();
    $$('.bz-tabs [role=tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    $$('.bz-panel').forEach(function (p) { p.hidden = p.dataset.panel !== t; });
    if (t === 'check') renderCheck(); if (t === 'levels') renderLevels();
  }
  $$('.bz-tabs [role=tab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

  // ---------- build panel ----------
  function bindRange(id, key, fmt, after) {
    var el = $('#' + id), out = $('#' + id + '-v');
    el.value = S[key]; if (out) out.textContent = fmt(S[key]);
    el.addEventListener('input', function () { S[key] = +el.value; if (out) out.textContent = fmt(S[key]); if (after) after(true); });
    el.addEventListener('change', function () { save(); if (after) after(false); });
    return el;
  }
  function siteChanged(live) {
    model.span = S.span; model.gap = S.gap;
    if (!live) { S.level = null; fit(); reanalyze(); save(); } else dirty();
  }
  bindRange('bz-span', 'span', function (v) { return v + ' m'; }, function (live) { if (!live) { var prev = snapshot(); scaleTo(); commit(prev); } else siteChanged(true); });
  bindRange('bz-gap', 'gap', function (v) { return v + ' m'; }, siteChanged);
  function scaleTo() { // keep the design: stretch it to the new span
    var old = model.span, k = S.span / old;
    if (Math.abs(k - 1) < 1e-9) return siteChanged(false);
    model.nodes.forEach(function (n) { n.x = Math.round(n.x * k * 100) / 100; });
    siteChanged(false);
  }
  $('#bz-ca1').textContent = money(B.BANK_ANCHOR); $('#bz-ca2').textContent = money(B.BED_ANCHOR);
  var typeSel = $('#bz-type');
  B.TYPES.forEach(function (t) { var o = document.createElement('option'); o.value = t[0]; o.textContent = t[1]; typeSel.appendChild(o); });
  typeSel.value = S.type;
  var depthEl = $('#bz-depth'), panEl = $('#bz-pan');
  function syncDesign(resetDepth) {
    if (resetDepth) S.depth = Math.round(B.defaultDepth(S.type, S.span) * 2) / 2;
    depthEl.max = Math.max(4, Math.round(S.span * (S.type === 'stayed' ? 0.5 : 0.4)));
    depthEl.value = S.depth; $('#bz-depth-v').textContent = S.depth + ' m (span / ' + (S.span / S.depth).toFixed(1) + ')';
    var np = B.panelsFor(S.type, S.span, S.depth); if (!S.pan) panEl.value = np; else panEl.value = S.pan;
    $('#bz-pan-v').textContent = (S.pan || np) + (S.pan ? '' : ' (automatic)') + ', ' + (S.span / (S.pan || np)).toFixed(1) + ' m each';
  }
  typeSel.onchange = function () { S.type = typeSel.value; S.pan = 0; syncDesign(true); save(); };
  depthEl.oninput = function () { S.depth = +depthEl.value; S.pan = 0; syncDesign(false); };
  panEl.oninput = function () { S.pan = +panEl.value; syncDesign(false); };
  $('#bz-make').onclick = function () { makeDesign(S.type); };
  function makeDesign(type) {
    if (sim) stopTest();
    var prev = snapshot(), m = B.template(type, S.span, S.gap, S.depth, S.pan || 0);
    if ($('#bz-makeauto').checked) { var a = B.autoSize(m, opts()); if (!a.res.err) m = a.model; }
    model = m; sel = -1; commit(prev); fit();
  }
  $('#bz-clear').onclick = function () { if (sim) stopTest(); var prev = snapshot(); model = {span: S.span, gap: S.gap, nodes: [], members: []}; sel = -1; commit(prev); dirty(); };
  // type thumbnails
  var th = $('#bz-thumbs');
  B.TYPES.forEach(function (t) {
    var m = B.template(t[0], 30, 14, B.defaultDepth(t[0], 30)), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    m.nodes.forEach(function (n) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    x0 = Math.min(x0, -2); x1 = Math.max(x1, 32); y0 = Math.min(y0, -1); y1 = Math.max(y1, 2);
    var vb = (x0 - 1) + ' ' + (-y1 - 1) + ' ' + (x1 - x0 + 2) + ' ' + (y1 - y0 + 2);
    var lines = m.members.map(function (e) { var a = m.nodes[e.a], b = m.nodes[e.b], M = B.MATS[e.m]; return '<line x1="' + a.x + '" y1="' + (-a.y) + '" x2="' + b.x + '" y2="' + (-b.y) + '" stroke="' + (M.road ? 'currentColor' : M.color) + '" stroke-width="' + (M.road ? 1.1 : M.cable ? 0.35 : 0.7) + '" stroke-linecap="round"/>'; }).join('');
    var b = document.createElement('button'); b.type = 'button'; b.title = t[1];
    b.innerHTML = '<svg viewBox="' + vb + '" aria-hidden="true"><rect x="' + (x0 - 1) + '" y="0" width="' + (1 - x0) + '" height="' + (y1 - y0 + 2) + '" class="bz-tg"/><rect x="30" y="0" width="' + (x1 - 29) + '" height="' + (y1 - y0 + 2) + '" class="bz-tg"/>' + lines + '</svg><span>' + esc(t[1]) + '</span>';
    b.onclick = function () { S.type = t[0]; typeSel.value = t[0]; S.pan = 0; syncDesign(true); makeDesign(t[0]); };
    th.appendChild(b);
  });

  // ---------- test panel ----------
  var vehSel = $('#bz-veh');
  Object.keys(B.VEH).forEach(function (k) { var V = B.VEH[k], o = document.createElement('option'); o.value = k; o.textContent = V.name + ' (' + (V.m / 1000).toFixed(1).replace('.0', '') + ' t)'; vehSel.appendChild(o); });
  vehSel.value = S.veh; vehSel.onchange = function () { S.veh = vehSel.value; save(); reanalyze(); };
  function designChange() { reanalyze(); windNote(); }
  bindRange('bz-nveh', 'nveh', function (v) { return v; }, designChange);
  bindRange('bz-vgap', 'vgap', function (v) { return v + ' m'; }, designChange);
  bindRange('bz-speed', 'speed', function (v) { return v + ' km/h'; });
  bindRange('bz-wind', 'wind', function (v) { return v + ' m/s (' + Math.round(v * 3.6) + ' km/h)' + (v >= 33 ? ' hurricane' : v >= 25 ? ' storm' : v >= 14 ? ' strong' : ''); }, designChange);
  bindRange('bz-gust', 'gust', function (v) { return v + ' %'; });
  bindRange('bz-pga', 'pga', function (v) { return v.toFixed(2) + ' g' + (v >= 0.6 ? ' (very strong)' : v >= 0.3 ? ' (strong)' : v > 0 ? '' : ' (off)'); }, designChange);
  bindRange('bz-qdur', 'qdur', function (v) { return v + ' s'; });
  var vx = $('#bz-vortex'); vx.checked = S.vortex; vx.onchange = function () { S.vortex = vx.checked; save(); };
  var qv = $('#bz-qvert'); qv.checked = S.qvert; qv.onchange = function () { S.qvert = qv.checked; save(); };
  var qt = $('#bz-qtype'); Object.keys(B.QUAKES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = B.QUAKES[k].name; qt.appendChild(o); }); qt.value = S.qtype; qt.onchange = function () { S.qtype = qt.value; save(); };
  $('#bz-slow').value = String(S.slow);
  function windNote() {
    var el = $('#bz-windnote'); if (!S.wind) { el.textContent = 'Wind across the deck lifts it and sheds swirling vortices that push it up and down.'; return; }
    var fs = 0.12 * S.wind / B.DECK_D, m = ana && ana.modes ? ana.modes.filter(function (q) { return q.py > 0.02 && Math.abs(fs - q.f) / q.f < 0.2; })[0] : null;
    el.textContent = 'Vortices leave the deck about ' + fs.toFixed(2) + ' times a second.' + (m ? ' That is close to a natural frequency of this bridge (' + m.f.toFixed(2) + ' Hz): expect it to bounce!' : '');
  }
  function renderModes() {
    var el = $('#bz-modes'); if (!ana || !ana.modes || !ana.modes.length) { el.innerHTML = '<span class="tu-note">Build a stable bridge to see its vibration modes.</span>'; return; }
    el.innerHTML = ana.modes.slice(0, 4).map(function (m, i) { return '<button type="button" class="bz-mode" data-m="' + i + '" aria-pressed="' + (modeAnim === i) + '">Mode ' + (i + 1) + ': ' + m.f.toFixed(2) + ' Hz<small>' + (m.py >= m.px ? 'up and down' : 'swaying along') + ' · ' + (1 / m.f).toFixed(2) + ' s per swing</small></button>'; }).join('');
    windNote();
  }
  $('#bz-modes').addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (!b || sim) return; var i = +b.dataset.m; modeAnim = modeAnim === i ? -1 : i; t0 = performance.now(); renderModes(); dirty(); });

  // ---------- check panel ----------
  var sfSel = $('#bz-sf'); sfSel.value = String(S.sf); sfSel.onchange = function () { S.sf = +sfSel.value; save(); reanalyze(); };
  var sortKey = 'util', sortDir = -1, hlRow = -1;
  function kindOf(i) {
    var e = model.members[i], M = B.MATS[e.m], a = model.nodes[e.a], b = model.nodes[e.b];
    if (M.road) return 'Road deck'; if (M.cable) return Math.abs(a.x - b.x) < 0.3 ? 'Hanger' : 'Cable';
    if (Math.abs(a.x - b.x) < 0.05) return 'Vertical'; if (Math.abs(a.y - b.y) < 0.05) return 'Chord'; return 'Diagonal';
  }
  function renderCheck() {
    var sum = $('#bz-summary'), tab = $('#bz-table'), cb = $('#bz-costbar');
    var c = ana ? ana.cost : B.cost(model);
    var parts = [['Steel', (c.byMat.steel || 0) + (c.byMat.road || 0) - (model.members.filter(function (e) { return e.m === 'road'; }).reduce(function (s, e) { return s + B.MATS.road.deckCost * B.memberLen(model, e); }, 0)), '#e0612a'],
      ['Timber', (c.byMat.wood || 0) + (c.byMat.wroad || 0) - model.members.filter(function (e) { return e.m === 'wroad'; }).reduce(function (s, e) { return s + B.MATS.wroad.deckCost * B.memberLen(model, e); }, 0), '#b07a3f'],
      ['Cables', c.byMat.cable || 0, '#9aa7b6'], ['Concrete', c.byMat.conc || 0, '#7b838c'], ['Deck slab', c.deck, '#3f4652'], ['Joints', c.joints, '#d4a017'], ['Foundations', c.anchors, '#5e8c4a']].filter(function (p) { return p[1] > 0.5; });
    cb.innerHTML = '<div class="bz-cbar">' + parts.map(function (p) { return '<i style="width:' + (100 * p[1] / c.total).toFixed(2) + '%;background:' + p[2] + '" title="' + p[0] + ': ' + money(p[1]) + '"></i>'; }).join('') + '</div><div class="bz-clegend">' + parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + p[0] + ' ' + money(p[1]) + ' (' + Math.round(100 * p[1] / c.total) + '%)</span>'; }).join('') + '</div>';
    if (!ana || ana.err) { sum.innerHTML = '<p class="tu-note">' + esc(problems()[0] || 'Nothing to check yet.') + '</p>'; tab.innerHTML = ''; return; }
    var nbad = ana.members.filter(function (r) { return r.util > 1; }).length;
    sum.innerHTML = '<p><b>' + money(c.total) + '</b> · ' + (c.mass / 1000).toFixed(1) + ' t · ' + (nbad ? '<span class="bz-bad">' + nbad + ' member' + (nbad > 1 ? 's fail' : ' fails') + '</span>' : '<span class="bz-ok">every member passes</span>') +
      ' with a safety factor of ' + S.sf + ' for ' + S.nveh + ' × ' + B.VEH[S.veh].name.toLowerCase() + (S.wind ? ', ' + S.wind + ' m/s wind' : '') + (S.pga ? ', a ' + S.pga + ' g earthquake (designed for ' + (ana.quakeAccel / B.G).toFixed(2) + ' g sideways after resonance amplification)' : '') + '.</p>';
    var rows = ana.members.map(function (r, i) { return {i: i, r: r, e: model.members[i]}; });
    var get = {i: function (q) { return q.i; }, kind: function (q) { return kindOf(q.i); }, mat: function (q) { return q.e.m; }, L: function (q) { return q.r.L; }, T: function (q) { return q.r.Tmax; }, C: function (q) { return -q.r.Cmax; }, util: function (q) { return isFinite(q.r.util) ? q.r.util : 99; }}[sortKey];
    rows.sort(function (a, b) { var x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    var head = [['i', '#'], ['kind', 'What'], ['mat', 'Material, size'], ['L', 'Length'], ['T', 'Worst pull'], ['C', 'Worst push'], ['util', 'Used']];
    tab.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th><button type="button" data-k="' + h[0] + '">' + h[1] + (sortKey === h[0] ? (sortDir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }).join('') + '<th>Strength (pull / push)</th><th>Worst case</th></tr></thead><tbody>' +
      rows.map(function (q) {
        var r = q.r, M = B.MATS[q.e.m], u = r.util, pct = isFinite(u) ? Math.round(u * 100) : 999;
        return '<tr data-i="' + q.i + '"' + (q.i === sel ? ' class="is-sel"' : '') + '><td>' + (q.i + 1) + '</td><td>' + kindOf(q.i) + '</td><td>' + esc(M.short) + ' ' + (q.e.s + 1) + ' <small>(' + Math.round(r.A * 1e4) + ' cm²)</small></td><td>' + r.L.toFixed(1) + ' m</td><td>' + (r.Tmax > 0 ? kN(r.Tmax) : '–') + '</td><td>' + (r.Cmax < 0 ? kN(-r.Cmax) : '–') + '</td>' +
          '<td><span class="bz-ubar"><i style="width:' + Math.min(100, pct) + '%;background:' + utilCol(u) + '"></i></span><b class="' + (u > 1 ? 'bz-bad' : '') + '">' + (pct >= 999 ? 'fails' : pct + '%') + '</b></td><td>' + kN(r.cap.T) + ' / ' + (M.cable ? '0' : kN(r.cap.C)) + '</td><td>' + esc(r.gov) + ' · ' + (r.mode === 'tension' ? 'pull' : r.mode === 'slack' ? 'cable pushed' : 'buckling') + '</td></tr>';
      }).join('') + '</tbody>';
  }
  $('#bz-table').addEventListener('click', function (e) {
    var h = e.target.closest('th button'); if (h) { var k = h.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'i' || k === 'kind' || k === 'mat' ? 1 : -1; } renderCheck(); return; }
    var tr = e.target.closest('tr[data-i]'); if (tr) { setTool('select'); select(+tr.dataset.i); renderCheck(); $('#bz-view').scrollIntoView({behavior: 'smooth', block: 'nearest'}); }
  });
  $('#bz-table').addEventListener('mouseover', function (e) { var tr = e.target.closest('tr[data-i]'); var i = tr ? +tr.dataset.i : -1; if (i !== hlRow) { hlRow = i; dirty(); } });
  $('#bz-table').addEventListener('mouseleave', function () { hlRow = -1; dirty(); });
  $('#bz-csv').onclick = function () {
    if (!ana || ana.err) return;
    var lines = ['#\tWhat\tMaterial\tSize\tArea cm2\tLength m\tWorst pull kN\tWorst push kN\tUsed %\tWorst case'];
    ana.members.forEach(function (r, i) { var e = model.members[i]; lines.push([i + 1, kindOf(i), B.MATS[e.m].short, e.s + 1, Math.round(r.A * 1e4), r.L.toFixed(2), (Math.max(0, r.Tmax) / 1000).toFixed(1), (Math.max(0, -r.Cmax) / 1000).toFixed(1), isFinite(r.util) ? Math.round(r.util * 100) : 'fails', r.gov].join('\t')); });
    navigator.clipboard.writeText(lines.join('\n')).then(function () { toast('Copied ' + ana.members.length + ' members (paste into a spreadsheet).'); }, function () { toast('Copy failed.'); });
  };

  // ---------- cheapest ----------
  var cheapRows = [], cheapBusy = false;
  $('#bz-findcheap').onclick = function () {
    if (cheapBusy) return; cheapBusy = true;
    var jobs = [], st = $('#bz-cheapst'), o = opts(), Sp = S.span, Gp = S.gap;
    B.TYPES.forEach(function (t) {
      var rs = t[0] === 'stayed' ? [3, 4, 5, 6] : t[0] === 'suspension' ? [30, 45, 60] : [3, 4, 5, 6, 8, 10, 12];
      rs.forEach(function (r) { jobs.push([t[0], r]); });
    });
    cheapRows = []; var i = 0;
    function next() {
      if (i >= jobs.length) { cheapBusy = false; st.textContent = cheapRows.length ? cheapRows.filter(function (r) { return r.ok; }).length + ' designs pass.' : 'No design fits this site.'; renderCheap(); return; }
      var t0c = performance.now();
      while (i < jobs.length && performance.now() - t0c < 40) {
        var j = jobs[i++], type = j[0], h = Sp / j[1];
        if ((type === 'deck' || type === 'arch') && h > Gp * 0.9 * (type === 'arch' ? 2 : 1)) continue;
        if (type !== 'stayed' && type !== 'suspension' && type !== 'tiedarch' && h > 30) continue;
        var m = B.template(type, Sp, Gp, h);
        if (m.members.some(function (e) { return B.memberLen(m, e) > B.MATS[e.m].maxL + 1e-6; })) continue;
        var a = B.autoSize(m, o); if (a.res.err) continue;
        cheapRows.push({type: type, ratio: j[1], h: h, n: m.members.length, cost: a.res.cost.total, ok: a.res.ok, model: a.model, f1: a.res.modes && a.res.modes[0] ? a.res.modes[0].f : null});
      }
      st.textContent = 'Designing… ' + Math.round(100 * i / jobs.length) + '%';
      renderCheap(); setTimeout(next, 0);
    }
    next();
  };
  function typeName(t) { return (B.TYPES.filter(function (q) { return q[0] === t; })[0] || [t, t])[1]; }
  var TCOL = {warren: '#e0612a', warrenv: '#f59e0b', pratt: '#2563eb', howe: '#7c3aed', k: '#db2777', parker: '#0891b2', deck: '#16a34a', arch: '#92400e', tiedarch: '#dc2626', stayed: '#475569', suspension: '#0f766e'};
  function renderCheap() {
    var ok = cheapRows.filter(function (r) { return r.ok; }).sort(function (a, b) { return a.cost - b.cost; }), box = $('#bz-cheapchart'), tab = $('#bz-cheaptab');
    if (!ok.length) { box.innerHTML = ''; tab.innerHTML = ''; return; }
    var w = Math.max(340, Math.min(1000, box.clientWidth || 760)), h = Math.round(Math.max(240, Math.min(340, w * 0.42))), pl = 70, pb = 38, hmax = 0, cmin = Infinity, cmax = 0;
    ok.forEach(function (r) { hmax = Math.max(hmax, r.h); cmin = Math.min(cmin, r.cost); cmax = Math.max(cmax, r.cost); });
    cmax = Math.min(cmax, cmin * 3.5);
    var X = function (v) { return pl + (w - pl - 12) * v / (hmax * 1.05); }, Y = function (v) { return h - pb - (h - pb - 12) * (Math.min(v, cmax) - cmin * 0.9) / (cmax - cmin * 0.9 || 1); };
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Cost of each bridge type against its height">';
    for (var k = 0; k <= 4; k++) { var cv2 = cmin * 0.9 + (cmax - cmin * 0.9) * k / 4, y = Y(cv2); svg += '<line x1="' + pl + '" x2="' + (w - 12) + '" y1="' + y + '" y2="' + y + '" class="bz-gl"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="bz-ax">' + money(cv2) + '</text>'; }
    for (k = 0; k <= 5; k++) { var hv = hmax * 1.05 * k / 5; svg += '<text x="' + X(hv) + '" y="' + (h - 16) + '" text-anchor="middle" class="bz-ax">' + hv.toFixed(0) + ' m</text>'; }
    svg += '<text x="' + (pl + (w - pl) / 2) + '" y="' + (h - 1) + '" text-anchor="middle" class="bz-ax">height of the bridge structure</text>';
    var byType = {}; ok.forEach(function (r) { (byType[r.type] = byType[r.type] || []).push(r); });
    Object.keys(byType).forEach(function (t) {
      var rs = byType[t].sort(function (a, b) { return a.h - b.h; });
      svg += '<polyline fill="none" stroke="' + TCOL[t] + '" stroke-width="2" points="' + rs.map(function (r) { return X(r.h) + ',' + Y(r.cost); }).join(' ') + '"/>';
      rs.forEach(function (r) { svg += '<circle cx="' + X(r.h) + '" cy="' + Y(r.cost) + '" r="' + (r === ok[0] ? 7 : 4) + '" fill="' + TCOL[t] + '" data-c="' + cheapRows.indexOf(r) + '" class="bz-pt"><title>' + esc(typeName(t)) + ', ' + r.h.toFixed(1) + ' m high: ' + money(r.cost) + '</title></circle>'; });
    });
    svg += '</svg><div class="bz-clegend">' + Object.keys(byType).map(function (t) { return '<span><i style="background:' + TCOL[t] + '"></i>' + esc(typeName(t)) + '</span>'; }).join('') + '</div>';
    box.innerHTML = svg;
    tab.innerHTML = '<thead><tr><th>#</th><th>Design</th><th>Height</th><th>Pieces</th><th>Lowest frequency</th><th>Cost</th><th></th></tr></thead><tbody>' + ok.slice(0, 12).map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td><i class="bz-dot" style="background:' + TCOL[r.type] + '"></i>' + esc(typeName(r.type)) + '</td><td>' + r.h.toFixed(1) + ' m (span / ' + r.ratio + ')</td><td>' + r.n + '</td><td>' + (r.f1 ? r.f1.toFixed(2) + ' Hz' : '–') + '</td><td><b>' + money(r.cost) + '</b>' + (i ? ' <small>+' + Math.round(100 * (r.cost / ok[0].cost - 1)) + '%</small>' : ' <small>cheapest</small>') + '</td><td><button type="button" class="tu-btn tu-btn--ghost" data-c="' + cheapRows.indexOf(r) + '">Use it</button></td></tr>';
    }).join('') + '</tbody>';
  }
  function useCheap(i) { var r = cheapRows[i]; if (!r) return; if (sim) stopTest(); var prev = snapshot(); model = B.clone(r.model); sel = -1; commit(prev); fit(); toast(typeName(r.type) + ' loaded: ' + money(r.cost) + '.'); $('#bz-view').scrollIntoView({behavior: 'smooth', block: 'start'}); }
  $('#bz-cheapchart').addEventListener('click', function (e) { var c = e.target.closest('[data-c]'); if (c) useCheap(+c.dataset.c); });
  $('#bz-cheaptab').addEventListener('click', function (e) { var c = e.target.closest('[data-c]'); if (c) useCheap(+c.dataset.c); });

  // ---------- challenges ----------
  function renderLevels() {
    var el = $('#bz-levels');
    el.innerHTML = B.LEVELS.map(function (l) {
      var st = S.stars[l.id] || 0, t = l.traffic, V = B.VEH[t.veh];
      return '<div class="bz-lv' + (S.level === l.id ? ' is-on' : '') + '"><h3>' + esc(l.name) + ' <span class="bz-st">' + '★★★'.slice(0, st) + '<em>' + '☆☆☆'.slice(st) + '</em></span></h3>' +
        '<p>' + l.span + ' m gap, ' + l.gap + ' m deep. ' + t.n + ' × ' + V.name.toLowerCase() + ' at ' + t.speed + ' km/h' + (l.wind ? ', ' + l.wind.U + ' m/s wind' : '') + (l.quake ? ', a ' + l.quake.pga + ' g earthquake' : '') + '.</p>' +
        '<p>Budget <b>' + money(l.budget) + '</b>. <small>' + esc(l.tip) + '</small></p><button type="button" class="tu-btn" data-l="' + l.id + '">' + (S.level === l.id ? 'Restart' : 'Start') + '</button></div>';
    }).join('');
  }
  $('#bz-levels').addEventListener('click', function (e) {
    var b = e.target.closest('[data-l]'); if (!b) return;
    var l = B.LEVELS.filter(function (q) { return q.id === b.dataset.l; })[0]; if (!l) return;
    if (sim) stopTest();
    var prev = snapshot();
    S.level = l.id; S.span = l.span; S.gap = l.gap; S.veh = l.traffic.veh; S.nveh = l.traffic.n; S.vgap = l.traffic.gap; S.speed = l.traffic.speed;
    S.wind = l.wind ? l.wind.U : 0; S.gust = l.wind ? Math.round(l.wind.gust * 100) : S.gust; S.vortex = true;
    S.pga = l.quake ? l.quake.pga : 0; if (l.quake) { S.qtype = l.quake.type; S.qdur = l.quake.dur; }
    syncInputs();
    model = {span: l.span, gap: l.gap, nodes: [], members: []}; sel = -1;
    commit(prev); fit(); renderLevels();
    toast(l.name + ': draw a bridge for under ' + money(l.budget) + ', then press Run test.');
    $('#bz-view').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  function syncInputs() {
    [['bz-span', 'span'], ['bz-gap', 'gap'], ['bz-nveh', 'nveh'], ['bz-vgap', 'vgap'], ['bz-speed', 'speed'], ['bz-wind', 'wind'], ['bz-gust', 'gust'], ['bz-pga', 'pga'], ['bz-qdur', 'qdur']].forEach(function (p) {
      var el = $('#' + p[0]); el.value = S[p[1]]; el.dispatchEvent(new Event('input'));
    });
    vehSel.value = S.veh; qt.value = S.qtype; vx.checked = S.vortex; syncDesign(false);
  }

  // ---------- share / files ----------
  function linkCode() { return '#d=' + encodeURIComponent(B.encode(model)) + '&v=' + [S.veh, S.nveh, S.vgap, S.speed].join('.') + (S.wind ? '&w=' + S.wind + '.' + S.gust : '') + (S.pga ? '&q=' + S.pga + '.' + S.qtype + '.' + S.qdur : ''); }
  $('#bz-link').onclick = function () {
    var url = location.origin + location.pathname + linkCode();
    navigator.clipboard.writeText(url).then(function () { toast('Link copied: it opens this bridge and its test settings.'); }, function () { prompt('Copy this link:', url); });
  };
  $('#bz-json').onclick = function () {
    var blob = new Blob([JSON.stringify({app: 'mes-bridge-builder', v: 1, code: B.encode(model), settings: {veh: S.veh, nveh: S.nveh, vgap: S.vgap, speed: S.speed, wind: S.wind, gust: S.gust, pga: S.pga, qtype: S.qtype, qdur: S.qdur, sf: S.sf}}, null, 1)], {type: 'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-bridge.mesbridge.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  };
  $('#bz-open').onchange = function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var j = JSON.parse(txt), m = B.decode(j.code); if (!m) throw new Error('bad');
      if (sim) stopTest();
      var prev = snapshot(); model = m; S.span = m.span; S.gap = m.gap; S.level = null;
      if (j.settings) Object.keys(j.settings).forEach(function (k) { if (k in DEF) S[k] = j.settings[k]; });
      syncInputs(); commit(prev); fit(); toast('Bridge opened.');
    }).catch(function () { toast('That file is not a saved bridge.'); });
    this.value = '';
  };

  // ---------- start ----------
  setTool(S.tool); setMat(S.mat); sizeLabel(); syncDesign(false); setTab(curTab);
  $('#bz-colours').setAttribute('aria-pressed', S.colours ? 'true' : 'false');
  S.span = model.span; S.gap = model.gap; $('#bz-span').value = S.span; $('#bz-span-v').textContent = S.span + ' m'; $('#bz-gap').value = S.gap; $('#bz-gap-v').textContent = S.gap + ' m';
  var ro2 = new ResizeObserver(function () { resize(); if (sim) resizeChart(); });
  ro2.observe(stage);
  window.addEventListener('resize', resize);
  new MutationObserver(function () { dirty(); }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  function panel() {
    if (!window.MESPanel) return setTimeout(panel, 300);
    window.MESPanel.add($('#bz-view'), {bar: $('#bz-bar'), stage: stage, onChange: function () { setTimeout(function () { resize(); fit(); if (sim) resizeChart(); }, 30); }});
  }
  panel();
  resize(); fit(); reanalyze(true);
  window.MESBridgeDebug = {get model() { return model; }, get ana() { return ana; }, get sim() { return sim; }, start: startTest, stop: stopTest, draw: draw, frame: function (n) { for (var i = 0; i < (n || 1); i++) { if (sim) sim.advance(0.05); } draw(); if (sim) { liveReadouts(); if (sim.finished() && !finishedShown) { finishedShown = true; showResult(); } } }};
})();
