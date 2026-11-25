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
    { id: "a36", eu: 0.18, A: 0.26, name: "Structural steel (A36 / S275), hot rolled", E: 200, sL: 275, uy: 1.08, eL: 0.018, K: 520, n: 0.42, grain: 25, su: 450, steel: true,
      note: "Plate and beams. The classic Lüders material: a clear upper yield, a flat plateau of 1 to 2.5% and bands you can see in the mill scale." },
    { id: "s1020", eu: 0.2, A: 0.3, name: "Carbon steel 1020, hot rolled", E: 200, sL: 260, uy: 1.06, eL: 0.02, K: 560, n: 0.45, grain: 22, su: 440, steel: true,
      note: "A common bar steel. Same story as structural steel." },
    { id: "dc01", eu: 0.24, A: 0.4, name: "Low-carbon sheet (DC01 / 1008), annealed", E: 205, sL: 200, uy: 1.1, eL: 0.026, K: 430, n: 0.4, grain: 15, su: 320, steel: true,
      note: "Freshly annealed sheet, before temper rolling. Pressed like this it shows stretcher strains (worms) on the part." },
    { id: "fine", eu: 0.17, A: 0.28, name: "Fine-grained steel (normalized, 8 µm)", E: 205, sL: 330, uy: 1.12, eL: 0.034, K: 560, n: 0.38, grain: 8, su: 480, steel: true,
      note: "Smaller grains: higher yield (Hall-Petch) and a longer Lüders plateau." },
    { id: "almg", eu: 0.2, A: 0.24, name: "Aluminium-magnesium 5182-O / 5754-O", E: 70, sL: 125, uy: 1.03, eL: 0.012, K: 360, n: 0.38, grain: 20, su: 270, steel: false,
      note: "Car inner panels. Mg atoms pin the dislocations like carbon does in steel: a small yield point and type A stretcher strains (and later the jerky Portevin-Le Chatelier bands, not modelled here)." },
    { id: "if", eu: 0.26, A: 0.45, name: "Interstitial-free (IF) steel: no yield point", E: 205, sL: 150, uy: 1.0, eL: 0, K: 470, n: 0.24, grain: 20, su: 300, steel: true, noYP: true,
      note: "Titanium / niobium tie up every carbon and nitrogen atom, so nothing pins the dislocations: smooth yielding, no bands. Used for deep-drawn car body parts." },
    { id: "custom", eu: 0.19, A: 0.28, name: "Your own settings", E: 200, sL: 250, uy: 1.08, eL: 0.02, K: 500, n: 0.42, grain: 20, su: 420, steel: true }
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
  /* H is the true stress of the steel. The machine sees force / starting area: as a slice stretches its cross-section shrinks, so the
     engineering stress it can carry is G = H ((1 + eL) / (1 + ep))^b (= sL on the plateau; b is set so the peak falls at the material's
     typical uniform elongation eu, since the plain 1/(1+ep) area loss with these hardening fits would neck far too late). G rises, peaks (Considère: the tensile
     strength) and would fall: past the peak one place thins faster than the rest and the bar necks there, then breaks. */
  function G(p, ep) { var b = p.beta || 1; return H(p, ep) * Math.pow((1 + p.eL) / (1 + Math.max(p.eL, ep)), b); }
  function peakOf(p) { var best = p.eL, bv = G(p, p.eL); for (var e = p.eL; e < 2; e += 0.0005) { var v = G(p, e); if (v > bv) { bv = v; best = e; } else if (v < bv - 1) break; } return { e: best, s: bv }; }
  function Gtab(p) {                                      /* e at evenly spaced stresses sL..Gmax, so Ginv is a lookup (the solver calls it ~10^4 times a step) */
    var n = 4096, t = new Float64Array(n + 1), a = p.sL, b = p.Gmax;
    for (var k = 0; k <= n; k++) { var s = a + (b - a) * k / n, lo = p.eL, hi = p.eNk; for (var i = 0; i < 48; i++) { var m = (lo + hi) / 2; if (G(p, m) < s) lo = m; else hi = m; } t[k] = (lo + hi) / 2; }
    t[0] = p.eL; t[n] = p.eNk; p.gt = t; p.gn = n;
  }
  function Ginv(p, s) { if (s <= p.sL) return p.eL; if (s >= p.Gmax) return p.eNk; var x = (s - p.sL) / (p.Gmax - p.sL) * p.gn, k = Math.floor(x), f = x - k; return p.gt[k] + (p.gt[Math.min(p.gn, k + 1)] - p.gt[k]) * f; }
  L.G = G; L.peakOf = peakOf;

  /* ---------- the simulation ----------
     opts: mat (material object), sL, uy, eL, K, n, E (GPa), Lg (gauge length mm), N (slices), k (machine / specimen stiffness), V (mm/min),
           scatter (0..1, how uneven the steel is), seed, r (r-value), lean (0 = chosen by the unevenness, 1 = every band leans one way (drawn as \\), -1 = the other way (/), 2 = each new band the other way than the last), shoulder (stress concentration at the fillets, fraction), notches [x 0..1] */
  function Sim(o) {
    var m = o.mat || L.MATS[0];
    var p = this.p = {
      sL: o.sL != null ? o.sL : m.sL, uy: o.uy != null ? o.uy : m.uy, eL: o.eL != null ? o.eL : m.eL, K: o.K != null ? o.K : m.K, n: o.n != null ? o.n : m.n,
      E: (o.E != null ? o.E : m.E) * 1000, Lg: o.Lg || 50, N: o.N || 160, k: o.k != null ? o.k : 3, V: o.V != null ? o.V : 5, scatter: o.scatter != null ? o.scatter : 0.5,
      seed: o.seed != null ? o.seed : 7, r: o.r != null ? o.r : 1, shoulder: o.shoulder != null ? o.shoulder : 0.03, notches: (o.notches || []).slice(), lean: o.lean || 0, noYP: !!(o.noYP || m.noYP)
    };
    if (p.uy < 1) p.uy = 1;
    if (!(p.eL > 0)) { p.eL = 0; p.noYP = true; }
    var eu = Math.max(p.eL + 0.04, o.eu != null ? o.eu : (m.eu || 0.19)), dh = (H(p, eu + 1e-4) - H(p, eu - 1e-4)) / 2e-4;
    p.beta = Math.max(0.5, (1 + eu) * dh / H(p, eu));               // area loss exponent chosen so the force peaks at the typical uniform elongation
    var pk = peakOf(p); p.eNk = pk.e; p.Gmax = pk.s; Gtab(p);                // uniform strain and tensile strength
    p.A = Math.max(p.eNk + 0.04, o.A != null ? o.A : (m.A || 0.28));  // elongation at break over the gauge
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
    this.neck = null; this.broken = false; this.brokenAt = null;
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
        var base = G(p, this.ep[i]), add = base * 0.06 * ageFrac;
        this.st[i] = ageFrac > 0.02 ? 0 : 3;
        this.sF[i] = base + add * (1 - 0.15 * sc * this.front[i]);
        this.sU[i] = (base + add) * (1 + (p.uy - 1 + 0.03) * ageFrac) * shoulderMul * this.notchMul[i] * (1 + nz);
        this.tgt[i] = Math.max(this.ep[i], Ginv(p, this.sF[i] + 0.5));
      }
      this.dir[i] = 0; this.band[i] = 0;
    }
  };

  /* stress for crosshead position u, letting hardened slices flow (monotonic -> bisection) */
  Sim.prototype._solveHardened = function () {
    var p = this.p, N = p.N, dx = this.dx, C = this.C, self = this;
    var Pfix = 0, anyH = false;
    for (var i = 0; i < N; i++) { if (this.st[i] === 3) anyH = true; else Pfix += this.ep[i]; }
    function Pat(s) { var P = Pfix; for (var i = 0; i < N; i++) if (self.st[i] === 3) { var e = self.ep[i]; if (s > G(p, e)) e = Math.max(e, Ginv(p, s)); P += e; } return P * dx; }
    var sEl = (this.u - this.P) / C;
    if (!anyH || sEl <= this._minHard()) return { s: sEl, flow: false };
    var lo = this._minHard(), hi = sEl;
    for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if ((this.u - Pat(mid)) / C > mid) lo = mid; else hi = mid; }
    return { s: lo, flow: true };
  };
  Sim.prototype._minHard = function () { var p = this.p, m = Infinity; for (var i = 0; i < p.N; i++) if (this.st[i] === 3) { var h = G(p, this.ep[i]); if (h < m) m = h; } return m; };
  Sim.prototype._applyHardFlow = function (s) {
    var p = this.p, P = 0;
    for (var i = 0; i < p.N; i++) {
      if (this.st[i] === 3 && s > G(p, this.ep[i])) { var e = Math.max(this.ep[i], Ginv(p, s)), d = e - this.ep[i]; if (d > 0) { this.rate[i] += d; this.ep[i] = e; } }
      P += this.ep[i];
    }
    this.P = P * this.dx;
  };
  Sim.prototype.threshold = function (i) { var st = this.st[i]; return st === 0 ? this.sU[i] : st === 3 ? (this.neck ? this.neckS(this.neck.q) : G(this.p, this.ep[i])) : this.sF[i]; };

  /* advance the crosshead by du (mm; negative = unload). Returns the events of this step. */
  Sim.prototype.step = function (du, dt) {
    var p = this.p, N = p.N, dx = this.dx, C = this.C, ev = [];
    if (this.broken) { this.t += dt || 0; for (var b0 = 0; b0 < N; b0++) this.rate[b0] *= 0.9; return ev; }
    this.u += du; this.t += dt || 0;
    for (var i = 0; i < N; i++) this.rate[i] *= 0.9;
    if (this.neck && du > 0) { this._neckStep(ev); this._record(); return ev; }
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
          this.bands++; nb = this.bands; nd = p.lean === 1 || p.lean === -1 ? p.lean : p.lean === 2 ? (this.bands % 2 ? -1 : 1) : (this.noise[i] > 0) ? 1 : -1;
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
    if (!this.neck && this.s >= p.Gmax - 1e-6) { var allH = true; for (i = 0; i < N; i++) if (this.st[i] !== 3) { allH = false; break; } if (allH) { this._startNeck(ev); this._neckStep(ev); this._record(); return ev; } }
    var yielding = 0, pinned = 0, hard = 0;
    for (i = 0; i < N; i++) { if (this.st[i] === 3) hard++; else if (this.st[i] === 0) pinned++; else yielding++; }
    var was = this.phase;
    this.phase = hard === N ? (this.bands || this.p.noYP ? "hardening" : "elastic") : (this.bands ? "luders" : "elastic");
    if (this.phase === "luders" && (this.lower == null || this.s < this.lower.s) && this.upper && this.strain() > this.upper.strain + 0.0005) this.lower = { s: this.s, strain: this.strain() };
    if (was === "luders" && this.phase === "hardening" && this.ludersEnd == null) { this.ludersEnd = { s: this.s, strain: this.strain(), t: this.t }; var e2 = { type: "end", t: this.t, strain: this.strain() }; ev.push(e2); this.events.push(e2); }
    this._record();
    return ev;
  };
  /* ---------- necking and fracture ----------
     Past the tensile strength the weakest place (a notch, else the slice with the least luck in the scatter) takes all further stretching.
     Neck profile: a Gaussian about 2.5 mm wide (a neck is about as long as the bar is thick). q = extra plastic strain at its centre.
     The force falls as the neck thins: s = Gmax (1 - 0.22 (q / qf)^1.5); the bar breaks at q = qf, chosen so the total elongation over
     the gauge equals the material's typical elongation at break A. Illustrative, not a damage model. */
  Sim.prototype._startNeck = function (ev) {
    var p = this.p, N = p.N, c = 0, bv = Infinity, i;
    for (i = 0; i < N; i++) { var x = (i + 0.5) / N, edge = Math.min(x, 1 - x) < 0.08 ? 0.01 : 0; var v = this.notchMul[i] * (1 + 0.004 * this.noise[i] + edge); if (v < bv) { bv = v; c = i; } }
    var sg = Math.max(2, 2.5 / this.dx), w = new Float64Array(N), W = 0;
    for (i = 0; i < N; i++) { var d = (i - c) / sg; w[i] = Math.exp(-d * d / 2); if (w[i] < 1e-4) w[i] = 0; W += w[i]; }
    var e0 = new Float64Array(this.ep), P0 = this.P;
    var qf = Math.max(0.15, (p.A - (P0 / p.Lg)) * p.Lg / (this.dx * W));
    this.neck = { c: c, w: w, W: W, e0: e0, P0: P0, q: 0, qf: qf, s0: Math.min(this.s, p.Gmax), strain: this.strain(), t: this.t };
    this.uts = { s: this.neck.s0, strain: this.strain() };
    var e = { type: "neck", x: (c + 0.5) / N, t: this.t, s: this.neck.s0, strain: this.strain() }; ev.push(e); this.events.push(e);
    this.phase = "necking";
  };
  Sim.prototype.neckS = function (q) { var n = this.neck; return n.s0 * (1 - 0.22 * Math.pow(Math.min(1, q / n.qf), 1.5)); };
  Sim.prototype._neckStep = function (ev) {
    var n = this.neck, p = this.p, C = this.C, dx = this.dx, self = this;
    function f(q) { return self.u - (n.P0 + dx * n.W * q) - C * self.neckS(q); }
    if (f(n.q) <= 0) { this.s = Math.max(0, (this.u - this.P) / C); this.phase = "necking"; return; }   // still elastic after an unload
    if (f(n.qf) > 0) {                                     // the neck has thinned to nothing: it breaks
      this._setQ(n.qf); this.broken = true; this.s = 0; this.phase = "broken";
      this.brokenAt = { x: (n.c + 0.5) / p.N, strain: this.strain(), t: this.t, s: this.neckS(n.qf) };
      var e = { type: "fracture", x: this.brokenAt.x, t: this.t, strain: this.brokenAt.strain }; ev.push(e); this.events.push(e);
      this.curve.push([this.brokenAt.strain, this.brokenAt.s]); this.curve.push([this.brokenAt.strain + 1e-6, 0]);
      return;
    }
    var lo = n.q, hi = n.qf;
    for (var it = 0; it < 50; it++) { var m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    this._setQ(lo); this.s = this.neckS(lo); this.phase = "necking";
  };
  Sim.prototype._setQ = function (q) {
    var n = this.neck, N = this.p.N, P = 0;
    for (var i = 0; i < N; i++) { var e = n.e0[i] + n.w[i] * q, d = e - this.ep[i]; if (d > 0) { this.rate[i] += d; this.ep[i] = e; } P += this.ep[i]; }
    n.q = q; this.P = P * this.dx;
  };
  /* snapshots for the rewind slider: everything that changes while the test runs (the curve / events are append-only: their lengths) */
  var ARR = ["ep", "st", "tgt", "sF", "sU", "dir", "band", "rate", "yt"], SCAL = ["u", "t", "s", "P", "bands", "done", "phase", "maxS", "upper", "lower", "ludersEnd", "unloaded", "agedTimes", "broken", "brokenAt", "uts", "unloadedNow"];
  Sim.prototype.snapshot = function () {
    var o = { a: {}, n: this.neck, q: this.neck ? this.neck.q : 0, cl: this.curve.length, el: this.events.length, noYP: this.p.noYP };
    for (var i = 0; i < ARR.length; i++) o.a[ARR[i]] = this[ARR[i]].slice();
    for (i = 0; i < SCAL.length; i++) o[SCAL[i]] = this[SCAL[i]];
    return o;
  };
  Sim.prototype.restore = function (o, curve, events) {
    for (var i = 0; i < ARR.length; i++) this[ARR[i]].set(o.a[ARR[i]]);
    for (i = 0; i < SCAL.length; i++) this[SCAL[i]] = o[SCAL[i]];
    this.neck = o.n; if (o.n) o.n.q = o.q;
    this.p.noYP = o.noYP;
    this.curve = (curve || this.curve).slice(0, o.cl); this.events = (events || this.events).slice(0, o.el);
  };
  /* how far through necking (0..1), for the page */
  Sim.prototype.neckFrac = function () { return this.neck ? Math.min(1, this.neck.q / this.neck.qf) : 0; };

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
    if (this.neck) return 0;                               // a necked bar can't be aged and tested again here
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
  L.KEYS = ["m", "eL", "uy", "k", "v", "sc", "r", "g", "n", "ln"];
  L.toQuery = function (s) { var q = []; L.KEYS.forEach(function (k) { if (s[k] != null && s[k] !== "") q.push(k + "=" + encodeURIComponent(s[k])); }); return q.join("&"); };
  L.fromQuery = function (str) {
    var o = {}; (str || "").replace(/^\?/, "").split("&").forEach(function (kv) { if (!kv) return; var a = kv.split("="), k = decodeURIComponent(a[0]), v = decodeURIComponent(a[1] || ""); if (L.KEYS.indexOf(k) < 0) return; if (k === "m" || k === "n") { if (/^[a-z0-9,.]{1,60}$/.test(v)) o[k] = v; } else { var x = parseFloat(v); if (isFinite(x)) o[k] = x; } });
    return o;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = L;
  root.MESLuders = L;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Lüders Band Simulator: the page (uses window.MESLuders from lib.js). Canvas drawing of the bar, the stress-strain curve, the
   space-time map, the dislocation picture and the front-angle figure. Settings in localStorage mes-luders:v1; links ?m=&eL=&uy=&k=&v=&sc=&r=&g=&n= */
(function () {
  "use strict";
  var L = window.MESLuders, root = document.getElementById("lu");
  if (!L || !root) return;
  function $(id) { return document.getElementById(id); }
  var KEY = "mes-luders:v1";
  var S = { m: "a36", eL: null, uy: null, k: 3, v: 5, sc: 0.5, r: 1, g: null, look: "polish", units: "mpa", thin: true, ghost: true, speed: 1, notches: [], lean: 0, mview: "side", show: { ro: 1, say: 1, key: 1, chart: 1, kymo: 1, micro: 1 } };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var kk in sv) if (kk in S) S[kk] = sv[kk]; } catch (e) {}
  if (!S.show || typeof S.show !== "object") S.show = { ro: 1, say: 1, key: 1, chart: 1, kymo: 1, micro: 1 };
  var Q = L.fromQuery(location.search);
  if (Q.m) { S.m = Q.m; S.eL = null; S.uy = null; S.g = null; }
  ["eL", "uy", "k", "v", "sc", "r", "g"].forEach(function (k) { if (Q[k] != null) S[k] = Q[k]; });
  if (Q.ln != null && [0, 1, -1, 2].indexOf(Q.ln) >= 0) S.lean = Q.ln;
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
    sim = new L.Sim({ mat: e.m, sL: e.sL, eL: e.eL, uy: e.uy, k: S.k, V: S.v, scatter: S.sc, r: S.r, notches: S.notches, lean: +S.lean || 0, seed: 7 });
    endStrain = Math.max(0.04, (e.eL || 0) + 0.035);
    kymo = []; lastFr = { t: 0, f: 0 }; vMeas = null; frontsN = 0; agedNote = "";
    ghostLabel = e.m.name.split(" (")[0] + ", k " + fmtK(S.k);
    setRun(false); $("lu-unload").disabled = true; $("lu-reload").disabled = true; $("lu-agemsg").textContent = "";
    pushKymo(); hist = []; histPos = -1; curveM = sim.curve; eventsM = sim.events; kymoM = kymo; record(true); drawAll(); say();
  }
  var ghostLabel = "", agedNote = "";

  /* ---- rewind: snapshots of the whole test, a slider moves through them ---- */
  var hist = [], histPos = -1, curveM = null, eventsM = null, kymoM = null, HMAX = 1400;
  function record(force) {
    if (histPos >= 0 && histPos < hist.length - 1) branch();
    var last = hist[hist.length - 1], gap = Math.max(0.02, estTotal() / 900);
    if (!force && last && sim.t - last.t < gap && !sim.broken) return;
    curveM = sim.curve; eventsM = sim.events; kymoM = kymo;
    hist.push({ t: sim.t, e: sim.strain(), snap: sim.snapshot(), kl: kymo.length, end: endStrain, vm: vMeas });
    if (hist.length > HMAX) { var h2 = [hist[0]]; for (var j = 1; j < hist.length - 1; j += 2) h2.push(hist[j]); h2.push(hist[hist.length - 1]); hist = h2; }
    histPos = hist.length - 1; scrubUI();
  }
  /* pressing Go after rewinding: forget the part of the test after this point */
  function branch() { hist.length = histPos + 1; curveM = sim.curve; eventsM = sim.events; kymoM = kymo; }
  function goTo(k) {
    if (!hist.length) return;
    k = Math.max(0, Math.min(hist.length - 1, k));
    if (running) { setRun(false); }
    var h = hist[k]; histPos = k;
    sim.restore(h.snap, curveM, eventsM); kymo = kymoM.slice(0, h.kl); endStrain = h.end; vMeas = h.vm; lastFr = { t: sim.t, f: sim.yieldedFraction() };
    $("lu-unload").disabled = !(sim.s > 1) || sim.broken; $("lu-reload").disabled = !sim.unloadedNow;
    setRun(false); drawAll(); say(); scrubUI();
  }
  function scrubUI() {
    var r = $("lu-scrub"); if (!r) return;
    var n = Math.max(1, hist.length - 1); r.max = n; r.value = Math.max(0, histPos);
    var live = histPos >= hist.length - 1;
    $("lu-scrubt").textContent = (live ? "" : "Rewound to ") + fT(sim.t) + " · strain " + L.pct(sim.strain(), 2) + (live ? "" : " (press ▶ to go on from here)");
    r.style.setProperty("--lu-sp", (histPos / n * 100) + "%");
  }

  function setRun(on) { running = on; var b = $("lu-go"); b.textContent = on ? "❚❚ Pause" : sim && sim.broken ? "↺ New bar" : (sim && sim.t > 0 && !sim.done ? "▶ Go on" : sim && sim.done ? (sim.phase === "hardening" || sim.phase === "necking" ? "▶ Pull until it breaks" : "▶ Pull further") : "▶ Start"); b.setAttribute("aria-pressed", on ? "true" : "false"); }

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
      if (sim.broken) { running = false; sim.done = true; break; }
      if (sim.strain() >= endStrain) { running = false; sim.done = true; break; }
    }
    measureSpeed();
    kymoAcc += dt; if (kymoAcc > Math.max(0.03, estTotal() / 600)) { kymoAcc = 0; pushKymo(); }
    record(!running);
    if (!running) { setRun(false); afterStop(); }
    drawAll(); say();
  }
  function estTotal() { var V = sim.p.V / 60; return endStrain * sim.p.Lg * (1 + 1 / sim.p.k * 0.2) / V; }
  function onEvent(e) {
    if (e.type === "nucleate") { var where = e.x < 0.06 ? "the left shoulder" : e.x > 0.94 ? "the right shoulder" : (Math.round(e.x * sim.p.Lg) + " mm along the bar" + (nearNotch(e.x) ? ", at the notch" : "")); toast("Band " + e.band + " starts at " + where + " (" + fS(e.s) + ")"); }
    if (e.type === "end") toast("The fronts have crossed the whole bar: now it hardens evenly.");
    if (e.type === "neck") toast("Necking at " + Math.round(e.x * sim.p.Lg) + " mm: the tensile strength (" + fS(e.s) + ") is reached, one spot starts to thin");
    if (e.type === "fracture") toast("Broken at " + Math.round(e.x * sim.p.Lg) + " mm after " + L.pct(e.strain, 1) + " stretch");
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
    $("lu-unload").disabled = !(sim.s > 1) || sim.broken;
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
  function fnt(n, bold) { return (bold ? "bold " : "500 ") + Math.round(n * TXS()) + "px system-ui, sans-serif"; }
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
    var stretchPx = 0, avail = w - 2 * pad - 2 * gripW - 2 * shW - 24, gaugeW0 = avail - 6;
    /* room for the longest the bar will get in this run (it can stretch 25-45% before it breaks), so the right grip stays in view */
    var reach = Math.max(0.06, Math.min(endStrain, p.A + 0.03), sim.P / p.Lg + sim.s / p.E + 0.01);
    var scale = (avail - (sim.broken ? 14 : 0)) / (p.Lg * (1 + reach));   // px per mm
    var yc = h * 0.53, gh = Math.min(h * 0.46, gaugeW0 * 0.2), sh = Math.min(h * 0.72, gh * 1.6);
    var nuW = S.r / (1 + S.r), thinMul = S.thin ? 15 : 1;
    var elastic = sim.s / p.E;
    /* cumulative positions of slice edges */
    var pos = new Float64Array(N + 1), x0 = pad + gripW + shW; pos[0] = x0;
    var brk = sim.broken && sim.neck ? sim.neck.c : -1, GAP = 14;
    for (var i = 0; i < N; i++) pos[i + 1] = pos[i] + sim.dx * (1 + sim.ep[i] + elastic) * scale + (i === brk ? GAP : 0);
    var x1 = pos[N];
    geo = { pos: pos, yc: yc, gh: gh, x0: x0, x1: x1, w: w, h: h };
    /* frame + grips */
    var steelHi = dark ? [205, 211, 219] : [214, 220, 228], look = S.look;
    c.fillStyle = css("--lu-frame"); c.fillRect(0, yc - sh / 2 - 26, w, 8); c.fillRect(0, yc + sh / 2 + 18, w, 8);
    function grip(x, wd) { c.fillStyle = css("--lu-grip"); c.fillRect(x, yc - sh / 2 - 10, wd, sh + 20); c.strokeStyle = css("--lu-gripl"); c.lineWidth = 1; for (var t = 6; t < sh + 14; t += 6) { c.beginPath(); c.moveTo(x + 3, yc - sh / 2 - 7 + t); c.lineTo(x + wd - 3, yc - sh / 2 - 7 + t - 3); c.stroke(); } }
    /* shoulders (plain metal) */
    var baseCol = look === "scale" ? "#3a414d" : look === "strain" ? rgbStr(L.viridisish(0)) : look === "rate" ? rgbStr(rateCol(0, dark)) : rgbStr(steelHi);
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
          var epU = sim.neck ? Math.min(sim.ep[k], sim.neck.e0[k]) : sim.ep[k], epN = sim.ep[k] - epU;
          var hw = gh / 2 * Math.max(0.12, (1 - Math.min(0.3, nuW * epU * thinMul * 0.5)) / (1 + 2.6 * epN));
          var o = (py * pw + px) * 4;
          if (Math.abs(dy) > hw) { d[o + 3] = 0; continue; }
          if (brk >= 0) { var xcr = pos[brk + 1] - GAP / 2 + Math.sin(dy * 0.55) * 3 + (hsh(0, Math.round(dy * 2)) - 0.5) * 3; if (Math.abs(X2 - xcr) < GAP / 2 - 1) { d[o + 3] = 0; continue; } }
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
            col = rateCol(Math.min(1, sim.rate[k] * 400), dark);
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
    /* labels sit on their own plate above the grey rail (they used to be drawn on it) */
    var ly = Math.max(Math.round(15 * TXS()), yc - sh / 2 - 32), ax = Math.min(w - 8, x1 + shW + gripW + 4);
    function plate(txt, x, align, col) {
      c.font = fnt(12, 1); var tw = c.measureText(txt).width, h2 = Math.round(17 * TXS()), x0 = align === "right" ? x - tw : x;
      c.fillStyle = css("--lu-bg"); c.strokeStyle = css("--lu-line"); c.lineWidth = 1;
      c.beginPath(); if (c.roundRect) c.roundRect(x0 - 6, ly - h2 + 4, tw + 12, h2 + 2, 5); else c.rect(x0 - 6, ly - h2 + 4, tw + 12, h2 + 2); c.fill(); c.stroke();
      c.fillStyle = col; c.textAlign = align; c.fillText(txt, x, ly);
    }
    plate(sim.unloadedNow ? "unloaded" : "pulled at " + S.v + " mm/min", ax - 28, "right", css("--lu-arrow"));
    c.strokeStyle = css("--lu-arrow"); c.fillStyle = css("--lu-arrow"); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(ax - 20, ly - 5); c.lineTo(ax - 2, ly - 5); c.stroke();
    c.beginPath(); c.moveTo(ax, ly - 5); c.lineTo(ax - 8, ly - 10); c.lineTo(ax - 8, ly); c.closePath(); c.fill();
    plate("fixed grip", pad + 6, "left", css("--lu-ink"));
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
    /* neck / break label */
    if (sim.neck) { var nx = (pos[sim.neck.c] + pos[sim.neck.c + 1]) / 2; c.font = fnt(12, 1); c.textAlign = "center"; c.fillStyle = css("--lu-upper"); c.fillText(sim.broken ? "broken here" : "neck", nx, yc - gh / 2 - 8); }
    /* selected slice */
    var si = microIdx();
    if (si >= 0) { var sx = (pos[si] + pos[si + 1]) / 2, sy = yc + gh / 2 + 3; c.fillStyle = css("--lu-sel"); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 6, sy + 9); c.lineTo(sx + 6, sy + 9); c.closePath(); c.fill(); }
    if (S.thin && sim.P > 0) { c.font = fnt(10); c.textAlign = "left"; c.fillStyle = css("--lu-mut"); c.textAlign = "right"; c.fillText("thinning drawn ×15", x1, yc + sh / 2 + 14 * TXS()); }
  }
  /* "Flowing now" colours: still steel = plain grey (visible on light and dark pages), stretching = orange, fastest = yellow-white */
  function rateCol(rr, dark) {
    var b = dark ? [92, 101, 116] : [190, 198, 208], m = [234, 88, 12], t = [255, 236, 140];
    if (rr <= 0.5) { var u = rr * 2; return [b[0] + (m[0] - b[0]) * u, b[1] + (m[1] - b[1]) * u, b[2] + (m[2] - b[2]) * u]; }
    var v = (rr - 0.5) * 2; return [m[0] + (t[0] - m[0]) * v, m[1] + (t[1] - m[1]) * v, m[2] + (t[2] - m[2]) * v];
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
      c.fillStyle = css("--lu-lower"); c.textAlign = "right"; c.fillText("lower yield ≈ " + fS(sim.p.sL), sim.brokenAt || sim.neck ? mL + pw * 0.62 : mL + pw - 4, sim.brokenAt || sim.neck ? ly + 14 : ly - 6);
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
    if (sim.uts) { c.fillStyle = css("--lu-front"); c.beginPath(); c.arc(X(sim.uts.strain), Y(sim.uts.s), 4, 0, 7); c.fill(); c.textAlign = "center"; c.font = fnt(11); c.fillText("tensile strength " + fS(sim.uts.s), X(sim.uts.strain), Y(sim.uts.s) - 9); }
    if (sim.brokenAt) { var bx = X(sim.brokenAt.strain), by = Y(sim.brokenAt.s); c.strokeStyle = css("--lu-upper"); c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx - 6, by - 6); c.lineTo(bx + 6, by + 6); c.moveTo(bx + 6, by - 6); c.lineTo(bx - 6, by + 6); c.stroke(); c.fillStyle = css("--lu-upper"); c.textAlign = "right"; c.font = fnt(11, 1); c.fillText("breaks", bx - 9, by + 4); }
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
      for (var r = 0; r < rows; r++) { var row = useRate ? kymo[r].rate : kymo[r].row; for (var i = 0; i < N; i++) { var col = useRate ? rateCol(row[i] / 255, isDark()) : L.viridisish(row[i] / kmx), o = (r * N + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; } }
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
  /* Side view: a cut through the crystal. Rows of iron atoms, the slip plane between two of them, and an edge dislocation =
     one extra half-row of atoms pushed in from the top. It glides along the slip plane; each time one crosses the whole
     block, the top half has slid one atom spacing over the bottom half (that is the permanent stretch). Carbon atoms sit
     in the roomy spot just under the end of the extra half-row and hold it there until the pull is big enough. */
  function drawSide(c, w, h, i, st, dark, live) {
    var a = Math.max(18, Math.min(26, h / 9)), yS = h * 0.52, rows = Math.ceil(yS / a) + 1;
    var bx0 = Math.max(44, w * 0.07), bx1 = w - Math.max(44, w * 0.07), M = Math.floor((bx1 - bx0) / a), bw = M * a, s0 = a * 0.9;
    var xpin = bx0 + bw * 0.38, margin = a * 2, cyc = bw + 2 * margin;
    var ink = dark ? "#7fb2ff" : "#1d4ed8", carbon = dark ? "#f5a524" : "#b45309", fe = dark ? "#6b7685" : "#a5b0be", feE = dark ? "#8792a2" : "#7d8896";
    /* where the dislocation is, and how many have crossed the block */
    var xd, n = 0;
    if (st === 0 || st === 1) { xd = xpin + Math.pow(mState.ratio, 2) * a * 0.45; mState.slid = 0; }
    else {
      if (live) mState.glide += (st === 2 ? 3.2 : 1.1) * Math.max(0.3, Math.min(3, S.speed));
      var d0 = xpin - (bx0 - margin) + mState.glide;
      n = Math.floor(d0 / cyc); xd = bx0 - margin + (d0 - n * cyc);
      mState.slid = n;
    }
    var nShow = Math.min(n, 3);
    function slip(x, r) { return 0.5 - Math.atan((x - xd) / (s0 * (1 + 0.7 * r))) / Math.PI; }   /* 1 = already slipped (left of the dislocation), 0 = not yet */
    /* the slip plane */
    c.setLineDash([6, 5]); c.strokeStyle = dark ? "rgba(203,213,225,0.35)" : "rgba(51,65,85,0.35)"; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(bx0 - a * 1.5, yS); c.lineTo(bx1 + a * 1.5, yS); c.stroke(); c.setLineDash([]);
    /* atoms: bottom half, then top half (shifted by nShow whole spacings plus the slip field) */
    var rA = a * 0.36, core = [];
    for (var r = 0; r < rows; r++) {
      var yb = yS + a / 2 + r * a, yt = yS - a / 2 - r * a;
      for (var j = 0; j <= M; j++) {
        var xb0 = bx0 + j * a, xb = xb0 - 0.4 * a * slip(xb0, r);
        if (yb < h + a) { c.fillStyle = fe; c.beginPath(); c.arc(xb, yb, rA, 0, 7); c.fill(); }
        var xt0 = bx0 + j * a + nShow * a, xt = xt0 + 0.6 * a * slip(xt0, r);
        if (yt > -a) { c.fillStyle = fe; c.beginPath(); c.arc(xt, yt, rA, 0, 7); c.fill(); if (Math.abs(xt - xd) < a * 0.5) core.push([xt, yt]); }
      }
    }
    /* the extra half-row: the top atoms whose column ends at the slip plane */
    var cx = null; if (core.length) { core.sort(function (p, q) { return q[1] - p[1]; }); cx = core[0][0]; }
    var onScreen = xd > bx0 - a && xd < bx1 + a;
    if (onScreen && cx != null) {
      core.forEach(function (p) { if (Math.abs(p[0] - cx) < a * 0.35) { c.fillStyle = ink; c.beginPath(); c.arc(p[0], p[1], rA, 0, 7); c.fill(); } });
      /* ⊥ mark at the end of the half-row */
      c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, yS - a * 0.35); c.lineTo(cx, yS + a * 0.05); c.moveTo(cx - a * 0.45, yS + a * 0.05); c.lineTo(cx + a * 0.45, yS + a * 0.05); c.stroke();
    }
    /* carbon atoms: tucked into the roomy spot under the end of the half-row (where it was pinned) */
    var bnd = st === 0 || st === 1 ? 1 : 0, R = L.rng(11);
    for (var k = 0; k < 5; k++) {
      var ox = (k - 2) * a * 0.42 + (R() - 0.5) * a * 0.15, oy = a * 0.12 + (k % 2) * a * 0.32;
      var fx = R() * w, fy = yS + a * (1 + R() * (rows - 1));
      var x = xpin + ox, y = yS + oy;   /* carbon is far too slow to move during a test: it stays where it was, the dislocation leaves it */
      c.fillStyle = carbon; c.beginPath(); c.arc(x, y, a * 0.19, 0, 7); c.fill();
    }
    /* labels */
    var lab = function (txt, x, y, tx, ty, col) {
      c.font = fnt(12, 1); var tw = c.measureText(txt).width; x = Math.max(4, Math.min(w - tw - 6, x));
      if (tx != null) { c.strokeStyle = col || (dark ? "#cbd5e1" : "#334155"); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + (tx > x + tw / 2 ? tw : 0), y - 4); c.lineTo(tx, ty); c.stroke(); }
      c.fillStyle = dark ? "rgba(21,26,34,0.88)" : "rgba(246,248,251,0.92)"; c.fillRect(x - 3, y - 13, tw + 6, 17);
      c.fillStyle = col || (dark ? "#e5e9ef" : "#1e2733"); c.textAlign = "left"; c.fillText(txt, x, y);
    };
    var tc = dark ? "#cbd5e1" : "#334155";
    /* the push along the slip plane: top half → , bottom half ← */
    c.strokeStyle = dark ? "#ff7b61" : "#d4351c"; c.fillStyle = c.strokeStyle; c.lineWidth = 2.5;
    [[bx1 + a * 0.6, yS - a * 1.5, 1], [bx0 - a * 0.6, yS + a * 1.5, -1]].forEach(function (q) { var x = q[0], y = q[1], d = q[2]; c.beginPath(); c.moveTo(x - d * 22, y); c.lineTo(x, y); c.stroke(); c.beginPath(); c.moveTo(x, y); c.lineTo(x - d * 8, y - 5); c.lineTo(x - d * 8, y + 5); c.closePath(); c.fill(); });
    lab("iron atoms", bx0 - 6, 16, bx0 + a * 1.4, yS - a * 2.5, tc);
    lab("slip plane", bx0 + a * 0.2, yS - 6, null, null, tc);
    if (onScreen && cx != null) lab(st === 0 || st === 1 ? "dislocation = an extra half-row of atoms (stuck)" : "dislocation (free): sliding along →", Math.min(cx + a * 0.8, w - 260), yS - a * 2.6, cx + 2, yS - a * 0.9, ink);
    if (bnd > 0.5) lab("carbon atoms hold it", xpin - a * 4.5, yS + a * 2.2, xpin, yS + a * 0.35, carbon);
    else lab("carbon left behind", xpin - a * 3, h - 10, xpin, yS + a * 0.6, carbon);
    if (mState.switchT && performance.now() - mState.switchT < 2200) { c.font = fnt(13, 1); var mt = "→ next slice: " + Math.round((i + 0.5) / sim.p.N * sim.p.Lg) + " mm, just ahead of the front", tw2 = c.measureText(mt).width; c.fillStyle = dark ? "#6d28d9" : "#7c3aed"; c.fillRect(w / 2 - tw2 / 2 - 8, h - 30, tw2 + 16, 22); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(mt, w / 2, h - 14); c.textAlign = "left"; }
    else if (n > 0) lab("top half has slid " + n + " atom" + (n === 1 ? "" : "s") + " along →", bx1 - 250, h - 10, null, null, ink);
  }
  function drawMicro(ts) {
    var cv = $("lu-mcv"); if (!cv || !sim) return;
    var F = fit(cv, S.mview === "top" ? Math.max(170, Math.min(240, cv.parentNode.clientWidth * 0.32)) : Math.max(200, Math.min(270, cv.parentNode.clientWidth * 0.36))), c = F.c, w = F.w, h = F.h;
    var i = microIdx(); if (i < 0) i = 0;
    var st = sim.st[i], dark = isDark();
    c.fillStyle = dark ? "#151a22" : "#f6f8fb"; c.fillRect(0, 0, w, h);
    var follow = $("lu-follow").checked, live = running && !document.hidden;
    var snap = false;
    if (i !== mState.last) { if (mState.last >= 0 && follow) mState.switchT = performance.now(); mState.last = i; mState.glide = 0; mState.slid = 0; snap = true; }
    /* smooth changes (following the front switches slices; the picture eases instead of jumping) */
    var ratio0 = st === 0 ? Math.min(1, sim.s / Math.max(1, sim.sU[i])) : 1;
    var fArr0 = sim.tgt[i] > 0 ? Math.min(1, sim.ep[i] / sim.tgt[i]) : 1;
    var boundT = st === 0 || st === 1 ? 1 : st === 3 && sim.agedTimes ? 0.2 : Math.max(0, 1 - fArr0 * 1.3);
    var ez = live && !snap ? 0.12 : 1;
    mState.bound = mState.bound == null ? boundT : mState.bound + (boundT - mState.bound) * ez;
    mState.ratio = mState.ratio == null ? ratio0 : mState.ratio + (ratio0 - mState.ratio) * ez;
    var sig = sim.s;
    if (S.mview !== "top") { drawSide(c, w, h, i, st, dark, live); }
    else {
    /* lattice */
    var a = 16; c.fillStyle = dark ? "rgba(160,175,195,0.20)" : "rgba(90,105,125,0.18)";
    for (var y = a / 2; y < h; y += a) for (var x = a / 2; x < w; x += a) { c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    var yLine = h * 0.5, pins = [], np = 9;
    for (var k = 0; k < np; k++) pins.push(w * (0.08 + 0.84 * k / (np - 1)));
    var thr = sim.threshold(i), ratio = st === 0 ? Math.min(1, sig / Math.max(1, sim.sU[i])) : 1;
    var running2 = running ? 1 : 0;
    if (st === 2 || st === 3) mState.glide += (st === 2 ? 2.2 : 0.6) * running2 * Math.max(0.3, S.speed);
    var ink = dark ? "#7fb2ff" : "#1d4ed8", carbon = dark ? "#f5a524" : "#b45309";
    /* carbon atoms */
    var fArr = sim.tgt[i] > 0 ? Math.min(1, sim.ep[i] / sim.tgt[i]) : 1;
    var R = L.rng(5);
    for (k = 0; k < 46; k++) {
      var cx = R() * w, cy0 = yLine + (R() - 0.5) * 10, cyFree = R() * h;
      var bound = mState.bound;
      var cy = cy0 * bound + cyFree * (1 - bound);
      c.fillStyle = carbon; c.beginPath(); c.arc(cx, cy, 3.1, 0, 7); c.fill();
    }
    c.strokeStyle = ink; c.lineWidth = 3; c.lineCap = "round";
    if (st === 0 || st === 1) {
      /* pinned line, bowing between pins as the stress rises */
      var bow = Math.pow(mState.ratio, 2) * 22 * (st === 1 ? 1.15 : 1);
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
    /* labels on the picture */
    var lab = function (txt, x, y, tx, ty, col) {
      c.font = fnt(12, 1); var tw = c.measureText(txt).width;
      if (tx != null) { c.strokeStyle = col || (dark ? "#cbd5e1" : "#334155"); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + (tx > x ? tw : 0), y - 4); c.lineTo(tx, ty); c.stroke(); }
      c.fillStyle = dark ? "rgba(21,26,34,0.85)" : "rgba(246,248,251,0.9)"; c.fillRect(x - 3, y - 13, tw + 6, 17);
      c.fillStyle = col || (dark ? "#e5e9ef" : "#1e2733"); c.textAlign = "left"; c.fillText(txt, x, y);
    };
    if (st === 0 || st === 1) {
      lab("carbon atoms pin the line", w * 0.06, yLine + 38, pins[2], yLine + 4, carbon);
      lab("dislocation line (stuck)", w * 0.56, yLine - 34, (pins[5] + pins[6]) / 2, yLine - Math.pow(ratio, 2) * 22 * 0.9, ink);
    } else if (!sim.neck || !sim.neck.w[i]) {
      lab("free dislocation lines, seen from above: each slides up the picture", w * 0.05, 18, null, null, ink);
      lab("carbon left behind", w * 0.62, h - 12, null, null, carbon);
    }
    }
    /* pull arrows at the sides (the side view draws its own: top half one way, bottom half the other) */
    if (S.mview === "top") {
    c.strokeStyle = dark ? "#ff7b61" : "#d4351c"; c.fillStyle = c.strokeStyle; c.lineWidth = 2.5;
    [[6, -1], [w - 6, 1]].forEach(function (a) { var x = a[0], y = h - 26; c.beginPath(); c.moveTo(x - a[1] * 26, y); c.lineTo(x, y); c.stroke(); c.beginPath(); c.moveTo(x, y); c.lineTo(x - a[1] * 8, y - 5); c.lineTo(x - a[1] * 8, y + 5); c.closePath(); c.fill(); });
    }
    /* where the slice is on the bar */
    var bw = Math.min(220, w * 0.38), bx0 = w - bw - 10, by0 = 8;
    c.fillStyle = dark ? "rgba(21,26,34,0.9)" : "rgba(246,248,251,0.92)"; c.fillRect(bx0 - 6, by0 - 4, bw + 12, 26);
    for (var q2 = 0; q2 < sim.p.N; q2++) { var sq = sim.st[q2]; c.fillStyle = sq === 3 ? (dark ? "#8b95a5" : "#94a3b8") : sq === 0 ? (dark ? "#3b4452" : "#dbe2ea") : "#f59e0b"; c.fillRect(bx0 + q2 / sim.p.N * bw, by0 + 6, bw / sim.p.N + 0.6, 8); }
    var mx2 = bx0 + (i + 0.5) / sim.p.N * bw; c.fillStyle = dark ? "#b794f6" : "#7c3aed"; c.beginPath(); c.moveTo(mx2, by0 + 15); c.lineTo(mx2 - 5, by0 + 22); c.lineTo(mx2 + 5, by0 + 22); c.closePath(); c.fill();
    c.font = fnt(10); c.fillStyle = dark ? "#aab4c0" : "#5b6573"; c.textAlign = "right"; c.fillText("this slice ▲", bx0 - 10, by0 + 15);
    /* story stage + stress meter */
    var inNeck = sim.neck && sim.neck.w[i] > 0.3, stage = inNeck ? 4 : st;
    root.querySelectorAll("#lu-mstages li").forEach(function (li) { var k = +li.getAttribute("data-s"); li.className = k === stage ? "is-now" : k < stage ? "is-done" : ""; });
    var need = st === 0 ? sim.sU[i] : sim.threshold(i), frac = Math.max(0, Math.min(1, sig / Math.max(1, need)));
    var mh = st === 0 ? '<span class="lu-mm__l">Pull on this slice: <b>' + fS(sig) + '</b> of the <b>' + fS(need) + '</b> needed to tear the lines free</span><span class="lu-mm__b"><span style="width:' + (frac * 100).toFixed(1) + '%"></span></span>'
      : '<span class="lu-mm__l">This slice has stretched <b>' + L.pct(sim.ep[i], 1) + '</b> for good' + (inNeck ? " (it is in the neck)" : "") + '</span><span class="lu-mm__b lu-mm__b--e"><span style="width:' + Math.min(100, sim.ep[i] / Math.max(0.05, sim.p.A) * 100).toFixed(1) + '%"></span></span>';
    var mm = $("lu-mmeter"); if (mm.__h !== mh) { mm.innerHTML = mh; mm.__h = mh; }
    /* caption */
    var cap, xmm = Math.round((i + 0.5) / sim.p.N * sim.p.Lg);
    if (st === 0) cap = "Slice at " + xmm + " mm: <b>pinned.</b> Carbon atoms (orange) sit along the dislocation (blue) and hold it. The line bows as the stress rises (" + fS(sig) + " of the " + fS(sim.sU[i]) + " it needs to break away). " + (sig > sim.p.sL && sim.phase === "elastic" ? "It is already above the lower yield but it cannot move yet." : "");
    else if (st === 1) cap = "Slice at " + xmm + " mm: <b>the front is next door.</b> The stretched slice beside it pulls on it hard (the front is a stress concentration), so it lets go at about the lower yield, " + fS(sim.sF[i]) + ".";
    else if (st === 2) cap = "Slice at " + xmm + " mm: <b>breaking free.</b> The lines have torn away from their carbon atoms. Free dislocations need less stress to move than pinned ones, and they multiply, so this slice suddenly stretches by the whole Lüders strain (" + L.pct(sim.tgt[i] - (sim.agedTimes ? 0 : 0), 1) + ").";
    else cap = "Slice at " + xmm + " mm: <b>yielded</b> (" + L.pct(sim.ep[i], 2) + " plastic strain). Its dislocations are free and tangled; from here it work-hardens like any metal." + (sim.agedTimes ? "" : " Leave it a few weeks, or bake it, and the carbon atoms gather on the dislocations again (strain ageing).");
    if (inNeck) cap = "Slice at " + xmm + " mm: <b>in the neck.</b> Past the tensile strength this spot thins faster than it can harden, so it takes all the stretching (" + L.pct(sim.ep[i], 1) + "). Tiny holes open around impurities and join up" + (sim.broken ? ": that is where it broke." : ", until the bar breaks here.");
    else if (sim.p.noYP && !sim.agedTimes) cap = "Slice at " + xmm + " mm: interstitial-free steel. Titanium / niobium have locked every carbon and nitrogen atom into tiny carbides, so nothing pins the dislocations: they start moving gradually everywhere at once. No upper yield point, no band.";
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
    else if (sim.phase === "broken") t = "<b>Broken.</b> The neck at " + Math.round(sim.brokenAt.x * p.Lg) + " mm thinned until it tore apart, after " + L.pct(sim.brokenAt.strain, 1) + " stretch over the gauge. Highest force: the tensile strength, " + fS(sim.uts ? sim.uts.s : sim.maxS) + ". Look at the curve: flat (Lüders), rising (hardening), falling (necking), then zero. Drag the slider under the bar to watch any moment again.";
    else if (sim.phase === "necking") t = "<b>Necking.</b> The steel reached its tensile strength (" + fS(sim.uts.s) + "). Now one spot thins faster than it hardens, so all the stretching goes there and the force falls even though the machine keeps pulling. " + Math.round(sim.neckFrac() * 100) + "% of the way to breaking.";
    else if (sim.phase === "hardening") t = sim.agedTimes && !sim.bands ? "Pulled again straight away: no yield point, no new band, it just carries on hardening from where it was." : "<b>Work hardening.</b> The fronts have met. The whole gauge now stretches evenly and gets stronger as it goes (" + fS(sim.s) + ")." + (sim.done ? " Press <b>Pull until it breaks</b>, or unload it below and try strain ageing." : "");
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

  /* ---- what the current look means (key under the bar) ---- */
  var LOOKKEY = {
    polish: ["Polished bar", "A shiny bar, as it comes out of the machine. Where the steel has yielded (stretched for good), the surface goes dull grey. That dull stripe is the Lüders band.", "linear-gradient(90deg,#d6dce4,#9aa3ae)", "shiny = not yielded yet", "dull = yielded"],
    scale: ["Mill scale", "Hot-rolled steel has a thin dark skin of oxide (mill scale). It cannot stretch, so it cracks and flakes off wherever the steel underneath has yielded.", "linear-gradient(90deg,#3a414d,#b8b2a6)", "dark skin = not yielded", "light flakes = yielded"],
    strain: ["Strain map", "Colour shows how much each part has stretched for good (plastic strain), like the DIC cameras used in real labs.", "linear-gradient(90deg,rgb(68,1,84),rgb(59,82,139),rgb(33,145,140),rgb(94,201,98),rgb(253,231,37))", "0% stretch", "most stretch"],
    rate: ["Flowing now", "Colour shows where the steel is stretching at this moment. During the plateau only the thin band front glows: that is the only place the metal is moving. Behind it the steel has already stretched and stopped; ahead of it, it has not started.", "linear-gradient(90deg,#5c6574,#ea580c,#ffec8c)", "grey = not moving", "yellow = stretching fastest"]
  };
  function lookKey() {
    var k = LOOKKEY[S.look] || LOOKKEY.polish, el = $("lu-lookkey");
    var h = '<span class="lu-lk__bar" style="background:' + k[2] + '"></span><span class="lu-lk__ends"><span>' + k[3] + '</span><span>' + k[4] + '</span></span><span class="lu-lk__txt"><b>' + k[0] + ':</b> ' + k[1] + '</span>';
    if (el.__h !== h) { el.innerHTML = h; el.__h = h; }
  }

  /* ---- show / hide parts ---- */
  function applyShow() {
    var sh = S.show;
    $("lu-lookkey").hidden = !sh.key; $("lu-ro").hidden = !sh.ro; $("lu-say").hidden = !sh.say;
    $("lu-fchart").hidden = !sh.chart; $("lu-fkymo").hidden = !sh.kymo; $("lu-micro").hidden = !sh.micro;
    var pl = root.querySelector(".lu-plots"); pl.hidden = !sh.chart && !sh.kymo; pl.classList.toggle("lu-plots--one", !sh.chart !== !sh.kymo);
    root.querySelectorAll("#lu-show [data-show]").forEach(function (b) { b.setAttribute("aria-pressed", sh[b.getAttribute("data-show")] ? "true" : "false"); });
  }
  $("lu-show").addEventListener("click", function (e) { var b = e.target.closest("[data-show]"); if (!b) return; var k = b.getAttribute("data-show"); S.show[k] = S.show[k] ? 0 : 1; save(); applyShow(); setTimeout(drawAll, 30); });

  /* ---- rewind slider ---- */
  $("lu-scrub").addEventListener("input", function () { goTo(+this.value); });
  $("lu-scrubw").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sc]"); if (!b) return; var a = b.getAttribute("data-sc"), step = Math.max(1, Math.round(hist.length / 60));
    goTo(a === "start" ? 0 : a === "end" ? hist.length - 1 : a === "back" ? histPos - step : histPos + step);
  });

  /* ---- "?" glossary ---- */
  var gl = $("lu-gloss");
  function openGloss(term) {
    gl.hidden = false; $("lu-gbtn").setAttribute("aria-expanded", "true");
    gl.querySelectorAll(".lu-g-on").forEach(function (x) { x.classList.remove("lu-g-on"); });
    if (term) { var dt = gl.querySelector('[data-term="' + term + '"]'); if (dt) { dt.classList.add("lu-g-on"); var dd = dt.nextElementSibling; if (dd) dd.classList.add("lu-g-on"); var box = gl.querySelector(".lu-g-list"); box.scrollTop = dt.offsetTop - box.offsetTop - 6; } }
  }
  $("lu-gbtn").addEventListener("click", function () { if (gl.hidden) openGloss(); else { gl.hidden = true; this.setAttribute("aria-expanded", "false"); } });
  $("lu-gclose").addEventListener("click", function () { gl.hidden = true; $("lu-gbtn").setAttribute("aria-expanded", "false"); });
  root.addEventListener("click", function (e) { var b = e.target.closest("[data-gl]"); if (b) { e.preventDefault(); openGloss(b.getAttribute("data-gl")); } });

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
    seg("lu-look", S.look); lookKey(); applyShow(); seg("lu-units", S.units); seg("lu-lean", String(+S.lean || 0)); seg("lu-mview", S.mview === "top" ? "top" : "side");
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
  $("lu-mview").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.mview = b.getAttribute("data-v"); mState.ratio = mState.bound = null; save(); syncUI(); drawAll(); });
  $("lu-lean").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.lean = +b.getAttribute("data-v"); changed(true); toast(S.lean === 0 ? "Lean: chosen by the bar (new bar)" : S.lean === 2 ? "Each new band leans the other way (new bar)" : "Every band leans " + (S.lean < 0 ? "╱" : "╲") + " (new bar)"); });
  $("lu-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.units = b.getAttribute("data-v"); save(); syncUI(); drawAll(); say(); });
  $("lu-agesel").addEventListener("change", syncUI);
  $("lu-clrnotch").addEventListener("click", function () { S.notches = []; changed(true); });
  $("lu-link").addEventListener("click", function () {
    var q = L.toQuery({ m: S.m, eL: S.eL, uy: S.uy, k: S.k, v: S.v, sc: S.sc, r: S.r, g: S.g, n: S.notches.length ? S.notches.map(function (x) { return x.toFixed(3); }).join(",") : null, ln: S.lean ? S.lean : null });
    var url = location.origin + location.pathname + (q ? "?" + q : "");
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
  });

  /* ---- run controls ---- */
  $("lu-go").addEventListener("click", function () {
    seq = null;
    if (running) { setRun(false); afterStop(); return; }
    if (sim.broken) { newSim(); return; }
    if (histPos >= 0 && histPos < hist.length - 1) branch();
    if (sim.done || sim.strain() >= endStrain - 1e-9) { endStrain = (sim.phase === "hardening" || sim.phase === "necking") ? sim.p.A + 0.03 : sim.strain() + 0.025; sim.done = false; }
    sim.unloadedNow = false;
    $("lu-unload").disabled = true; $("lu-reload").disabled = true;
    setRun(true);
  });
  $("lu-reset").addEventListener("click", function () { seq = null; newSim(); });
  $("lu-unload").addEventListener("click", function () { doUnload(); });
  $("lu-reload").addEventListener("click", function () { doReload(); });
  function doUnload() {
    setRun(false); sim.unload(); sim.unloadedNow = true; sim.done = false;
    $("lu-unload").disabled = true; $("lu-reload").disabled = false; pushKymo(); record(true); drawAll(); say();
    $("lu-agemsg").textContent = "Unloaded with " + L.pct(sim.P / sim.p.Lg, 2) + " permanent stretch. Pick a waiting time and press Pull again.";
  }
  function doReload() {
    if (sim.neck) { $("lu-agemsg").textContent = "This bar has already started to neck: a real lab would throw it away. Press New bar."; return; }
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
    selIdx = i; $("lu-follow").checked = false; drawAll();
    var card = document.querySelector("#lu .lu-micro"), xmm = ((i + 0.5) / sim.p.N * sim.p.Lg).toFixed(1);
    if ($("lu-view").classList.contains("mes-pfill") || document.fullscreenElement) { toast("Slice at " + xmm + " mm picked: close Fill window to see it in Inside the metal"); return; }
    var r = card.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight) { var to = window.scrollY + r.top - Math.max(70, (window.innerHeight - r.height) / 2); try { window.scrollTo({ top: to, behavior: "smooth" }); } catch (e) { window.scrollTo(0, to); } setTimeout(function () { var q = card.getBoundingClientRect(); if (q.top > window.innerHeight || q.bottom < 0) window.scrollTo(0, to); }, 900); }
    card.classList.remove("lu-flash"); void card.offsetWidth; card.classList.add("lu-flash");
  });
  spec.addEventListener("pointermove", function (ev) {
    var i = sliceAt(ev); if (i < 0) { tip.hidden = true; return; }
    var names = ["pinned (not yielded)", "next to the front", "yielding", "yielded"], r = spec.getBoundingClientRect();
    tip.innerHTML = "<b>" + ((i + 0.5) / sim.p.N * sim.p.Lg).toFixed(1) + " mm</b> · " + names[sim.st[i]] + "<br>plastic strain " + L.pct(sim.ep[i], 2) + ($("lu-notchmode").checked ? "<br><i>click to add / remove a notch</i>" : "<br><i>click to watch it inside (panel below)</i>");
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
    else if (e.key === "," || e.key === ".") { e.preventDefault(); goTo(histPos + (e.key === "," ? -1 : 1) * Math.max(1, Math.round(hist.length / 120))); }
    else if ((e.key === "Home" || e.key === "End") && root.contains(document.activeElement) && document.activeElement.id !== "lu-scrub") { e.preventDefault(); goTo(e.key === "Home" ? 0 : hist.length - 1); }
    else if (e.key === "p" || e.key === "P") { var order = ["polish", "scale", "strain", "rate"]; S.look = order[(order.indexOf(S.look) + 1) % 4]; save(); syncUI(); drawAll(); }
  });

  /* ---- front-angle figure ---- */
  var angDrag = false, aLean = 1;
  try { aLean = localStorage.getItem("mes-luders:alean") === "-1" ? -1 : 1; } catch (e) {}
  function setALean(v, quiet) { aLean = v; [].forEach.call(document.querySelectorAll("#lu .lu-alean button"), function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-l") === v)); }); try { localStorage.setItem("mes-luders:alean", String(v)); } catch (e) {} if (!quiet) drawAngle(); }
  function drawAngle() {
    var svg = $("lu-ang"), r = +$("lu-ar").value, th = L.frontAngle(r), my = +$("lu-aa").value, k = TXS(), sg = aLean;
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
    var h1 = P(sg * my, R0), h0 = P(sg * my + 180, R0);
    g += '<line x1="' + h0[0] + '" y1="' + h0[1] + '" x2="' + h1[0] + '" y2="' + h1[1] + '" class="lu-a-my' + (ok ? ' lu-a-ok' : '') + '"/>';
    g += '<circle cx="' + h1[0] + '" cy="' + h1[1] + '" r="11" class="lu-a-h' + (ok ? ' lu-a-ok' : '') + '" id="lu-ah"/>';
    g += '<path d="M' + (cx + 34) + ',' + cy + ' A34,34 0 0 ' + (sg > 0 ? 0 : 1) + ' ' + P(sg * th, 34)[0] + ',' + P(sg * th, 34)[1] + '" class="lu-a-arc"/>';
    g += '<text x="' + (cx + 40) + '" y="' + (sg > 0 ? cy - 8 : cy + 8 + Math.round(14 * k)) + '" class="lu-a-t lu-a-th" style="font-size:' + Math.round(14 * k) + 'px">' + (sg > 0 ? 'θ' : '−θ') + '</text>';
    svg.innerHTML = g;
    /* readout: grows / shrinks, with a centre-zero meter */
    var pc = Math.round(Math.abs(lineE) * 100), w = Math.min(50, Math.abs(lineE) * 50);
    var meter = '<span class="lu-meter" aria-hidden="true"><span class="lu-meter__z"></span><span class="lu-meter__b' + (ok ? ' lu-meter__b--ok' : lineE > 0 ? ' lu-meter__b--up' : ' lu-meter__b--dn') + '" style="left:' + (lineE >= 0 ? 50 : 50 - w) + '%;width:' + Math.max(ok ? 2 : 0, w) + '%"></span></span><span class="lu-meter__k" aria-hidden="true"><span>shrinks</span><span>same length</span><span>grows</span></span>';
    var txt = ok ? "<b class='lu-good'>Same length: the band front can run here.</b>"
      : lineE > 0 ? "<b>Gets longer</b> by " + pc + "% of the pull. Turn it more upright."
      : "<b>Gets shorter</b> by " + pc + "% of the pull. Turn it back towards the pull.";
    $("lu-angout").innerHTML = meter + '<span class="lu-angtxt">' + txt + "</span>";
    $("lu-angst").innerHTML = 'Band: ±' + th.toFixed(1) + '° · test line: ' + (sg > 0 ? '╱ ' : '╲ ') + my.toFixed(1) + '° ' + (ok ? '<span class="lu-good">✓ on the band</span>' : lineE > 0 ? '(grows)' : '(shrinks)');
  }
  $("lu-ar").addEventListener("input", drawAngle);
  $("lu-aa").addEventListener("input", drawAngle);
  var angSvg = $("lu-ang");
  angSvg.addEventListener("pointerdown", function (e) { if (e.target.id === "lu-ah" || e.target.classList.contains("lu-a-my")) { stopSweep(); angDrag = true; angSvg.setPointerCapture(e.pointerId); e.preventDefault(); } });
  angSvg.addEventListener("pointermove", function (e) {
    if (!angDrag) return; var pt = angSvg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; pt = pt.matrixTransform(angSvg.getScreenCTM().inverse()); var x = pt.x - 220, y = 150 - pt.y;
    var d = Math.atan2(y, x) * 180 / Math.PI; if (d < 0) d += 180; var sNew = 1; if (d > 90) { d = 180 - d; sNew = -1; }
    if (sNew !== aLean && d > 1) setALean(sNew, true);
    $("lu-aa").value = Math.round(d * 10) / 10; drawAngle();
  });
  angSvg.addEventListener("pointerup", function () { angDrag = false; });
  $("lu-ar").value = S.r;
  /* sweep, snap, width, fill window for the 55° figure */
  var sweepT = 0, sweepDir = 1;
  function stopSweep() { if (sweepT) { clearInterval(sweepT); sweepT = 0; $("lu-asweep").textContent = "▶ Sweep"; } }
  $("lu-asweep").addEventListener("click", function () {
    if (sweepT) return stopSweep();
    this.textContent = "❚❚ Stop";
    sweepT = setInterval(function () { var a = $("lu-aa"), v = +a.value + sweepDir * 0.5; if (v >= 90) { v = 90; sweepDir = -1; } if (v <= 0) { v = 0; sweepDir = 1; } a.value = v; drawAngle(); }, 40);
  });
  $("lu-asnap").addEventListener("click", function () { stopSweep(); $("lu-aa").value = Math.round(L.frontAngle(+$("lu-ar").value) * 10) / 10; drawAngle(); });
  $("lu-aa").addEventListener("pointerdown", stopSweep);
  var awide = 0; try { awide = +localStorage.getItem("mes-luders:awide") || 0; } catch (e) {}
  function setWide(w) { awide = w; $("lu-angview").classList.toggle("lu-awide-on", !!w); [].forEach.call(document.querySelectorAll("#lu .lu-awide button"), function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-w") === w)); }); try { localStorage.setItem("mes-luders:awide", w); } catch (e) {} }
  [].forEach.call(document.querySelectorAll("#lu .lu-awide button"), function (b) { b.addEventListener("click", function () { setWide(+b.getAttribute("data-w")); }); });
  setWide(awide);
  [].forEach.call(document.querySelectorAll("#lu .lu-alean button"), function (b) { b.addEventListener("click", function () { setALean(+b.getAttribute("data-l")); }); });
  setALean(aLean, true);
  /* picture beside the text when the card is wide enough; ⇄ Side swaps them */
  var angC = root.querySelector(".lu-angc"), aSideR = false;
  try { aSideR = localStorage.getItem("mes-luders:aside") === "R"; } catch (e) {}
  function angLayout() { var two = angC.clientWidth >= 880 && !awide; if (two !== angC.classList.contains("lu-ang2")) { angC.classList.toggle("lu-ang2", two); setTimeout(drawAngle, 30); } angC.classList.toggle("lu-angR", aSideR); }
  $("lu-aside").addEventListener("click", function () { aSideR = !aSideR; try { localStorage.setItem("mes-luders:aside", aSideR ? "R" : "L"); } catch (e) {} angLayout(); });
  if (window.ResizeObserver) new ResizeObserver(angLayout).observe(angC); window.addEventListener("resize", angLayout);
  [].forEach.call(document.querySelectorAll("#lu .lu-awide button"), function (b) { b.addEventListener("click", angLayout); });
  angLayout();
  function addAngPanel() { var v = $("lu-angview"); if (window.MESPanel && !v.__mesPanel) { window.MESPanel.add(v, { bar: v.querySelector(".lu-angbtns"), onChange: function () { setTimeout(drawAngle, 40); } }); } }
  if (document.readyState === "complete") addAngPanel(); else window.addEventListener("load", addAngPanel);
  setTimeout(addAngPanel, 1500);

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

  /* ---- sections: collapse, and drag (or ▲ ▼) to change their order ---- */
  (function () {
    var LKEY = KEY + ":lay", SECS = [["test", "#lu-view", "The test"], ["set", ".lu-grid2", "The bar, the machine and strain ageing"], ["micro", "#lu-micro", "Inside the metal"], ["angle", ".lu-angc", "Why the band leans at about 55°"], ["photos", "#lu-photos", "Real photos"]];
    var lay = {}; try { lay = JSON.parse(localStorage.getItem(LKEY) || "{}") || {}; } catch (e) {}
    lay.col = lay.col || {};
    var wraps = {};
    SECS.forEach(function (d) {
      var el = root.querySelector(d[1]); if (!el) return;
      var w = document.createElement("div"); w.className = "lu-sec"; w.setAttribute("data-sec", d[0]);
      el.parentNode.insertBefore(w, el);
      var bar = document.createElement("div"); bar.className = "lu-secbar";
      bar.innerHTML = '<button type="button" class="lu-sgrip" aria-label="Drag to move this section" title="Drag to move this section">⠿</button><button type="button" class="lu-stitle" aria-expanded="true"><span class="lu-scar" aria-hidden="true">▾</span> ' + d[2] + '</button><button type="button" class="lu-shalf" aria-pressed="false" title="Half width: two half-width sections sit side by side">½ width</button><span class="lu-smove"><button type="button" data-mv="-1" aria-label="Move up" title="Move up">▲</button><button type="button" data-mv="1" aria-label="Move down" title="Move down">▼</button></span>';
      w.appendChild(bar); w.appendChild(el); wraps[d[0]] = w;
    });
    var outer = wraps.test && wraps.test.parentNode;
    if (!outer) return;
    var host = document.createElement("div"); host.className = "lu-secs";
    var firstSec = outer.querySelector(":scope > .lu-sec"); outer.insertBefore(host, firstSec);
    [].slice.call(outer.querySelectorAll(":scope > .lu-sec")).forEach(function (w) { host.appendChild(w); });
    var pair = document.createElement("div"); pair.className = "lu-pair";
    pair.innerHTML = '<button type="button" aria-pressed="false" title="Each section bar also has a ½ button">▥ The test and Inside the metal side by side</button>';
    outer.insertBefore(pair, host);
    function list() { return Array.prototype.slice.call(host.querySelectorAll(":scope > .lu-sec")); }
    function save2() { lay.order = list().map(function (w) { return w.getAttribute("data-sec"); }); try { localStorage.setItem(LKEY, JSON.stringify(lay)); } catch (e) {} }
    function setCol(w, on) { w.classList.toggle("is-col", on); var t = w.querySelector(".lu-stitle"); t.setAttribute("aria-expanded", on ? "false" : "true"); t.querySelector(".lu-scar").textContent = on ? "▸" : "▾"; }
    if (!lay.half) { lay.half = { test: 1, micro: 1 }; lay.defPair = 1; }
    function setHalf(w, on) { w.classList.toggle("is-half", on); w.querySelector(".lu-shalf").setAttribute("aria-pressed", String(on)); }
    function pairOn() { var L3 = list(); return !!(lay.half.test && lay.half.micro && Math.abs(L3.indexOf(wraps.test) - L3.indexOf(wraps.micro)) === 1); }
    function syncPair() { pair.querySelector("button").setAttribute("aria-pressed", String(pairOn())); }
    function halfOk() { var ok = host.clientWidth >= 980; if (ok !== host.classList.contains("lu-halfok")) { host.classList.toggle("lu-halfok", ok); redraw(); } pair.hidden = !ok; }
    if (window.ResizeObserver) new ResizeObserver(halfOk).observe(host);
    pair.addEventListener("click", function () {
      var on = !pairOn();
      lay.half.test = on ? 1 : 0; lay.half.micro = on ? 1 : 0; setHalf(wraps.test, on); setHalf(wraps.micro, on);
      if (on) { host.insertBefore(wraps.micro, wraps.test.nextSibling); setCol(wraps.test, false); setCol(wraps.micro, false); lay.col.test = lay.col.micro = 0; }
      save2(); syncPair(); redraw();
    });
    var tail = null;
    if (lay.defPair && !Array.isArray(lay.order)) lay.order = ["test", "micro", "set", "angle", "photos"];
    if (Array.isArray(lay.order)) { var seen = {}; lay.order.concat(SECS.map(function (d) { return d[0]; })).forEach(function (k) { if (wraps[k] && !seen[k]) { seen[k] = 1; host.insertBefore(wraps[k], tail); } }); }
    var toast2 = $("lu-toast"); if (toast2) outer.insertBefore(toast2, host.nextSibling);
    Object.keys(wraps).forEach(function (k) { setCol(wraps[k], !!lay.col[k]); setHalf(wraps[k], !!lay.half[k]); });
    halfOk(); syncPair();
    function redraw() { setTimeout(function () { drawAll(); drawAngle(); }, 30); }
    host.addEventListener("click", function (e) {
      var w = e.target.closest(".lu-sec"); if (!w || e.target.closest(".lu-sec") !== w) return;
      if (e.target.closest(".lu-shalf")) { var hk = w.getAttribute("data-sec"), hon = !w.classList.contains("is-half"); setHalf(w, hon); lay.half[hk] = hon ? 1 : 0; save2(); syncPair(); redraw(); return; }
      if (e.target.closest(".lu-stitle")) { var on = !w.classList.contains("is-col"); setCol(w, on); lay.col[w.getAttribute("data-sec")] = on ? 1 : 0; save2(); if (!on) redraw(); return; }
      var mv = e.target.closest(".lu-secbar [data-mv]");
      if (mv) { var L2 = list(), i = L2.indexOf(w), j = i + (+mv.getAttribute("data-mv")); if (j < 0 || j >= L2.length) return; host.insertBefore(w, +mv.getAttribute("data-mv") > 0 ? L2[j].nextSibling : L2[j]); save2(); syncPair(); redraw(); mv.focus(); }
    });
    /* drag by the grip: the section follows the pointer between the others */
    var drag = null;
    host.addEventListener("pointerdown", function (e) {
      var g = e.target.closest(".lu-sgrip"); if (!g) return;
      var w = g.closest(".lu-sec"); e.preventDefault(); g.setPointerCapture(e.pointerId);
      drag = { w: w, g: g }; w.classList.add("is-drag"); host.classList.add("lu-dragging");
    });
    host.addEventListener("pointermove", function (e) {
      if (!drag) return; var y = e.clientY;
      var L2 = list().filter(function (x) { return x !== drag.w; }), before = null;
      for (var i = 0; i < L2.length; i++) { var r = L2[i].getBoundingClientRect(); if (y < r.top + Math.min(r.height / 2, 120)) { before = L2[i]; break; } }
      var cur = drag.w.nextElementSibling; while (cur && !cur.classList.contains("lu-sec")) cur = cur.nextElementSibling;
      if (before !== cur) { if (before) host.insertBefore(drag.w, before); else { var last = L2[L2.length - 1]; host.insertBefore(drag.w, last.nextSibling); } }
      if (y < 60) window.scrollBy(0, -14); else if (y > window.innerHeight - 60) window.scrollBy(0, 14);
    });
    function endDrag() { if (!drag) return; drag.w.classList.remove("is-drag"); host.classList.remove("lu-dragging"); drag = null; save2(); syncPair(); redraw(); }
    host.addEventListener("pointerup", endDrag); host.addEventListener("pointercancel", endDrag);
    host.addEventListener("keydown", function (e) {
      var g = e.target.closest(".lu-sgrip"); if (!g || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault(); var b = g.closest(".lu-sec").querySelector('[data-mv="' + (e.key === "ArrowUp" ? -1 : 1) + '"]'); b.click(); g.focus();
    });
    var rb = document.createElement("button"); rb.type = "button"; rb.className = "lu-secreset"; rb.textContent = "Reset section order";
    rb.addEventListener("click", function () { SECS.forEach(function (d) { if (wraps[d[0]]) { host.appendChild(wraps[d[0]]); setCol(wraps[d[0]], false); setHalf(wraps[d[0]], false); } }); lay = { col: {}, half: {} }; syncPair(); try { localStorage.removeItem(LKEY); } catch (e) {} redraw(); });
    outer.insertBefore(rb, host.nextSibling);
  })();

  /* ---- fill window / full screen ---- */
  function addPanel() { if (window.MESPanel && !$("lu-view").__mesPanel) { window.MESPanel.add($("lu-view"), { bar: $("lu-vbar").querySelector(".lu-vbtns"), stage: $("lu-stage"), onChange: function () { setTimeout(drawAll, 40); } }); } }
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
