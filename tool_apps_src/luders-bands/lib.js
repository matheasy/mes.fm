/* MES Lüders Band Simulator: the maths (window.MESLuders; also require()-able in node: node tool_apps_src/luders-bands-tests.js).
   A flat tensile specimen's gauge length is cut into N slices ("cells") along its length. Each slice is in one of four states:
     0 pinned     : dislocations held by carbon / nitrogen atoms (Cottrell atmospheres); it only lets go at the UPPER yield stress
                    (lowered a little at the shoulders, where the fillet concentrates stress, and at any notch you add)
     1 next       : a neighbour has yielded, so the stress concentration at the band front lets it go at about the LOWER yield stress
     2 yielding   : it is stretching plastically at the front stress, on its way to the Lüders strain
     3 hardened   : it has reached the Lüders strain; from now on it follows the work-hardening curve H(ep)
   The machine pulls the crosshead at a steady speed. Machine + specimen are springs in series, so the stress is
     sigma = (u - plastic elongation) / C,   C = (L / E) (1 + 1 / k)   (k = machine stiffness / specimen stiffness)
   A slice that yields takes up plastic elongation and the stress drops: that is why the curve has a yield drop, why the drop is
   steeper on a stiff machine, and why the front moves at v = V / (fronts x Lüders strain). Pure functions, no DOM. */
(function (root) {
  "use strict";
  var L = {};

  /* ---------- small helpers ---------- */
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  L.rng = rng;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  L.clamp = clamp;

  /* ---------- materials: typical values (textbook / handbook ranges, not a specification) ----------
     E GPa, sL = lower yield MPa, uy = upper / lower yield, eL = Lüders strain, K / n = hardening after the plateau
     H(ep) = sL + K (ep - eL)^n  (MPa), grain = typical ferrite grain size in µm (steels: sL and eL follow it when the grain slider moves),
     su = typical tensile strength (only used for the text). */
  L.MATS = [
    { id: "a36", name: "Structural steel (A36 / S275), hot rolled", E: 200, sL: 275, uy: 1.08, eL: 0.018, K: 520, n: 0.42, grain: 25, su: 450, steel: true,
      note: "Plate and beams. The classic Lüders material: a clear upper yield, a flat plateau of 1 to 2.5% and bands you can see in the mill scale." },
    { id: "s1020", name: "Carbon steel 1020, hot rolled", E: 200, sL: 260, uy: 1.06, eL: 0.02, K: 560, n: 0.45, grain: 22, su: 440, steel: true,
      note: "A common bar steel. Same story as structural steel." },
    { id: "dc01", name: "Low-carbon sheet (DC01 / 1008), annealed", E: 205, sL: 200, uy: 1.1, eL: 0.026, K: 430, n: 0.4, grain: 15, su: 320, steel: true,
      note: "Freshly annealed sheet, before temper rolling. Pressed like this it shows stretcher strains (worms) on the part." },
    { id: "fine", name: "Fine-grained steel (normalized, 8 µm)", E: 205, sL: 330, uy: 1.12, eL: 0.034, K: 560, n: 0.38, grain: 8, su: 480, steel: true,
      note: "Smaller grains: higher yield (Hall-Petch) and a longer Lüders plateau." },
    { id: "almg", name: "Aluminium-magnesium 5182-O / 5754-O", E: 70, sL: 125, uy: 1.03, eL: 0.012, K: 360, n: 0.38, grain: 20, su: 270, steel: false,
      note: "Car inner panels. Mg atoms pin the dislocations like carbon does in steel: a small yield point and type A stretcher strains (and later the jerky Portevin-Le Chatelier bands, not modelled here)." },
    { id: "if", name: "Interstitial-free (IF) steel: no yield point", E: 205, sL: 150, uy: 1.0, eL: 0, K: 470, n: 0.24, grain: 20, su: 300, steel: true, noYP: true,
      note: "Titanium / niobium tie up every carbon and nitrogen atom, so nothing pins the dislocations: smooth yielding, no bands. Used for deep-drawn car body parts." },
    { id: "custom", name: "Your own settings", E: 200, sL: 250, uy: 1.08, eL: 0.02, K: 500, n: 0.42, grain: 20, su: 420, steel: true }
  ];
  L.mat = function (id) { for (var i = 0; i < L.MATS.length; i++) if (L.MATS[i].id === id) return L.MATS[i]; return L.MATS[0]; };

  /* Hall-Petch for mild steel: sL = s0 + k / sqrt(d) (s0 70 MPa, k 0.74 MPa·m^½), and the Lüders strain grows as the grains get smaller
     (roughly eL ∝ d^-½; Butler 1962, Hall 1970). A trend, not a prediction for a particular steel. */
  L.hallPetch = function (dMicron) { var d = Math.max(1, dMicron) * 1e-6; return 70 + 0.74 / Math.sqrt(d); };
  L.ludersFromGrain = function (dMicron) { var d = Math.max(1, dMicron) * 1e-6; return clamp(1.1e-4 / Math.sqrt(d), 0.004, 0.06); };

  /* ---------- front angle ----------
     Along the band front the deformed and the undeformed metal must stay joined, so the front lies along a line that does not stretch.
     In-plane plastic strains of a sheet pulled along x: ex = e, ey = -e r / (1 + r)   (r = plastic anisotropy, Lankford r-value; r = 1 for an
     isotropic metal). Stretch along a line at angle t to the pull: e cos²t + ey sin²t = 0  ->  tan² t = (1 + r) / r.  r = 1 -> 54.7°. */
  L.frontAngle = function (r) { r = Math.max(0.05, r); return Math.atan(Math.sqrt((1 + r) / r)) * 180 / Math.PI; };
  L.lineStrain = function (deg, r) { var t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return c * c - (r / (1 + r)) * s * s; };

  /* ---------- band speed and plateau length ----------
     During the plateau the stress (so the elastic stretch) does not change, so every bit of crosshead travel goes into turning unyielded
     metal into Lüders-strained metal: V dt = n v dt eL  ->  v = V / (n eL). The plateau lasts t = L eL / V. */
  L.bandSpeed = function (Vmm_s, eL, fronts) { return eL > 0 ? Vmm_s / (Math.max(1, fronts) * eL) : Infinity; };
  L.plateauTime = function (Lmm, eL, Vmm_s) { return Vmm_s > 0 ? Lmm * eL / Vmm_s : Infinity; };

  /* ---------- strain ageing ----------
     After a plastic strain the dislocations are free; carbon atoms diffuse back to them and the yield point returns. Cottrell-Bilby: the
     pinned fraction grows as t^(2/3). Diffusion of carbon in ferrite has Q ≈ 84 kJ/mol, so ageing time scales with exp(Q/R (1/T0 - 1/T)).
     Returns 0..1 (fraction of the full yield-point return). tau = 30 days at 20 °C to reach ~63% (order of magnitude for rimmed / unstabilised
     low-carbon steel; killed and bake-hardening steels differ). */
  L.ageEquivalentHours = function (hours, tempC) { var R = 8.314, Q = 84000, T0 = 293.15, T = tempC + 273.15; return hours * Math.exp(Q / R * (1 / T0 - 1 / T)); };
  L.ageFraction = function (hours, tempC) { var te = L.ageEquivalentHours(hours, tempC), tau = 30 * 24; return 1 - Math.exp(-Math.pow(te / tau, 2 / 3)); };

  /* ---------- hardening curve ---------- */
  function H(p, ep) { var x = ep - p.eL; return x <= 0 ? p.sL : p.sL + p.K * Math.pow(x, p.n); }
  function Hinv(p, s) { if (s <= p.sL) return p.eL; return p.eL + Math.pow((s - p.sL) / p.K, 1 / p.n); }
  L.H = H; L.Hinv = Hinv;

  /* ---------- the simulation ----------
     opts: mat (material object), sL, uy, eL, K, n, E (GPa), Lg (gauge length mm), N (slices), k (machine / specimen stiffness), V (mm/min),
           scatter (0..1, how uneven the steel is), seed, r (r-value), shoulder (stress concentration at the fillets, fraction), notches [x 0..1] */
  function Sim(o) {
    var m = o.mat || L.MATS[0];
    var p = this.p = {
      sL: o.sL != null ? o.sL : m.sL, uy: o.uy != null ? o.uy : m.uy, eL: o.eL != null ? o.eL : m.eL, K: o.K != null ? o.K : m.K, n: o.n != null ? o.n : m.n,
      E: (o.E != null ? o.E : m.E) * 1000, Lg: o.Lg || 50, N: o.N || 160, k: o.k != null ? o.k : 3, V: o.V != null ? o.V : 5, scatter: o.scatter != null ? o.scatter : 0.5,
      seed: o.seed != null ? o.seed : 7, r: o.r != null ? o.r : 1, shoulder: o.shoulder != null ? o.shoulder : 0.03, notches: (o.notches || []).slice(), noYP: !!(o.noYP || m.noYP)
    };
    if (p.uy < 1) p.uy = 1;
    if (!(p.eL > 0)) { p.eL = 0; p.noYP = true; }
    var N = p.N, dx = p.Lg / N, R = rng(p.seed), sc = p.scatter;
    this.dx = dx;
    this.C = p.Lg / p.E * (1 + 1 / Math.max(0.05, p.k));    // mm of crosshead per MPa
    this.ep = new Float64Array(N);       // plastic strain per slice
    this.st = new Uint8Array(N);         // state 0..3 (see top)
    this.tgt = new Float64Array(N);      // strain the slice runs to while yielding
    this.sF = new Float64Array(N);       // front (lower) stress of the slice
    this.sU = new Float64Array(N);       // upper (pinned) stress of the slice
    this.dir = new Int8Array(N);         // which way the front leans (+1 / -1)
    this.band = new Int16Array(N);       // id of the band that yielded the slice (0 = none)
    this.rate = new Float64Array(N);     // recent plastic strain rate, for the "flowing now" view
    this.yt = new Float64Array(N).fill(-1); // time the slice finished yielding
    this.noise = new Float64Array(N);
    for (var i = 0; i < N; i++) this.noise[i] = R() * 2 - 1;
    this.front = new Float64Array(N);
    for (i = 0; i < N; i++) this.front[i] = R();
    this.notchMul = new Float64Array(N).fill(1);
    this._setNotches();
    this.u = 0; this.t = 0; this.s = 0; this.P = 0; this.bands = 0; this.done = false; this.phase = "elastic"; this.maxS = 0;
    this.upper = null; this.lower = null; this.ludersEnd = null; this.events = []; this.curve = [[0, 0]]; this.unloaded = false; this.agedTimes = 0;
    this._seedStates(true);
  }
  L.Sim = Sim;

  Sim.prototype._setNotches = function () {
    var p = this.p, N = p.N;
    for (var i = 0; i < N; i++) this.notchMul[i] = 1;
    for (var j = 0; j < p.notches.length; j++) {
      var c = p.notches[j] * N;
      for (i = 0; i < N; i++) { var d = Math.abs(i + 0.5 - c); if (d < 4) this.notchMul[i] = Math.min(this.notchMul[i], 1 - 0.07 * Math.exp(-d * d / 2)); }
    }
  };

  /* thresholds for a fresh (or aged) specimen: base = the stress the slice now flows at, upper = base x uy, Lüders target from H */
  Sim.prototype._seedStates = function (fresh, ageFrac) {
    var p = this.p, N = p.N, sc = p.scatter;
    for (var i = 0; i < N; i++) {
      var x = (i + 0.5) / N, dEnd = Math.min(x, 1 - x) * p.Lg;
      var shoulderMul = 1 - p.shoulder * Math.exp(-dEnd / 2.5);                  // fillet stress concentration fades over a few mm
      var nz = this.noise[i] * 0.008 * sc;
      if (fresh) {
        if (p.noYP) { this.st[i] = 3; this.ep[i] = 0; this.sF[i] = p.sL; this.sU[i] = p.sL; this.tgt[i] = 0; continue; }
        this.st[i] = 0; this.ep[i] = 0;
        this.sF[i] = p.sL * (1 - 0.012 * sc * this.front[i]);                       // front stress, a little scatter = plateau serrations
        this.sU[i] = p.sL * p.uy * shoulderMul * this.notchMul[i] * (1 + nz);
        this.tgt[i] = p.eL;
      } else {
        /* strain ageing: the current flow stress becomes the new lower yield (+ a little), with a new upper yield on top */
        var base = H(p, this.ep[i]), add = base * 0.06 * ageFrac;
        this.st[i] = ageFrac > 0.02 ? 0 : 3;
        this.sF[i] = base + add * (1 - 0.15 * sc * this.front[i]);
        this.sU[i] = (base + add) * (1 + (p.uy - 1 + 0.03) * ageFrac) * shoulderMul * this.notchMul[i] * (1 + nz);
        this.tgt[i] = Hinv(p, this.sF[i] + 0.5);
      }
      this.dir[i] = 0; this.band[i] = 0;
    }
  };

  /* stress for crosshead position u, letting hardened slices flow (monotonic -> bisection) */
  Sim.prototype._solveHardened = function () {
    var p = this.p, N = p.N, dx = this.dx, C = this.C, self = this;
    var Pfix = 0, anyH = false;
    for (var i = 0; i < N; i++) { if (this.st[i] === 3) anyH = true; else Pfix += this.ep[i]; }
    function Pat(s) { var P = Pfix; for (var i = 0; i < N; i++) if (self.st[i] === 3) { var e = self.ep[i]; if (s > H(p, e)) e = Hinv(p, s); P += e; } return P * dx; }
    var sEl = (this.u - this.P) / C;
    if (!anyH || sEl <= this._minHard()) return { s: sEl, flow: false };
    var lo = this._minHard(), hi = sEl;
    for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if ((this.u - Pat(mid)) / C > mid) lo = mid; else hi = mid; }
    return { s: lo, flow: true };
  };
  Sim.prototype._minHard = function () { var p = this.p, m = Infinity; for (var i = 0; i < p.N; i++) if (this.st[i] === 3) { var h = H(p, this.ep[i]); if (h < m) m = h; } return m; };
  Sim.prototype._applyHardFlow = function (s) {
    var p = this.p, P = 0;
    for (var i = 0; i < p.N; i++) {
      if (this.st[i] === 3 && s > H(p, this.ep[i])) { var e = Hinv(p, s), d = e - this.ep[i]; if (d > 0) { this.rate[i] += d; this.ep[i] = e; } }
      P += this.ep[i];
    }
    this.P = P * this.dx;
  };
  Sim.prototype.threshold = function (i) { var st = this.st[i]; return st === 0 ? this.sU[i] : st === 3 ? H(this.p, this.ep[i]) : this.sF[i]; };

  /* advance the crosshead by du (mm; negative = unload). Returns the events of this step. */
  Sim.prototype.step = function (du, dt) {
    var p = this.p, N = p.N, dx = this.dx, C = this.C, ev = [];
    this.u += du; this.t += dt || 0;
    for (var i = 0; i < N; i++) this.rate[i] *= 0.9;
    if (du < 0) {                                  // unloading is elastic
      this.s = (this.u - this.P) / C;
      if (this.s <= 0) { this.s = 0; this.u = this.P; }
      this._record(); return ev;
    }
    for (var guard = 0; guard < 4 * N + 50; guard++) {
      var r = this._solveHardened();
      this.s = r.s;
      var best = -1, bt = Infinity;
      for (i = 0; i < N; i++) { var st = this.st[i]; if (st === 3) continue; var t = st === 0 ? this.sU[i] : this.sF[i]; if (t < this.s && t < bt) { bt = t; best = i; } }
      if (best < 0) { if (r.flow) this._applyHardFlow(this.s); break; }
      if (r.flow) this._applyHardFlow(Math.max(bt, this._minHard()));   // hardened slices take what they can before the front moves
      var s0 = (this.u - this.P) / C;
      if (s0 <= bt) { this.s = s0; continue; }
      i = best;
      if (this.st[i] === 0) {                       // a new band nucleates here
        var nb = 0, nd = 0;
        if (i > 0 && this.st[i - 1] !== 0) { nb = this.band[i - 1]; nd = this.dir[i - 1]; }
        else if (i < N - 1 && this.st[i + 1] !== 0) { nb = this.band[i + 1]; nd = this.dir[i + 1]; }
        if (!nb) {
          this.bands++; nb = this.bands; nd = (this.noise[i] > 0) ? 1 : -1;
          var e = { type: "nucleate", band: nb, x: (i + 0.5) / N, t: this.t, s: s0, strain: this.strain() };
          ev.push(e); this.events.push(e);
          if (this.upper == null || s0 > this.upper.s) this.upper = { s: s0, strain: this.strain() };
        }
        this.band[i] = nb; this.dir[i] = nd;
        this.st[i] = 2;
        this.sF[i] = Math.min(this.sF[i], s0);      // once let go it flows at the front stress
      }
      if (this.st[i] === 1) this.st[i] = 2;
      var need = (s0 - this.sF[i]) * C / dx;        // plastic strain that would bring the stress back down to the front stress
      var room = this.tgt[i] - this.ep[i];
      var dep = Math.min(need, room);
      if (dep < 0) dep = 0;
      this.ep[i] += dep; this.rate[i] += dep; this.P += dep * dx;
      if (this.tgt[i] - this.ep[i] < 1e-12) {
        this.ep[i] = this.tgt[i]; this.st[i] = 3; this.yt[i] = this.t;
        for (var j = i - 1; j <= i + 1; j += 2) if (j >= 0 && j < N && this.st[j] === 0) { this.st[j] = 1; this.band[j] = this.band[i]; this.dir[j] = this.dir[i]; if (!this.agedTimes) this.sF[j] = Math.min(this.sF[j], p.sL * (1 - 0.012 * p.scatter * this.front[j])); }
      }
    }
    this.s = Math.max(0, (this.u - this.P) / C);
    if (this.s > this.maxS) this.maxS = this.s;
    var yielding = 0, pinned = 0, hard = 0;
    for (i = 0; i < N; i++) { if (this.st[i] === 3) hard++; else if (this.st[i] === 0) pinned++; else yielding++; }
    var was = this.phase;
    this.phase = hard === N ? (this.bands || this.p.noYP ? "hardening" : "elastic") : (this.bands ? "luders" : "elastic");
    if (this.phase === "luders" && (this.lower == null || this.s < this.lower.s) && this.upper && this.strain() > this.upper.strain + 0.0005) this.lower = { s: this.s, strain: this.strain() };
    if (was === "luders" && this.phase === "hardening" && this.ludersEnd == null) { this.ludersEnd = { s: this.s, strain: this.strain(), t: this.t }; var e2 = { type: "end", t: this.t, strain: this.strain() }; ev.push(e2); this.events.push(e2); }
    this._record();
    return ev;
  };
  Sim.prototype._record = function () { var c = this.curve, e = this.strain(); if (!c.length || Math.abs(c[c.length - 1][0] - e) > 2e-6 || Math.abs(c[c.length - 1][1] - this.s) > 0.05) c.push([e, this.s]); };

  /* extensometer strain over the whole gauge (elastic + plastic), and plateau stress estimate */
  Sim.prototype.strain = function () { return this.s / this.p.E + this.P / this.p.Lg; };
  Sim.prototype.crossheadStrain = function () { return this.u / this.p.Lg; };
  Sim.prototype.counts = function () { var c = [0, 0, 0, 0]; for (var i = 0; i < this.p.N; i++) c[this.st[i]]++; return c; };
  /* active fronts = boundaries between hardened and not-hardened slices */
  Sim.prototype.fronts = function () {
    var N = this.p.N, out = [];
    for (var i = 0; i < N - 1; i++) { var a = this.st[i] === 3, b = this.st[i + 1] === 3; if (a !== b) out.push({ x: (i + 1) / N, dir: this.dir[a ? i : i + 1] || 1, moving: a ? 1 : -1 }); }
    return out;
  };
  Sim.prototype.yieldedFraction = function () { var n = 0; for (var i = 0; i < this.p.N; i++) if (this.st[i] === 3) n++; return n / this.p.N; };

  /* unload to zero, then age (hours at tempC) or not, ready to reload */
  Sim.prototype.unload = function () { this.u = this.P; this.s = 0; this._record(); this.unloaded = true; };
  Sim.prototype.age = function (hours, tempC) {
    var f = L.ageFraction(hours, tempC);
    this.agedTimes++;
    this.upper = null; this.lower = null; this.ludersEnd = null;
    this.p.noYP = false;
    var savedBands = this.bands;
    this._seedStates(false, f);
    this.bands = savedBands;
    if (f <= 0.02) this.phase = "hardening";
    return f;
  };

  /* run the whole test quickly (for tests and the "jump to end" button): to strain eEnd at crosshead speed V (mm/min) */
  Sim.prototype.runTo = function (eEnd, stepMm) {
    var du = stepMm || this.p.Lg * 2e-5, V = this.p.V / 60, n = 0;
    while (this.strain() < eEnd && n < 500000) { this.step(du, du / V); n++; }
    return n;
  };

  /* summary numbers after a run */
  Sim.prototype.summary = function () {
    var c = this.curve, up = this.upper, lo = null, eEnd = this.ludersEnd ? this.ludersEnd.strain : null;
    if (up && eEnd) { var s = 0, n = 0, mn = Infinity; for (var i = 0; i < c.length; i++) if (c[i][0] > up.strain + 0.002 && c[i][0] < eEnd) { s += c[i][1]; n++; if (c[i][1] < mn) mn = c[i][1]; } lo = n ? { mean: s / n, min: mn } : null; }
    return { upper: up ? up.s : null, plateau: lo ? lo.mean : null, lowerMin: lo ? lo.min : null, ludersStrain: (up && eEnd) ? eEnd - up.strain : null, bands: this.bands, t: this.t };
  };

  /* colour maps used by the page (kept here so they are tested) */
  L.viridisish = function (x) {
    x = clamp(x, 0, 1);
    var stops = [[0, 33, 46, 92], [0.25, 40, 104, 160], [0.5, 32, 165, 150], [0.75, 140, 205, 70], [1, 253, 231, 37]];
    for (var i = 1; i < stops.length; i++) if (x <= stops[i][0]) { var a = stops[i - 1], b = stops[i], f = (x - a[0]) / (b[0] - a[0]); return [Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)]; }
    return [253, 231, 37];
  };

  /* number formats */
  L.fmt = function (x, d) { if (x == null || !isFinite(x)) return "–"; return x.toFixed(d == null ? 0 : d); };
  L.pct = function (x, d) { return x == null || !isFinite(x) ? "–" : (x * 100).toFixed(d == null ? 2 : d) + "%"; };
  L.MPA_KSI = 0.1450377;

  /* share-link state */
  L.KEYS = ["m", "eL", "uy", "k", "v", "sc", "r", "g", "n"];
  L.toQuery = function (s) { var q = []; L.KEYS.forEach(function (k) { if (s[k] != null && s[k] !== "") q.push(k + "=" + encodeURIComponent(s[k])); }); return q.join("&"); };
  L.fromQuery = function (str) {
    var o = {}; (str || "").replace(/^\?/, "").split("&").forEach(function (kv) { if (!kv) return; var a = kv.split("="), k = decodeURIComponent(a[0]), v = decodeURIComponent(a[1] || ""); if (L.KEYS.indexOf(k) < 0) return; if (k === "m" || k === "n") { if (/^[a-z0-9,.]{1,60}$/.test(v)) o[k] = v; } else { var x = parseFloat(v); if (isFinite(x)) o[k] = x; } });
    return o;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = L;
  root.MESLuders = L;
})(typeof window !== "undefined" ? window : globalThis);
