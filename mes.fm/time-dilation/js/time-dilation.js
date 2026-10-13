/* MESRel: special-relativity time-dilation maths (pure, no DOM). Tests: node tool_apps_src/time-dilation-tests.js
   Units in the trip functions: years and light-years, so c = 1. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.MESRel = factory(); })(typeof self !== "undefined" ? self : this, function () {
	"use strict";
	var C = 299792458, G0 = 9.80665, DAY = 86400, YEAR = 365.25 * DAY, LY = C * YEAR, AU = 1.495978707e11;
	var A1G = G0 * YEAR / C;                 /* 1 g in light-years per year^2 (about 1.0323) */
	var MAXR = 7.6;                          /* slider range: rapidity 0..7.6 -> gamma up to ~1000 */

	function gammaOf(b) { b = Math.abs(b); if (b >= 1) return Infinity; return 1 / Math.sqrt((1 - b) * (1 + b)); }
	function betaOf(g) { if (g < 1) return 0; return Math.sqrt((g - 1) * (g + 1)) / g; }
	function slowdown(b) { b = Math.abs(b); return b * b / (1 + Math.sqrt((1 - b) * (1 + b))); }   /* 1 - 1/gamma without cancellation */
	function fromSlider(x) { var r = Math.max(0, Math.min(1, x)) * MAXR; return Math.tanh(r); }
	function toSlider(b) { b = Math.max(0, Math.min(0.9999999999, b)); return 0.5 * Math.log((1 + b) / (1 - b)) / MAXR; }

	var UNITS = { "m/s": 1, "mps": 1, "km/s": 1000, "kps": 1000, "km/h": 1000 / 3600, "kph": 1000 / 3600, "kmh": 1000 / 3600, "mph": 1609.344 / 3600, "mi/h": 1609.344 / 3600, "mi/s": 1609.344, "ft/s": 0.3048, "kn": 1852 / 3600, "mach": 340.29 };
	/* "0.9c", "90%", "270000 km/s", "900 mph", "gamma 7", "g=7": returns { beta, gamma, error } */
	function parseSpeed(str) {
		var s = String(str == null ? "" : str).trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
		if (!s) return { error: "Type a speed." };
		var m = /^(?:gamma|γ|g|lorentz factor)\s*[=:]?\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)$/.exec(s);
		if (m) { var g = parseFloat(m[1]); if (!(g >= 1)) return { error: "The Lorentz factor is at least 1." }; return { beta: betaOf(g), gamma: g }; }
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(%|c|\*c|x c|times c|percent|% of c|% c|%c|percent of c)?\s*(?:of the speed of light|speed of light)?$/.exec(s);
		if (m && m[2]) {
			var v = parseFloat(m[1]), b = /^(c|\*c|x c|times c)$/.test(m[2]) ? v : v / 100;
			if (!(b >= 0 && b < 1)) return { error: "A speed at or above the speed of light is not possible for anything with mass. Try less than 100%." };
			return { beta: b, gamma: gammaOf(b) };
		}
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(m\/s|mps|km\/s|kps|km\/h|kph|kmh|mph|mi\/h|mi\/s|ft\/s|kn|mach)$/.exec(s);
		if (m) { var ms = parseFloat(m[1]) * UNITS[m[2]], b2 = ms / C; if (!(b2 < 1)) return { error: "That is the speed of light or more. Nothing with mass gets there." }; return { beta: b2, gamma: gammaOf(b2) }; }
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)$/.exec(s);
		if (m) { var n = parseFloat(m[1]); if (n < 1) return { beta: n, gamma: gammaOf(n) }; return { error: "Add a unit (c, %, km/s, mph...) or write gamma 7." }; }
		return { error: "I could not read that. Try 0.9c, 90%, 270000 km/s or gamma 7." };
	}

	/* ------- formatting ------- */
	function sig(x, d) { if (!isFinite(x)) return x > 0 ? "∞" : "–"; if (x === 0) return "0"; d = d || 3; var a = Math.abs(x), e = Math.floor(Math.log10(a)); if (a >= 1e9 || a < 1e-3) { var s = x.toExponential(d - 1), p = s.split("e"); return p[0] + " × 10" + sup(parseInt(p[1], 10)); } var dec = Math.max(0, d - 1 - e); return trim(x.toFixed(Math.min(10, dec))); }
	function trim(s) { return s.indexOf(".") < 0 ? s : s.replace(/0+$/, "").replace(/\.$/, ""); }
	function sup(n) { var m = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function commas(x, d) { var s = sig(x, d || 4); if (/×|∞|–/.test(s)) return s; var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join("."); }
	function fmtYears(y) {   /* a duration given in years -> plain words */
		if (!isFinite(y)) return "∞"; var a = Math.abs(y);
		if (a === 0) return "0";
		if (a < 1 / 365.25 / 24 / 60) return sig(a * YEAR, 3) + " seconds";
		if (a < 1 / 365.25 / 24) return sig(a * 365.25 * 24 * 60, 3) + " minutes";
		if (a < 1 / 365.25) return sig(a * 365.25 * 24, 3) + " hours";
		if (a < 0.1) return sig(a * 365.25, 3) + " days";
		if (a < 1000) return sig(a, 3) + (Math.abs(a - 1) < 1e-9 ? " year" : " years");
		if (a < 1e6) return commas(a, 4) + " years";
		if (a < 1e9) return sig(a / 1e6, 4) + " million years";
		return sig(a / 1e9, 4) + " billion years";
	}
	function fmtSpeed(b) { var v = b * C; if (v < 1e3) return sig(v, 3) + " m/s"; if (v < 1e6) return sig(v / 1e3, 4) + " km/s"; return commas(v / 1e3, 6) + " km/s"; }
	function fmtPct(b) { var p = b * 100; if (p < 99) return sig(p, 3) + "%"; var nines = Math.min(12, Math.max(2, Math.floor(-Math.log10(1 - b) + 1e-9))); return trim((b * 100).toFixed(Math.max(0, nines - 1))) + "%"; }

	/* ------- twin trips (c = 1, years, light-years) ------- */
	/* constant speed with an instant turn-around (the textbook version). model: { kind: "const", beta, d, round } */
	function tripConst(d, beta, round) {
		var legs = round ? 2 : 1, g = gammaOf(beta), t = legs * d / beta;
		return { tEarth: t, tShip: t / g, peakBeta: beta, peakGamma: g, d: d, round: !!round };
	}
	/* one half of a leg under constant proper acceleration a (ly/yr^2): accelerate for the first half of the distance, decelerate for the second.
	   u = ship (proper) time since the leg started, 0..2*tau1. Returns x (ly), t (years), beta. */
	function legGeom(d, a) { var gp = 1 + a * d / 2, tau1 = Math.acosh(gp) / a; return { gp: gp, tau1: tau1, tauLeg: 2 * tau1, tLeg: 2 * Math.sqrt(gp * gp - 1) / a }; }
	function legAt(d, a, u) {
		var L = legGeom(d, a), tau1 = L.tau1;
		if (u <= tau1) { var th = a * u; return { x: (Math.cosh(th) - 1) / a, t: Math.sinh(th) / a, beta: Math.tanh(th) }; }
		var w = Math.max(0, L.tauLeg - u), th2 = a * w;               /* time still to go until arrival */
		return { x: d - (Math.cosh(th2) - 1) / a, t: L.tLeg - Math.sinh(th2) / a, beta: Math.tanh(th2) };
	}
	function trip1g(d, round, aG) {
		var a = (aG == null ? 1 : aG) * A1G, L = legGeom(d, a), legs = round ? 2 : 1;
		return { tEarth: legs * L.tLeg, tShip: legs * L.tauLeg, peakGamma: L.gp, peakBeta: betaOf(L.gp), a: a, d: d, round: !!round, legTau: L.tauLeg, legT: L.tLeg };
	}
	/* where is everyone at progress s in 0..1 of the trip? constant speed: s is Earth time; constant acceleration: s is the traveller's own time. */
	function tripState(model, s) {
		s = Math.max(0, Math.min(1, s));
		if (model.kind === "const") {
			var T = model.tEarth, t = s * T, half = T / (model.round ? 2 : 1), out = t <= half, b = model.beta, x;
			if (!model.round) x = b * t; else x = out ? b * t : model.d - b * (t - half);
			var back = model.round && t > half;
			return { t: t, tau: t / model.peakGamma, x: x, beta: (t > 0 && t < T) ? (back ? -b : b) : 0, phase: out ? "out" : "back", gamma: (t > 0 && t < T) ? model.peakGamma : 1 };
		}
		var tauTot = model.tShip, tau = s * tauTot, leg = model.legTau, a = model.a, d = model.d;
		if (!model.round || tau <= leg) { var g1 = legAt(d, a, Math.min(tau, leg)); return { t: g1.t, tau: tau, x: g1.x, beta: g1.beta, phase: "out", gamma: gammaOf(g1.beta) }; }
		var g2 = legAt(d, a, Math.min(tau - leg, leg));
		return { t: model.legT + g2.t, tau: tau, x: d - g2.x, beta: -g2.beta, phase: "back", gamma: gammaOf(g2.beta) };
	}
	function worldline(model, n) {   /* points {x,t,tau} along the traveller's path */
		var pts = []; n = n || 240; for (var i = 0; i <= n; i++) { var st = tripState(model, i / n); pts.push({ x: st.x, t: st.t, tau: st.tau }); }
		if (model.kind === "const") { var half = model.round ? model.tEarth / 2 : model.tEarth; var h = tripState(model, half / model.tEarth); pts.push({ x: h.x, t: h.t, tau: h.tau }); pts.sort(function (a, b) { return a.t - b.t; }); }
		return pts;
	}

	/* ------- light clock: a photon bounces between mirrors L apart ------- */
	function lightClock(beta) { var g = gammaOf(beta); return { gamma: g, pathRatio: g, tickRatio: 1 / g, sideways: beta * g /* v dt / (c dtau) */ }; }

	/* ------- a few real-world numbers ------- */
	var EVERYDAY = [
		{ n: "Walking", v: 1.4 }, { n: "A fast car (120 km/h)", v: 120 / 3.6 }, { n: "Passenger jet (900 km/h)", v: 250 }, { n: "Concorde (2,180 km/h)", v: 605.6 },
		{ n: "Space Shuttle in orbit", v: 7800 }, { n: "GPS satellite (orbital speed only)", v: 3874 }, { n: "Earth around the Sun", v: 29780 }, { n: "Parker Solar Probe, closest approach", v: 192000 },
		{ n: "Sun around the Milky Way", v: 230000 }, { n: "Earth's motion relative to the cosmic microwave background", v: 369820 }
	];
	var MUON = { tau0: 2.1969811e-6 };
	function muon(beta, distKm) { var g = gammaOf(beta), v = beta * C, tLab = MUON.tau0 * g, tTravel = (distKm * 1000) / v; return { gamma: g, lifetimeLab: tLab, travelTime: tTravel, survive: Math.exp(-tTravel / tLab), surviveNoDilation: Math.exp(-tTravel / MUON.tau0), meanRangeKm: v * tLab / 1000 }; }
	function kineticEnergy(mKg, beta) { return (gammaOf(beta) - 1) * mKg * C * C; }

	/* the full "what does this speed do" block used by the calculator */
	function summary(beta, years) {
		var g = gammaOf(beta);
		return { beta: beta, gamma: g, rate: 1 / g, slowPct: 100 * slowdown(beta), shipYears: years / g, distanceLy: beta * years, lengthContraction: 1 / g };
	}

	return { C: C, G0: G0, DAY: DAY, YEAR: YEAR, LY: LY, AU: AU, A1G: A1G, MAXR: MAXR, gammaOf: gammaOf, betaOf: betaOf, slowdown: slowdown, fromSlider: fromSlider, toSlider: toSlider, parseSpeed: parseSpeed,
		sig: sig, commas: commas, fmtYears: fmtYears, fmtSpeed: fmtSpeed, fmtPct: fmtPct, tripConst: tripConst, trip1g: trip1g, legAt: legAt, legGeom: legGeom, tripState: tripState, worldline: worldline,
		lightClock: lightClock, EVERYDAY: EVERYDAY, muon: muon, kineticEnergy: kineticEnergy, summary: summary };
});

/* Time Dilation Simulator UI: clocks + ageing (a person at home and one on a fast ship), the light clock, the twin trip with a spacetime diagram, and a calculator.
   Maths: MESRel (node-tested: tool_apps_src/time-dilation-tests.js). State: localStorage mes-time-dilation:v1; links ?tab=&v=0.9&age=20&ts=1 ... */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("td"); if (!root) return;
	var R = window.MESRel, KEY = "mes-time-dilation:v1", PI = Math.PI, TAU = PI * 2;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function lerp(a, b, t) { return a + (b - a) * t; }
	function frac(x) { return x - Math.floor(x); }
	var q = new URLSearchParams(location.search), saved = sget();
	function toast(msg) { var t = $("td-toast"); if (!t) { t = document.createElement("div"); t.id = "td-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copyLink(url) { var done = function () { toast("Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url); }
	function pngOf(cv, name) { cv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); }
	function betaTxt(b) { return R.fmtPct(b) + " of c"; }
	function gTxt(g) { return g < 1.0005 ? "1.000" : g < 100 ? R.sig(g, 4) : g < 1e5 ? R.commas(g, 5) : R.sig(g, 3); }

	/* ================= tabs ================= */
	var tab = /^(clocks|light|trip|calc)$/.test(q.get("tab") || "") ? q.get("tab") : "clocks";
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) try { var u = new URL(location.href); if (t === "clocks") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {}
		setTimeout(function () { onResize(); if (t === "calc") calcRender(); }, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ================= shared state ================= */
	var st = { beta: 0.9, age: 20, ts: 1, view: "home", water: false, mol: true, pulse: true, play: true, fig: "mm" };
	function female(k) { return st.fig === "ff" || (k === 0 ? st.fig === "fm" : st.fig === "mf"); }   /* k: 0 = the one at home, 1 = the traveller */
	var PRE = [["Walking", 1.4 / R.C], ["Jet", 250 / R.C], ["ISS", 7660 / R.C], ["10% of c", 0.1], ["50% of c", 0.5], ["87% (γ = 2)", R.betaOf(2)], ["90%", 0.9], ["99%", 0.99], ["99.9%", 0.999], ["99.999%", 0.99999], ["γ = 1000", R.betaOf(1000)]];
	function presetChips(host, onPick, getB) {
		host.innerHTML = PRE.map(function (p, i) { return '<button type="button" data-i="' + i + '" aria-pressed="false">' + esc(p[0]) + "</button>"; }).join("");
		host.onclick = function (e) { var b = e.target.closest("button"); if (b) onPick(PRE[+b.dataset.i][1]); };
		return function () { var cur = getB(); Array.prototype.forEach.call(host.children, function (b, i) { b.setAttribute("aria-pressed", Math.abs(PRE[i][1] - cur) < 1e-9 * Math.max(1, cur) || (cur > 0 && Math.abs(PRE[i][1] / cur - 1) < 1e-6) ? "true" : "false"); }); };
	}
	/* ---- A person, drawn for any age ---- */
	function ageFrac(age) { if (age < 1) return 0.4 + 0.06 * age; if (age < 18) { var u = (age - 1) / 17; return 0.46 + 0.54 * (u * u * (3 - 2 * u)); } if (age > 65) return 1 - 0.07 * clamp((age - 65) / 40, 0, 1); return 1; }
	function mixc(a, b, t) { return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(lerp(a[i], b[i], clamp(t, 0, 1))); }).join(",") + ")"; }
	function person(c, cx, by, hh, age, o) {
		age = clamp(age, 0, 125); var f = ageFrac(age), H = hh * f, t = Math.min(1, age / 18), headR = H * (0.1 + 0.07 * (1 - t));
		var torso = H * 0.32, leg = Math.max(H * 0.14, H - headR * 2.1 - torso - H * 0.03), arm = H * 0.27, lw = Math.max(2, H * 0.07);
		var stoop = age > 72 ? Math.min(0.3, (age - 72) * 0.007) : 0, hipX = cx, hipY = by - leg;
		var shX = hipX + Math.sin(stoop) * torso, shY = hipY - Math.cos(stoop) * torso, hx = shX + Math.sin(stoop) * headR * 1.1, hy = shY - headR * 1.15;
		c.lineCap = "round"; c.lineJoin = "round";
		var fem = !!o.female, dress = fem && age >= 2;
		if (dress) {   /* legs in skin colour, a dress from the shoulders to the knees */
			c.strokeStyle = o.skin; c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(hipX - lw * 0.5, hipY + leg * 0.4); c.lineTo(cx - H * 0.06, by); c.moveTo(hipX + lw * 0.5, hipY + leg * 0.4); c.lineTo(cx + H * 0.06, by); c.stroke();
		} else { c.strokeStyle = o.pants; c.lineWidth = lw; c.beginPath(); c.moveTo(hipX - lw * 0.6, hipY); c.lineTo(cx - H * 0.07, by); c.moveTo(hipX + lw * 0.6, hipY); c.lineTo(cx + H * 0.07, by); c.stroke(); }
		c.strokeStyle = "#222"; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(cx - H * 0.07, by); c.lineTo(cx - H * 0.07 - lw * 0.8, by); c.moveTo(cx + H * 0.07, by); c.lineTo(cx + H * 0.07 + lw * 0.8, by); c.stroke();
		c.strokeStyle = "#222"; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(cx - H * 0.07, by); c.lineTo(cx - H * 0.07 - lw * 0.8, by); c.moveTo(cx + H * 0.07, by); c.lineTo(cx + H * 0.07 + lw * 0.8, by); c.stroke();
		if (dress) { c.fillStyle = o.shirt; c.beginPath(); c.moveTo(shX - lw * 1.0, shY); c.lineTo(shX + lw * 1.0, shY); c.lineTo(hipX + H * 0.15, hipY + leg * 0.45); c.lineTo(hipX - H * 0.15, hipY + leg * 0.45); c.closePath(); c.fill(); }
		else { c.strokeStyle = o.shirt; c.lineWidth = lw * 1.7; c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(shX, shY); c.stroke(); }
		var wave = o.wave || 0, ax = shX - Math.sin(stoop) * 0, ay = shY + lw * 0.2;
		c.strokeStyle = o.shirt; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(ax - lw * 0.7, ay); c.lineTo(ax - lw * 1.3 - arm * 0.3, ay + arm * 0.9); c.stroke();
		var hx2 = ax + lw * 1.4 + arm * 0.25 + Math.sin(wave) * arm * 0.18, hy2 = ay + arm * 0.9 - Math.max(0, Math.sin(wave)) * arm * 0.35;
		c.beginPath(); c.moveTo(ax + lw * 0.7, ay); c.lineTo(hx2, hy2); c.stroke();
		c.fillStyle = o.skin; c.beginPath(); c.arc(hx2, hy2, lw * 0.5, 0, TAU); c.fill(); c.beginPath(); c.arc(ax - lw * 1.3 - arm * 0.3, ay + arm * 0.9, lw * 0.5, 0, TAU); c.fill();
		if (age > 80) { c.strokeStyle = "#8a6a3a"; c.lineWidth = Math.max(2, lw * 0.35); c.beginPath(); c.moveTo(hx2, hy2); c.lineTo(hx2 + arm * 0.08, by); c.stroke(); }
		/* heart under the shirt */
		var beat = o.beat || 0, hs = Math.max(3, H * 0.045) * (1 + 0.45 * beat), hxh = lerp(hipX, shX, 0.72) - lw * 0.35, hyh = lerp(hipY, shY, 0.72);
		c.fillStyle = mixc([255, 214, 224], [255, 40, 90], beat); c.strokeStyle = "#fff"; c.lineWidth = Math.max(1.3, hs * 0.2); c.beginPath(); c.moveTo(hxh, hyh + hs * 0.9); c.bezierCurveTo(hxh - hs * 1.6, hyh - hs * 0.2, hxh - hs * 0.6, hyh - hs * 1.3, hxh, hyh - hs * 0.4); c.bezierCurveTo(hxh + hs * 0.6, hyh - hs * 1.3, hxh + hs * 1.6, hyh - hs * 0.2, hxh, hyh + hs * 0.9); c.closePath(); c.stroke(); c.fill();   /* white outline: visible on red and blue clothes alike */
		/* head */
		var grey = clamp((age - 38) / 30, 0, 1), hair = o.female ? mixc([122, 66, 28], [214, 214, 218], grey) : mixc([74, 47, 27], [214, 214, 218], grey);
		if (fem && age >= 3 && age < 90) { c.fillStyle = hair; [-1, 1].forEach(function (sg) { c.beginPath(); c.moveTo(hx + sg * headR * 1.06, hy - headR * 0.2); c.quadraticCurveTo(hx + sg * headR * 1.3, hy + headR * 1.2, hx + sg * headR * 1.05, hy + headR * 1.75); c.lineTo(hx + sg * headR * 0.72, hy + headR * 1.7); c.quadraticCurveTo(hx + sg * headR * 0.95, hy + headR * 0.9, hx + sg * headR * 0.8, hy + headR * 0.1); c.closePath(); c.fill(); }); }   /* two side curtains: the chin and neck stay clear */
		if (fem && age >= 78) { c.fillStyle = hair; c.beginPath(); c.arc(hx - headR * 0.1, hy - headR * 1.25, headR * 0.38, 0, TAU); c.fill(); }   /* a bun */
		c.fillStyle = o.skin; c.beginPath(); c.arc(hx, hy, headR, 0, TAU); c.fill();
		if (age < 1.5) { c.strokeStyle = hair; c.lineWidth = Math.max(1.5, headR * 0.12); c.beginPath(); c.arc(hx, hy - headR, headR * 0.18, PI * 0.2, PI * 1.3); c.stroke(); }
		else if (age > 78) { c.strokeStyle = hair; c.lineWidth = Math.max(1.5, headR * 0.16); c.beginPath(); c.arc(hx, hy, headR * 1.02, PI * 0.95, PI * 1.22); c.stroke(); c.beginPath(); c.arc(hx, hy, headR * 1.02, PI * 1.78, PI * 2.05); c.stroke(); }
		else { c.fillStyle = hair; c.beginPath(); c.arc(hx, hy, headR * 1.04, PI * 1.02, PI * 1.98); c.lineTo(hx + headR * 0.7, hy - headR * 0.38); c.quadraticCurveTo(hx, hy - headR * 0.7, hx - headR * 0.7, hy - headR * 0.38); c.closePath(); c.fill(); }
		var ey = hy - headR * 0.05, ex = headR * 0.38, er = Math.max(1.2, headR * 0.1), blink = o.blink;
		c.fillStyle = "#222"; if (blink) { c.fillRect(hx - ex - er, ey, er * 2, Math.max(1, er * 0.4)); c.fillRect(hx + ex - er, ey, er * 2, Math.max(1, er * 0.4)); } else { c.beginPath(); c.arc(hx - ex, ey, er, 0, TAU); c.arc(hx + ex, ey, er, 0, TAU); c.fill(); }
		c.strokeStyle = fem ? "#c2415a" : "#7a3b2e"; c.lineWidth = Math.max(1, headR * (fem ? 0.1 : 0.07)); c.beginPath(); c.arc(hx, hy + headR * 0.15, headR * 0.4, 0.15 * PI, 0.85 * PI); c.stroke();
		if (fem && !blink && age > 3) { c.strokeStyle = "#222"; c.lineWidth = Math.max(1, er * 0.5); [-1, 1].forEach(function (sg) { c.beginPath(); c.moveTo(hx + sg * ex + sg * er, ey - er * 0.4); c.lineTo(hx + sg * ex + sg * er * 2.1, ey - er * 1.5); c.stroke(); }); }
		if (age > 52) { c.strokeStyle = "rgba(90,60,40," + clamp((age - 52) / 40, 0, 0.6) + ")"; c.lineWidth = Math.max(1, headR * 0.05); for (var k = 0; k < 3; k++) { c.beginPath(); c.moveTo(hx - headR * 0.5, hy - headR * (0.42 - k * 0.1)); c.lineTo(hx + headR * 0.5, hy - headR * (0.42 - k * 0.1)); c.stroke(); } }
		if (age > 62) { c.strokeStyle = "#333"; c.lineWidth = Math.max(1, headR * 0.06); c.beginPath(); c.arc(hx - ex, ey, headR * 0.24, 0, TAU); c.arc(hx + ex, ey, headR * 0.24, 0, TAU); c.moveTo(hx - ex + headR * 0.24, ey); c.lineTo(hx + ex - headR * 0.24, ey); c.stroke(); }
	}
	function ecg(p) {
		if (p < 0.10) return 0; if (p < 0.18) return 0.12 * Math.sin((p - 0.10) / 0.08 * PI); if (p < 0.26) return 0; if (p < 0.29) return -0.15 * ((p - 0.26) / 0.03);
		if (p < 0.33) return -0.15 + (p - 0.29) / 0.04 * 1.15; if (p < 0.37) return 1 - (p - 0.33) / 0.04 * 1.25; if (p < 0.40) return -0.25 + (p - 0.37) / 0.03 * 0.25; if (p < 0.55) return 0;
		if (p < 0.70) return 0.2 * Math.sin((p - 0.55) / 0.15 * PI); return 0;
	}
	function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	/* the age bars share one scale that grows with the ages: 100, 200, 500, 1000, 2000 ... */
	var barMax = 100, dragMax = 0, MAXY = 1e10;   /* clocks stop at 10 billion years (about the age of the universe) */
	function niceMax(x) { var m = 100; while (m < x - 1e-9) m *= (m.toString().charAt(0) === "2" ? 2.5 : 2); return Math.round(m); }
	function ageStr(a) { if (a >= 1e6) return R.fmtYears(a); return a < 1 ? (a * 12).toFixed(1) + " months" : a.toFixed(a < 100 ? 1 : 0) + " years"; }
	function ownStr(y) { if (y >= 1e5) return R.fmtYears(y); if (y < 1) return R.sig(y * 365.25, 3) + " days"; return y.toFixed(y < 100 ? 2 : 1) + " yr"; }

	/* ================= sizing ================= */
	var cv = $("td-c"), cx = cv.getContext("2d"), stage = $("td-stage");
	var lcv = $("td-lc"), lcx = lcv.getContext("2d"), lstage = $("td-lstage");
	var tcv = $("td-tc"), tcx = tcv.getContext("2d"), tstage = $("td-tstage");
	var dpr = 1, SZ = {};
	function sizeStage(stg, c2d, canvas, aspect, key, extraFn) {
		var wrap = stg.parentNode, w = wrap.clientWidth || 640; dpr = Math.min(2, window.devicePixelRatio || 1);
		stg.style.width = w + "px"; var extra = extraFn ? extraFn(w) : 0, h = Math.round(w / aspect(w)) + extra; SZ[key + "x"] = extra;
		stg.style.height = h + "px"; var cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
		SZ[key] = { w: w, h: h };
	}
	function onResize() {
		if (tab === "clocks") { sizeStage(stage, cx, cv, function (w) { return w < 620 ? 0.78 : 1.72; }, "c", function () { return $("td-ctl").offsetHeight || 48; }); drawClocks(); }
		else if (tab === "light") { sizeStage(lstage, lcx, lcv, function (w) { return w < 620 ? 1 : 2.1; }, "l"); drawLight(); }
		else if (tab === "trip") { sizeStage(tstage, tcx, tcv, function (w) { return w < 700 ? 0.8 : 1.9; }, "t"); drawTrip(); }
	}

	/* ================= tab 1: clocks and ageing ================= */
	var eH = 0, eS = 0, bphH = 0, bphS = 0, blinkT = 0, last = 0, rates = [1, 1], uiT = 0;
	var mols = [[], []], stars = [], bubbles = [[], []];
	(function () { var i, k; for (k = 0; k < 2; k++) { for (i = 0; i < 36; i++) { var a = Math.random() * TAU; mols[k].push({ x: Math.random(), y: Math.random(), vx: Math.cos(a), vy: Math.sin(a) }); } for (i = 0; i < 16; i++) bubbles[k].push({ x: Math.random(), y: Math.random(), r: 0.01 + Math.random() * 0.02, ph: Math.random() * TAU }); } for (i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 }); })();
	function gamma() { return R.gammaOf(st.beta); }
	function resetClocks() { eH = 0; eS = 0; updateReadouts(); drawClocks(); }
	function curRates() { var g = gamma(); return st.view === "home" ? [1, 1 / g] : [1 / g, 1]; }   /* [home, ship] rate of own time relative to the viewer's */
	function stepClocks(dt) {
		rates = curRates(); var adv = dt * st.ts;
		if (st.view === "home") { eH += adv; eS += adv * rates[1]; } else { eS += adv; eH += adv * rates[0]; }
		capYears();
		bphH += dt * 1.2 * rates[0]; bphS += dt * 1.2 * rates[1]; blinkT += dt;
		for (var k = 0; k < 2; k++) mols[k].forEach(function (m) { var s = dt * 0.45 * rates[k]; m.x += m.vx * s; m.y += m.vy * s; if (m.x < 0) { m.x = -m.x; m.vx = Math.abs(m.vx); } if (m.x > 1) { m.x = 2 - m.x; m.vx = -Math.abs(m.vx); } if (m.y < 0) { m.y = -m.y; m.vy = Math.abs(m.vy); } if (m.y > 1) { m.y = 2 - m.y; m.vy = -Math.abs(m.vy); } });
		for (k = 0; k < 2; k++) bubbles[k].forEach(function (b) { b.y -= dt * 0.12 * rates[k]; b.ph += dt * 1.5 * rates[k]; if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); } });
		var r = Math.atanh(Math.min(0.99999999, st.beta)), v = clamp(r / 3, 0, 1.2);
		stars.forEach(function (s) { s.x -= dt * (0.02 + 0.9 * v) * s.z; if (s.x < -0.05) { s.x += 1.1; s.y = Math.random(); } });
	}
	function panelRects(W, H) { return W < 620 ? [[4, 4, W - 8, H / 2 - 8], [4, H / 2 + 4, W - 8, H / 2 - 8]] : [[4, 4, W / 2 - 8, H - 8], [W / 2 + 4, 4, W / 2 - 8, H - 8]]; }
	function drawClocks() {
		if (tab !== "clocks" || !SZ.c) return; var W = SZ.c.w, H = SZ.c.h, c = cx, g = gamma(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H);
		barMax = dragMax ? dragMax : niceMax(Math.max(st.age + eH, st.age + eS)); var rects = panelRects(W, H - (SZ.cx || 0)), eg = [eH, eS], bph = [bphH, bphS]; bars = [];
		for (var k = 0; k < 2; k++) panel(c, rects[k], k, eg[k], bph[k], g);
		if (eH >= MAXY || eS >= MAXY) { var fz = clamp(W * 0.02, 11, 15); c.font = "700 " + fz + "px sans-serif"; c.textAlign = "center"; var msg = "Clocks stopped at 10 billion years (about the age of the universe). Press Restart.", mw = c.measureText(msg).width + 24, my = (H - (SZ.cx || 0)) / 2; c.fillStyle = "rgba(10,13,20,0.88)"; rr(c, W / 2 - mw / 2, my - fz, mw, fz * 2.2, 8); c.fill(); c.fillStyle = "#ffd27a"; c.fillText(msg, W / 2, my + fz * 0.4); }
	}
	function panel(c, rc, k, own, bph, g) {
		var px = rc[0], py = rc[1], pw = rc[2], ph = rc[3], ship = k === 1, rate = rates[k], age = st.age + own, fs = clamp(pw * 0.034, 10, 15), slowed = rate < 0.9995;
		c.save(); rr(c, px, py, pw, ph, 10); c.clip();
		var gr = c.createLinearGradient(0, py, 0, py + ph); if (ship) { gr.addColorStop(0, "#0a1024"); gr.addColorStop(1, "#141b34"); } else { gr.addColorStop(0, "#0b1736"); gr.addColorStop(0.62, "#274a7a"); gr.addColorStop(1, "#1c3a22"); }
		c.fillStyle = gr; c.fillRect(px, py, pw, ph);
		/* sky / stars */
		var r = Math.atanh(Math.min(0.99999999, st.beta)), v = clamp(r / 3, 0, 1.2);
		stars.forEach(function (s, i) { if (!ship && i > 45) return; var x = px + s.x * pw, y = py + s.y * ph * (ship ? 1 : 0.6), len = ship ? v * 60 * s.z : 0; c.strokeStyle = "rgba(255,255,255," + (0.35 + 0.5 * s.z) + ")"; c.lineWidth = Math.max(1, s.z * 1.4); c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y); c.stroke(); if (!len) { c.fillStyle = c.strokeStyle; c.fillRect(x, y, 1.5, 1.5); } });
		var floorY = py + ph * 0.64; c.fillStyle = ship ? "#2a3350" : "#1d4a2a"; c.fillRect(px, floorY, pw, py + ph - floorY); c.fillStyle = ship ? "#3a4670" : "#2a6a3a"; c.fillRect(px, floorY, pw, 3);
		/* title */
		c.fillStyle = "#e8ecf5"; c.font = "700 " + fs * 1.15 + "px sans-serif"; c.textAlign = "left"; c.fillText(ship ? "TRAVELLER on the ship" : "HOME, standing still", px + 12, py + fs * 1.9);
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.9 + "px sans-serif"; c.fillText((ship ? betaTxt(st.beta) : "the ship passes by") + (st.water && slowed ? "  ·  🌊 slow motion" : ""), px + 12, py + fs * 3.2);
		/* year clock */
		var clr = Math.min(pw * 0.15, ph * 0.105), ccx = px + pw * 0.21, ccy = py + ph * 0.285;
		c.fillStyle = "#0e1424"; c.strokeStyle = slowed ? "#7fd0ff" : "#ffd27a"; c.lineWidth = 3; c.beginPath(); c.arc(ccx, ccy, clr, 0, TAU); c.fill(); c.stroke();
		for (var i = 0; i < 12; i++) { var a = i / 12 * TAU - PI / 2; c.strokeStyle = "#c9d2e6"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(ccx + Math.cos(a) * clr * 0.82, ccy + Math.sin(a) * clr * 0.82); c.lineTo(ccx + Math.cos(a) * clr * 0.95, ccy + Math.sin(a) * clr * 0.95); c.stroke(); }
		var ha = frac(own) * TAU - PI / 2; c.strokeStyle = slowed ? "#7fd0ff" : "#ffd27a"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(ccx, ccy); c.lineTo(ccx + Math.cos(ha) * clr * 0.78, ccy + Math.sin(ha) * clr * 0.78); c.stroke();
		c.fillStyle = "#e8ecf5"; c.beginPath(); c.arc(ccx, ccy, 3, 0, TAU); c.fill();
		c.textAlign = "center"; c.fillStyle = "#e8ecf5"; c.font = "700 " + fs * 1.1 + "px sans-serif"; c.fillText(ownStr(own), ccx, ccy + clr + fs * 1.5); c.fillStyle = "#9aa5bb"; c.font = fs * 0.8 + "px sans-serif"; c.fillText("1 turn = 1 year of their own time", ccx, ccy + clr + fs * 2.6);
		/* molecules */
		if (st.mol) {
			var mw = pw * 0.34, mh = ph * 0.15, mx = px + pw * 0.04, my = py + ph * 0.545; rr(c, mx, my, mw, mh, 6); c.fillStyle = st.water && slowed ? "rgba(40,120,210,0.35)" : "rgba(255,255,255,0.06)"; c.fill(); c.strokeStyle = "#3a4258"; c.lineWidth = 1; c.stroke();
			mols[k].forEach(function (m) { c.fillStyle = st.water ? (slowed ? "#8fd3ff" : "#cfe9ff") : (slowed ? "#7fd0ff" : "#ffd27a"); c.beginPath(); c.arc(mx + 4 + m.x * (mw - 8), my + 4 + m.y * (mh - 8), Math.max(1.6, mh * 0.04), 0, TAU); c.fill(); });
			c.fillStyle = "#9aa5bb"; c.font = fs * 0.78 + "px sans-serif"; c.textAlign = "left"; c.fillText("molecules in their body: " + (slowed ? R.sig(rate * 100, 3) + "% speed" : "full speed"), mx, my + mh + fs * 1.05);
		}
		/* person */
		var o = { female: female(k), shirt: ship ? "#e0574b" : "#3b82f6", pants: "#2c3550", skin: "#f1c9a3", beat: Math.exp(-Math.pow((frac(bph) - 0.31) / 0.05, 2)), blink: frac(blinkT * (rate * 0.35 + 0.01) + k * 0.4) > 0.94, wave: Math.sin(blinkT * 3 * rate) * 0.8 };
		person(c, px + pw * 0.69, floorY + ph * 0.02, ph * (pw > ph * 1.2 ? 0.5 : 0.42), age, o);   /* stacked phone panels are wide and short: a bigger figure */
		c.textAlign = "center"; c.fillStyle = "#fff"; c.font = "700 " + fs * 1.3 + "px sans-serif"; c.fillText("age " + ageStr(age), px + pw * 0.69, floorY + ph * 0.095);
		/* life bar: drag it (or click) to jump this person to any age from 0 to 100 */
		var bx = px + pw * 0.06, bw = pw * 0.88, bh = Math.max(9, ph * 0.034), by2 = py + ph * 0.775, frc = clamp(age / barMax, 0, 1), kx = bx + Math.max(bh * 0.5, bw * frc);
		c.fillStyle = "#1b2238"; rr(c, bx, by2, bw, bh, bh / 2); c.fill(); c.fillStyle = slowed ? "#7fd0ff" : "#ffd27a"; rr(c, bx, by2, Math.max(bh, kx - bx), bh, bh / 2); c.fill();
		c.fillStyle = "#fff"; c.strokeStyle = slowed ? "#2a7fb5" : "#c28a1c"; c.lineWidth = 2; c.beginPath(); c.arc(kx, by2 + bh / 2, bh * 0.85, 0, TAU); c.fill(); c.stroke();
		bars[k] = { x: bx, y: by2 - 10, w: bw, h: bh + 20 };
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.75 + "px sans-serif"; c.textAlign = "left"; c.fillText("0", bx, by2 + bh + fs * 0.95); c.textAlign = "center"; c.fillText("◂ drag to change age ▸", bx + bw / 2, by2 + bh + fs * 0.95); c.textAlign = "right"; c.fillText(R.commas(barMax, 5) + " years", bx + bw, by2 + bh + fs * 0.95);
		/* heartbeat */
		if (st.pulse) {
			var ex = px + pw * 0.06, ew = pw * 0.88, ey = py + ph * 0.935, eh = ph * 0.04; c.strokeStyle = slowed ? "#7fd0ff" : "#7dff9a"; c.lineWidth = 2; c.beginPath();
			for (var j = 0; j <= 90; j++) { var xx = ex + ew * j / 90, p = frac(bph - (1 - j / 90) * 2.6), yy = ey - ecg(p) * eh; if (j) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
			c.fillStyle = "#9aa5bb"; c.font = fs * 0.78 + "px sans-serif"; c.textAlign = "right"; c.fillText(R.sig(72 * rate, 3) + " beats a minute as seen by " + (st.view === "home" ? "home" : "the ship"), px + pw - 10, py + ph - 6);
		}
		/* underwater look on the slowed panel */
		if (st.water && slowed) {
			var wt = clamp(1 - rate, 0.12, 0.62); c.fillStyle = "rgba(20,110,200," + wt * 0.8 + ")"; c.fillRect(px, py, pw, ph); var g2 = c.createLinearGradient(0, py, 0, py + ph); g2.addColorStop(0, "rgba(120,200,255," + wt * 0.5 + ")"); g2.addColorStop(1, "rgba(0,30,90," + wt * 0.7 + ")"); c.fillStyle = g2; c.fillRect(px, py, pw, ph);
			c.strokeStyle = "rgba(200,235,255," + wt * 0.5 + ")"; c.lineWidth = 1.2; for (var l = 0; l < 5; l++) { c.beginPath(); for (var x2 = 0; x2 <= pw; x2 += 8) { var y2 = py + ph * (0.12 + l * 0.17) + Math.sin(x2 * 0.03 + blinkT * 0.8 * rate + l) * 5; if (x2) c.lineTo(px + x2, y2); else c.moveTo(px + x2, y2); } c.stroke(); }
			bubbles[k].forEach(function (b) { c.strokeStyle = "rgba(220,245,255,0.75)"; c.lineWidth = 1.2; c.beginPath(); c.arc(px + (b.x + Math.sin(b.ph) * 0.01) * pw, py + b.y * ph, b.r * pw * 0.7, 0, TAU); c.stroke(); });
		}
		c.strokeStyle = "#2a3040"; c.lineWidth = 2; rr(c, px, py, pw, ph, 10); c.stroke(); c.restore();
	}
	function updateReadouts() {
		var g = gamma(), b = st.beta;
		$("td-r-v").textContent = betaTxt(b); $("td-r-vs").textContent = R.fmtSpeed(b);
		$("td-r-g").textContent = gTxt(g); $("td-r-gs").textContent = g < 1.0001 ? "no visible effect" : "1 ship year = " + R.fmtYears(g) + " at home";
		$("td-r-h").textContent = ageStr(st.age + eH); $("td-r-hs").textContent = "lived " + ownStr(eH);
		$("td-r-t").textContent = ageStr(st.age + eS); $("td-r-ts").textContent = "lived " + ownStr(eS) + (eH > 0 ? " · " + R.fmtYears(Math.max(0, eH - eS)) + " younger" : "");
	}
	function note1() {
		var g = gamma(), b = st.beta, per = R.slowdown(b) * R.YEAR, ref = st.view === "home" ? "Seen from home" : "Seen from the ship";
		var other = st.view === "home" ? "the traveller's" : "the home person's";
		$("td-note").innerHTML = g < 1.0001
			? "At this speed the effect is far too small to see: in a whole year " + other + " clock would fall behind by only <b>" + R.sig(per * 1e6, 3) + " millionths of a second</b>. It is real, and your satellite navigation corrects for it. Try 90% of the speed of light."
			: "<b>" + ref + ":</b> " + other + " clock runs <b>" + R.sig(g, 4) + " times slower</b> (it keeps " + R.sig(100 / g, 3) + "% of the pace). While " + (st.view === "home" ? "1 year passes on the ship, " + R.fmtYears(g) + " pass at home" : "1 year passes for the traveller, only " + R.fmtYears(1 / g) + " pass at home") + ". " + (st.view === "ship" ? "On a steady journey each side sees the other's clock slow; the twin trip tab shows who is really younger at a reunion." : "The traveller themselves feels nothing unusual.");
	}
	/* ---- drag the life bars: set a person's age directly; the other one follows at the right rate ---- */
	var bars = [], dragBar = -1, wasPlaying = true;
	function capYears() { if (!(eH <= MAXY)) eH = MAXY; if (!(eS <= MAXY)) eS = MAXY; if (!(eH >= 0)) eH = 0; if (!(eS >= 0)) eS = 0; if (eH >= MAXY || eS >= MAXY) { /* stop at the cap rather than run off to infinity */ st.play = false; syncPlay(); } }
	function barAt(e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; for (var k = 0; k < bars.length; k++) { var b = bars[k]; if (b && x >= b.x - 14 && x <= b.x + b.w + 14 && y >= b.y && y <= b.y + b.h) return k; } return -1; }
	function setAgeFromBar(k, e) {
		var r = cv.getBoundingClientRect(), b = bars[k]; if (!b) return; var f = clamp((e.clientX - r.left - b.x) / b.w, 0, 1), own = Math.max(0, f * barMax - st.age), g = gamma(), refIsHome = st.view === "home", isRef = (k === 0) === refIsHome;
		var ref = isRef ? own : own * g;                 /* the reference person's own time; the other has lived ref / gamma */
		if (refIsHome) { eH = ref; eS = ref / g; } else { eS = ref; eH = ref / g; }
		capYears(); updateReadouts(); drawClocks();
	}
	cv.addEventListener("pointerdown", function (e) { var k = barAt(e); if (k < 0) return; dragBar = k; dragMax = barMax; wasPlaying = st.play; st.play = false; try { cv.setPointerCapture(e.pointerId); } catch (x) {} setAgeFromBar(k, e); e.preventDefault(); });
	cv.addEventListener("pointermove", function (e) { if (dragBar >= 0) { setAgeFromBar(dragBar, e); return; } cv.className = barAt(e) >= 0 ? "td-bar" : ""; });
	function endDrag() { if (dragBar < 0) return; dragBar = -1; dragMax = 0; st.play = wasPlaying; syncPlay(); }
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
	cv.tabIndex = 0;
	cv.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; var g = gamma(); if (st.view === "home") { eH = Math.max(0, eH + d); eS = eH / g; } else { eS = Math.max(0, eS + d); eH = eS / g; } capYears(); updateReadouts(); drawClocks(); e.preventDefault(); });
	function syncPlay() { var b = $("td-play"); b.setAttribute("aria-pressed", st.play ? "true" : "false"); b.textContent = st.play ? "❚❚ Pause" : "▶ Play"; }

	/* controls */
	var spEl = $("td-sp"), setPre1;
	function setBeta(b, keepText) {
		st.beta = clamp(b, 0, 0.99999999); spEl.value = Math.round(R.toSlider(st.beta) * 1000); $("td-ctl-sp").value = spEl.value; $("td-sp-v").textContent = betaTxt(st.beta) + " (γ = " + gTxt(gamma()) + ")";
		if (!keepText) { $("td-sp-t").value = ""; $("td-sp-err").textContent = ""; } setPre1(); note1(); updateReadouts(); sset({ beta: st.beta });
	}
	spEl.oninput = function () { setBeta(R.fromSlider(+spEl.value / 1000)); };   /* the clocks keep what they have already counted: the traveller adds up dt / gamma as the speed changes */
	$("td-sp-t").oninput = function () { var v = this.value, r = R.parseSpeed(v); if (!v.trim()) { $("td-sp-err").textContent = ""; return; } if (r.error) { $("td-sp-err").textContent = r.error; return; } $("td-sp-err").textContent = ""; setBeta(r.beta, true); };
	function syncTs() { Array.prototype.forEach.call($("td-ctl-ts").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", Math.abs(+b.dataset.ts - st.ts) < 1e-9 ? "true" : "false"); }); }
	$("td-ts").onchange = function () { st.ts = +this.value; sset({ ts: st.ts }); syncTs(); };
	$("td-ctl-sp").oninput = function () { spEl.value = this.value; spEl.oninput(); };
	$("td-ctl-ts").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; st.ts = +b.dataset.ts; $("td-ts").value = String(b.dataset.ts); if ($("td-ts").value !== String(b.dataset.ts)) $("td-ts").selectedIndex = Array.prototype.findIndex.call($("td-ts").options, function (o) { return Math.abs(+o.value - st.ts) < 1e-9; }); sset({ ts: st.ts }); syncTs(); };
	$("td-age").onchange = function () { st.age = clamp(Math.round(+this.value || 0), 0, 110); this.value = st.age; sset({ age: st.age }); updateReadouts(); };
	Array.prototype.forEach.call(root.querySelectorAll("#td-view button"), function (b) { b.onclick = function () { st.view = b.dataset.view; Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); sset({ view: st.view }); resetClocks(); note1(); }; });
	$("td-fig").onchange = function () { st.fig = this.value; sset({ fig: st.fig }); drawClocks(); drawTrip(); };
	$("td-o-water").onchange = function () { st.water = this.checked; sset({ water: st.water }); }; $("td-o-mol").onchange = function () { st.mol = this.checked; sset({ mol: st.mol }); }; $("td-o-pulse").onchange = function () { st.pulse = this.checked; sset({ pulse: st.pulse }); };
	$("td-play").onclick = function () { st.play = !st.play; syncPlay(); };
	$("td-reset").onclick = resetClocks;
	$("td-png").onclick = function () { drawClocks(); pngOf(cv, "time-dilation-" + R.sig(st.beta * 100, 4) + "pc.png"); };
	$("td-link").onclick = function () { var u = new URL(location.href); u.search = ""; u.searchParams.set("v", String(st.beta)); u.searchParams.set("age", st.age); if (st.ts !== 1) u.searchParams.set("ts", st.ts); if (st.view !== "home") u.searchParams.set("view", st.view); if (st.water) u.searchParams.set("water", "1"); if (st.fig !== "mm") u.searchParams.set("fig", st.fig); copyLink(u.toString()); };

	/* ================= tab 2: light clock ================= */
	var lightBeta, lt = { x: 0, t: 0, n0: 0, n1: 0, y0: 0, dir0: 1, y1: 0, dir1: 1, trail: [], play: true }, setPreL;
	function lightReset() { lt.x = 0; lt.t = 0; lt.n0 = 0; lt.n1 = 0; lt.trail = []; lt.p0 = 0; lt.p1 = 0; lt.c0 = 0; lt.c1 = 0; }
	function lightGeo() { if (!SZ.l) return null; var W = SZ.l.w, H = SZ.l.h, stacked = W < 620, h = stacked ? H * 0.2 : H * 0.44; return { W: W, H: H, h: h, stacked: stacked, rx: stacked ? 20 : W * 0.2, rw: stacked ? W - 40 : W * 0.44 }; }
	function tri(p) { var f = frac(p / 2) * 2; return f < 1 ? f : 2 - f; }   /* 0..1..0 */
	function lightStep(dt) {
		var b = lightBeta, g = R.gammaOf(b), geo = lightGeo(); if (!geo) return; var cpx = geo.h / 1.2, vx = b * cpx, vy = cpx / g; lt.t += dt;
		/* resting clock: the photon goes up and down at c */
		lt.p0 += dt * cpx / geo.h; var n0 = Math.floor(lt.p0); if (n0 > lt.c0) { lt.n0 += n0 - lt.c0; lt.c0 = n0; }
		/* moving clock seen from the lab: sideways vx, and up/down at only c / gamma, so each bounce takes gamma times longer */
		lt.x += vx * dt; lt.p1 += dt * vy / geo.h; var n1 = Math.floor(lt.p1); if (n1 > lt.c1) { lt.n1 += n1 - lt.c1; lt.c1 = n1; }
		lt.trail.push([lt.x, tri(lt.p1)]); if (lt.trail.length > 600) lt.trail.shift();
		if (lt.x > geo.rw) { lt.x = 0; lt.trail = []; }
	}
	function drawLight() {
		if (tab !== "light" || !SZ.l) return; var G = lightGeo(), W = G.W, H = G.H, c = lcx, b = lightBeta, g = R.gammaOf(b), fs = clamp(W * 0.0175, 10, 15), h = G.h, stacked = G.stacked; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H);
		var x0 = stacked ? W * 0.5 - W * 0.09 : W * 0.06, top0 = stacked ? H * 0.1 : H * 0.18, mw = stacked ? W * 0.18 : W * 0.07, top1 = stacked ? H * 0.5 : H * 0.18;
		clockBox(c, x0, top0, mw, h, tri(lt.p0), 0, "RESTING clock", fs, "#ffd27a");
		c.strokeStyle = "rgba(127,208,255,0.55)"; c.lineWidth = 1.6; c.beginPath(); lt.trail.forEach(function (pt, i) { var xx = G.rx + pt[0] + mw / 2, y2 = top1 + h - pt[1] * h; if (i) c.lineTo(xx, y2); else c.moveTo(xx, y2); }); c.stroke();
		clockBox(c, G.rx + lt.x, top1, mw, h, tri(lt.p1), 0, "MOVING clock", fs, "#7fd0ff");
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.9 + "px sans-serif"; c.textAlign = "left"; c.fillText("moving at " + betaTxt(b) + " →", G.rx, top1 - 10);
		triangle(c, stacked ? W * 0.06 : W * 0.7, stacked ? H * 0.8 : H * 0.2, stacked ? W * 0.4 : W * 0.26, stacked ? H * 0.12 : H * 0.34, b, g, fs);
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.85 + "px sans-serif"; c.textAlign = "center"; c.fillText(g < 1.0001 ? "At this speed the zig-zag is hardly longer than the straight path." : "Longer path, same speed of light: " + R.sig(g, 4) + "× more time per tick.", W / 2, H - 8);
		$("td-l-n0").textContent = String(lt.n0); $("td-l-n1").textContent = String(lt.n1); $("td-l-n1s").textContent = lt.n0 ? "about " + R.sig(lt.n0 / g, 3) + " expected (the resting count ÷ γ)" : "";
		$("td-l-p").textContent = "× " + R.sig(g, 4); $("td-l-pyth").textContent = "1² + " + R.sig(b * g, 4) + "² = " + R.sig(g, 4) + "²";
	}
	function clockBox(c, x, y, w, h, pos, _, label, fs, col, moving) {
		c.strokeStyle = "#c9d2e6"; c.lineWidth = 4; c.beginPath(); c.moveTo(x - w * 0.15, y); c.lineTo(x + w * 1.15, y); c.moveTo(x - w * 0.15, y + h); c.lineTo(x + w * 1.15, y + h); c.stroke();
		c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 2; c.strokeRect(x, y, w, h);
		var px = x + w / 2, py = y + h - pos * h; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 12; c.beginPath(); c.arc(px, py, 6, 0, TAU); c.fill(); c.shadowBlur = 0;
		c.fillStyle = "#e8ecf5"; c.font = "700 " + fs + "px sans-serif"; c.textAlign = "center"; c.fillText(label, x + w / 2, y + h + fs * 1.6);
	}
	function triangle(c, x, y, w, h, b, g, fs) {
		c.save(); c.fillStyle = "rgba(255,255,255,0.05)"; rr(c, x - 8, y - 22, w + 16, h + 52, 8); c.fill(); c.restore();
		var cdtau = h * 0.9, vdt = cdtau * b * g;                      /* sides in the ratio v dt : c dtau = beta*gamma : 1 */
		var sc = Math.min(1, w * 0.78 / Math.max(vdt, 1)); vdt *= sc; cdtau *= sc; var x0 = x + 6, y0 = y + h * 0.95;
		c.strokeStyle = "#ffd27a"; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + vdt, y0); c.lineTo(x0 + vdt, y0 - cdtau); c.closePath(); c.stroke();
		c.fillStyle = "#e8ecf5"; c.font = fs * 0.85 + "px sans-serif"; c.textAlign = "center"; c.fillText("v·Δt", x0 + vdt / 2, y0 + fs * 1.15); c.textAlign = "left"; c.fillText("c·Δτ", x0 + vdt + 4, y0 - cdtau / 2); c.fillStyle = "#7fd0ff"; c.fillText("c·Δt", x0 + 2, y0 - 6 - Math.min(cdtau * 0.4, 30));
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.8 + "px sans-serif"; c.fillText("one tick of the moving clock", x, y - 6);
	}
	$("td-l-sp").oninput = function () { setLightBeta(R.fromSlider(+this.value / 1000)); lightReset(); };
	function setLightBeta(b) { lightBeta = clamp(b, 0, 0.99999999); $("td-l-sp").value = Math.round(R.toSlider(lightBeta) * 1000); var g = R.gammaOf(lightBeta); $("td-l-sp-v").textContent = betaTxt(lightBeta) + " (γ = " + gTxt(g) + ")"; setPreL(); $("td-l-note").textContent = g < 1.0001 ? "At everyday speeds the zig-zag is no longer than the straight path, so you cannot tell the clocks apart. Slide the speed up." : "In the time the resting clock ticks " + R.sig(g, 4) + " times, the moving one ticks once. Light has the same speed in both pictures, so the only way both clocks can agree about light is for time itself to differ."; sset({ lbeta: lightBeta }); }
	$("td-l-play").onclick = function () { lt.play = !lt.play; this.setAttribute("aria-pressed", lt.play ? "true" : "false"); this.textContent = lt.play ? "❚❚ Pause" : "▶ Play"; };
	$("td-l-reset").onclick = lightReset;

	/* ================= tab 3: twin trip ================= */
	var DEST = [["Proxima Centauri", 4.24], ["Sirius", 8.6], ["Vega", 25], ["Pleiades", 444], ["Galactic centre", 26000], ["Andromeda", 2537000]];
	var tr = { mode: "g", d: 4.24, beta: 0.9, age: 20, round: true, s: 0, play: false, model: null }, TRIP_SECS = 16, setPreT;
	function tripModel() {
		if (tr.mode === "const") { var m = R.tripConst(tr.d, tr.beta, tr.round); m.kind = "const"; m.beta = tr.beta; return m; }
		var m2 = R.trip1g(tr.d, tr.round); m2.kind = "g"; return m2;
	}
	function tripUpdate(keepS) {
		tr.model = tripModel(); if (!keepS) tr.s = 0; var m = tr.model, tg = m.tEarth - m.tShip;
		$("td-t-sp-l").parentNode.style.display = tr.mode === "const" ? "" : "none";
		$("td-t-sp-v").textContent = betaTxt(tr.beta) + " (γ = " + gTxt(R.gammaOf(tr.beta)) + ")";
		$("td-t-pk").textContent = betaTxt(m.peakBeta); $("td-t-pks").textContent = "γ = " + gTxt(m.peakGamma);
		$("td-t-gap").textContent = R.fmtYears(tg); $("td-t-gaps").textContent = "traveller " + (tr.round ? "returns " : "arrives ") + R.fmtYears(tg) + " younger";
		var dd = R.commas(tr.d, 6);
		$("td-t-note").innerHTML = (tr.mode === "g" ? "A ship under a steady <b>1 g</b> (the pull you feel on Earth) accelerates for half the way and brakes for the other half, so passengers feel normal gravity all the way." : "The ship moves at one fixed speed and turns round instantly (the textbook version; real turn-arounds take acceleration). ") +
			" To go " + (tr.round ? "to a place " + dd + " light-years away and back" : dd + " light-years") + " the <b>traveller lives through " + R.fmtYears(m.tShip) + "</b> while <b>" + R.fmtYears(m.tEarth) + "</b> pass at home. Peak speed " + R.fmtPct(m.peakBeta) + " of c.";
		tripReadouts(); sset({ trip: { mode: tr.mode, d: tr.d, beta: tr.beta, age: tr.age, round: tr.round } });
		var destMatch = DEST.map(function (x) { return Math.abs(x[1] - tr.d) < 1e-9; }); Array.prototype.forEach.call($("td-t-dest").children, function (b, i) { b.setAttribute("aria-pressed", destMatch[i] ? "true" : "false"); });
		drawTrip();
	}
	function tripReadouts() {
		var s = R.tripState(tr.model, tr.s); $("td-t-h").textContent = ageStr(tr.age + s.t); $("td-t-hs").textContent = "lived " + ownStr(s.t); $("td-t-v").textContent = ageStr(tr.age + s.tau); $("td-t-vs").textContent = "lived " + ownStr(s.tau);
	}
	function nice(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; }
	function drawTrip() {
		if (tab !== "trip" || !SZ.t || !tr.model) return; var W = SZ.t.w, H = SZ.t.h, c = tcx, m = tr.model, s = R.tripState(m, tr.s), stacked = W < 700, fs = clamp(W * 0.0165, 10, 14);
		c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H);
		var L = stacked ? [4, 4, W - 8, H * 0.46] : [4, 4, W * 0.44 - 8, H - 8], D = stacked ? [4, H * 0.5 + 4, W - 8, H * 0.5 - 8] : [W * 0.44 + 4, 4, W * 0.56 - 8, H - 8];
		/* ---- left: the trip ---- */
		c.save(); rr(c, L[0], L[1], L[2], L[3], 10); c.clip(); c.fillStyle = "#0a1024"; c.fillRect(L[0], L[1], L[2], L[3]);
		for (var i = 0; i < 60; i++) { var sx = L[0] + ((i * 977) % 1000) / 1000 * L[2], sy = L[1] + ((i * 613) % 1000) / 1000 * L[3]; c.fillStyle = "rgba(255,255,255," + (0.2 + ((i * 37) % 10) / 20) + ")"; c.fillRect(sx, sy, 1.5, 1.5); }
		var ax = L[0] + L[2] * 0.12, bx = L[0] + L[2] * 0.88, ly = L[1] + L[3] * 0.34;
		c.strokeStyle = "#3a4258"; c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.moveTo(ax, ly); c.lineTo(bx, ly); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#3b82f6"; c.beginPath(); c.arc(ax, ly, 11, 0, TAU); c.fill(); c.fillStyle = "#ffd27a"; c.beginPath(); c.arc(bx, ly, 8, 0, TAU); c.fill(); c.shadowColor = "#ffd27a"; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0;
		c.fillStyle = "#e8ecf5"; c.font = fs + "px sans-serif"; c.textAlign = "center"; c.fillText("Earth", ax, ly + 28); c.textAlign = "right"; c.fillText(tr.d < 100 ? R.sig(tr.d, 3) + " light-years" : R.commas(tr.d, 5) + " ly", bx + 12, ly + 28); c.textAlign = "center";
		var shipX = ax + (bx - ax) * clamp(s.x / tr.d, 0, 1); c.save(); c.translate(shipX, ly); if (s.beta < 0) c.scale(-1, 1); c.fillStyle = "#e0574b"; c.beginPath(); c.moveTo(16, 0); c.lineTo(-10, -9); c.lineTo(-6, 0); c.lineTo(-10, 9); c.closePath(); c.fill(); c.restore();
		var ph = s.phase === "out" ? "outbound" : "returning";
		if (m.kind === "g") { var s2 = R.tripState(m, Math.min(1, tr.s + 0.003)); ph += Math.abs(s2.beta) > Math.abs(s.beta) + 1e-9 ? ", speeding up" : Math.abs(s2.beta) < Math.abs(s.beta) - 1e-9 ? ", slowing down" : ""; } else ph += ", cruising";
		if (tr.s <= 0) ph = "ready at Earth"; else if (tr.s >= 1) ph = tr.round ? "home again" : "arrived";
		c.fillStyle = "#9aa5bb"; c.font = fs * 0.95 + "px sans-serif"; c.fillText(ph + " · " + (Math.abs(s.beta) < 0.0005 ? "at rest" : R.fmtPct(Math.abs(s.beta)) + " of c"), L[0] + L[2] / 2, ly - 22);
		var by = L[1] + L[3] * 0.92 - (stacked ? 0 : 0), pw2 = L[2] / 2, hh = L[3] * 0.38, py = L[1] + L[3] * 0.9;
		person(c, L[0] + pw2 * 0.5, py - 18, hh, tr.age + s.t, { female: female(0), shirt: "#3b82f6", pants: "#2c3550", skin: "#f1c9a3", beat: 0, blink: false });
		person(c, L[0] + pw2 * 1.5, py - 18, hh, tr.age + s.tau, { female: female(1), shirt: "#e0574b", pants: "#2c3550", skin: "#f1c9a3", beat: 0, blink: false });
		c.fillStyle = "#e8ecf5"; c.font = "700 " + fs + "px sans-serif"; c.textAlign = "center"; c.fillText("Home twin: " + ageStr(tr.age + s.t), L[0] + pw2 * 0.5, py + 2); c.fillText("Traveller: " + ageStr(tr.age + s.tau), L[0] + pw2 * 1.5, py + 2);
		c.restore(); c.strokeStyle = "#2a3040"; c.lineWidth = 2; rr(c, L[0], L[1], L[2], L[3], 10); c.stroke();
		/* ---- right: spacetime diagram ---- */
		c.save(); rr(c, D[0], D[1], D[2], D[3], 10); c.clip(); c.fillStyle = "#080b12"; c.fillRect(D[0], D[1], D[2], D[3]);
		var padL = 44, padB = 34, padT = 26, padR = 14, pw = D[2] - padL - padR, phh = D[3] - padT - padB, T = m.tEarth, dX = tr.d * (tr.round ? 1 : 1);
		var xr = Math.max(dX * 1.18, T * 0.34), tr2 = T * 1.06, sc = Math.min(pw / xr, phh / tr2), ox = D[0] + padL, oy = D[1] + padT + phh;
		function X(x) { return ox + x * sc; } function Y(t) { return oy - t * sc; }
		c.strokeStyle = "#2a3040"; c.lineWidth = 1; c.fillStyle = "#9aa5bb"; c.font = fs * 0.85 + "px sans-serif"; c.textAlign = "right";
		var tick = nice(T / 5); for (var tv = 0; tv <= T * 1.03; tv += tick) { c.beginPath(); c.moveTo(ox, Y(tv)); c.lineTo(ox + xr * sc, Y(tv)); c.stroke(); c.fillText(R.sig(tv, 3), ox - 4, Y(tv) + 4); }
		c.save(); c.translate(D[0] + 12, D[1] + D[3] / 2); c.rotate(-PI / 2); c.textAlign = "center"; c.fillText("time at home (years)", 0, 0); c.restore(); c.textAlign = "center"; c.fillText("distance from Earth (light-years)", ox + xr * sc / 2, D[1] + D[3] - 6);
		var xt = nice(xr / 4); c.textAlign = "center"; for (var xv = 0; xv <= xr; xv += xt) { c.fillText(R.sig(xv, 3), X(xv), D[1] + D[3] - 20); }
		/* light cone from the start */
		c.strokeStyle = "rgba(255,210,122,0.35)"; c.setLineDash([5, 5]); c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(Math.min(xr, tr2)), Y(Math.min(xr, tr2))); c.stroke(); c.setLineDash([]); c.fillStyle = "rgba(255,210,122,0.7)"; c.textAlign = "left"; c.fillText("light", X(Math.min(xr, tr2)) - 34, Y(Math.min(xr, tr2)) + 14);
		var wl = R.worldline(m, 300), unit = nice(m.tShip / 18);
		/* home world line */
		c.strokeStyle = "#3b82f6"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(0), Y(T)); c.stroke();
		c.strokeStyle = "#e0574b"; c.lineWidth = 2.5; c.beginPath(); wl.forEach(function (p, i) { if (i) c.lineTo(X(p.x), Y(p.t)); else c.moveTo(X(p.x), Y(p.t)); }); c.stroke();
		/* dots every `unit` years of own time */
		var nh = 0, ns = 0; c.fillStyle = "#3b82f6"; for (var u = unit; u <= T / 1 + 1e-9; u += unit) { c.beginPath(); c.arc(X(0), Y(u), 3.2, 0, TAU); c.fill(); nh++; if (nh > 400) break; }
		c.fillStyle = "#e0574b"; for (var w = unit; w <= m.tShip + 1e-9; w += unit) { var f2 = w / m.tShip, p = m.kind === "g" ? R.tripState(m, f2) : tripAtTau(m, w); c.beginPath(); c.arc(X(p.x), Y(p.t), 3.4, 0, TAU); c.fill(); ns++; if (ns > 400) break; }
		/* now */
		c.strokeStyle = "rgba(255,255,255,0.45)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(X(0), Y(s.t)); c.lineTo(X(s.x), Y(s.t)); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#3b82f6"; c.beginPath(); c.arc(X(0), Y(s.t), 6, 0, TAU); c.fill(); c.fillStyle = "#e0574b"; c.beginPath(); c.arc(X(s.x), Y(s.t), 6, 0, TAU); c.fill();
		c.fillStyle = "#e8ecf5"; c.font = fs * 0.9 + "px sans-serif"; c.textAlign = "left"; c.fillText("● = " + (unit < 1 ? R.fmtYears(unit) : R.sig(unit, 3) + (unit === 1 ? " year" : " years")) + " of their own time", D[0] + padL + 6, D[1] + 17);
		c.fillStyle = "#3b82f6"; c.fillText(nh + " dots home", D[0] + D[2] - padR - 150, D[1] + 17); c.fillStyle = "#e0574b"; c.fillText(ns + " dots ship", D[0] + D[2] - padR - 150 + 78, D[1] + 17);
		c.restore(); c.strokeStyle = "#2a3040"; c.lineWidth = 2; rr(c, D[0], D[1], D[2], D[3], 10); c.stroke();
	}
	function tripAtTau(m, w) { var T = m.tEarth, g = m.peakGamma, t = w * g; return R.tripState(m, t / T); }
	var tProg = $("td-t-prog");
	function tripProg() { tProg.value = Math.round(tr.s * 1000); $("td-t-prog-v").textContent = Math.round(tr.s * 100) + "%"; }
	tProg.oninput = function () { tr.s = +this.value / 1000; $("td-t-prog-v").textContent = Math.round(tr.s * 100) + "%"; tripReadouts(); drawTrip(); };
	$("td-t-play").onclick = function () { if (tr.s >= 1) tr.s = 0; tr.play = !tr.play; this.setAttribute("aria-pressed", tr.play ? "true" : "false"); this.textContent = tr.play ? "❚❚ Pause" : "▶ Play the trip"; };
	$("td-t-reset").onclick = function () { tr.s = 0; tr.play = false; $("td-t-play").setAttribute("aria-pressed", "false"); $("td-t-play").textContent = "▶ Play the trip"; tripProg(); tripReadouts(); drawTrip(); };
	Array.prototype.forEach.call(root.querySelectorAll("#td-t-mode button"), function (b) { b.onclick = function () { tr.mode = b.dataset.mode; Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); tripUpdate(); tripProg(); }; });
	$("td-t-d").onchange = function () { tr.d = num(this.value, 0.01, 1e8, tr.d); this.value = tr.d; tripUpdate(); tripProg(); };
	$("td-t-age").onchange = function () { tr.age = clamp(Math.round(+this.value || 0), 0, 100); this.value = tr.age; tripUpdate(true); };
	$("td-t-sp").oninput = function () { tr.beta = R.fromSlider(+this.value / 1000); tripUpdate(); tripProg(); };
	$("td-t-round").onchange = function () { tr.round = this.checked; tripUpdate(); tripProg(); };
	$("td-t-dest").innerHTML = DEST.map(function (d) { return '<button type="button" aria-pressed="false">' + esc(d[0]) + " · " + R.commas(d[1], 4) + " ly</button>"; }).join("");
	$("td-t-dest").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; var i = Array.prototype.indexOf.call(this.children, b); tr.d = DEST[i][1]; $("td-t-d").value = tr.d; tripUpdate(); tripProg(); };
	$("td-t-link").onclick = function () { var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", "trip"); u.searchParams.set("d", String(tr.d)); u.searchParams.set("mode", tr.mode); if (tr.mode === "const") u.searchParams.set("tv", String(tr.beta)); u.searchParams.set("age", tr.age); u.searchParams.set("round", tr.round ? "1" : "0"); copyLink(u.toString()); };

	/* ================= tab 4: calculator ================= */
	var calc = { text: "0.9c", years: 10, mass: 70 }, setPreC;
	function cell(label, val, sub, hl) { return '<div' + (hl ? ' class="td-hl"' : "") + "><span>" + esc(label) + "</span><b>" + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
	function calcRender() {
		var r = R.parseSpeed(calc.text), out = $("td-c-res"); $("td-c-err").textContent = r.error || "";
		if (r.error) { out.innerHTML = ""; return; }
		var b = r.beta, g = r.gamma || R.gammaOf(b), yrs = calc.years, S = R.summary(b, yrs), E = R.kineticEnergy(calc.mass, b), world = 6e20;
		setPreC && setPreC();
		out.innerHTML =
			cell("Speed", R.fmtPct(b) + " of c", R.fmtSpeed(b) + " · " + R.commas(b * R.C * 2.2369363, 4) + " mph") +
			cell("Time-stretch γ", gTxt(g), "the Lorentz factor, 1 / √(1 − v²/c²)", true) +
			cell("A moving clock runs", R.sig(100 / g, 4) + "% of the pace", g < 1.0001 ? "slower by " + R.sig(R.slowdown(b) * 100, 3) + " parts in a hundred" : "slower by " + R.sig(100 * R.slowdown(b), 4) + "%") +
			cell("While " + R.fmtYears(yrs) + " pass for the observer", R.fmtYears(S.shipYears) + " for the traveller", "the traveller ages " + R.fmtYears(yrs - S.shipYears) + " less", true) +
			cell("Distance covered", R.commas(S.distanceLy, 5) + " light-years", "as measured by the observer at rest") +
			cell("To the traveller that distance seems", R.commas(S.distanceLy / g, 5) + " light-years", "space is squeezed along the direction of travel: " + R.sig(100 / g, 4) + "% of its length") +
			cell("1 year on the ship is", R.fmtYears(g) + " at home", "") +
			cell("Energy to reach this speed", R.sig(E, 3) + " J", "for " + R.sig(calc.mass, 4) + " kg: " + R.sig(E / world, 3) + " × all the energy humanity uses in a year (≈ 6 × 10²⁰ J)");
	}
	$("td-c-v").value = calc.text; $("td-c-y").value = calc.years; $("td-c-m").value = calc.mass;
	$("td-c-v").oninput = function () { calc.text = this.value; calcRender(); sset({ calc: calc }); };
	$("td-c-y").oninput = function () { calc.years = num(this.value, 0, 1e12, calc.years); calcRender(); sset({ calc: calc }); };
	$("td-c-m").oninput = function () { calc.mass = num(this.value, 0, 1e30, calc.mass); calcRender(); sset({ calc: calc }); };
	setPreC = presetChips($("td-c-pre"), function (b) { calc.text = R.sig(b, 8) + "c"; if (b < 1e-4) calc.text = R.sig(b * R.C, 5) + " m/s"; $("td-c-v").value = calc.text; calcRender(); sset({ calc: calc }); }, function () { var r = R.parseSpeed(calc.text); return r.error ? -1 : r.beta; });
	/* everyday table */
	(function () {
		var rows = R.EVERYDAY.map(function (e) { var b = e.v / R.C, sl = R.slowdown(b), lost = sl * R.YEAR; return "<tr><td>" + esc(e.n) + "</td><td>" + R.sig(e.v, 4) + " m/s</td><td>" + R.sig(sl, 3) + "</td><td>" + (lost < 1e-3 ? R.sig(lost * 1e6, 3) + " µs" : lost < 1 ? R.sig(lost * 1e3, 3) + " ms" : R.sig(lost, 3) + " s") + '</td><td><button type="button" data-v="' + e.v + '">Use</button></td></tr>'; });
		$("td-c-tab").querySelector("tbody").innerHTML = rows.join("");
		$("td-c-tab").onclick = function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; calc.text = b.dataset.v + " m/s"; $("td-c-v").value = calc.text; calcRender(); sset({ calc: calc }); };
	})();
	/* muons */
	var MUON_TAU = 2.1969811e-6, mu = { n: 322, h: 15 };
	function muRender() {
		var beta = 1 - Math.pow(10, -(mu.n / 100)), m = R.muon(beta, mu.h);
		$("td-m-sv").textContent = R.fmtPct(beta) + " of c (γ = " + gTxt(m.gamma) + ")";
		$("td-m-res").innerHTML = cell("Muon's own clock", "2.197 µs", "mean lifetime at rest") + cell("Lifetime on our clocks", R.sig(m.lifetimeLab * 1e6, 4) + " µs", "γ times longer", true) + cell("Typical distance travelled", R.sig(m.meanRangeKm, 3) + " km", "without time dilation: " + R.sig(R.C * MUON_TAU * beta / 1000, 3) + " km") + cell("Survive a " + mu.h + " km fall", R.sig(m.survive * 100, 3) + "%", "without time dilation only " + R.sig(m.surviveNoDilation * 100, 3) + "%", true);
	}
	$("td-m-s").value = mu.n; $("td-m-h").value = mu.h; $("td-m-s").oninput = function () { mu.n = +this.value; muRender(); }; $("td-m-h").oninput = function () { mu.h = num(this.value, 1, 100, mu.h); muRender(); };

	/* ================= start-up ================= */
	function init() {
		if (saved.beta !== undefined) st.beta = num(saved.beta, 0, 0.99999999, st.beta); st.age = Math.round(num(saved.age, 0, 110, st.age)); st.ts = num(saved.ts, 0.001, 1000, st.ts); if (saved.view === "ship") st.view = "ship"; if (/^(mm|ff|mf|fm)$/.test(saved.fig || "")) st.fig = saved.fig;
		["water", "mol", "pulse"].forEach(function (k) { if (typeof saved[k] === "boolean") st[k] = saved[k]; });
		lightBeta = num(saved.lbeta, 0, 0.99999999, 0.8); if (saved.trip) { tr.mode = saved.trip.mode === "const" ? "const" : "g"; tr.d = num(saved.trip.d, 0.01, 1e8, tr.d); tr.beta = num(saved.trip.beta, 0, 0.99999999, tr.beta); tr.age = Math.round(num(saved.trip.age, 0, 100, 20)); tr.round = saved.trip.round !== false; }
		if (saved.calc) { calc.text = String(saved.calc.text || calc.text); calc.years = num(saved.calc.years, 0, 1e12, 10); calc.mass = num(saved.calc.mass, 0, 1e30, 70); }
		/* links */
		if (q.get("v") !== null) { var vv = R.parseSpeed(q.get("v")); if (!vv.error) st.beta = vv.beta; lightBeta = st.beta; } if (q.get("age") !== null) { st.age = Math.round(num(q.get("age"), 0, 110, st.age)); tr.age = st.age; } if (q.get("ts") !== null) st.ts = num(q.get("ts"), 0.001, 1000, st.ts); if (q.get("view") === "ship") st.view = "ship"; if (/^(mm|ff|mf|fm)$/.test(q.get("fig") || "")) st.fig = q.get("fig"); if (q.get("water") === "1") st.water = true;
		if (q.get("d") !== null) { tr.d = num(q.get("d"), 0.01, 1e8, tr.d); if (q.get("mode") === "const" || q.get("mode") === "g") tr.mode = q.get("mode"); if (q.get("tv") !== null) tr.beta = num(q.get("tv"), 0, 0.99999999, tr.beta); tr.round = q.get("round") !== "0"; }
		setPre1 = presetChips($("td-pre"), function (b) { setBeta(b); }, function () { return st.beta; }); setPreL = presetChips($("td-l-pre"), function (b) { setLightBeta(b); lightReset(); }, function () { return lightBeta; });
		$("td-age").value = st.age; $("td-ts").value = String(st.ts); if ($("td-ts").value !== String(st.ts)) $("td-ts").selectedIndex = 2; st.ts = +$("td-ts").value;
		$("td-fig").value = st.fig; $("td-o-water").checked = st.water; $("td-o-mol").checked = st.mol; $("td-o-pulse").checked = st.pulse;
		Array.prototype.forEach.call(root.querySelectorAll("#td-view button"), function (b) { b.setAttribute("aria-pressed", b.dataset.view === st.view ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("#td-t-mode button"), function (b) { b.setAttribute("aria-pressed", b.dataset.mode === tr.mode ? "true" : "false"); });
		$("td-t-d").value = tr.d; $("td-t-age").value = tr.age; $("td-t-sp").value = Math.round(R.toSlider(tr.beta) * 1000); $("td-t-round").checked = tr.round;
		setBeta(st.beta); syncTs(); setLightBeta(lightBeta); lightReset(); tripUpdate(); tripProg(); muRender(); calcRender(); setTab(tab, true);
		window.addEventListener("resize", onResize); if (window.ResizeObserver) { new ResizeObserver(onResize).observe(stage.parentNode); } setTimeout(onResize, 0);
		requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
	}
	function frame(t) {
		var dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
		if (!document.hidden) {
			if (tab === "clocks") { if (st.play) stepClocks(dt); drawClocks(); uiT += dt; if (uiT > 0.1) { uiT = 0; updateReadouts(); } }
			else if (tab === "light") { if (lt.play) lightStep(dt); drawLight(); }
			else if (tab === "trip") { if (tr.play) { tr.s = Math.min(1, tr.s + dt / TRIP_SECS); tripProg(); tripReadouts(); if (tr.s >= 1) { tr.play = false; $("td-t-play").setAttribute("aria-pressed", "false"); $("td-t-play").textContent = "▶ Play the trip"; } } drawTrip(); }
		}
		requestAnimationFrame(frame);
	}
	var setPre1;
	init();
	window.__td = { st: st, tr: tr, lt: lt, R: R, get eH() { return eH; }, get eS() { return eS; }, step: function (n) { for (var i = 0; i < (n || 1); i++) stepClocks(0.1); } };
})();
