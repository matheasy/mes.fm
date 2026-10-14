/* MES Grounding & Ground Rod Simulator -- UI (maths in lib.js, global MESGnd). State: localStorage "mes-grounding-rod-simulator:v1"; links ?tab=&rho=&L=&d=&n=&s=&t= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gr"); if (!root) return;
	var G = window.MESGnd, KEY = "mes-grounding-rod-simulator:v1", FT = 0.3048;
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function num(s) { s = String(s).trim().replace(/\s/g, ""); if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); else s = s.replace(",", "."); var x = Number(s); return isFinite(x) && s !== "" ? x : NaN; }
	function sig(x, n) { if (x === 0) return "0"; var a = Math.abs(x); n = n || 3; if (a >= 1e5 || a < 1e-2) { var e = x.toExponential(n - 1).split("e"); return e[0] + " × 10" + sup(+e[1]); } return Number(x.toPrecision(n)).toLocaleString(undefined, { maximumFractionDigits: 6 }); }
	function sup(n) { var m = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function si(x, u, n) { var a = Math.abs(x); if (!isFinite(x)) return "–"; var P = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]]; for (var i = 0; i < P.length; i++) if (a >= P[i][0] * 0.9995 || i === P.length - 1) return sig(x / P[i][0], n || 3) + " " + P[i][1] + u; return sig(x, n) + " " + u; }
	function dur(t) { if (!isFinite(t)) return "never"; if (t < 1e-3) return si(t, "s"); if (t < 60) return sig(t, 3) + " s"; if (t < 3600) return sig(t / 60, 3) + " min"; if (t < 86400) return sig(t / 3600, 3) + " h"; if (t < 3.15e7) return sig(t / 86400, 3) + " days"; return sig(t / 3.15e7, 3) + " years"; }

	var q = new URLSearchParams(location.search), saved = sget(), fromLink = q.has("rho") || q.has("L") || q.has("n");
	function pick(k, ok, d) { var v = q.has(k) ? q.get(k) : (!fromLink ? saved[k] : null); return v != null && v !== "" && ok(v) ? v : d; }
	var S = {
		tab: q.get("tab") && /^(rod|fault|light|static|rules)$/.test(q.get("tab")) ? q.get("tab") : (saved.tab || "rod"),
		soil: pick("soil", function (v) { return G.SOILS.some(function (s) { return s.id === v; }); }, "loam"),
		rho: pick("rho", function (v) { return num(v) > 0; }, "100"), L: pick("L", function (v) { return num(v) > 0; }, "2.4"), lu: pick("lu", function (v) { return v === "m" || v === "ft"; }, "m"),
		d: pick("d", function (v) { return G.DIAS.some(function (s) { return s.id === v; }); }, "d58"), n: pick("n", function (v) { return num(v) >= 1; }, "1"),
		sp: pick("s", function (v) { return num(v) > 0; }, "2.4"), su: "m", t: pick("t", function (v) { return num(v) > 0; }, "25"),
		reg: saved.reg || "us"
	};
	/* ---- regions (summaries; hedged on the page) ---- */
	var REG = [
		{ id: "us", name: "United States (NEC / NFPA 70)", sys: "Neutral and ground are tied together at the main panel only. A grounding electrode system is required; all electrodes present must be bonded together.", items: [
			["Rod size", "A rod electrode is at least 8 ft (2.44 m) long, in contact with the soil for its whole length, and at least 5/8 in (15.9 mm) steel, or 1/2 in (12.7 mm) if listed (NEC 250.52, 250.53)."],
			["One rod or two", "A single rod, pipe or plate must be supplemented by another electrode unless it is shown to measure 25 Ω or less. In practice two rods are usually installed and no resistance test is made (NEC 250.53(A)(2))."],
			["Spacing", "Rods used to meet the requirement are at least 6 ft (1.8 m) apart (NEC 250.53)."],
			["Other electrodes", "A concrete-encased electrode (Ufer: 20 ft of ½ in rebar or #4 bare copper in the footing) and metal water pipe in contact with earth for 10 ft or more must be used when present, and bonded to the rods."],
			["Ground wire", "If a rod is the only electrode, the wire to it need not be larger than #6 copper (NEC 250.66(A))."],
			["Other safety rules", "GFCI protection in kitchens, bathrooms, garages, outdoors, basements and more (210.8); AFCI in living areas; a surge-protective device at the service for dwellings (230.67, since 2020); an intersystem bonding termination for cable/phone/antenna (250.94)."]] },
		{ id: "ca", name: "Canada (CSA C22.1, CEC)", sys: "Neutral bonded to ground at the service. Section 10 covers grounding and bonding.", items: [
			["Rods", "Where rods are the electrode, the code calls for two rods about 3 m (10 ft) long driven full length, spaced at least 3 m apart and bonded together (Rule 10-700/10-702; older editions said 2 m spacing, and provinces amend it)."],
			["Resistance", "No resistance test is normally required for dwellings."],
			["Other electrodes", "A plate, a concrete-encased electrode or the metal water pipe may be used or added where the code allows."],
			["Other safety rules", "GFCIs for bathrooms, outdoors, garages and kitchens counters; AFCIs in bedrooms; surge protection is a utility/provincial matter. Electrical work needs a permit and inspection."]] },
		{ id: "uk", name: "United Kingdom (BS 7671, IET Wiring Regulations)", sys: "Most homes are TN-C-S (PME): the supplier gives you an earth terminal, so no rod is normally needed. In places with no supplier earth (some rural supplies) it is a TT system and your own earth electrode is the only earth.", items: [
			["TT rule", "R<sub>A</sub> × I<sub>Δn</sub> ≤ 50 V (Regulation 411.5.3). With a 30 mA RCD the limit is 1,667 Ω; designers aim under about 200 Ω because the soil dries out and the reading drifts."],
			["Testing", "The electrode resistance must be measured to verify a TT system (643.7.2), by fall-of-potential or a loop-impedance test."],
			["Bonding", "Main protective bonding connects incoming metal gas and water pipes to the main earthing terminal."],
			["RCDs", "30 mA RCD protection is required for sockets that could supply outdoor equipment and, since the 17th/18th editions, most socket circuits in homes."],
			["PME warning", "A rod is not added to a PME supply to 'improve' it without the supplier's agreement."]] },
		{ id: "au", name: "Australia and New Zealand (AS/NZS 3000)", sys: "MEN (Multiple Earthed Neutral): the neutral is earthed at the street and at your switchboard, with the main earth conductor to an earth electrode.", items: [
			["Electrode", "A driven vertical earth electrode must go in at least 1.2 m (cl. 5.3.6), with a main earthing conductor sized to Table 5.1; it must be protected against damage."],
			["Role", "Fault clearing relies on the metal MEN return path, not on the electrode's resistance."],
			["RCDs", "30 mA RCDs are required on final sub-circuits in homes."],
			["Lightning protection", "A lightning protection system has its own standard (AS/NZS 1768), with a stated electrode resistance goal; it is bonded to the installation earth."]] },
		{ id: "eu", name: "Europe (IEC 60364, e.g. Germany)", sys: "TN-S, TN-C-S or TT depending on the country; rules are written in national standards based on IEC 60364.", items: [
			["Germany", "New buildings usually have a foundation earth electrode (Fundamenterder, DIN 18014) cast into the footing, with the main earthing bar and equipotential bonding of pipes."],
			["TT systems", "R<sub>A</sub> × I<sub>Δn</sub> ≤ 50 V (IEC 60364-4-41), as in the UK."],
			["RCDs", "30 mA RCDs protect socket circuits in homes (rules vary, usually sockets up to 20 A)."],
			["Surge protection", "Required in many countries by IEC 60364-4-44 / 5-53 depending on the building and risk."]] },
		{ id: "vn", name: "Vietnam (TCVN 7447, IEC-based)", sys: "TCVN 7447 follows IEC 60364 (TT / TN systems); household supplies are commonly TT or TN-C-S depending on the provider.", items: [
			["Standards", "TCVN 7447-4-41 (protection against shock) and 7447-5-54 (earthing arrangements) are the IEC 60364 equivalents; the TT rule R<sub>A</sub> × I<sub>Δn</sub> ≤ 50 V applies."],
			["Rule of thumb", "Retail advice often says to aim for a dedicated earth of about 4 Ω or less. I could not verify this as a legal limit from the standards, so treat it as a common good-practice target."],
			["Practice", "Use a leakage breaker (ELCB/RCD, 30 mA) on home circuits, a proper earth wire to sockets and a measured earth resistance from a licensed electrician."]] },
		{ id: "iec", name: "Anywhere else (general principles)", sys: "Most countries follow IEC 60364. Ask your electrician which system you have (TN-S, TN-C-S or TT).", items: [
			["Always", "Bond all incoming metal services to one main earthing terminal; keep one earth system; use an RCD/GFCI of 30 mA (or 5 mA in North America) on socket circuits."],
			["TT supply", "Check R<sub>A</sub> × I<sub>Δn</sub> ≤ 50 V and measure the electrode, because it is your only earth."],
			["Lightning", "Add a surge protector at the panel; bond any lightning protection system to the electrical earth."]] }
	];

	/* ---- setup ---- */
	$("gr-soil").innerHTML = G.SOILS.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name + " (" + s.range + " Ω·m)") + "</option>"; }).join("");
	$("gr-dia").innerHTML = G.DIAS.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("");
	$("gr-curve").innerHTML = Object.keys(G.CURVES).map(function (k) { return '<option value="' + k + '">' + esc(G.CURVES[k].name) + "</option>"; }).join("");
	$("gr-reg").innerHTML = REG.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");
	var SOBJ = [["A person after walking on carpet", 150, 15000], ["A person touching a doorknob in dry winter air", 150, 5000], ["A plastic jug being filled with fuel", 100, 10000], ["Grain dust on a conveyor belt", 500, 30000], ["Custom (type your own)", 150, 10000]];
	var SPATH = [["Bare finger to a metal doorknob (1 kΩ)", 1e3], ["Wrist strap (1 MΩ)", 1e6], ["Anti-static floor and shoes (100 MΩ)", 1e8], ["Ordinary carpet and shoes (10 GΩ)", 1e10], ["Rubber soles on a dry floor (1 TΩ)", 1e12], ["Good insulator, plastic on plastic (100 TΩ)", 1e14]];
	var MIE = [["Hydrogen / air", 0.017], ["Gasoline vapour", 0.24], ["Propane or methane", 0.28], ["Flour, sugar or grain dust cloud", 30], ["Fine sulphur or coal dust", 15]];
	$("gr-sobj").innerHTML = SOBJ.map(function (o, i) { return '<option value="' + i + '">' + esc(o[0]) + "</option>"; }).join("");
	$("gr-sR").innerHTML = SPATH.map(function (o, i) { return '<option value="' + i + '"' + (i === 3 ? " selected" : "") + ">" + esc(o[0]) + "</option>"; }).join("");
	$("gr-sC").value = SOBJ[0][1]; $("gr-sV").value = SOBJ[0][2]; $("gr-reg").value = S.reg;

	function lenM() { var x = num($("gr-len").value); return x * ($("gr-lu").value === "ft" ? FT : 1); }
	function spM() { var x = num($("gr-spv").value); return x * ($("gr-su").value === "ft" ? FT : 1); }
	function write() { $("gr-soil").value = S.soil; $("gr-rho").value = S.rho; $("gr-len").value = S.L; $("gr-lu").value = S.lu; $("gr-dia").value = S.d; $("gr-n").value = S.n; $("gr-spv").value = S.sp; $("gr-su").value = S.su; $("gr-target").value = S.t; }
	function read() { S.soil = $("gr-soil").value; S.rho = $("gr-rho").value; S.L = $("gr-len").value; S.lu = $("gr-lu").value; S.d = $("gr-dia").value; S.n = $("gr-n").value; S.sp = $("gr-spv").value; S.su = $("gr-su").value; S.t = $("gr-target").value; S.reg = $("gr-reg").value; }
	function geom() { var dm = G.DIAS.filter(function (x) { return x.id === S.d; })[0].m; return { rho: num(S.rho), L: lenM(), d: dm, n: Math.max(1, Math.min(12, Math.round(num(S.n)))), s: spM(), t: num(S.t) }; }
	function ok(g) { return g.rho > 0 && g.L > 0.2 && g.s > 0 && g.n >= 1; }
	function rodTxt(g, R) { return g.n + " rod" + (g.n > 1 ? "s" : "") + ", " + sig(g.L, 3) + " m long, soil " + sig(g.rho, 3) + " Ω·m = " + sig(R, 3) + " Ω"; }

	var LASTF = null, LASTP = null, LASTL = null, LASTR = null, LASTG = null;
	/* ---- tab 1 ---- */
	function rodTab() {
		var g = geom(); if (!ok(g)) { $("gr-R").textContent = "–"; return; }
		var R = G.groupR(g.n, g.rho, g.L, g.d, g.s), R1 = G.rodR(g.rho, g.L, g.d);
		$("gr-R").textContent = sig(R, 3) + " Ω"; $("gr-Rs").innerHTML = g.n + " rod" + (g.n > 1 ? "s" : "") + " " + sig(g.s, 2) + " m apart" + (g.t ? (R <= g.t ? ' · <span class="gr-ok">meets ' + g.t + " Ω</span>" : ' · <span class="gr-no">above ' + g.t + " Ω</span>") : "");
		$("gr-R1").textContent = sig(R1, 3) + " Ω"; $("gr-R1s").textContent = g.n > 1 ? "adding rods gives " + sig(100 * (1 - R / R1), 2) + "% less" : "one rod, " + sig(g.L, 2) + " m";
		var need = g.t > 0 ? G.rodsNeeded(g.t, g.rho, g.L, g.d, g.s, 30) : null;
		$("gr-need").textContent = need ? String(need) : (g.t > 0 ? "30+" : "–"); $("gr-needs").textContent = need ? "at " + sig(g.s, 2) + " m spacing, " + sig(g.L, 2) + " m rods" : "this soil is hard: try longer rods, a deeper electrode, a ground ring or soil treatment";
		var Ls = [1.2, 2.4, 3, 4.8, 6], ns = [1, 2, 3, 4, 6], h = "<thead><tr><th>Rod length</th>" + ns.map(function (n) { return "<th>" + n + " rod" + (n > 1 ? "s" : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
		Ls.forEach(function (L) { h += "<tr><td>" + sig(L, 2) + " m (" + sig(L / FT, 2) + " ft)</td>" + ns.map(function (n) { var r = G.groupR(n, g.rho, L, g.d, Math.max(g.s, L)); return '<td class="' + (g.t && r <= g.t ? "gr-ok" : "") + '">' + sig(r, 3) + " Ω</td>"; }).join("") + "</tr>"; });
		$("gr-grid").innerHTML = h + "</tbody>"; $("gr-gridn").textContent = "Rods are spaced at least one rod-length apart here, so they don't crowd each other. Green meets your " + (g.t || "–") + " Ω target. Doubling the length roughly halves the resistance; doubling the number of rods helps less than that because their patches of soil overlap.";
		$("gr-rodused").textContent = rodTxt(g, R); $("gr-rodused2").textContent = rodTxt(g, R); LASTR = R; LASTG = g;
	}
	/* ---- tab 2 ---- */
	function faultTab() {
		var g = geom(); if (!ok(g)) return; var R = G.groupR(g.n, g.rho, g.L, g.d, g.s);
		var p = { V: +$("gr-v").value, In: num($("gr-in").value), curve: $("gr-curve").value, Rline: num($("gr-rline").value), Regc: num($("gr-regc").value), Rsrc: num($("gr-rsrc").value), Rsrcg: num($("gr-rsg").value), Rfloor: +$("gr-rfl").value, Rrod: R };
		if (!(p.In > 0) || !(p.Rline >= 0) || !(p.Regc >= 0) || !(p.Rsrc >= 0) || !(p.Rsrcg >= 0)) return;
		var f = G.faultCases(p); LASTF = f; LASTP = p; var h = "<thead><tr><th>If a hot wire touches a metal case…</th><th>Fault current</th><th>Does the breaker trip?</th><th>Case voltage</th><th>Current through you</th></tr></thead><tbody>";
		f.forEach(function (c) { var e = G.bodyEffect(c.Ibody); h += "<tr><td>" + esc(c.name) + "</td><td>" + si(c.I, "A", 3) + " (" + (c.I / p.In < 0.01 ? "under 0.01" : sig(c.I / p.In, 3)) + " × rating)</td><td>" + (c.trip.trips ? '<span class="gr-ok">Yes</span> ' + esc(c.trip.note) : '<span class="gr-no">No</span>: the case stays live') + "</td><td>" + si(c.Vcase, "V", 3) + '</td><td>' + si(c.Ibody / 1000, "A", 2) + (c.trip.trips && c.trip.t < 5 ? " for about " + dur(c.trip.t) : "") + ' <span class="gr-risk gr-r' + e.k + '">' + esc(e.t) + "</span></td></tr>"; });
		$("gr-faults").innerHTML = h + "</tbody>"; $("gr-nogcurrent").textContent = si(f[2].Ibody / 1000, "A", 2);
		var t = "<thead><tr><th>RCD rating I<sub>Δn</sub></th><th>Max electrode resistance (50 V)</th><th>Your rod</th></tr></thead><tbody>";
		[[10, "10 mA"], [30, "30 mA"], [100, "100 mA"], [300, "300 mA"], [500, "500 mA"]].forEach(function (r) { var mx = G.ttMaxRA(r[0]); t += "<tr><td>" + r[1] + "</td><td>" + sig(mx, 3) + " Ω</td><td>" + (R <= mx ? '<span class="gr-ok">OK</span>' : '<span class="gr-no">too high</span>') + "</td></tr>"; });
		$("gr-tt").innerHTML = t + "</tbody>"; $("gr-ttn").textContent = "Your rod measures about " + sig(R, 3) + " Ω. The rod's resistance plus the earth wire is what counts; in a TT system the fault current is tiny (120 V over 25 Ω ≈ 5 A), which is why an RCD, not the breaker, does the protecting.";
	}
	/* ---- tab 3 ---- */
	var cv = $("gr-cv"), cx = cv.getContext("2d");
	function lightTab() {
		var g = geom(); if (!ok(g)) return; var R = G.groupR(g.n, g.rho, g.L, g.d, g.s), I = +$("gr-ipk").value * 1000, r = num($("gr-dist").value), st = num($("gr-stride").value), d2 = num($("gr-d2").value);
		if (!(r > 0) || !(st > 0) || !(d2 > 0)) return;
		var gp = G.gpr(I, R), sv = G.stepV(g.rho, I, r, st), bt = G.betweenRods(g.rho, I, R, d2), r0 = G.hemiRadius(g.rho, R);
		$("gr-gpr").textContent = si(gp, "V", 3); $("gr-gprs").textContent = "I × R = " + si(I, "A", 2) + " × " + sig(R, 3) + " Ω (the whole rod system floats this high above far-away ground)";
		$("gr-step").textContent = si(sv, "V", 3); $("gr-steps").textContent = "across a " + sig(st, 2) + " m stride at " + sig(r, 3) + " m: " + (sv > 1000 ? "lethal if current crosses your chest" : sv > 50 ? "dangerous" : "low");
		$("gr-btw").textContent = si(bt.between, "V", 3); $("gr-btws").textContent = "between this rod and one " + sig(d2, 3) + " m away that is not bonded to it: an arc waiting to happen. Bond them.";
		LASTL = { gp: gp, sv: sv, bt: bt, I: I, R: R, r: r, d2: d2, st: st };
		drawLight(g, I, R, r, r0, st);
	}
	function drawLight(g, I, R, r, r0, st) {
		var W = cv.width, H = cv.height, dk = document.body.classList.contains("dark-mode"), fg = dk ? "#e6e8ec" : "#223", gr = dk ? "#3a3f48" : "#dde2e8", L = 84, B = 48, T = 14, Rr = 12, x0 = Math.log10(0.3), x1 = Math.log10(200);
		var vmax = Math.max(1e5, Math.pow(10, Math.ceil(Math.log10(G.lightningV(g.rho, I, Math.max(0.3, r0)) * 1.2)))), y0 = 1, y1 = Math.log10(vmax);
		cx.clearRect(0, 0, W, H); cx.fillStyle = dk ? "#161616" : "#fff"; cx.fillRect(0, 0, W, H);
		function X(m) { return L + (Math.log10(m) - x0) / (x1 - x0) * (W - L - Rr); } function Y(v) { return H - B - (Math.log10(Math.max(v, 1)) - y0) / (y1 - y0) * (H - B - T); }
		cx.font = "17px system-ui,sans-serif"; cx.strokeStyle = gr; cx.fillStyle = fg; cx.lineWidth = 1;
		[0.3, 1, 3, 10, 30, 100].forEach(function (m) { cx.beginPath(); cx.moveTo(X(m), T); cx.lineTo(X(m), H - B); cx.stroke(); cx.textAlign = "center"; cx.fillText(m + " m", X(m), H - B + 20); });
		for (var e = 1; e <= y1; e++) { var v = Math.pow(10, e); cx.beginPath(); cx.moveTo(L, Y(v)); cx.lineTo(W - Rr, Y(v)); cx.stroke(); cx.textAlign = "right"; cx.fillText(si(v, "V", 1), L - 6, Y(v) + 4); }
		cx.setLineDash([6, 4]); cx.strokeStyle = "#c46a00"; [[50, "50 V"], [1000, "1 kV"]].forEach(function (h) { if (Math.log10(h[0]) <= y1) { cx.beginPath(); cx.moveTo(L, Y(h[0])); cx.lineTo(W - Rr, Y(h[0])); cx.stroke(); cx.fillStyle = "#c46a00"; cx.textAlign = "left"; cx.fillText(h[1], L + 6, Y(h[0]) - 4); } }); cx.setLineDash([]);
		cx.strokeStyle = "#c2410c"; cx.lineWidth = 3; cx.beginPath(); var first = true, rs = Math.max(0.3, r0); for (var i = 0; i <= 200; i++) { var m = rs * Math.pow(200 / rs, i / 200), vv = Math.min(G.lightningV(g.rho, I, m), I * R); if (first) { cx.moveTo(X(m), Y(vv)); first = false; } else cx.lineTo(X(m), Y(vv)); } cx.stroke();
		var a = Math.min(Math.max(r, rs), 200), b = Math.min(a + st, 200); cx.fillStyle = "rgba(220,38,38,0.25)"; cx.fillRect(X(a), T, Math.max(2, X(b) - X(a)), H - B - T);
		var va = Math.min(G.lightningV(g.rho, I, Math.max(r, rs)), I * R); cx.fillStyle = "#dc2626"; cx.beginPath(); cx.arc(X(Math.max(r, rs)), Y(va), 6, 0, 7); cx.fill(); cx.fillStyle = fg; cx.textAlign = "left"; cx.fillText("you: " + si(va, "V", 2), Math.min(X(Math.max(r, rs)) + 10, W - 130), Math.max(Y(va) - 10, T + 12));
		cx.textAlign = "center"; cx.fillStyle = fg; cx.fillText("distance from the strike point (m)", (L + W - Rr) / 2, H - 6);
	}
	/* ---- tab 4 ---- */
	function staticTab() {
		var C = num($("gr-sC").value) * 1e-12, V = num($("gr-sV").value), Rp = SPATH[+$("gr-sR").value][1]; if (!(C > 0) || !(V > 0)) return;
		var E = G.staticE(C, V), tau = G.staticTau(Rp, C), t100 = G.staticDecay(Rp, C, V, 100);
		$("gr-sE").textContent = si(E, "J", 3); $("gr-sEs").textContent = "½ C V² = " + sig(E * 1000, 3) + " millijoules" + (E < 1e-4 ? ": you feel it only above ~1 to 3 kV" : "");
		$("gr-sT").textContent = dur(tau); $("gr-sTs").textContent = "τ = R × C = " + si(Rp, "Ω", 2) + " × " + si(C, "F", 2);
		$("gr-s100").textContent = dur(t100); $("gr-s100s").textContent = V <= 100 ? "already under 100 V" : "τ × ln(" + sig(V, 3) + " V ÷ 100 V)";
		var h = "<thead><tr><th>Atmosphere</th><th>Minimum spark energy</th><th>Your spark</th></tr></thead><tbody>"; MIE.forEach(function (m) { var can = E * 1000 >= m[1]; h += "<tr><td>" + esc(m[0]) + "</td><td>" + sig(m[1], 2) + " mJ</td><td>" + (can ? '<span class="gr-no">can ignite</span>' : '<span class="gr-ok">too weak</span>') + "</td></tr>"; });
		$("gr-mie").innerHTML = h + "</tbody>";
	}
	/* ---- tab 5 ---- */
	function rulesTab() {
		var r = REG.filter(function (x) { return x.id === S.reg; })[0] || REG[0];
		$("gr-rules").innerHTML = '<h2 class="gr-h">' + esc(r.name) + '</h2><p><strong>System:</strong> ' + r.sys + '</p><dl class="gr-reg">' + r.items.map(function (i) { return "<dt>" + i[0] + "</dt><dd>" + i[1] + "</dd>"; }).join("") + "</dl>";
	}


	/* ---- the house picture ---- */
	var SC = { normal: 1, egc: 1, rod: 1, none: 1, light: 1 }, TABSC = { rod: "normal", fault: "egc", light: "light", static: "normal", rules: "normal" };
	function diagram() {
		var sc = S.sc || "normal", svg = $("gr-svg"), g = LASTG, R = LASTR; if (!g || R == null) return;
		Array.prototype.forEach.call(svg.querySelectorAll("[data-show]"), function (el) { el.classList.toggle("on", el.getAttribute("data-show").split(" ").indexOf(sc) >= 0); });
		Array.prototype.forEach.call($("gr-sc").children, function (b) { b.classList.toggle("is-on", b.dataset.sc === sc); b.setAttribute("aria-pressed", b.dataset.sc === sc ? "true" : "false"); });
		var n = Math.min(g.n, 3), h = "";
		for (var i = 0; i < n; i++) { var x = 494 + i * 46; h += (i ? '<line x1="' + (x - 46) + '" y1="272" x2="' + x + '" y2="272" class="gr-wg"/>' : "") + '<line x1="' + x + '" y1="266" x2="' + x + '" y2="272" class="gr-wg"/><rect x="' + (x - 4) + '" y="270" width="8" height="100" rx="3" class="gr-rod"/>'; }
		if (g.n > 3) h += '<text x="' + (494 + 2 * 46 + 16) + '" y="330" class="gr-t gr-sm">+' + (g.n - 3) + " more</text>";
		$("gr-houserods").innerHTML = h;
		$("gr-rh").textContent = "House rod" + (g.n > 1 ? "s" : "") + " ≈ " + sig(R, 3) + " Ω";
		var rsg = LASTP ? LASTP.Rsrcg : 20; $("gr-ru").textContent = "≈ " + sig(rsg, 3) + " Ω";
		var f = LASTF, L = LASTL, cap = "", fl = "";
		if (sc === "normal") cap = "<strong>Everyday:</strong> current goes out on the hot wire (red) and comes back on the neutral (grey) to the transformer. The ground wire (green) carries nothing. The neutral is tied to ground at the panel only (the N–G bond), and the ground rod just holds the whole system at the earth's voltage. Nothing here flows through the soil.";
		else if (sc === "egc" && f) { var c = f[0]; cap = "<strong>Hot touches the case, with a proper ground wire:</strong> the fault current takes the metal road back (case → green wire → panel bond → neutral) and is about <strong>" + si(c.I, "A", 3) + "</strong>, " + sig(c.I / LASTP.In, 3) + " × the breaker rating, so it " + (c.trip.trips ? "<strong>trips " + c.trip.note + "</strong>" : "does not trip") + ". The case only rises to ~" + si(c.Vcase, "V", 2) + " for that instant. The rod isn't what trips the breaker."; fl = "fault current ≈ " + si(c.I, "A", 3); }
		else if (sc === "rod" && f) { var d = f[1]; cap = "<strong>Hot touches a case that is connected only to a ground rod:</strong> the current must go down the rod, across the soil to the utility's earth and back up to the transformer. That path is " + sig(LASTP.Rrod + LASTP.Rsrcg, 3) + " Ω, so the fault current is just <strong>" + si(d.I, "A", 3) + "</strong>: the breaker <strong>" + (d.trip.trips ? "eventually trips" : "does not trip") + "</strong> and the case stays at about <strong>" + si(d.Vcase, "V", 3) + "</strong> above the earth until someone touches it."; fl = "fault current ≈ " + si(d.I, "A", 3); }
		else if (sc === "none" && f) { var e = f[2], k = G.bodyEffect(e.Ibody); cap = "<strong>Hot touches an ungrounded case and you touch it:</strong> you are the path (case → you → floor → soil → utility earth). About <strong>" + sig(e.Ibody, 3) + " mA</strong> flows through you: " + k.t.toLowerCase() + ". The breaker " + (e.trip.trips ? "trips" : "does not notice") + ". A GFCI / RCD would cut this in ~30 ms."; fl = "through you ≈ " + sig(e.Ibody, 3) + " mA"; }
		else if (sc === "light" && L) cap = "<strong>Lightning strikes nearby:</strong> the current spreads out through the soil as rings of voltage. Your house rods rise to ~<strong>" + si(L.gp, "V", 2) + "</strong>, and the step voltage across a stride " + sig(L.r, 3) + " m from the strike is ~<strong>" + si(L.sv, "V", 2) + "</strong>. If everything (rods, pipes, panel) is bonded they all rise together and nothing sparks; an unbonded rod " + sig(L.d2, 3) + " m away could differ by ~" + si(L.bt.between, "V", 2) + ".";
		$("gr-cap").innerHTML = cap; $("gr-flab").textContent = fl;
	}
	$("gr-sc").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; S.sc = b.dataset.sc; diagram(); };
	var P = { rod: $("gr-p-rod"), fault: $("gr-p-fault"), light: $("gr-p-light"), static: $("gr-p-static"), rules: $("gr-p-rules") };
	function show() { S.sc = TABSC[S.tab] || "normal"; Object.keys(P).forEach(function (k) { P[k].hidden = k !== S.tab; }); Array.prototype.forEach.call($("gr-tabs").children, function (b) { b.setAttribute("aria-pressed", b.dataset.tab === S.tab ? "true" : "false"); }); }
	function all() { rodTab(); faultTab(); lightTab(); staticTab(); rulesTab(); diagram(); }
	function save() { sset({ tab: S.tab, soil: S.soil, rho: S.rho, L: S.L, lu: S.lu, d: S.d, n: S.n, s: S.sp, t: S.t, reg: S.reg }); }
	function link() { var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", S.tab); u.searchParams.set("rho", S.rho); u.searchParams.set("L", S.lu === "ft" ? String(+(num(S.L) * FT).toFixed(3)) : S.L); u.searchParams.set("d", S.d); u.searchParams.set("n", S.n); u.searchParams.set("s", String(+spM().toFixed(3))); u.searchParams.set("t", S.t); return u.toString(); }

	$("gr-tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; S.tab = b.dataset.tab; show(); all(); save(); };
	$("gr-soil").onchange = function () { var s = G.SOILS.filter(function (x) { return x.id === this.value; }.bind(this))[0]; $("gr-rho").value = s.rho; read(); all(); save(); };
	$("gr-rho").addEventListener("input", function () { read(); all(); save(); });
	["gr-len", "gr-lu", "gr-dia", "gr-n", "gr-spv", "gr-su", "gr-target", "gr-reg"].forEach(function (id) { $(id).addEventListener("input", function () { read(); all(); save(); }); $(id).addEventListener("change", function () { read(); all(); save(); }); });
	["gr-v", "gr-in", "gr-curve", "gr-rline", "gr-regc", "gr-rsrc", "gr-rsg", "gr-rfl"].forEach(function (id) { $(id).addEventListener("input", function () { faultTab(); diagram(); }); $(id).addEventListener("change", function () { faultTab(); diagram(); }); });
	["gr-ipk", "gr-dist", "gr-stride", "gr-d2"].forEach(function (id) { $(id).addEventListener("input", function () { lightTab(); diagram(); }); $(id).addEventListener("change", function () { lightTab(); diagram(); }); });
	$("gr-sobj").onchange = function () { var o = SOBJ[+this.value]; $("gr-sC").value = o[1]; $("gr-sV").value = o[2]; staticTab(); };
	["gr-sC", "gr-sV", "gr-sR"].forEach(function (id) { $(id).addEventListener("input", staticTab); $(id).addEventListener("change", staticTab); });
	$("gr-link").onclick = function () { var u = link(), b = this; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { b.textContent = "✓ Copied"; }, function () { window.prompt("Copy this link", u); }); setTimeout(function () { b.textContent = "🔗 Copy link"; }, 1600); };
	new MutationObserver(function () { lightTab(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	write(); show(); all();
})();
