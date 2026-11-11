/* MES Bridge Builder: pure maths (works in node too: require('./lib.js')).
   A bridge is a 2D pin-jointed truss in metres: nodes {x, y} (y up, the road level is y = 0) and members {a, b, m: material, s: size index}.
   The site: banks at y = 0 for x <= 0 and x >= span, a gorge between them with the river bed at y = -gap. A node on the ground is a pinned anchor.
   analyze(): linear static stiffness method (dense Cholesky, geometric stiffness from the dead-load tension so cable systems are stable),
   influence lines for moving traffic, wind and earthquake load cases, member checks (tension, Rankine buckling), deflection, cost, vibration modes.
   autoSize(): fully stressed design = the cheapest catalogue size of every member that passes with the safety factor.
   Sim: explicit dynamics of the same truss (lumped masses, axial springs + dashpots), vehicles driving over it, wind lift + vortex shedding,
   earthquake ground motion at the anchors, members that snap or buckle. */
(function (root) {
  'use strict';
  var G = 9.81;
  var DECK_D = 2.0; // aerodynamic depth of the deck (m), used for wind
  var MATS = {
    road:  {name: 'Road deck (steel + concrete)', short: 'Steel road', E: 200e9, ft: 300e6, fc: 300e6, rho: 7850, cost: 7, deckMass: 1500, deckCost: 1200, maxL: 15, shape: 'box', road: true, color: '#3f4652',
            sizes: [40, 60, 80, 120, 160, 240, 320, 480, 640, 900]},
    wroad: {name: 'Road deck (timber)', short: 'Timber road', E: 12e9, ft: 16e6, fc: 20e6, rho: 480, cost: 4, deckMass: 300, deckCost: 350, maxL: 8, shape: 'rect', road: true, color: '#7a5532',
            sizes: [150, 250, 400, 600, 900, 1300, 1800, 2500]},
    steel: {name: 'Steel beam', short: 'Steel', E: 200e9, ft: 355e6, fc: 355e6, rho: 7850, cost: 7, maxL: 30, shape: 'box', color: '#e0612a',
            sizes: [10, 15, 25, 40, 60, 90, 130, 180, 250, 350, 500, 700, 1000]},
    wood:  {name: 'Timber (glulam)', short: 'Timber', E: 12e9, ft: 18e6, fc: 24e6, rho: 480, cost: 4, maxL: 12, shape: 'rect', color: '#b07a3f',
            sizes: [100, 200, 300, 450, 650, 900, 1300, 1800, 2500]},
    cable: {name: 'Steel cable', short: 'Cable', E: 160e9, ft: 1500e6, fc: 0, rho: 7850, cost: 14, maxL: 1000, shape: 'cable', cable: true, color: '#c9d2dc',
            sizes: [5, 10, 20, 40, 80, 150, 300, 600, 1000]},
    conc:  {name: 'Concrete', short: 'Concrete', E: 30e9, ft: 3e6, fc: 30e6, rho: 2400, cost: 0.8, maxL: 80, shape: 'rect', color: '#9aa1a8',
            sizes: [400, 800, 1500, 2500, 4000, 6000, 9000, 14000, 20000]}
  };
  var MAT_ORDER = ['road', 'wroad', 'steel', 'wood', 'cable', 'conc'];
  var PIECE_COST = 900, CABLE_PIECE = 1800, JOINT_COST = 800, BANK_ANCHOR = 12000, BED_ANCHOR = 50000;

  // Vehicles: m kg, L m, axles = [distance behind the front (m), share of the mass]
  var VEH = {
    car:   {name: 'Car', m: 1500, L: 4.5, h: 1.5, axles: [[0.9, 0.55], [3.6, 0.45]], color: '#2f80ed'},
    suv:   {name: 'SUV', m: 2500, L: 5, h: 1.8, axles: [[1, 0.52], [4, 0.48]], color: '#27ae60'},
    bus:   {name: 'Bus', m: 13000, L: 12, h: 3.2, axles: [[2.6, 0.35], [9.4, 0.65]], color: '#f2c94c'},
    fire:  {name: 'Fire truck', m: 20000, L: 10, h: 3.3, axles: [[1.8, 0.35], [7.6, 0.65]], color: '#d63a2f'},
    truck: {name: 'Truck (40 t)', m: 40000, L: 16.5, h: 4, axles: [[1.4, 0.175], [5.2, 0.2125], [6.5, 0.2125], [14.2, 0.2], [15.5, 0.2]], color: '#8e44ad'}
  };

  function sizeInfo(mat, s) {
    var M = MATS[mat], A = M.sizes[Math.max(0, Math.min(M.sizes.length - 1, s))] * 1e-4, b, I;
    if (M.shape === 'box') { b = Math.sqrt(A / 0.234375); I = 0.03448 * b * b * b * b; }
    else if (M.shape === 'cable') { b = Math.sqrt(4 * A / Math.PI); I = 0; }
    else { b = Math.sqrt(A); I = b * b * b * b / 12; }
    return {A: A, b: b, I: I, kgm: M.rho * A + (M.deckMass || 0)};
  }
  function capacity(mat, s, L) {
    var M = MATS[mat], si = sizeInfo(mat, s), T = M.ft * si.A, C = 0;
    if (!M.cable) { var Pcr = Math.PI * Math.PI * M.E * si.I / (L * L), Py = M.fc * si.A; C = 1 / (1 / Py + 1 / Pcr); }
    return {T: T, C: C};
  }

  // ---- site ------------------------------------------------------------
  function ground(model, x, y) { // 'bank' | 'bed' | null : is (x, y) on the ground surface?
    var S = model.span, H = model.gap, e = 0.02;
    if (Math.abs(y) < e && (x <= e || x >= S - e)) return 'bank';
    if (Math.abs(x) < e && y <= e && y >= -H - e) return 'bank';
    if (Math.abs(x - S) < e && y <= e && y >= -H - e) return 'bank';
    if (Math.abs(y + H) < e && x >= -e && x <= S + e) return 'bed';
    return null;
  }
  function inside(model, x, y) { return ((x < -0.02 || x > model.span + 0.02) && y < -0.02) || y < -model.gap - 0.02; }
  function snapOut(model, x, y) { // push a point inside the ground to the nearest surface point
    var S = model.span, H = model.gap;
    if (y < -H) y = -H;
    if (x < 0 && y < 0) { if (-x < -y) x = 0; else y = 0; }
    if (x > S && y < 0) { if (x - S < -y) x = S; else y = 0; }
    return {x: x, y: y};
  }
  function waterY(model) { return -model.gap + Math.min(6, model.gap * 0.3); }

  // ---- model helpers ---------------------------------------------------
  function clone(m) { return {span: m.span, gap: m.gap, nodes: m.nodes.map(function (n) { return {x: n.x, y: n.y}; }), members: m.members.map(function (e) { return {a: e.a, b: e.b, m: e.m, s: e.s}; })}; }
  function memberLen(model, e) { var A = model.nodes[e.a], B = model.nodes[e.b]; return Math.hypot(B.x - A.x, B.y - A.y); }
  function clean(model) { // drop zero-length / duplicate members and nodes no member uses; keeps order otherwise
    var seen = {}, mem = [];
    model.members.forEach(function (e) {
      if (e.a === e.b || !model.nodes[e.a] || !model.nodes[e.b]) return;
      var k = Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b);
      if (seen[k] || memberLen(model, e) < 0.05) return;
      seen[k] = 1; mem.push(e);
    });
    var used = model.nodes.map(function () { return false; });
    mem.forEach(function (e) { used[e.a] = used[e.b] = true; });
    var map = [], nodes = [];
    model.nodes.forEach(function (n, i) { if (used[i]) { map[i] = nodes.length; nodes.push(n); } });
    return {span: model.span, gap: model.gap, nodes: nodes, members: mem.map(function (e) { return {a: map[e.a], b: map[e.b], m: e.m, s: e.s}; })};
  }

  // ---- costs / mass ----------------------------------------------------
  function nodeMasses(model) {
    var m = new Float64Array(model.nodes.length);
    model.members.forEach(function (e) {
      var L = memberLen(model, e), kg = sizeInfo(e.m, e.s).kgm * L;
      m[e.a] += kg / 2; m[e.b] += kg / 2;
    });
    for (var i = 0; i < m.length; i++) m[i] = m[i] * 1.06 + 20; // gusset plates, bolts
    return m;
  }
  function cost(model) {
    var c = {members: 0, pieces: 0, deck: 0, joints: 0, anchors: 0, byMat: {}, mass: 0, steelMass: 0, total: 0, nAnchor: 0, nJoint: 0};
    model.members.forEach(function (e) {
      var M = MATS[e.m], L = memberLen(model, e), si = sizeInfo(e.m, e.s), kg = M.rho * si.A * L, pc = M.cable ? CABLE_PIECE : PIECE_COST, mc = kg * M.cost + pc, dc = (M.deckCost || 0) * L;
      c.pieces += pc;
      c.members += mc; c.deck += dc; c.mass += kg + (M.deckMass || 0) * L;
      c.byMat[e.m] = (c.byMat[e.m] || 0) + mc + dc;
    });
    model.nodes.forEach(function (n) {
      var g = ground(model, n.x, n.y);
      if (g) { c.nAnchor++; c.anchors += g === 'bed' ? BED_ANCHOR : BANK_ANCHOR; } else { c.nJoint++; c.joints += JOINT_COST; }
    });
    c.total = c.members + c.deck + c.joints + c.anchors;
    return c;
  }

  // ---- linear algebra --------------------------------------------------
  function cholesky(K, n, scale) { // in place lower triangle; returns -1 or the index of the first bad pivot (a mechanism)
    var tol = 1e-9 * scale;
    for (var j = 0; j < n; j++) {
      var jj = j * n, d = K[jj + j];
      for (var k = 0; k < j; k++) d -= K[jj + k] * K[jj + k];
      if (!(d > tol)) return j;
      d = Math.sqrt(d); K[jj + j] = d;
      for (var i = j + 1; i < n; i++) {
        var ii = i * n, s = K[ii + j];
        for (var k2 = 0; k2 < j; k2++) s -= K[ii + k2] * K[jj + k2];
        K[ii + j] = s / d;
      }
    }
    return -1;
  }
  function cholSolve(L, n, b) {
    var x = Float64Array.from(b), i, k;
    for (i = 0; i < n; i++) { var s = x[i], ii = i * n; for (k = 0; k < i; k++) s -= L[ii + k] * x[k]; x[i] = s / L[ii + i]; }
    for (i = n - 1; i >= 0; i--) { var s2 = x[i]; for (k = i + 1; k < n; k++) s2 -= L[k * n + i] * x[k]; x[i] = s2 / L[i * n + i]; }
    return x;
  }
  function jacobiEig(A, n) { // symmetric; returns {val, vec (column-major n*n)}
    var V = new Float64Array(n * n), a = Float64Array.from(A), i, j, p, q;
    for (i = 0; i < n; i++) V[i * n + i] = 1;
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (p = 0; p < n; p++) for (q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
      if (off < 1e-22) break;
      for (p = 0; p < n; p++) for (q = p + 1; q < n; q++) {
        var apq = a[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
        var th = (a[q * n + q] - a[p * n + p]) / (2 * apq), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (var k = 0; k < n; k++) {
          var akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
        }
        for (k = 0; k < n; k++) {
          var apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
        }
        for (k = 0; k < n; k++) {
          var vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
    var val = []; for (i = 0; i < n; i++) val.push(a[i * n + i]);
    return {val: val, vec: V};
  }

  // ---- road path -------------------------------------------------------
  function roadMembers(model) { return model.members.map(function (e, i) { return i; }).filter(function (i) { return MATS[model.members[i].m].road; }); }
  function roadAt(model, roads, x, nodes) { // {i (member index), a, b, t, y} of the highest road member over x, or null
    nodes = nodes || model.nodes;
    var best = null;
    for (var r = 0; r < roads.length; r++) {
      var e = model.members[roads[r]], A = nodes[e.a], B = nodes[e.b];
      var lo = Math.min(A.x, B.x), hi = Math.max(A.x, B.x);
      if (x < lo - 1e-6 || x > hi + 1e-6 || hi - lo < 1e-6) continue;
      var t = (x - A.x) / (B.x - A.x), y = A.y + t * (B.y - A.y);
      if (!best || y > best.y) best = {i: roads[r], a: e.a, b: e.b, t: t, y: y};
    }
    return best;
  }
  function roadCheck(model) { // problems with the road: gaps, steps at the banks, steep bits
    var roads = roadMembers(model), S = model.span, out = [], step = Math.max(0.1, S / 400), gapStart = null;
    if (!roads.length) return [{k: 'noroad', x: S / 2}];
    for (var x = 0; x <= S + 1e-9; x += step) {
      var r = roadAt(model, roads, Math.min(x, S));
      if (!r) { if (gapStart === null) gapStart = x; }
      else if (gapStart !== null) { out.push({k: 'gap', x: (gapStart + x) / 2}); gapStart = null; }
    }
    if (gapStart !== null) out.push({k: 'gap', x: (gapStart + S) / 2});
    var r0 = roadAt(model, roads, 0), r1 = roadAt(model, roads, S);
    if (r0 && Math.abs(r0.y) > 0.3) out.push({k: 'step', x: 0});
    if (r1 && Math.abs(r1.y) > 0.3) out.push({k: 'step', x: S});
    roads.forEach(function (i) {
      var e = model.members[i], A = model.nodes[e.a], B = model.nodes[e.b], dx = Math.abs(B.x - A.x);
      if (dx < 1e-6 || Math.abs(B.y - A.y) / dx > 0.15) out.push({k: 'steep', x: (A.x + B.x) / 2, i: i});
    });
    return out;
  }

  // ---- traffic convoy --------------------------------------------------
  function convoy(tr) { // axle list relative to the front of the first vehicle: [{d: distance behind, P: N}], total length
    var V = VEH[tr.veh] || VEH.car, n = Math.max(1, Math.min(20, tr.n | 0)), gap = Math.max(1, +tr.gap || 6), ax = [];
    for (var k = 0; k < n; k++) { var off = k * (V.L + gap); V.axles.forEach(function (a) { ax.push({d: off + a[0], P: V.m * a[1] * G}); }); }
    return {axles: ax, len: n * V.L + (n - 1) * gap, V: V, n: n};
  }

  // quake design: spectral amplification of a 5%-damped structure on a simple design spectrum
  function spectralAmp(f) { if (!(f > 0)) return 2.5; var T = 1 / f; if (T < 0.1) return 1 + 15 * T; if (T <= 0.5) return 2.5; return 1.25 / T; }

  // ---- static analysis -------------------------------------------------
  function analyze(model, o) {
    o = o || {};
    var tr = o.traffic || {veh: 'car', n: 3, gap: 6}, sf = o.sf || 1.5, U = o.wind ? +o.wind : 0, pga = o.quake ? +o.quake : 0;
    var nN = model.nodes.length, nE = model.members.length, res = {ok: false, warnings: [], members: [], nodes: nN};
    res.cost = cost(model);
    if (!nE) { res.err = 'empty'; return res; }
    var fixed = model.nodes.map(function (n) { return !!ground(model, n.x, n.y); });
    var map = new Int32Array(2 * nN).fill(-1), nf = 0, i;
    for (i = 0; i < nN; i++) if (!fixed[i]) { map[2 * i] = nf++; map[2 * i + 1] = nf++; }
    res.fixed = fixed;
    if (!fixed.some(Boolean)) { res.err = 'noanchor'; return res; }
    var mass = nodeMasses(model);
    var el = model.members.map(function (e) {
      var A = model.nodes[e.a], B = model.nodes[e.b], L = Math.hypot(B.x - A.x, B.y - A.y), si = sizeInfo(e.m, e.s);
      return {c: (B.x - A.x) / L, s: (B.y - A.y) / L, L: L, k: MATS[e.m].E * si.A / L, si: si, cap: capacity(e.m, e.s, L)};
    });
    function assemble(Ng) {
      var K = new Float64Array(nf * nf), scale = 0;
      model.members.forEach(function (e, k) {
        var q = el[k], c = q.c, s = q.s, kk = q.k, g = Ng && Ng[k] > 0 ? Ng[k] / q.L : 0;
        var kxx = kk * c * c + g * s * s, kxy = kk * c * s - g * c * s, kyy = kk * s * s + g * c * c;
        var d = [map[2 * e.a], map[2 * e.a + 1], map[2 * e.b], map[2 * e.b + 1]];
        var m = [[kxx, kxy, -kxx, -kxy], [kxy, kyy, -kxy, -kyy], [-kxx, -kxy, kxx, kxy], [-kxy, -kyy, kxy, kyy]];
        for (var r = 0; r < 4; r++) if (d[r] >= 0) for (var cc = 0; cc < 4; cc++) if (d[cc] >= 0) K[d[r] * nf + d[cc]] += m[r][cc];
        scale = Math.max(scale, kk);
      });
      return {K: K, scale: scale};
    }
    function memberForces(u) {
      return model.members.map(function (e, k) {
        var q = el[k], ua = [map[2 * e.a], map[2 * e.a + 1]], ub = [map[2 * e.b], map[2 * e.b + 1]];
        var dx = (ub[0] >= 0 ? u[ub[0]] : 0) - (ua[0] >= 0 ? u[ua[0]] : 0), dy = (ub[1] >= 0 ? u[ub[1]] : 0) - (ua[1] >= 0 ? u[ua[1]] : 0);
        return q.k * (dx * q.c + dy * q.s);
      });
    }
    if (nf === 0) { res.err = 'nofree'; }
    var asm = assemble(null), L = asm.K, bad = nf ? cholesky(L, nf, asm.scale) : -1;
    if (bad >= 0) {
      var dofNode = -1; for (i = 0; i < nN; i++) if (map[2 * i] === bad || map[2 * i + 1] === bad) dofNode = i;
      res.err = 'mech'; res.mechNode = dofNode;
      // a mechanism can still be fine once cables are pulled tight: try geometric stiffness from a crude gravity estimate
      return res;
    }
    var Fd = new Float64Array(nf);
    for (i = 0; i < nN; i++) if (!fixed[i]) Fd[map[2 * i + 1]] -= mass[i] * G;
    var ud = cholSolve(L, nf, Fd), Nd0 = memberForces(ud);
    // geometric stiffness (tension members only) from the dead load, then re-factor
    if (Nd0.some(function (v, k) { return v > 0; })) {
      asm = assemble(Nd0); L = asm.K;
      if (cholesky(L, nf, asm.scale) >= 0) { res.err = 'mech'; return res; }
      ud = cholSolve(L, nf, Fd);
    }
    var Nd = memberForces(ud);
    res.uDead = new Float64Array(2 * nN);
    for (i = 0; i < nN; i++) if (!fixed[i]) { res.uDead[2 * i] = ud[map[2 * i]]; res.uDead[2 * i + 1] = ud[map[2 * i + 1]]; }
    // influence lines: unit downward load at every free road node
    var roads = roadMembers(model), roadNodes = {};
    roads.forEach(function (r) { var e = model.members[r]; if (!fixed[e.a]) roadNodes[e.a] = 1; if (!fixed[e.b]) roadNodes[e.b] = 1; });
    var IL = {}, ILv = {}, rn = Object.keys(roadNodes).map(Number);
    rn.forEach(function (n) {
      var F = new Float64Array(nf); F[map[2 * n + 1]] = -1;
      var u = cholSolve(L, nf, F); IL[n] = memberForces(u);
      var v = {}; rn.forEach(function (m) { v[m] = u[map[2 * m + 1]]; }); ILv[n] = v;
    });
    // envelope
    var Tmax = Nd.slice(), Cmax = Nd.slice(), govT = Nd.map(function () { return 'weight'; }), govC = govT.slice();
    function combine(N, name, sign) {
      for (var k = 0; k < nE; k++) { var v = Nd[k] + (sign || 1) * N[k]; if (v > Tmax[k]) { Tmax[k] = v; govT[k] = name; } if (v < Cmax[k]) { Cmax[k] = v; govC[k] = name; } }
    }
    var rc = roadCheck(model), gaps = rc.filter(function (p) { return p.k === 'gap' || p.k === 'noroad'; });
    rc.forEach(function (p) { res.warnings.push(p); });
    var cv = convoy(tr), S = model.span, maxDefl = 0, maxDeflX = 0;
    if (!gaps.length) {
      var step = Math.max(0.25, S / 300), Ld = new Float64Array(nE), defl = {};
      for (var p = 0; p <= S + cv.len + 1e-9; p += step) {
        Ld.fill(0); rn.forEach(function (m) { defl[m] = 0; });
        var any = false;
        for (var a = 0; a < cv.axles.length; a++) {
          var x = p - cv.axles[a].d; if (x <= 0 || x >= S) continue;
          var r = roadAt(model, roads, x); if (!r) continue;
          any = true;
          var P = cv.axles[a].P, wa = (1 - r.t) * P, wb = r.t * P;
          if (IL[r.a]) { for (var k = 0; k < nE; k++) Ld[k] += wa * IL[r.a][k]; for (var m1 in defl) defl[m1] += wa * ILv[r.a][m1]; }
          if (IL[r.b]) { for (k = 0; k < nE; k++) Ld[k] += wb * IL[r.b][k]; for (m1 in defl) defl[m1] += wb * ILv[r.b][m1]; }
        }
        if (!any) continue;
        combine(Ld, 'traffic');
        for (var m2 in defl) if (-defl[m2] > maxDefl) { maxDefl = -defl[m2]; maxDeflX = model.nodes[m2].x; }
      }
    }
    res.liveDefl = maxDefl; res.liveDeflX = maxDeflX;
    // wind: lift / buffeting on the deck, up and down
    if (U > 0) {
      var w = 0.5 * 1.225 * U * U * DECK_D * 0.5, Fw = new Float64Array(nf);
      roads.forEach(function (r) { var e = model.members[r], Lr = el[r].L; if (!fixed[e.a]) Fw[map[2 * e.a + 1]] += w * Lr / 2; if (!fixed[e.b]) Fw[map[2 * e.b + 1]] += w * Lr / 2; });
      var Nw = memberForces(cholSolve(L, nf, Fw));
      combine(Nw, 'wind', 1); combine(Nw, 'wind', -1);
    }
    // vibration modes (needed for the quake load)
    var modes = modesOf(L, nf, map, mass, nN, fixed);
    res.modes = modes;
    if (pga > 0) {
      var f1 = modes.length ? modes[0].f : 2, ah = pga * G * spectralAmp(f1), Fe = new Float64Array(nf), Fv = new Float64Array(nf);
      for (i = 0; i < nN; i++) if (!fixed[i]) { Fe[map[2 * i]] = mass[i] * ah; Fv[map[2 * i + 1]] = mass[i] * ah * 0.4; }
      var Ne = memberForces(cholSolve(L, nf, Fe)), Nv = memberForces(cholSolve(L, nf, Fv));
      var comb = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      comb.forEach(function (sg) { var N = Ne.map(function (v, k) { return sg[0] * v + sg[1] * Nv[k]; }); combine(N, 'earthquake'); });
      res.quakeAccel = ah;
    }
    // checks
    var worst = 0, worstI = -1;
    res.members = model.members.map(function (e, k) {
      var q = el[k], M = MATS[e.m], uT = Tmax[k] > 0 ? sf * Tmax[k] / q.cap.T : 0, uC = 0;
      if (Cmax[k] < 0) uC = M.cable ? (Cmax[k] < -1 ? Infinity : 0) : sf * -Cmax[k] / q.cap.C;
      var util = Math.max(uT, uC), mode = uT >= uC ? 'tension' : (M.cable ? 'slack' : 'buckling');
      if (util > worst) { worst = util; worstI = k; }
      return {L: q.L, A: q.si.A, kgm: q.si.kgm, cap: q.cap, Nd: Nd[k], Tmax: Tmax[k], Cmax: Cmax[k], util: util, mode: mode, gov: uT >= uC ? govT[k] : govC[k],
              tooLong: q.L > M.maxL + 1e-6};
    });
    res.members.forEach(function (r, k) { if (r.tooLong) res.warnings.push({k: 'long', i: k}); });
    res.worst = worst; res.worstI = worstI; res.sf = sf; res.ok = !res.err && worst <= 1 + 1e-9 && !gaps.length;
    res.deflLimit = S / 400;
    return res;
  }

  function modesOf(L, nf, map, mass, nN, fixed) {
    if (!nf) return [];
    var m = new Float64Array(nf), i;
    for (i = 0; i < nN; i++) if (!fixed[i]) { m[map[2 * i]] = mass[i]; m[map[2 * i + 1]] = mass[i]; }
    var p = Math.min(8, nf), X = [], seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
    for (var j = 0; j < p; j++) { var v = new Float64Array(nf); for (i = 0; i < nf; i++) v[i] = rnd(); X.push(v); }
    var Kr, Mr, ev;
    for (var it = 0; it < 40; it++) {
      var Y = X.map(function (x) { var b = new Float64Array(nf); for (var k = 0; k < nf; k++) b[k] = m[k] * x[k]; return cholSolve(L, nf, b); });
      // Rayleigh-Ritz: Kr = Y' K Y = Y' M X (since K Y = M X), Mr = Y' M Y
      Kr = new Float64Array(p * p); Mr = new Float64Array(p * p);
      for (var a = 0; a < p; a++) for (var b2 = 0; b2 < p; b2++) {
        var sk = 0, sm = 0; for (i = 0; i < nf; i++) { sk += Y[a][i] * m[i] * X[b2][i]; sm += Y[a][i] * m[i] * Y[b2][i]; }
        Kr[a * p + b2] = sk; Mr[a * p + b2] = sm;
      }
      for (a = 0; a < p; a++) for (b2 = 0; b2 < a; b2++) { var av = (Kr[a * p + b2] + Kr[b2 * p + a]) / 2; Kr[a * p + b2] = Kr[b2 * p + a] = av; }
      var Lm = Float64Array.from(Mr);
      if (cholesky(Lm, p, 1e-30) >= 0) break;
      // A = Lm^-1 Kr Lm^-T
      var T = new Float64Array(p * p), A = new Float64Array(p * p);
      for (b2 = 0; b2 < p; b2++) { var col = []; for (a = 0; a < p; a++) col.push(Kr[a * p + b2]); var y = fwd(Lm, p, col); for (a = 0; a < p; a++) T[a * p + b2] = y[a]; }
      for (a = 0; a < p; a++) { var row = []; for (b2 = 0; b2 < p; b2++) row.push(T[a * p + b2]); var y2 = fwd(Lm, p, row); for (b2 = 0; b2 < p; b2++) A[a * p + b2] = y2[b2]; }
      ev = jacobiEig(A, p);
      // new X = Y * Lm^-T * vec
      var Z = [];
      for (j = 0; j < p; j++) { var vv = []; for (a = 0; a < p; a++) vv.push(ev.vec[a * p + j]); Z.push(bwd(Lm, p, vv)); }
      X = Z.map(function (z) { var x = new Float64Array(nf); for (var a2 = 0; a2 < p; a2++) { var c = z[a2]; if (c) for (var k = 0; k < nf; k++) x[k] += c * Y[a2][k]; } return x; });
      ev.X = X;
    }
    if (!ev) return [];
    var out = [];
    for (j = 0; j < p; j++) {
      var lam = ev.val[j]; if (!(lam > 0)) continue;
      var x = ev.X[j], mm = 0, gx = 0, gy = 0, mx = 0, my = 0;
      for (i = 0; i < nN; i++) if (!fixed[i]) { var ux = x[map[2 * i]], uy = x[map[2 * i + 1]]; mm += mass[i] * (ux * ux + uy * uy); gx += mass[i] * ux; gy += mass[i] * uy; mx += mass[i]; }
      var sc = 1 / Math.sqrt(mm || 1), shape = new Float64Array(2 * nN), mxv = 0;
      for (i = 0; i < nN; i++) if (!fixed[i]) { shape[2 * i] = x[map[2 * i]] * sc; shape[2 * i + 1] = x[map[2 * i + 1]] * sc; }
      for (i = 0; i < 2 * nN; i++) mxv = Math.max(mxv, Math.abs(shape[i]));
      for (i = 0; i < 2 * nN; i++) shape[i] /= mxv || 1;
      out.push({f: Math.sqrt(lam) / (2 * Math.PI), shape: shape, px: gx * gx * sc * sc / mx, py: gy * gy * sc * sc / mx});
    }
    out.sort(function (a, b) { return a.f - b.f; });
    return out.slice(0, 5);
  }
  function fwd(L, n, b) { var x = b.slice(); for (var i = 0; i < n; i++) { var s = x[i]; for (var k = 0; k < i; k++) s -= L[i * n + k] * x[k]; x[i] = s / L[i * n + i]; } return x; }
  function bwd(L, n, b) { var x = b.slice(); for (var i = n - 1; i >= 0; i--) { var s = x[i]; for (var k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; } return x; }

  // ---- auto-size -------------------------------------------------------
  function pickSize(mat, L, T, C) {
    var M = MATS[mat];
    for (var s = 0; s < M.sizes.length; s++) { var cap = capacity(mat, s, L); if (cap.T >= T && (C <= 0 || (!M.cable && cap.C >= C))) return {s: s, ok: true}; }
    return {s: M.sizes.length - 1, ok: false};
  }
  function autoSize(model, o) {
    var m = clone(model), sf = (o && o.sf) || 1.5, last = null, it, res;
    for (it = 0; it < 12; it++) {
      res = analyze(m, o);
      if (res.err) return {model: m, res: res, iters: it};
      var changed = false, weak = [];
      m.members.forEach(function (e, k) {
        var r = res.members[k], pk = pickSize(e.m, r.L, sf * Math.max(0, r.Tmax), sf * Math.max(0, -r.Cmax));
        if (!pk.ok) weak.push(k);
        var s = it >= 6 ? Math.max(e.s, pk.s) : pk.s; // after a few rounds only grow, so it settles
        if (s !== e.s) { e.s = s; changed = true; }
      });
      last = weak;
      if (!changed) break;
    }
    res = analyze(m, o);
    return {model: m, res: res, iters: it, weak: last || []};
  }

  // ---- templates -------------------------------------------------------
  var TYPES = [
    ['warren', 'Warren truss'], ['warrenv', 'Warren with verticals'], ['pratt', 'Pratt truss'], ['howe', 'Howe truss'], ['k', 'K truss'],
    ['parker', 'Parker (camelback)'], ['deck', 'Deck truss (under the road)'], ['arch', 'Deck arch'], ['tiedarch', 'Network tied arch'],
    ['stayed', 'Cable-stayed'], ['suspension', 'Suspension']
  ];
  function panelsFor(type, S, h) {
    var n = Math.round(S / Math.max(2, Math.min(h * 1.1, 12)));
    n = Math.max(n, Math.ceil(S / 12));
    if (type === 'k' || type === 'parker') n = Math.max(4, n);
    return Math.max(2, Math.min(40, n));
  }
  function template(type, S, gap, h, n, opt) {
    opt = opt || {};
    var road = opt.road || 'road', tm = opt.mat || 'steel';
    n = n || panelsFor(type, S, h);
    if (type === 'k' && n % 2) n++;
    var nodes = [], mem = [], idx = {};
    function N(x, y, key) { x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100; var k = key || (x + ',' + y); if (idx[k] != null) return idx[k]; idx[k] = nodes.length; nodes.push({x: x, y: y}); return idx[k]; }
    function M(a, b, m, s) { if (a !== b) mem.push({a: a, b: b, m: m || tm, s: s == null ? 4 : s}); }
    var dx = S / n, b = [], t = [], i;
    for (i = 0; i <= n; i++) b.push(N(i * dx, 0));
    for (i = 0; i < n; i++) M(b[i], b[i + 1], road, 3);
    var half = n / 2;
    if (type === 'warren') {
      for (i = 0; i < n; i++) t.push(N((i + 0.5) * dx, h));
      for (i = 0; i < n - 1; i++) M(t[i], t[i + 1]);
      for (i = 0; i < n; i++) { M(b[i], t[i]); M(t[i], b[i + 1]); }
    } else if (type === 'warrenv' || type === 'pratt' || type === 'howe' || type === 'parker') {
      t[0] = b[0]; t[n] = b[n];
      for (i = 1; i < n; i++) {
        var hy = type === 'parker' ? h * (0.6 + 0.4 * Math.sin(Math.PI * i / n)) : h;
        t[i] = N(i * dx, hy);
      }
      for (i = 1; i < n - 1; i++) M(t[i], t[i + 1]);
      M(b[0], t[1]); M(b[n], t[n - 1]);
      for (i = 1; i < n; i++) M(b[i], t[i]);
      for (i = 1; i < n - 1; i++) {
        var leftHalf = i + 1 <= half, down;
        if (type === 'warrenv') down = i % 2 === 1;
        else if (type === 'howe') down = !leftHalf;
        else down = leftHalf; // pratt / parker: tension diagonals slope down towards the middle
        if (down) M(t[i], b[i + 1]); else M(b[i], t[i + 1]);
      }
    } else if (type === 'k') {
      for (i = 1; i < n; i++) t[i] = N(i * dx, h);
      for (i = 1; i < n - 1; i++) M(t[i], t[i + 1]);
      M(b[0], t[1]); M(b[n], t[n - 1]);
      var diag = [];
      for (i = 1; i < n - 1; i++) { var j = (i + 1 <= half) ? i + 1 : i, k2 = j === i + 1 ? i : i + 1; diag.push([j, k2]); }
      var split = {}; diag.forEach(function (d) { split[d[0]] = 1; });
      var mid = {};
      for (i = 1; i < n; i++) {
        if (split[i]) { mid[i] = N(i * dx, h / 2); M(b[i], mid[i]); M(mid[i], t[i]); } else M(b[i], t[i]);
      }
      diag.forEach(function (d) { M(mid[d[0]], t[d[1]]); M(mid[d[0]], b[d[1]]); });
    } else if (type === 'deck') {
      var hh = Math.min(h, gap * 0.9);
      for (i = 0; i < n; i++) t.push(N((i + 0.5) * dx, -hh));
      for (i = 0; i < n - 1; i++) M(t[i], t[i + 1]);
      for (i = 0; i < n; i++) { M(b[i], t[i]); M(t[i], b[i + 1]); }
    } else if (type === 'arch') {
      var ha = Math.min(h * 2, gap * 0.9), crown = Math.min(1.5, ha * 0.15), a = [];
      for (i = 0; i <= n; i++) { var x = i * dx; a.push(N(x, -ha + (ha - crown) * 4 * x * (S - x) / (S * S))); }
      for (i = 0; i < n; i++) M(a[i], a[i + 1], opt.archMat || 'steel', 6);
      for (i = 1; i < n; i++) M(a[i], b[i]);
      for (i = 0; i < n; i++) { if (i + 1 <= half) M(b[i], a[i + 1]); else M(a[i], b[i + 1]); }
    } else if (type === 'tiedarch') {
      var at = [b[0]];
      for (i = 1; i < n; i++) { var xa = i * dx; at.push(N(xa, h * 4 * xa * (S - xa) / (S * S))); }
      at.push(b[n]);
      for (i = 0; i < n; i++) M(at[i], at[i + 1], 'steel', 6);
      for (i = 1; i < n; i++) { M(at[i], b[i], "steel", 1); if (i > 1) M(at[i], b[i - 1], "steel", 1); if (i < n - 1) M(at[i], b[i + 1], "steel", 1); }
    } else if (type === 'stayed') {
      var H = Math.max(h, S * 0.22), TL = N(0, H), TR = N(S, H), back = Math.min(H * 0.7, 60);
      M(b[0], TL, 'conc', 4); M(b[n], TR, 'conc', 4);
      M(TL, N(-back, 0), 'cable', 5); M(TR, N(S + back, 0), 'cable', 5);
      for (i = 1; i < n; i++) {
        if (i < half) M(TL, b[i], 'cable', 3);
        else if (i > half) M(TR, b[i], 'cable', 3);
        else { M(TL, b[i], 'cable', 3); M(TR, b[i], 'cable', 3); }
      }
    } else if (type === 'suspension') {
      var dt = Math.max(1.5, Math.min(h, S / 50)), sag = S / 9, Ht = dt + 1 + sag, T2L = N(0, Ht), T2R = N(S, Ht), bk = Math.min(Ht * 0.9, 70);
      for (i = 1; i < n; i++) t[i] = N(i * dx, dt);
      for (i = 1; i < n - 1; i++) M(t[i], t[i + 1]);
      M(b[0], t[1]); M(b[n], t[n - 1]);
      for (i = 1; i < n; i++) M(b[i], t[i]);
      for (i = 1; i < n - 1; i++) { if (i + 1 <= half) M(t[i], b[i + 1]); else M(b[i], t[i + 1]); }
      M(b[0], T2L, 'conc', 4); M(b[n], T2R, 'conc', 4);
      var c = [T2L];
      for (i = 1; i < n; i++) { var xc = i * dx, u = 2 * xc / S - 1; c.push(N(xc, Ht - sag * (1 - u * u))); }
      c.push(T2R);
      for (i = 0; i < n; i++) M(c[i], c[i + 1], 'cable', 5);
      for (i = 1; i < n; i++) M(c[i], t[i], 'cable', 1);
      M(T2L, N(-bk, 0), 'cable', 6); M(T2R, N(S + bk, 0), 'cable', 6);
    }
    return clean({span: S, gap: gap, nodes: nodes, members: mem});
  }
  function defaultDepth(type, S) {
    if (type === 'stayed') return S * 0.22;
    if (type === 'suspension') return S / 50;
    if (type === 'tiedarch') return S / 5;
    if (type === 'arch') return S / 6;
    return Math.max(2, S / 7);
  }

  // ---- cheapest design search -----------------------------------------
  function cheapest(S, gap, o, types, ratios) {
    types = types || TYPES.map(function (t) { return t[0]; });
    ratios = ratios || [3, 4, 5, 6, 8, 10, 12];
    var rows = [];
    types.forEach(function (type) {
      var rs = type === 'stayed' ? [3, 4, 5, 6] : type === 'suspension' ? [30, 45, 60] : ratios;
      rs.forEach(function (r) {
        var h = S / r;
        if ((type === 'deck' || type === 'arch') && h > gap * 0.9 * (type === 'arch' ? 2 : 1)) return;
        if (type !== 'stayed' && type !== 'suspension' && type !== 'tiedarch' && h > 30) return;
        var m = template(type, S, gap, h);
        var bad = m.members.some(function (e) { return memberLen(m, e) > MATS[e.m].maxL + 1e-6; });
        if (bad) return;
        var a = autoSize(m, o);
        if (a.res.err) return;
        rows.push({type: type, ratio: r, h: h, n: m.members.length, cost: a.res.cost.total, ok: a.res.ok, worst: a.res.worst, model: a.model, f1: a.res.modes && a.res.modes[0] ? a.res.modes[0].f : null});
      });
    });
    rows.sort(function (a, b) { return (b.ok - a.ok) || a.cost - b.cost; });
    return rows;
  }

  // ---- earthquake ground motion ----------------------------------------
  var QUAKES = {
    shake: {name: 'Typical shaking (firm ground)', fg: 2.5, zg: 0.6, strong: 10},
    soft: {name: 'Long rolling (soft soil, like Mexico City 1985)', fg: 0.7, zg: 0.3, strong: 18},
    pulse: {name: 'Near-fault jolt (one big pulse)', pulse: true, f: 0.8, strong: 2},
    sine: {name: 'Resonance test (sine at the bridge frequency)', sine: true, strong: 12}
  };
  function quakeSignal(type, pga, o) {
    o = o || {};
    var Q = QUAKES[type] || QUAKES.shake, seed = o.seed || 11, comps = [], i;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var rise = Q.pulse ? 0.01 : 2, strong = o.strong || Q.strong, decay = Q.pulse ? 1 : 3, end = rise + strong + 4 * decay;
    function env(t) { if (t < 0) return 0; if (t < rise) { var r = t / rise; return r * r * (3 - 2 * r); } if (t < rise + strong) return 1; return Math.exp(-(t - rise - strong) / decay); }
    function envd(t) { if (t < 0) return 0; if (t < rise) { var r = t / rise; return 6 * r * (1 - r) / rise; } if (t < rise + strong) return 0; return -Math.exp(-(t - rise - strong) / decay) / decay; }
    if (Q.sine) { var f0 = o.f || 1; comps.push({w: 2 * Math.PI * f0, A: 1, ph: 0}); }
    else if (Q.pulse) {
      var wp = 2 * Math.PI * Q.f; // one-and-a-half cycle velocity pulse (Ricker-like displacement)
      return finish(function (t) { var tt = t - 1.5 / Q.f; return Math.exp(-0.5 * Math.pow(wp * tt / 2.2, 2)) * Math.sin(wp * tt); }, 6 / Q.f + 2);
    } else {
      for (i = 0; i < 40; i++) {
        var f = 0.15 * Math.pow(15 / 0.15, (i + rnd()) / 40), r = f / Q.fg, z = Q.zg;
        var hp = Math.pow(f / 0.3, 4), S = (1 + 4 * z * z * r * r) / ((1 - r * r) * (1 - r * r) + 4 * z * z * r * r) * hp / (1 + hp); // Kanai-Tajimi + a soft high-pass
        var df = f * Math.log(100) / 40, w = 2 * Math.PI * f;
        comps.push({w: w, A: Math.sqrt(S * df) / (w * w), ph: rnd() * 2 * Math.PI});
      }
    }
    function u0(t) { var s = 0; for (var k = 0; k < comps.length; k++) s += comps[k].A * Math.sin(comps[k].w * t + comps[k].ph); return s; }
    function v0(t) { var s = 0; for (var k = 0; k < comps.length; k++) s += comps[k].A * comps[k].w * Math.cos(comps[k].w * t + comps[k].ph); return s; }
    var base = {u: function (t) { return env(t) * u0(t); }, v: function (t) { return env(t) * v0(t) + envd(t) * u0(t); }};
    return finish(null, end, base);
    function finish(fn, endT, b) {
      var uf = b ? b.u : fn, vf = b ? b.v : null, h = 0.005, peak = 0;
      for (var t = h; t < endT; t += h) { var a = (uf(t + h) - 2 * uf(t) + uf(t - h)) / (h * h); if (Math.abs(a) > peak) peak = Math.abs(a); }
      var sc = peak > 0 ? pga * G / peak : 0;
      return {
        end: endT,
        u: function (t) { return t < 0 || t > endT + 2 ? 0 : sc * uf(t); },
        v: function (t) { if (t < 0 || t > endT + 2) return 0; return vf ? sc * vf(t) : sc * (uf(t + 1e-3) - uf(t - 1e-3)) / 2e-3; },
        a: function (t) { return sc * (uf(t + h) - 2 * uf(t) + uf(t - h)) / (h * h); }
      };
    }
  }

  // ---- dynamic simulation ----------------------------------------------
  function Sim(model, o) {
    o = o || {};
    this.model = model; this.o = o;
    var nN = model.nodes.length, nE = model.members.length, i;
    this.t = 0;
    this.x = new Float64Array(nN); this.y = new Float64Array(nN); this.vx = new Float64Array(nN); this.vy = new Float64Array(nN);
    this.x0 = new Float64Array(nN); this.y0 = new Float64Array(nN);
    this.fx = new Float64Array(nN); this.fy = new Float64Array(nN); this.mv = new Float64Array(nN);
    this.fixed = new Uint8Array(nN);
    this.m = nodeMasses(model);
    for (i = 0; i < nN; i++) {
      var n = model.nodes[i]; this.x[i] = this.x0[i] = n.x; this.y[i] = this.y0[i] = n.y;
      if (ground(model, n.x, n.y)) this.fixed[i] = 1;
    }
    var an = o.analysis;
    if (an && an.uDead) for (i = 0; i < nN; i++) { this.x[i] += an.uDead[2 * i]; this.y[i] += an.uDead[2 * i + 1]; }
    var f1 = an && an.modes && an.modes[0] ? an.modes[0].f : 1.5;
    this.f1 = f1; this.modes = an && an.modes ? an.modes : [];
    this.alpha = 2 * 0.012 * 2 * Math.PI * f1; // mass-proportional damping ~1.2 % in mode 1
    this.e = model.members.map(function (e) {
      var A = model.nodes[e.a], B = model.nodes[e.b], L = Math.hypot(B.x - A.x, B.y - A.y), si = sizeInfo(e.m, e.s), M = MATS[e.m], cap = capacity(e.m, e.s, L);
      return {a: e.a, b: e.b, L0: L, k: M.E * si.A / L, T: cap.T, C: cap.C, cable: !!M.cable, road: !!M.road, broken: 0, N: 0, peak: 0, over: 0};
    });
    // stiffness-proportional dashpots (damps the high, stiff modes) and a stable time step from Gershgorin
    var ksum = new Float64Array(nN), self = this;
    this.e.forEach(function (q) { ksum[q.a] += q.k; ksum[q.b] += q.k; });
    var w2 = 0; for (i = 0; i < nN; i++) if (!this.fixed[i]) w2 = Math.max(w2, 2 * ksum[i] / this.m[i]);
    var wmax = Math.sqrt(w2 || 1);
    this.beta = Math.min(0.004 / (2 * Math.PI * f1), 0.25 / wmax);
    var zmax = this.beta * wmax / 2;
    this.dt = Math.min(0.004, 0.85 * (Math.sqrt(1 + zmax * zmax) - zmax) * 2 / wmax);
    // traffic
    this.veh = [];
    var tr = o.traffic;
    if (tr && tr.n > 0) {
      var V = VEH[tr.veh] || VEH.car, v = (tr.speed || 50) / 3.6;
      for (var k = 0; k < tr.n; k++) this.veh.push({type: tr.veh, V: V, x: -3 - k * (V.L + (tr.gap || 6)), v: v, st: 'road', ay: [], body: null, t: 0});
    }
    this.roads = roadMembers(model);
    this.quake = o.quake && o.quake.pga > 0 ? quakeSignal(o.quake.type, o.quake.pga, {f: o.quake.f || f1, strong: o.quake.dur, seed: 11}) : null;
    this.quakeV = this.quake && o.quake.vert ? quakeSignal(o.quake.type === 'sine' ? 'sine' : o.quake.type, o.quake.pga * 0.5, {f: o.quake.f || f1, strong: o.quake.dur, seed: 29}) : null;
    this.wind = o.wind && o.wind.U > 0 ? o.wind : null;
    if (this.wind) {
      var U = this.wind.U, fs = 0.12 * U / DECK_D, lock = null;
      this.modes.forEach(function (md) { if (md.py > 0.02 && Math.abs(fs - md.f) / md.f < 0.2 && !lock) lock = md; });
      this.fs = lock ? lock.f : fs; this.lock = lock;
      this.gustPh = [0.3, 1.7, 2.9, 4.1, 5.3];
    }
    this.water = waterY(model); this.events = []; this.broken = 0; this.crossed = 0; this.fell = 0; this.maxUtil = 0; this.gu = 0; this.gv = 0;
    this.slow = 1;
    void self;
  }
  Sim.prototype.ground = function () {
    var t = this.t;
    this.gu = this.quake ? this.quake.u(t) : 0; this.gvel = this.quake ? this.quake.v(t) : 0;
    this.gv = this.quakeV ? this.quakeV.u(t) : 0; this.gvv = this.quakeV ? this.quakeV.v(t) : 0;
  };
  Sim.prototype.windForce = function () { // N per metre of deck, up = +
    var w = this.wind; if (!w) return 0;
    var t = this.t, g = 0; for (var k = 0; k < 5; k++) g += Math.sin(2 * Math.PI * (0.04 + 0.09 * k) * t + this.gustPh[k]) / 5;
    var U = w.U * (1 + (w.gust || 0) * 2.2 * g), q = 0.5 * 1.225 * U * U;
    var cl = 0.15 * g * (w.gust ? 1 : 0.3);
    if (w.vortex !== false) cl += (this.lock ? 0.35 : 0.12) * Math.sin(2 * Math.PI * this.fs * t);
    this.Unow = U;
    return q * DECK_D * cl;
  };
  Sim.prototype.roadUnder = function (x, near) {
    var best = null, model = this.model, X = this.x, Y = this.y;
    for (var r = 0; r < this.roads.length; r++) {
      var q = this.e[this.roads[r]]; if (q.broken) continue;
      var ax = X[q.a], bx = X[q.b], lo = Math.min(ax, bx), hi = Math.max(ax, bx);
      if (x < lo || x > hi || hi - lo < 1e-6) continue;
      var t = (x - ax) / (bx - ax), y = Y[q.a] + t * (Y[q.b] - Y[q.a]);
      if (near != null && Math.abs(y - near) > 1.2) continue;
      if (!best || (near != null ? Math.abs(y - near) < Math.abs(best.y - near) : y > best.y)) best = {q: q, t: t, y: y};
    }
    void model;
    return best;
  };
  Sim.prototype.step = function (dt) {
    var nN = this.x.length, i, X = this.x, Y = this.y, VX = this.vx, VY = this.vy, FX = this.fx, FY = this.fy, M = this.m, MV = this.mv;
    this.ground();
    for (i = 0; i < nN; i++) { FX[i] = 0; FY[i] = -M[i] * G; MV[i] = 0; }
    // members
    var beta = this.beta, util = 0;
    for (var k = 0; k < this.e.length; k++) {
      var q = this.e[k]; if (q.broken) continue;
      var dx = X[q.b] - X[q.a], dy = Y[q.b] - Y[q.a], L = Math.sqrt(dx * dx + dy * dy) || 1e-9, ux = dx / L, uy = dy / L;
      var ext = L - q.L0, rv = (VX[q.b] - VX[q.a]) * ux + (VY[q.b] - VY[q.a]) * uy;
      var N = q.k * ext, Nd = q.k * beta * rv;
      if (q.cable && N < 0) { N = 0; Nd = 0; }
      q.N = N;
      var u = N > 0 ? N / q.T : (q.C > 0 ? -N / q.C : 0);
      if (u > q.peak) q.peak = u;
      if (u > util) util = u;
      if (u > 1) { q.over++; if (q.over > 2 && this.t > 0.05) { q.broken = N > 0 ? 1 : 2; this.broken++; this.events.push({t: this.t, k: k, how: N > 0 ? 'snapped' : 'buckled'}); continue; } } else q.over = 0;
      var F = N + Nd;
      FX[q.a] += F * ux; FY[q.a] += F * uy; FX[q.b] -= F * ux; FY[q.b] -= F * uy;
    }
    if (util > this.maxUtil) this.maxUtil = util;
    this.util = util;
    // wind on the deck
    var wf = this.windForce();
    if (wf) for (var r = 0; r < this.roads.length; r++) {
      var qr = this.e[this.roads[r]]; if (qr.broken) continue;
      var Lr = Math.abs(X[qr.b] - X[qr.a]) * wf / 2; FY[qr.a] += Lr; FY[qr.b] += Lr;
    }
    // vehicles
    var S = this.model.span;
    for (var vi = 0; vi < this.veh.length; vi++) {
      var v = this.veh[vi];
      if (v.st === 'road') {
        v.x += v.v * dt;
        var V = v.V, lost = false;
        for (var a = 0; a < V.axles.length; a++) {
          var xa = v.x - V.axles[a][0], ya;
          if (xa <= 0) ya = this.gv; else if (xa >= S) ya = this.gv;
          else {
            var ru = this.roadUnder(xa, v.ay[a] != null ? v.ay[a] : 0);
            if (!ru) { lost = true; break; }
            ya = ru.y;
            var P = V.m * V.axles[a][1], ta = ru.t;
            FY[ru.q.a] -= P * G * (1 - ta); FY[ru.q.b] -= P * G * ta; MV[ru.q.a] += P * (1 - ta); MV[ru.q.b] += P * ta;
          }
          v.ay[a] = ya;
        }
        if (lost) {
          var y0 = v.ay[0] || 0, y1 = v.ay[V.axles.length - 1] || 0, len = V.axles[V.axles.length - 1][0] - V.axles[0][0];
          v.st = 'fall'; this.fell++;
          v.body = {x: v.x - V.L / 2, y: (y0 + y1) / 2, vx: v.v, vy: 0, ang: Math.atan2(y0 - y1, len || 1), w: -0.6};
          this.events.push({t: this.t, veh: vi, how: 'fell'});
        } else if (v.x - V.L > S + 2 && !v.done) { v.done = true; this.crossed++; }
      } else if (v.st === 'fall' || v.st === 'water') {
        var bd = v.body;
        if (v.st === 'fall') { bd.vy -= G * dt; bd.ang += bd.w * dt; }
        else { bd.vy += (-0.4 - bd.vy) * Math.min(1, 2 * dt); bd.vx *= 1 - Math.min(1, 1.5 * dt); bd.w *= 0.98; bd.ang += bd.w * dt; }
        bd.x += bd.vx * dt; bd.y += bd.vy * dt;
        if (bd.x < 0 + 0.1 && bd.y < 0) { bd.x = 0.1 + v.V.L * 0.1; bd.vx = Math.abs(bd.vx) * 0.3; }
        if (bd.x > S - 0.1 && bd.y < 0) { bd.x = S - 0.1 - v.V.L * 0.1; bd.vx = -Math.abs(bd.vx) * 0.3; }
        if (v.st === 'fall' && bd.y < this.water) { v.st = 'water'; v.splash = this.t; bd.vy *= 0.2; }
        var half = v.V.L / 2 * Math.abs(Math.sin(bd.ang)) + v.V.h * 0.45 * Math.abs(Math.cos(bd.ang));
        if (bd.y < -this.model.gap + half) { // resting on the river bed: settle flat
          bd.y = -this.model.gap + half; bd.vy = 0; bd.vx *= 0.9;
          var tgt = Math.round(bd.ang / Math.PI) * Math.PI; bd.w = 0; bd.ang += (tgt - bd.ang) * Math.min(1, 1.5 * dt);
        }
      }
    }
    // integrate (semi-implicit Euler with mass-proportional damping)
    var alpha = this.alpha, gu = this.gu, gvel = this.gvel, gv = this.gv, gvv = this.gvv, H = this.model.gap, wat = this.water;
    for (i = 0; i < nN; i++) {
      if (this.fixed[i]) { X[i] = this.x0[i] + gu; Y[i] = this.y0[i] + gv; VX[i] = gvel; VY[i] = gvv; continue; }
      var mi = M[i] + MV[i];
      VX[i] += dt * (FX[i] / mi - alpha * (VX[i] - gvel));
      VY[i] += dt * (FY[i] / mi - alpha * (VY[i] - gvv));
      X[i] += dt * VX[i]; Y[i] += dt * VY[i];
      if (Y[i] < wat) { var dr = Math.min(1, 3 * dt); VX[i] *= 1 - dr; VY[i] *= 1 - dr; }
      if (Y[i] < -H) { Y[i] = -H; VY[i] = 0; VX[i] *= 0.9; }
      if (Y[i] < 0 && X[i] < gu) { if (gu - X[i] < -Y[i]) { X[i] = gu; VX[i] = Math.max(VX[i], 0); } else { Y[i] = 0; VY[i] = Math.max(0, VY[i]); } }
      if (Y[i] < 0 && X[i] > S + gu) { if (X[i] - S - gu < -Y[i]) { X[i] = S + gu; VX[i] = Math.min(VX[i], 0); } else { Y[i] = 0; VY[i] = Math.max(0, VY[i]); } }
    }
    this.t += dt;
  };
  Sim.prototype.advance = function (seconds, budgetMs, now) { // runs whole steps; returns the simulated time actually advanced
    var n = Math.ceil(seconds / this.dt), t0 = now ? now() : 0, done = 0;
    for (var s = 0; s < n; s++) {
      this.step(this.dt); done += this.dt;
      if (now && (s & 15) === 15 && now() - t0 > budgetMs) break;
    }
    return done;
  };
  Sim.prototype.finished = function () {
    var allVeh = this.veh.every(function (v) { return v.done || v.st !== 'road'; });
    var qEnd = this.quake ? this.t > this.quake.end + 2 : true;
    var wEnd = this.wind ? this.t > (this.wind.dur || 20) : true;
    return allVeh && qEnd && wEnd && this.t > 1;
  };
  Sim.prototype.midDefl = function () { // vertical movement of the road node nearest mid-span, from where it started
    if (this._mid == null) {
      var best = -1, bd = 1e9, S = this.model.span, self = this;
      this.roads.forEach(function (r) { [self.e[r].a, self.e[r].b].forEach(function (n) { var d = Math.abs(self.x0[n] - S / 2); if (!self.fixed[n] && d < bd) { bd = d; best = n; } }); });
      this._mid = best; this._midY = best >= 0 ? this.y[best] : 0;
    }
    return this._mid >= 0 ? this.y[this._mid] - this._midY : 0;
  };

  // ---- share code ------------------------------------------------------
  function encode(model) {
    var p = [Math.round(model.span * 10), Math.round(model.gap * 10)].join(',');
    var n = model.nodes.map(function (q) { return Math.round(q.x * 100) + ',' + Math.round(q.y * 100); }).join(';');
    var e = model.members.map(function (q) { return q.a + ',' + q.b + ',' + MAT_ORDER.indexOf(q.m) + ',' + q.s; }).join(';');
    return '1|' + p + '|' + n + '|' + e;
  }
  function decode(str) {
    var parts = String(str || '').split('|');
    if (parts[0] !== '1' || parts.length < 4) return null;
    var sg = parts[1].split(',').map(Number), span = sg[0] / 10, gap = sg[1] / 10;
    if (!(span >= 4 && span <= 400 && gap >= 2 && gap <= 150)) return null;
    var nodes = parts[2] ? parts[2].split(';').map(function (s) { var a = s.split(',').map(Number); return {x: a[0] / 100, y: a[1] / 100}; }) : [];
    if (nodes.length > 600 || nodes.some(function (q) { return !isFinite(q.x) || !isFinite(q.y); })) return null;
    var members = parts[3] ? parts[3].split(';').map(function (s) { var a = s.split(',').map(Number); return {a: a[0], b: a[1], m: MAT_ORDER[a[2]] || 'steel', s: a[3] | 0}; }) : [];
    if (members.length > 1500) return null;
    members = members.filter(function (q) { return nodes[q.a] && nodes[q.b]; });
    members.forEach(function (q) { q.s = Math.max(0, Math.min(MATS[q.m].sizes.length - 1, q.s)); });
    return clean({span: span, gap: gap, nodes: nodes, members: members});
  }

  // ---- challenges ------------------------------------------------------
  var LEVELS = [
    {id: 'creek', name: 'Creek crossing', span: 12, gap: 5, traffic: {veh: 'car', n: 3, gap: 5, speed: 40}, budget: 72000, tip: 'Small and simple: one triangle row is enough.'},
    {id: 'river', name: 'River road', span: 30, gap: 12, traffic: {veh: 'bus', n: 2, gap: 8, speed: 50}, budget: 130000, tip: 'Deeper trusses need smaller chords.'},
    {id: 'trucks', name: 'Truck route', span: 40, gap: 15, traffic: {veh: 'truck', n: 2, gap: 10, speed: 60}, budget: 185000, tip: 'A 40 t truck: watch the deck members.'},
    {id: 'gorge', name: 'Windy gorge', span: 60, gap: 40, traffic: {veh: 'car', n: 6, gap: 8, speed: 70}, wind: {U: 32, gust: 0.25, vortex: true, dur: 20}, budget: 235000, tip: 'A deep gorge: an arch can sit on the cliff faces.'},
    {id: 'quake', name: 'Earthquake zone', span: 36, gap: 14, traffic: {veh: 'suv', n: 4, gap: 6, speed: 50}, quake: {pga: 0.5, type: 'shake', dur: 10}, budget: 160000, tip: 'Light bridges shake less.'},
    {id: 'long', name: 'Long span', span: 140, gap: 30, traffic: {veh: 'car', n: 8, gap: 10, speed: 80}, budget: 620000, tip: 'Over 100 m, cables are usually cheapest.'}
  ];

  var api = {G: G, DECK_D: DECK_D, MATS: MATS, MAT_ORDER: MAT_ORDER, VEH: VEH, TYPES: TYPES, QUAKES: QUAKES, LEVELS: LEVELS,
    JOINT_COST: JOINT_COST, PIECE_COST: PIECE_COST, CABLE_PIECE: CABLE_PIECE, BANK_ANCHOR: BANK_ANCHOR, BED_ANCHOR: BED_ANCHOR,
    sizeInfo: sizeInfo, capacity: capacity, ground: ground, inside: inside, snapOut: snapOut, waterY: waterY, clone: clone, clean: clean, memberLen: memberLen,
    nodeMasses: nodeMasses, cost: cost, analyze: analyze, autoSize: autoSize, pickSize: pickSize, template: template, panelsFor: panelsFor, defaultDepth: defaultDepth,
    cheapest: cheapest, quakeSignal: quakeSignal, spectralAmp: spectralAmp, Sim: Sim, encode: encode, decode: decode, roadAt: roadAt, roadMembers: roadMembers, roadCheck: roadCheck,
    convoy: convoy, cholesky: cholesky, cholSolve: cholSolve, jacobiEig: jacobiEig};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MESBridge = api;
})(typeof window !== 'undefined' ? window : this);
