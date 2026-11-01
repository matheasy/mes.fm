/* node tool_apps_src/neuron-simulator-tests.js */
const N = require("./neuron-simulator/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
const P = N.params();
/* Hodgkin-Huxley membrane at 6.3 degC */
{ const s = N.rest(P); near(s[0], -65, 0.1, "HH resting potential");
  const a = N.analyse(N.simulate(P, { amp: 20, dur: 1 }, 30));
  ok(a.spikes.length === 1, "one pulse, one spike"); near(a.spikes[0].peak, 40, 3, "spike peak about +40 mV");
  near(a.spikes[0].thr, -55, 4, "threshold voltage about -55 mV"); ok(a.min < -70 && a.min > -78, "undershoot below rest, above E_K (" + a.min + ")");
  ok(a.spikes[0].width > 1 && a.spikes[0].width < 2.5, "half-width 1-2.5 ms at 6.3 degC"); }
{ const t = N.threshold(P, 1); ok(t > 5 && t < 9, "1 ms threshold current 5-9 uA/cm2 (" + t + ")");
  ok(N.threshold(P, 0.1) > 5 * t, "short pulses need much more current (strength-duration)"); }
/* refractory periods */
{ const t = N.threshold(P, 1); ok(N.secondThreshold(P, 3, t) === null && N.secondThreshold(P, 5, t) === null, "absolute refractory at 3 and 5 ms"); const r8 = N.secondThreshold(P, 8, t); ok(r8 && r8 > 2 * t, "relative refractory at 8 ms needs >2x current"); const r30 = N.secondThreshold(P, 30, t); ok(r30 && r30 < 1.5 * t, "recovered by 30 ms"); }
/* drugs and conditions */
{ ok(N.analyse(N.simulate(N.params({ ttx: 1 }), { amp: 40, dur: 1 }, 30)).spikes.length === 0, "TTX (full Na block) abolishes the spike");
  const w0 = N.analyse(N.simulate(P, { amp: 20, dur: 1 }, 40)).spikes[0].width, w1 = N.analyse(N.simulate(N.params({ tea: 0.3 }), { amp: 20, dur: 1 }, 40)).spikes[0].width; ok(w1 > 1.05 * w0, "TEA (K block) broadens the spike (" + w0 + " -> " + w1 + ")");
  ok(N.analyse(N.simulate(N.params({ tea: 0.6 }), { amp: 10, dur: 1 }, 100)).spikes.length >= 3, "strong K block: the model fires by itself");
  near(N.ekShift(7), 26.73 * Math.log(7 / 4), 0.05, "hyperkalaemia moves E_K by the Nernst amount"); ok(N.rest(N.params({ Ko: 7 }))[0] > -65, "hyperkalaemia depolarises rest");
  const cool = N.analyse(N.simulate(N.params({ T: 18.5 }), { amp: 20, dur: 1 }, 30)).spikes[0]; ok(cool.width < 0.7, "warmer = faster, narrower spike");
  ok(N.analyse(N.simulate(N.params({ T: 36 }), { amp: 60, dur: 1 }, 30)).spikes.length === 0, "the squid model fails (heat block) at 36 degC");
  const L = N.params({ lido: 1 }), tr = N.simulate(L, { amp: 30, dur: 0.5, n: 10, gap: 10 }, 110); ok(tr.b[tr.len - 1] > tr.b[0] + 0.05, "lidocaine block builds up with use"); }
/* voltage clamp: inward Na current then outward K current at 0 mV */
{ const v = N.vclamp(P, -65, 0, 10, 1, 9); let mn = 0, i = 0; for (; i < v.len; i++) mn = Math.min(mn, v.iNa[i]); ok(mn < -400, "early inward Na current at 0 mV (" + mn + ")"); ok(v.iK[950] > 400, "late outward K current"); ok(v.iNa[950] > -20, "Na current inactivates"); }
/* cable: HH 1952 computed 18.8 m/s at 18.5 degC (measured 21.2) */
{ const r = N.runCable({ T: 18.5, len: 6, stim: 5 }, 6); near(N.speedOf(r, 0.3, 0.8), 18.8, 1.2, "squid axon conduction speed (HH 1952)"); ok(N.reached(r), "the impulse reaches the end");
  const sub = N.runCable({ T: 18.5, len: 6, stim: 0.5 }, 6); ok(!N.reached(sub), "a weak stimulus does not start an impulse");
  const my = N.runCable({ T: 18.5, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24 }, 8), vm = N.speedOf(my, 0.05, 0.35); ok(vm > 5 * 18.8, "myelin makes it much faster (" + vm + ")");
  const sl = N.runCable({ T: 18.5, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24, damage: 0.6 }, 10); ok(N.reached(sl) && N.speedOf(sl, 0.45, 0.65) < 0.8 * vm, "damaged myelin slows conduction");
  const bl = N.runCable({ T: 18.5, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24, damage: 0.95 }, 10); ok(!N.reached(bl), "badly damaged myelin blocks conduction");
  const warm = N.runCable({ T: 28, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24, damage: 0.8 }, 10), coolr = N.runCable({ T: 18.5, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24, damage: 0.8 }, 10);
  ok(N.reached(coolr) && !N.reached(warm), "Uhthoff: warming blocks a damaged fibre that conducts when cool"); }
/* human fibre laws vs textbook ranges */
{ for (const f of N.FIBRES) { const lo = N.humanSpeed(f.d[0], f.my), hi = N.humanSpeed(f.d[1], f.my); ok(lo >= f.v[0] * 0.5 && hi <= f.v[1] * 1.3, f.name + " speeds in the textbook range (" + lo.toFixed(1) + "-" + hi.toFixed(1) + ")"); }
  ok(N.fibreOf(15, true).id === "Aa" && N.fibreOf(1, false).id === "C", "fibre classes"); }
/* synapses */
{ near(N.psp("E", 0.5, 0), 5, 1, "one EPSP about 5 mV"); ok(N.psp("E", 0.5, 300) < N.psp("E", 0.5, 0) / 2, "distant synapse gives a smaller EPSP"); ok(N.psp("I", 0.5, 0) < 0, "IPSP hyperpolarises");
  const one = new N.Neuron(); one.input("E", 0.5, 0, 0); for (let i = 0; i < 3000; i++) one.step(0.01); ok(one.spikes.length === 0, "one EPSP stays below threshold");
  const four = new N.Neuron(); for (let k = 0; k < 4; k++) four.input("E", 0.5, 0, 0); for (let i = 0; i < 3000; i++) four.step(0.01); ok(four.spikes.length === 1, "four together (spatial summation) fire");
  const temp = new N.Neuron(); for (let k = 0; k < 5; k++) temp.input("E", 0.5, 0, k * 3); for (let i = 0; i < 4000; i++) temp.step(0.01); ok(temp.spikes.length >= 1, "five in a row 3 ms apart (temporal summation) fire");
  const slow = new N.Neuron(); for (let k = 0; k < 5; k++) slow.input("E", 0.5, 0, k * 60); for (let i = 0; i < 40000; i++) slow.step(0.01); ok(slow.spikes.length === 0, "the same five 60 ms apart do not");
  const inh = new N.Neuron(); for (let k = 0; k < 4; k++) inh.input("E", 0.5, 0, 0); for (let k = 0; k < 3; k++) inh.input("I", 1.5, 0, 0); for (let i = 0; i < 3000; i++) inh.step(0.01); ok(inh.spikes.length === 0, "inhibition (shunting) stops them firing"); }
/* neuromuscular junction */
{ const tof = c => { const a = N.nmjTrain(c, 2, 4); return a[3].twitch / a[0].twitch; };
  near(tof("normal"), 1, 0.02, "normal train-of-four ratio 1"); const e = N.nmjTrain("normal", 2, 4); ok(e[0].epp > 30 && e[0].epp < 50, "normal EPP 30-50 mV, safety factor ~3");
  ok(tof("mg") < 0.9, "myasthenia: fade on train-of-four"); ok(tof("mgache") > tof("mg"), "AChE inhibitor helps myasthenia"); ok(tof("roc") < 0.9, "non-depolarising block: fade");
  const l = N.nmjTrain("lems", 50, 10); ok(l[9].epp > 1.4 * l[0].epp, "Lambert-Eaton: increment at 50 Hz"); }
/* Nernst / GHK */
{ near(N.nernst(1, 4, 140, 37), -95.0, 0.3, "Nernst K 4/140 at 37 degC"); near(N.nernst(1, 145, 12, 37), 66.6, 0.3, "Nernst Na"); near(N.nernst(-1, 110, 10, 37), -64.1, 0.3, "Nernst Cl"); near(N.nernst(2, 2.5, 1e-4, 37), 135.3, 0.5, "Nernst Ca");
  near(N.rtf(37) * Math.LN10, 61.5, 0.1, "61.5 mV per decade at 37 degC"); const I = N.ION_PRESETS;
  near(N.ghk(I.neuron.c, I.neuron.p, 37), -69.1, 0.3, "GHK resting potential, normal neuron"); ok(N.ghk(I.hyperK.c, I.hyperK.p, 37) > N.ghk(I.neuron.c, I.neuron.p, 37) + 4, "hyperkalaemia depolarises GHK");
  ok(N.ghk(I.hypoK.c, I.hypoK.p, 37) < N.ghk(I.neuron.c, I.neuron.p, 37), "hypokalaemia hyperpolarises"); near(N.ghk(I.muscle.c, I.muscle.p, 37), -90, 1.5, "skeletal muscle about -90 mV"); }
console.log(pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
