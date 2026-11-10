/* ui-calc: the "Calculators" tab. Ten small live cards; every input accepts a typed unit ("500 nm", "2 eV") or the unit picked from its menu.
   Maths in lib-atom.js (MESQ.calc, MESQ.atom). Values are saved per card in api.st.v; links carry ca=<card> and ca_<card>_<field>=<text>. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var K, A, C, api, P, st, cards = {}, on = false;
	function $(s, r) { return (r || document).querySelector(s); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var f4 = function (x) { return Q.fmt(x, 4); }, f3 = function (x) { return Q.fmt(x, 3); };
	function partOpts(withCustom) { var o = K.PARTICLES.map(function (p) { return [p[0], p[1]]; }); if (withCustom) o.push(["custom", "Custom mass…"]); return o; }
	function partOf(id) { for (var i = 0; i < K.PARTICLES.length; i++) if (K.PARTICLES[i][0] === id) return K.PARTICLES[i]; return K.PARTICLES[0]; }
	var NUCS = [["inf", "Fixed nucleus (infinite mass)"], ["H", "Hydrogen-1 (proton)"], ["D", "Deuterium"], ["He", "Helium-4"], ["Li", "Lithium-7"]];
	var UNITS = {
		length: ["nm", "pm", "µm", "mm", "m", "Å", "fm"], energy: ["eV", "meV", "keV", "MeV", "J", "kJ/mol"], freq: ["THz", "GHz", "Hz", "PHz"], speed: ["m/s", "km/s", "c"],
		voltage: ["V", "kV", "MV"], mass: ["kg", "u", "g", "me"], time: ["ns", "fs", "ps", "µs", "ms", "s"], temp: ["K", "°C", "°F"], angle: ["deg", "rad"], area: ["m2", "cm2", "mm2"],
		density: ["/m3", "/cm3"], xray: ["pm", "nm", "Å", "keV", "eV", "MeV", "J"], photon: ["nm", "µm", "m", "eV", "J", "THz", "Hz", "cm-1"]
	};
	var PHOTON_DIMS = ["length", "energy", "freq", "wavenumber"];
	function lenTxt(x) { return Q.si(x, "m", 4); }
	function eTxt(J) { var eV = J / C.e; return Math.abs(eV) >= 1e-3 && Math.abs(eV) < 1e7 ? Q.si(eV, "eV", 4) : f4(eV) + " eV"; }
	function swatch(lam) { var rgb = A.wavelengthRGB(lam * 1e9); return rgb ? '<i class="qm-ca-sw" style="background:rgb(' + rgb.join(",") + ')" title="approximate colour"></i>' : ""; }
	function lamComp(l) {
		var tbl = [[1e-15, "a proton"], [1e-12, "an atomic nucleus is ~10× smaller"], [1e-10, "an atom"], [1e-8, "a small molecule cluster"], [4e-7, "visible light"], [1e-5, "a bacterium"], [1e-3, "a grain of sand"]];
		if (l < 1e-17) return "far smaller than a proton (10⁻¹⁵ m): no experiment could ever see this wave";
		if (l < 3e-15) return "about the size of a proton";
		if (l < 3e-13) return "about the size of an atomic nucleus";
		if (l < 5e-12) return "much smaller than an atom (10⁻¹⁰ m): like X-ray wavelengths";
		if (l < 5e-10) return "about the size of an atom: such waves diffract off crystals";
		if (l < 3.8e-7) return "between atoms and visible light";
		if (l < 7.5e-7) return "in the range of visible light";
		return "longer than visible light";
	}

	/* ---------- card definitions: fields + compute(v) -> {rows:[[label, html]], plug, say, chart?} ---------- */
	var DEF = {
		db: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(true); }, def: "e" },
				{ k: "mass", t: "q", label: "Mass", dims: ["mass"], units: "mass", def: "1 u", show: function (v) { return v.part === "custom"; } },
				{ k: "mode", t: "sel", label: "I know its", opts: [["V", "accelerating voltage"], ["K", "kinetic energy"], ["v", "speed"]], def: "V" },
				{ k: "val", t: "q", label: function (v) { return v.mode === "V" ? "Voltage" : v.mode === "K" ? "Kinetic energy" : "Speed"; }, dims: function (v) { return v.mode === "V" ? ["voltage"] : v.mode === "K" ? ["energy"] : ["speed"]; }, units: function (v) { return v.mode === "V" ? "voltage" : v.mode === "K" ? "energy" : "speed"; }, def: "100 V" }],
			calc: function (v, g) {
				var p = partOf(v.part), m = v.part === "custom" ? g("mass").v : p[2], q = v.part === "custom" ? 1 : Math.abs(p[3]), val = g("val");
				var r;
				if (v.mode === "V") { if (!q) throw { k: "val", m: "a neutral " + p[1].toLowerCase() + " is not sped up by a voltage: give its energy or speed" }; r = K.deBroglie(m, { K: q * C.e * val.v }); }
				else if (v.mode === "K") r = K.deBroglie(m, { K: val.v }); else r = K.deBroglie(m, { v: val.v });
				if (r.err) throw { k: "val", m: r.err };
				var rows = [["Wavelength λ", "<b>" + lenTxt(r.lambda) + "</b>"], ["Momentum p", f4(r.p) + " kg·m/s"], ["Speed v", (r.v > 1e-3 * C.c ? f4(r.v / C.c) + " c = " : "") + Q.si(r.v, "m/s", 4)], ["Kinetic energy", eTxt(r.K)], ["Lorentz factor γ", r.gamma < 1 + 1e-9 ? "1.000000000" : Q.fmt(r.gamma, 6)]];
				var plug = "λ = h / p = 6.626 × 10⁻³⁴ J·s ÷ " + f4(r.p) + " kg·m/s = " + lenTxt(r.lambda);
				var say = "The wave that goes with this " + (v.part === "custom" ? "particle" : p[1].toLowerCase()) + " is " + lamComp(r.lambda) + ".";
				if (r.relDiff > 0.005) say += " Relativity matters here: the non-relativistic formula would give " + lenTxt(r.lambdaNR) + " (" + (100 * r.relDiff).toFixed(1) + "% off).";
				else say += " At this speed the simple formula λ = h/(mv) is fine (relativity changes it by " + (r.relDiff < 1e-6 ? "less than a millionth" : (100 * r.relDiff).toPrecision(2) + "%") + ").";
				return { rows: rows, plug: plug, say: say };
			}
		},
		ph: {
			fields: [{ k: "val", t: "q", label: "Wavelength, energy or frequency", dims: PHOTON_DIMS, units: "photon", def: "500 nm" }],
			calc: function (v, g) {
				var x = g("val"), r = K.photon(x.v, x.dim);
				var rows = [["Wavelength", "<b>" + lenTxt(r.lambda) + "</b> " + swatch(r.lambda)], ["Energy", "<b>" + Q.si(r.eV, "eV", 4) + "</b>"], ["Energy (J)", f4(r.E) + " J"], ["Frequency", Q.si(r.f, "Hz", 4)], ["Wavenumber", f4(r.wavenumber / 100) + " cm⁻¹"], ["Momentum", f4(r.p) + " kg·m/s"], ["Band", r.band]];
				var plug = "E = hc / λ = (6.626 × 10⁻³⁴ × 2.998 × 10⁸) ÷ " + f4(r.lambda) + " m = " + f4(r.E) + " J = " + Q.si(r.eV, "eV", 4);
				var say = r.band === "visible" ? "Visible light: one photon of this colour carries " + Q.fmt(r.eV, 3) + " eV, about the energy that a chemical bond or your eye's retinal molecule works with." :
					r.lambda < 3.8e-7 ? "Ultraviolet or shorter: each photon has enough energy (" + Q.si(r.eV, "eV", 3) + ") to break chemical bonds, which is why it damages skin and DNA." :
						"Infrared or longer: each photon has only " + Q.si(r.eV, "eV", 3) + ", enough to make molecules vibrate (warmth) but not to break bonds.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		un: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e" },
				{ k: "dx", t: "q", label: "Position spread Δx", dims: ["length"], units: "length", def: "0.1 nm" },
				{ k: "dt", t: "q", label: "Time window Δt (for ΔE)", dims: ["time"], units: "time", def: "1 ns" }],
			calc: function (v, g) {
				var p = partOf(v.part), dx = g("dx").v, dt = g("dt").v, u = K.uncertainty(dx, p[2]), e = K.energyTime(dt);
				var rows = [["Minimum Δp", "<b>" + f4(u.dp) + " kg·m/s</b>"], ["Minimum Δv", "<b>" + Q.si(u.dv, "m/s", 4) + "</b>" + (u.dv > 0.1 * C.c ? " (relativistic: treat as rough)" : "")], ["Minimum ΔE", eTxt(e.dE)], ["Line width Δf = ΔE/h", Q.si(e.df, "Hz", 3)]];
				var plug = "Δp ≥ ħ / (2Δx) = 1.0546 × 10⁻³⁴ ÷ (2 × " + f4(dx) + " m) = " + f4(u.dp) + " kg·m/s;  Δv = Δp / m = " + Q.si(u.dv, "m/s", 4);
				var say = "Squeeze a " + p[1].toLowerCase() + " into " + lenTxt(dx) + " and its speed cannot be known better than ±" + Q.si(u.dv / 2, "m/s", 2) + " or so" +
					(u.dv > 1e4 ? ": it can never sit still, which is why atoms do not collapse." : u.dv > 1e-3 ? "." : ": far too small to ever notice, which is why everyday objects look perfectly classical.") +
					" A state that lives only " + Q.si(dt, "s") + " has an energy blurred by at least " + eTxt(e.dE) + ".";
				return { rows: rows, plug: plug, say: say };
			}
		},
		tu: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e" },
				{ k: "E", t: "q", label: "Particle energy E", dims: ["energy"], units: "energy", def: "1 eV" },
				{ k: "V", t: "q", label: "Barrier height V", dims: ["energy"], units: "energy", def: "2 eV" },
				{ k: "a", t: "q", label: "Barrier width a", dims: ["length"], units: "length", def: "0.5 nm" }],
			calc: function (v, g) {
				var p = partOf(v.part), E = g("E").v, V = g("V").v, a = g("a").v, r = K.tunnel(E, V, a, p[2]);
				if (r.err) throw { k: "E", m: r.err };
				var pc = function (x) { return x >= 1e-4 ? (100 * x).toPrecision(4) + "%" : f3(x); };
				var rows = [["Transmission T (exact)", "<b>" + pc(r.T) + "</b>"], ["Reflection R", pc(r.R)]];
				var plug, say;
				if (!r.above) {
					rows.push(["Decay constant κ", Q.si(r.kappa * 1e-9, "/nm", 4).replace(" /nm", " nm⁻¹")], ["Penetration depth 1/κ", lenTxt(r.depth)], ["Thick-barrier formula", pc(r.thick)], ["WKB  e^(−2κa)", pc(r.wkb)]);
					plug = "κ = √(2m(V−E))/ħ = " + f4(r.kappa) + " m⁻¹;  κa = " + Q.fmt(r.kappa * a, 4) + ";  T = 1 / [1 + V² sinh²(κa) / (4E(V−E))] = " + f3(r.T);
					var ka = r.kappa * a;
					say = ka < 1 ? "The barrier is thin compared with the decay length, so a big part of the wave gets through. The thick-barrier and WKB shortcuts are poor here: use the exact value." :
						"Inside the barrier the wave dies away like e^(−κx). Each extra " + lenTxt(Math.LN2 / (2 * r.kappa)) + " of width halves the chance of getting through" + (ka > 3 ? "; with κa = " + ka.toFixed(1) + " the thick-barrier formula is within a few per cent." : ".");
				} else {
					plug = "E > V: k′ = √(2m(E−V))/ħ = " + f4(r.k2) + " m⁻¹;  T = 1 / [1 + V² sin²(k′a) / (4E(E−V))] = " + f3(r.T);
					say = "The particle has enough energy to go over, yet quantum mechanically part of the wave still reflects. T reaches exactly 100% when the barrier fits a whole number of half wavelengths (k′a = nπ).";
				}
				return { rows: rows, plug: plug, say: say, chart: { E: E, V: V, a: a, m: p[2] } };
			},
			draw: function (c, W, H, d, dark) {
				var pl = 46, pr = 10, pt = 10, pb = 28, gw = W - pl - pr, gh = H - pt - pb, amax = d.a * 3, lo = -12, hi = 0;
				var Tv = [], N = 160, i;
				for (i = 0; i <= N; i++) { var a = amax * i / N, r = K.tunnel(d.E, d.V, Math.max(a, 1e-30), d.m); Tv.push([Math.log10(Math.max(r.T, 1e-300)), d.E < d.V ? Math.log10(Math.max(r.thick, 1e-300)) : NaN]); lo = Math.min(lo, Tv[i][0]); }
				lo = Math.max(-40, Math.floor(lo)); if (lo > -2) lo = -2;
				var X = function (a) { return pl + a / amax * gw; }, Y = function (l) { return pt + (hi - l) / (hi - lo) * gh; };
				axes(c, W, H, pl, pr, pt, pb, dark);
				c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.font = "11px system-ui,sans-serif";
				var stp = Math.max(1, Math.ceil((hi - lo) / 5));
				for (var e = 0; e >= lo; e -= stp) { c.fillText(e === 0 ? "1" : "10" + Q.sup(e), 4, Y(e) + 4); }
				c.fillText("barrier width →  (your width at the dot, scale to " + lenTxt(amax) + ")", pl, H - 8);
				line(c, Tv.map(function (t, i) { return [X(amax * i / N), Y(Q.clamp(t[0], lo, hi))]; }), "#5b3fd6", 2.2);
				if (d.E < d.V) line(c, Tv.map(function (t, i) { return [X(amax * i / N), Y(Q.clamp(t[1], lo, hi))]; }), "#db2777", 1.5, [5, 4]);
				var rr = K.tunnel(d.E, d.V, d.a, d.m); c.fillStyle = "#5b3fd6"; c.beginPath(); c.arc(X(d.a), Y(Q.clamp(Math.log10(rr.T), lo, hi)), 4.5, 0, 7); c.fill();
				legend(c, W - pr, pt + 12, [["#5b3fd6", "exact T"], ["#db2777", d.E < d.V ? "thick-barrier formula" : ""]], dark);
			}
		},
		bx: {
			fields: [{ k: "mode", t: "sel", label: "Mode", opts: [["lv", "Jump between two levels"], ["dye", "Dye molecule: N π electrons"]], def: "lv" },
				{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e", show: function (v) { return v.mode === "lv"; } },
				{ k: "L", t: "q", label: "Box length L", dims: ["length"], units: "length", def: "1 nm" },
				{ k: "n1", t: "int", label: "From level n", min: 1, max: 50, def: "1", show: function (v) { return v.mode === "lv"; } },
				{ k: "n2", t: "int", label: "To level n", min: 1, max: 50, def: "2", show: function (v) { return v.mode === "lv"; } },
				{ k: "N", t: "int", label: "π electrons N (even)", min: 2, max: 40, def: "6", show: function (v) { return v.mode === "dye"; } }],
			calc: function (v, g) {
				var L = g("L").v, rows, plug, say, chart, lam;
				if (v.mode === "dye") {
					var N = g("N").v; if (N % 2) throw { k: "N", m: "use an even number (two electrons per level)" };
					var d = K.dye(N, L); lam = d.lambda;
					rows = [["HOMO → LUMO", "n = " + d.homo + " → " + d.lumo], ["Gap ΔE", "<b>" + eTxt(d.dE) + "</b>"], ["Absorbed wavelength", "<b>" + lenTxt(lam) + "</b> " + swatch(lam)], ["Band", A.band(lam)]];
					plug = "ΔE = h²(N+1) / (8 mₑ L²) = (6.626 × 10⁻³⁴)² × " + (N + 1) + " ÷ (8 × 9.109 × 10⁻³¹ × (" + f4(L) + ")²) = " + eTxt(d.dE) + ";  λ = hc/ΔE = " + lenTxt(lam);
					say = "The " + N + " π electrons fill the lowest " + d.homo + " levels, two per level. Light is absorbed when one jumps to the first empty level. Longer chains = bigger box = smaller gap = longer wavelength, which is why longer dyes absorb redder light. (For butadiene, L = 0.578 nm, this simple model gives 220 nm; the measured absorption peak is about 217 nm.)";
					chart = { levels: 6 > d.lumo + 1 ? 6 : d.lumo + 1, filled: d.homo, from: d.homo, to: d.lumo, lam: lam };
				} else {
					var p = partOf(v.part), n1 = g("n1").v, n2 = g("n2").v, E1 = K.box(n1, L, p[2]), E2 = K.box(n2, L, p[2]), dE = Math.abs(E2 - E1);
					lam = dE ? C.h * C.c / dE : Infinity;
					rows = [["Energy at n = " + n1, eTxt(E1)], ["Energy at n = " + n2, eTxt(E2)], ["Gap ΔE", "<b>" + eTxt(dE) + "</b>"], ["Photon wavelength", dE ? "<b>" + lenTxt(lam) + "</b> " + swatch(lam) : "–"], ["Ground state E₁", eTxt(K.box(1, L, p[2]))]];
					plug = "Eₙ = n²h² / (8mL²): E₁ = (6.626 × 10⁻³⁴)² ÷ (8 × " + f4(p[2]) + " × (" + f4(L) + ")²) = " + eTxt(K.box(1, L, p[2])) + ";  ΔE = |" + n2 + "² − " + n1 + "²| E₁ = " + eTxt(dE);
					say = "A trapped particle can only have these energies, growing as n². Even the lowest level is not zero: confinement always costs energy (the uncertainty principle again). Halve the box and every level goes up 4×.";
					chart = { levels: Math.max(5, Math.min(12, Math.max(n1, n2) + 1)), filled: 0, from: n1, to: n2, lam: lam };
				}
				return { rows: rows, plug: plug, say: say, chart: chart };
			},
			draw: function (c, W, H, d, dark) {
				var nmax = d.levels, x0 = 70, x1 = Math.min(W - 20, 320), top = 10, bot = H - 14, Y = function (n) { return bot - (n * n) / (nmax * nmax) * (bot - top); };
				c.strokeStyle = dark ? "#b3b0cc" : "#5b5875"; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 - 6, top); c.lineTo(x0 - 6, bot); c.lineTo(x1 + 6, bot); c.lineTo(x1 + 6, top); c.stroke();
				c.font = "11px system-ui,sans-serif";
				for (var n = 1; n <= nmax; n++) {
					var y = Y(n); c.strokeStyle = n === d.from || n === d.to ? "#5b3fd6" : dark ? "#6b6a90" : "#b5b2d6"; c.lineWidth = n === d.from || n === d.to ? 2.4 : 1.2;
					c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
					if (nmax <= 12 && (Y(n - 1) - y > 11 || n === nmax)) { c.fillStyle = dark ? "#e6e4f7" : "#1f1b3a"; c.fillText("n = " + n, 8, y + 4); }
					if (n <= d.filled) { c.fillStyle = "#db2777"; c.beginPath(); c.arc((x0 + x1) / 2 - 8, y, 3.5, 0, 7); c.arc((x0 + x1) / 2 + 8, y, 3.5, 0, 7); c.fill(); }
				}
				if (d.from !== d.to) {
					var rgb = A.wavelengthRGB(d.lam * 1e9), col = rgb ? "rgb(" + rgb.join(",") + ")" : "#f59e0b", ax = x1 - 30, ya = Y(d.from), yb = Y(d.to);
					c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ax, ya); c.lineTo(ax, yb); c.stroke();
					c.beginPath(); var dir = yb < ya ? 1 : -1; c.moveTo(ax, yb); c.lineTo(ax - 5, yb + 8 * dir); c.lineTo(ax + 5, yb + 8 * dir); c.fill();
				}
				if (x1 + 30 < W) { c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.fillText("levels grow as n²", x1 + 16, top + 12); }
			}
		},
		bo: {
			fields: [{ k: "n", t: "int", label: "Level n", min: 1, max: 1000, def: "1" }, { k: "Z", t: "int", label: "Nuclear charge Z", min: 1, max: 118, def: "1" },
				{ k: "nuc", t: "sel", label: "Nucleus mass", opts: NUCS, def: "inf" }],
			calc: function (v, g) {
				var n = g("n").v, Z = g("Z").v, Mm = A.MASS[v.nuc], b = K.bohr(n, Z, Mm);
				var rows = [["Orbit radius rₙ", "<b>" + lenTxt(b.r) + "</b> = " + Q.fmt(b.r / C.a0, 5) + " a₀"], ["Speed vₙ", Q.si(b.v, "m/s", 4) + " = " + Q.fmt(b.beta, 4) + " c"], ["Energy Eₙ", "<b>" + Q.fmt(b.eV, 6) + " eV</b>"], ["Ionization energy", Q.fmt(b.ion, 6) + " eV"], ["Orbit period", Q.si(b.T, "s", 4)], ["Angular momentum", n + "ħ = " + f4(b.L) + " J·s"]];
				var plug = "rₙ = n²a₀/Z = " + n + "² × 52.918 pm ÷ " + Z + (isFinite(Mm) ? " × (1 + mₑ/M)" : "") + " = " + lenTxt(b.r) + ";  Eₙ = −13.6057 eV × " + Z + "² ÷ " + n + "²" + (isFinite(Mm) ? " × μ/mₑ" : "") + " = " + Q.fmt(b.eV, 6) + " eV";
				var say = "Bohr's 1913 model gets the energies of one-electron atoms right" + (b.beta > 0.1 ? ", but here the electron would move at " + (100 * b.beta).toFixed(0) + "% of light speed, so relativity (Dirac's equation) shifts the levels noticeably" : "") + ". The circular orbit itself is not real: quantum mechanically the electron is a cloud, and rₙ is only its typical size (see the Hydrogen atom tab).";
				if (Z > 1 && v.nuc === "H") say += " Note: you picked a hydrogen nucleus mass with Z > 1.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		ry: {
			fields: [{ k: "Z", t: "int", label: "Nuclear charge Z", min: 1, max: 10, def: "1" }, { k: "nuc", t: "sel", label: "Nucleus mass", opts: NUCS, def: "H" },
				{ k: "n1", t: "int", label: "Lower level n₁", min: 1, max: 30, def: "2" }, { k: "n2", t: "int", label: "Upper level n₂", min: 2, max: 60, def: "3" },
				{ k: "air", t: "sel", label: "Wavelengths", opts: [["air", "in air (lab tables)"], ["vac", "in vacuum"]], def: "air" },
				{ k: "find", t: "q", label: "Find the line nearest to", dims: ["length"], units: "length", def: "486 nm" }],
			calc: function (v, g) {
				var Z = g("Z").v, Mm = A.MASS[v.nuc], n1 = g("n1").v, n2 = g("n2").v, air = v.air === "air";
				if (n2 <= n1) throw { k: "n2", m: "the upper level must be above n₁" };
				var lv = K.rydberg(n1, n2, Z, Mm), l = air ? A.toAir(lv) : lv, E = C.h * C.c / lv / C.e;
				var rows = [["Wavelength", "<b>" + lenTxt(l) + "</b> " + swatch(lv) + (air && lv >= 2e-7 ? " (air)" : " (vacuum)")], ["Photon energy", Q.fmt(E, 6) + " eV"], ["Wavenumber", Q.fmt(1 / lv / 100, 7) + " cm⁻¹"], ["Series", A.seriesName(n1) + " · " + A.band(lv)], ["Series limit (n₂ → ∞)", lenTxt(air ? A.toAir(A.seriesLimit(n1, Z, Mm)) : A.seriesLimit(n1, Z, Mm))]];
				var fnd = g("find"), list = K.findLines(fnd.v, Z, Mm, 12, 5, air);
				var tb = '<div class="qm-tablewrap"><table class="qm-table qm-ca-lines"><tr><th>Line</th><th>Series</th><th>λ</th><th>Off by</th></tr>' + list.map(function (x) { return "<tr><td>" + x.n2 + " → " + x.n1 + "</td><td>" + x.series + "</td><td>" + lenTxt(x.lambda) + " " + swatch(x.lambda) + "</td><td>" + (x.off >= 0 ? "+" : "−") + Math.abs(100 * x.off).toFixed(Math.abs(x.off) < 0.001 ? 3 : 2) + "%</td></tr>"; }).join("") + "</table></div>";
				var plug = "1/λ = 10 973 731.568 m⁻¹" + (isFinite(Mm) ? " × μ/mₑ" : "") + " × " + Z + "² × (1/" + n1 + "² − 1/" + n2 + "²) → λ = " + lenTxt(lv) + " (vacuum)";
				return { rows: rows, plug: plug, say: "Nearest hydrogen-like lines to " + lenTxt(fnd.v) + (Z > 1 ? " for Z = " + Z : "") + ":", extra: tb };
			}
		},
		co: {
			fields: [{ k: "val", t: "q", label: "Incoming photon (wavelength or energy)", dims: ["length", "energy"], units: "xray", def: "71.1 pm" },
				{ k: "th", t: "q", label: "Scattering angle θ", dims: ["angle"], units: "angle", def: "90 deg" },
				{ k: "tg", t: "sel", label: "Scattered off", opts: [["e", "a free electron"], ["p", "a proton"]], def: "e" }],
			calc: function (v, g) {
				var x = g("val"), lam = x.dim === "length" ? x.v : C.h * C.c / x.v, th = g("th").v, m = v.tg === "p" ? C.mp : C.me, r = K.compton(lam, th, m);
				var rows = [["Compton wavelength h/mc", lenTxt(r.lc)], ["Shift Δλ", "<b>" + lenTxt(r.dl) + "</b>"], ["Scattered λ′", lenTxt(r.lambda2)], ["Photon energy before → after", eTxt(r.E1) + " → " + eTxt(r.E2)], ["Recoil energy given to the " + (v.tg === "p" ? "proton" : "electron"), eTxt(r.Ke)]];
				var plug = "Δλ = h/(mc)(1 − cos θ) = " + lenTxt(r.lc) + " × (1 − cos " + (th * 180 / Math.PI).toFixed(1) + "°) = " + lenTxt(r.dl);
				var say = "The shift does not depend on the wavelength, only on the angle, so it is easy to see with X-rays (Compton used molybdenum Kα at 71 pm in 1923) and invisible with light: for 500 nm light it is only " + (100 * r.dl / 5e-7).toPrecision(2) + "% of the wavelength. Light bouncing like a billiard ball off an electron is direct evidence that photons carry momentum.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		bb: {
			fields: [{ k: "T", t: "q", label: "Temperature", dims: ["temp"], units: "temp", def: "5772 K" }, { k: "A", t: "q", label: "Surface area", dims: ["area"], units: "area", def: "1 m2" }],
			calc: function (v, g) {
				var T = g("T").v, Ar = g("A").v, r = K.blackbody(T);
				var rows = [["Peak wavelength (Wien)", "<b>" + lenTxt(r.peak) + "</b> " + swatch(r.peak)], ["Peak frequency", Q.si(r.fpeak, "Hz", 4)], ["Radiated per m² (σT⁴)", Q.si(r.flux, "W/m²", 4).replace("W/m²", "W/m²")], ["Radiated by the area", Q.si(r.flux * Ar, "W", 4)], ["Peak is in the", A.band(r.peak)]];
				var plug = "λpeak = 2.898 × 10⁻³ m·K ÷ " + Q.fmt(T, 5) + " K = " + lenTxt(r.peak) + ";  σT⁴ = 5.670 × 10⁻⁸ × " + Q.fmt(T, 5) + "⁴ = " + Q.si(r.flux, "W/m²", 4);
				var say = r.peak < 3.8e-7 ? "Hotter than any star surface: the glow peaks in the ultraviolet and looks blue-white." : r.peak < 7.5e-7 ? "The glow peaks in visible light. Planck explained this curve in 1900 by assuming light energy comes in packets hf: the start of quantum physics." : r.peak < 1e-5 ? "The peak is in the infrared: it glows warm, and only the short-wavelength tail is visible (red-orange) if it is hot enough." : "Far infrared or microwaves: nothing visible at all, but thermal cameras (or radio telescopes, for the CMB) see it.";
				return { rows: rows, plug: plug, say: say, chart: { T: T, peak: r.peak } };
			},
			draw: function (c, W, H, d, dark) {
				var pl = 14, pr = 10, pt = 10, pb = 26, gw = W - pl - pr, gh = H - pt - pb, l0 = d.peak * 0.12, l1 = d.peak * 6, N = 240, mx = K.planck(d.peak, d.T), i;
				var X = function (l) { return pl + (Math.log(l) - Math.log(l0)) / (Math.log(l1) - Math.log(l0)) * gw; };
				for (var nm = 380; nm < 750; nm += 3) { var x = X(nm * 1e-9), x2 = X((nm + 3) * 1e-9); if (x2 < pl || x > W - pr) continue; var rgb = A.wavelengthRGB(nm); c.fillStyle = "rgba(" + rgb.join(",") + ",0.45)"; c.fillRect(Math.max(pl, x), pt, Math.min(x2, W - pr) - Math.max(pl, x) + 0.6, gh); }
				axes(c, W, H, pl, pr, pt, pb, dark);
				var pts = []; for (i = 0; i <= N; i++) { var l = l0 * Math.pow(l1 / l0, i / N); pts.push([X(l), pt + gh - K.planck(l, d.T) / mx * gh * 0.95]); }
				c.beginPath(); c.moveTo(pts[0][0], pt + gh); pts.forEach(function (p) { c.lineTo(p[0], p[1]); }); c.lineTo(pts[N][0], pt + gh); c.closePath(); c.fillStyle = "rgba(91,63,214,0.15)"; c.fill();
				line(c, pts, "#5b3fd6", 2.2);
				c.strokeStyle = "#db2777"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(d.peak), pt); c.lineTo(X(d.peak), pt + gh); c.stroke(); c.setLineDash([]);
				c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.font = "11px system-ui,sans-serif";
				[l0 * 1.4, d.peak, l1 / 1.6].forEach(function (l) { var t = lenTxt(l).replace(/(\.\d)\d+/, "$1"); c.fillText(t, Math.min(X(l) - 14, W - pr - 50), H - 8); });
			}
		},
		th: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "He" },
				{ k: "T", t: "q", label: "Temperature", dims: ["temp"], units: "temp", def: "300 K" },
				{ k: "n", t: "q", label: "Number density n", dims: ["density"], units: "density", def: "2.45e25 /m3" }],
			calc: function (v, g) {
				var p = partOf(v.part), T = g("T").v, n = g("n").v, l = K.thermal(p[2], T), d = Math.pow(n, -1 / 3), D = n * l * l * l;
				var rows = [["Thermal wavelength λth", "<b>" + lenTxt(l) + "</b>"], ["Typical spacing n^(−1/3)", lenTxt(d)], ["Degeneracy n λth³", "<b>" + Q.fmt(D, 3) + "</b>"]];
				var plug = "λth = h / √(2π m kB T) = 6.626 × 10⁻³⁴ ÷ √(2π × " + f4(p[2]) + " × 1.381 × 10⁻²³ × " + Q.fmt(T, 4) + ") = " + lenTxt(l);
				var say = D < 0.01 ? "The waves are much smaller than the gaps between particles, so they behave like tiny classical balls: an ordinary gas." :
					D < 1 ? "Getting close: the waves begin to overlap, and quantum statistics starts to change the gas's behaviour." :
						(p[3] !== 0 && p[0] === "e" ? "The waves overlap strongly: a degenerate Fermi gas. This is why the electrons in a metal fill energy levels up to the Fermi energy and barely care about temperature." :
							"The waves overlap: a quantum gas. For bosons like rubidium-87 a Bose-Einstein condensate forms when nλth³ passes about 2.612.");
				return { rows: rows, plug: plug, say: say };
			}
		}
	};

	/* ---------- tiny chart helpers ---------- */
	function axes(c, W, H, pl, pr, pt, pb, dark) { c.strokeStyle = dark ? "#6b6a90" : "#b5b2d6"; c.lineWidth = 1; c.beginPath(); c.moveTo(pl, pt); c.lineTo(pl, H - pb); c.lineTo(W - pr, H - pb); c.stroke(); }
	function line(c, pts, col, w, dash) { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); var st0 = false; pts.forEach(function (p) { if (!isFinite(p[1])) { st0 = false; return; } if (st0) c.lineTo(p[0], p[1]); else { c.moveTo(p[0], p[1]); st0 = true; } }); c.stroke(); c.setLineDash([]); }
	function legend(c, x, y, items, dark) { c.font = "11px system-ui,sans-serif"; items.forEach(function (it, i) { if (!it[1]) return; var tw = c.measureText(it[1]).width; c.fillStyle = it[0]; c.fillRect(x - tw - 22, y + i * 15 - 4, 14, 3); c.fillStyle = dark ? "#e6e4f7" : "#1f1b3a"; c.fillText(it[1], x - tw, y + i * 15); }); }

	/* ---------- generic card engine ---------- */
	function val(f, v) { return typeof f === "function" ? f(v) : f; }
	function build(id) {
		var el = document.getElementById("qm-ca-" + id), D = DEF[id], box = $(".qm-ca-fields", el), vals = Object.assign({}, st.v[id] || {});
		D.fields.forEach(function (f) { if (vals[f.k] == null) vals[f.k] = f.def; });
		var card = cards[id] = { el: el, D: D, vals: vals, box: box, out: $(".qm-ca-out", el), cv: $(".qm-ca-cv", el), last: null };
		box.innerHTML = '<div class="qm-grid qm-ca-g">' + D.fields.map(function (f) {
			var iid = "qm-ca-" + id + "-" + f.k, h = '<div class="tu-field" data-f="' + f.k + '"><label class="tu-label" for="' + iid + '"></label>';
			if (f.t === "sel") h += '<select id="' + iid + '" data-k="' + f.k + '"></select>';
			else if (f.t === "int") h += '<input id="' + iid + '" data-k="' + f.k + '" type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" step="1">';
			else h += '<div class="qm-ca-in"><input id="' + iid + '" data-k="' + f.k + '" type="text" inputmode="text" autocomplete="off" spellcheck="false"><select data-u="' + f.k + '" aria-label="Unit"></select></div>';
			return h + '<small class="qm-ca-rd" data-r="' + f.k + '"></small></div>';
		}).join("") + "</div>" + '<div class="qm-row"><button type="button" class="tu-btn qm-ca-link">Copy link to this card</button><button type="button" class="tu-btn qm-ca-reset">Reset</button></div>';
		D.fields.forEach(function (f) {
			var inp = $('[data-k="' + f.k + '"]', box);
			if (f.t === "sel") inp.innerHTML = val(f.opts, vals).map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");
			inp.value = vals[f.k];
			if (f.t === "sel" && inp.value !== vals[f.k]) { inp.value = f.def; vals[f.k] = f.def; }
		});
		box.addEventListener("input", function (e) { var k = e.target.dataset.k; if (!k) return; vals[k] = e.target.value; if (D.fields.some(function (f) { return f.k === k && f.t === "sel"; })) refreshDyn(id); run(id, true); });
		box.addEventListener("change", function (e) {
			var u = e.target.dataset.u; if (!u) return;
			/* picking a unit rewrites the number in that unit */
			var f = fieldOf(D, u), inp = $('[data-k="' + u + '"]', box), dims = val(f.dims, vals), p = K.parse(inp.value, dims, e.target.dataset.prev);
			var unit = e.target.value, dim = dimOfUnit(unit, dims);
			if (!p.err && dim === p.dim && dim !== "temp") { var fac = K.UNITS[dim][unit]; inp.value = +(p.v / fac).toPrecision(6) + " " + unit; }
			else if (!p.err && dim === "temp") { var Tk = p.v, tv = unit === "K" ? Tk : unit === "°C" ? Tk - 273.15 : (Tk - 273.15) * 9 / 5 + 32; inp.value = +tv.toPrecision(6) + " " + unit; }
			else { var num = (inp.value.match(/^[-+]?[\d.]+(e[-+]?\d+)?/i) || ["1"])[0]; inp.value = num + " " + unit; }
			e.target.dataset.prev = unit; vals[u] = inp.value; run(id, true);
		});
		$(".qm-ca-link", el).addEventListener("click", function () {
			var o = { ca: id }; Object.keys(cards).forEach(function (c) { DEF[c].fields.forEach(function (f) { o["ca_" + c + "_" + f.k] = null; }); });
			D.fields.forEach(function (f) { if (String(vals[f.k]) !== String(f.def)) o["ca_" + id + "_" + f.k] = vals[f.k]; });
			api.setQuery(o); api.copy(location.href, "Link to this calculator copied");
		});
		$(".qm-ca-reset", el).addEventListener("click", function () { D.fields.forEach(function (f) { vals[f.k] = f.def; }); setVals(id, vals); });
		var pre = $(".qm-ca-pre", el);
		if (pre) pre.addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (!b) return; var o = JSON.parse(b.dataset.p); Object.keys(o).forEach(function (k) { vals[k] = o[k]; }); setVals(id, vals); Array.prototype.forEach.call(pre.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
		refreshDyn(id);
	}
	function setVals(id, vals) { var c = cards[id]; c.D.fields.forEach(function (f) { var inp = $('[data-k="' + f.k + '"]', c.box); if (f.t === "sel") refreshDyn(id); inp.value = vals[f.k]; }); refreshDyn(id); run(id, true); }
	function fieldOf(D, k) { for (var i = 0; i < D.fields.length; i++) if (D.fields[i].k === k) return D.fields[i]; }
	function dimOfUnit(u, dims) { for (var i = 0; i < dims.length; i++) if (K.UNITS[dims[i]] && K.UNITS[dims[i]][u] != null) return dims[i]; return null; }
	function refreshDyn(id) {
		var c = cards[id], vals = c.vals;
		c.D.fields.forEach(function (f) {
			var wrapF = $('[data-f="' + f.k + '"]', c.box); wrapF.hidden = f.show ? !f.show(vals) : false;
			$("label", wrapF).textContent = val(f.label, vals);
			var us = $('[data-u="' + f.k + '"]', c.box);
			if (us) { var list = UNITS[val(f.units, vals)] || [], key = list.join("|"); if (us.dataset.key !== key) { us.innerHTML = list.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u === "m2" ? "m²" : u === "cm2" ? "cm²" : u === "mm2" ? "mm²" : u === "/m3" ? "per m³" : u === "/cm3" ? "per cm³" : u === "cm-1" ? "cm⁻¹" : u) + "</option>"; }).join(""); us.dataset.key = key; us.value = list[0]; us.dataset.prev = list[0]; } }
		});
	}
	function run(id, save) {
		var c = cards[id], vals = c.vals, errs = {};
		c.D.fields.forEach(function (f) { var r = $('[data-r="' + f.k + '"]', c.box); if (r) { r.textContent = ""; r.classList.remove("qm-ca-bad"); } });
		var g = function (k) {
			var f = fieldOf(c.D, k), raw = vals[k];
			if (f.t === "int") { var n = parseInt(raw, 10); if (!isFinite(n) || n < f.min || n > f.max) throw { k: k, m: "whole number from " + f.min + " to " + f.max }; return { v: n }; }
			var dims = val(f.dims, vals), us = $('[data-u="' + k + '"]', c.box), p = K.parse(raw, dims, us && us.dataset.prev);
			if (p.err) throw { k: k, m: p.err };
			if (p.dim === "angle" ? p.v < 0 : !(p.v > 0)) throw { k: k, m: "must be above zero" };
			if (us && p.unit && us.value !== p.unit && K.UNITS[p.dim] && (UNITS[val(f.units, vals)] || []).indexOf(p.unit) >= 0) { us.value = p.unit; us.dataset.prev = p.unit; }
			var r = $('[data-r="' + k + '"]', c.box);
			if (r && p.dim !== "count") r.textContent = "= " + readSI(p);
			return p;
		};
		var res;
		try { res = c.D.calc(vals, g); }
		catch (e) {
			if (e && e.k) { var r = $('[data-r="' + e.k + '"]', c.box); if (r) { r.textContent = e.m; r.classList.add("qm-ca-bad"); } c.out.classList.add("qm-ca-stale"); return; }
			console.error(e); return;
		}
		c.out.classList.remove("qm-ca-stale");
		c.out.innerHTML = '<div class="qm-ca-res">' + res.rows.map(function (r) { return '<div class="qm-ca-ro"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("") + "</div>" +
			'<p class="qm-ca-plug"><span>Plugged in:</span> ' + esc(res.plug) + "</p>" + '<p class="qm-ca-say">' + esc(res.say) + "</p>" + (res.extra || "");
		c.last = res;
		if (c.cv && res.chart) drawChart(id);
		if (save) { st.v[id] = Object.assign({}, vals); api.save(); }
	}
	function readSI(p) {
		var u = { length: "m", energy: "J", freq: "Hz", wavenumber: "m⁻¹", mass: "kg", speed: "m/s", time: "s", voltage: "V", angle: "rad", area: "m²", density: "m⁻³", temp: "K" }[p.dim] || "";
		if (p.dim === "energy") return Q.fmt(p.v, 4) + " J = " + Q.fmt(p.v / C.e, 4) + " eV";
		if (p.dim === "angle") return (p.v * 180 / Math.PI).toFixed(2) + "°";
		if (p.dim === "temp") return Q.fmt(p.v, 5) + " K";
		return Q.fmt(p.v, 4) + " " + u;
	}
	function drawChart(id) {
		var c = cards[id], cv = c.cv; if (!cv || !c.last || !c.last.chart || !cv.offsetParent) return;
		var dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.parentNode.clientWidth, H = cv.parentNode.clientHeight || 170;
		cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
		var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
		c.D.draw(ctx, W, H, c.last.chart, api.dark());
	}
	function redrawAll() { Object.keys(cards).forEach(drawChart); }

	Q.reg("calc", {
		init: function (panel, a) {
			api = a; P = panel; st = a.st; K = Q.calc; A = Q.atom; C = Q.C;
			st.v = st.v || {};
			/* link parameters ca_<card>_<field> override saved values */
			a.query.forEach(function (v2, k) { var m = /^ca_([a-z]+)_([A-Za-z0-9]+)$/.exec(k); if (m && DEF[m[1]]) { st.v[m[1]] = st.v[m[1]] || {}; st.v[m[1]][m[2]] = v2; } });
			Object.keys(DEF).forEach(build);
			Object.keys(DEF).forEach(function (id) { run(id, false); });
			$("#qm-ca-jump", P).addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; var t = document.getElementById("qm-ca-" + b.dataset.c); if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); var i = t.querySelector("input,select"); if (i) setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (x) {} }, 400); } });
			var want = a.query.get("ca");
			if (want && DEF[want]) setTimeout(function () { var t = document.getElementById("qm-ca-" + want); if (t) t.scrollIntoView({ block: "start" }); }, 300);
			window.addEventListener("resize", function () { if (on) redrawAll(); });
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) redrawAll(); }).observe(P);
			a.onTheme(function () { if (on) redrawAll(); });
			window.MESQuantumDebug_calc = { cards: cards, set: function (id, k, v2) { cards[id].vals[k] = v2; setVals(id, cards[id].vals); return cards[id].last; }, result: function (id) { return cards[id].last; } };
		},
		show: function () { on = true; setTimeout(redrawAll, 0); },
		hide: function () { on = false; }
	});
})();
