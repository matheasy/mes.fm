/* MES Fuel Cost Calculator maths (global FC; node: require('./tool_apps_src/fuel-cost-calculator/lib.js')). Pure. Internally:
 * distance in km, fuel in litres, economy in L/100 km, electricity in kWh/100 km, prices per litre / per kWh. Exact constants. */
(function (root) {
	"use strict";
	var FC = {};
	FC.MI = 1.609344;            // km per mile (exact)
	FC.GAL_US = 3.785411784;     // litres per US gallon (exact)
	FC.GAL_UK = 4.54609;         // litres per imperial gallon (exact)
	FC.CO2 = { gasoline: 2.31, diesel: 2.68 };   // kg CO2 per litre burned (approximate, tank-to-wheel)
	// L/100 km <-> other economy units (each conversion is its own inverse: x -> K / x)
	FC.K_US = 100 * FC.GAL_US / FC.MI;   // 235.2145833...
	FC.K_UK = 100 * FC.GAL_UK / FC.MI;   // 282.4809363...
	FC.ECON = {
		l100: { name: "L/100 km", to: function (l) { return l; }, from: function (v) { return v; }, lowerBetter: true },
		kml: { name: "km/L", to: function (l) { return 100 / l; }, from: function (v) { return 100 / v; } },
		mpgus: { name: "mpg (US)", to: function (l) { return FC.K_US / l; }, from: function (v) { return FC.K_US / v; } },
		mpguk: { name: "mpg (UK)", to: function (l) { return FC.K_UK / l; }, from: function (v) { return FC.K_UK / v; } }
	};
	FC.toL100 = function (v, unit) { var u = FC.ECON[unit]; if (!u || !(v > 0)) return null; return u.from(v); };
	FC.fromL100 = function (l, unit) { var u = FC.ECON[unit]; if (!u || !(l > 0)) return null; return u.to(l); };
	FC.allEcon = function (l) { var o = {}; Object.keys(FC.ECON).forEach(function (k) { o[k] = FC.fromL100(l, k); }); return o; };
	// distance
	FC.toKm = function (d, unit) { return unit === "mi" ? d * FC.MI : d; };
	FC.fromKm = function (km, unit) { return unit === "mi" ? km / FC.MI : km; };
	// volume: L, galus, galuk
	FC.VOL = { l: 1, galus: FC.GAL_US, galuk: FC.GAL_UK };
	FC.toL = function (v, unit) { return v * (FC.VOL[unit] || 1); };
	FC.fromL = function (l, unit) { return l / (FC.VOL[unit] || 1); };
	// price per unit volume -> per litre
	FC.pricePerL = function (p, unit) { return p / (FC.VOL[unit] || 1); };
	// electricity economy: kwh100 (kWh/100 km), kwhmi (kWh/100 mi), mikwh (mi/kWh), kmkwh (km/kWh), whkm (Wh/km), whmi (Wh/mi)
	FC.EV = {
		kwh100: { name: "kWh/100 km", from: function (v) { return v; }, to: function (e) { return e; } },
		kwh100mi: { name: "kWh/100 mi", from: function (v) { return v / FC.MI; }, to: function (e) { return e * FC.MI; } },
		mikwh: { name: "mi/kWh", from: function (v) { return 100 / (v * FC.MI); }, to: function (e) { return 100 / (e * FC.MI); } },
		kmkwh: { name: "km/kWh", from: function (v) { return 100 / v; }, to: function (e) { return 100 / e; } },
		whkm: { name: "Wh/km", from: function (v) { return v / 10; }, to: function (e) { return e * 10; } },
		whmi: { name: "Wh/mi", from: function (v) { return v / 10 / FC.MI; }, to: function (e) { return e * 10 * FC.MI; } }
	};
	FC.toKwh100 = function (v, unit) { var u = FC.EV[unit]; if (!u || !(v > 0)) return null; return u.from(v); };
	FC.fromKwh100 = function (e, unit) { var u = FC.EV[unit]; if (!u || !(e > 0)) return null; return u.to(e); };

	FC.num = function (s) {
		if (typeof s === "number") return s;
		var t = String(s == null ? "" : s).trim().replace(/[\s$€£¥₫₹]/g, "");
		if (!t) return NaN;
		if (/^-?\d+,\d+$/.test(t) && !/^-?\d{1,3},\d{3}$/.test(t)) t = t.replace(",", ".");
		if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
		t = t.replace(/,/g, "");
		return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
	};

	/* trip: {km, l100, pricePerL, people (>=1), roundTrip} -> {km (total), litres, cost, perPerson, perKm, co2kg (with fuel)} */
	FC.trip = function (o) {
		var km = (o.km || 0) * (o.roundTrip ? 2 : 1), litres = km * o.l100 / 100, cost = litres * (o.pricePerL || 0), people = Math.max(1, Math.floor(o.people || 1));
		return { km: km, litres: litres, cost: cost, perPerson: cost / people, people: people, perKm: km ? cost / km : 0, perMi: km ? cost / km * FC.MI : 0,
			co2kg: litres * (FC.CO2[o.fuel] || FC.CO2.gasoline) };
	};
	/* fill-up: distance since the last fill (km) and litres put in -> L/100 km */
	FC.fillup = function (km, litres) { if (!(km > 0) || !(litres > 0)) return null; return litres / km * 100; };
	/* electric trip: {km, kwh100, pricePerKwh, loss (charging loss fraction, 0-0.3)} -> {kwh (from the wall), cost} */
	FC.evTrip = function (o) {
		var kwhCar = o.km * o.kwh100 / 100, wall = kwhCar / (1 - Math.min(0.5, Math.max(0, o.loss || 0)));
		return { kwhCar: kwhCar, kwh: wall, cost: wall * (o.pricePerKwh || 0), co2kg: wall * (o.gridG || 0) / 1000 };
	};
	/* break-even: extra purchase cost of car B over car A, and yearly running costs of A and B -> years (null = never) */
	FC.breakEven = function (extra, yearlyA, yearlyB) {
		var save = yearlyA - yearlyB;
		if (!(extra > 0)) return 0;
		if (!(save > 0)) return null;
		return extra / save;
	};
	FC.round = function (x, dp) { var f = Math.pow(10, dp || 0), v = Math.round(Math.abs(x) * f + 1e-9) / f; return x < 0 ? -v : v; };
	FC.fixed = function (x, dp) {
		if (x == null || !isFinite(x)) return "–";
		var v = FC.round(x, dp).toFixed(dp), p = v.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	};
	// a sensible number of decimals for a value shown to a person
	FC.nice = function (x) { var a = Math.abs(x); return FC.fixed(x, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
	// Google Maps directions link (no API key: the public "api=1" URL format)
	FC.mapUrl = function (from, to) {
		return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(from) + "&destination=" + encodeURIComponent(to) + "&travelmode=driving";
	};

	if (typeof module !== "undefined" && module.exports) module.exports = FC; else root.FC = FC;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Fuel Cost Calculator -- mes.fm/fuel-cost-calculator (UI; maths in lib.js, global FC). Fuel economy is kept as L/100 km and the four
 * economy boxes mirror each other. State: localStorage "mes-fuel-cost-calculator:v1" = { d, du, rt, e (L/100 km), p, pu, cur, n, fuel,
 * from, to, fd, fv, fvu, b, bu, bp, yr, ev, evu, ep, loss, grid, extra }.
 * Links: ?d=350&du=km&rt=1&e=7.8&p=1.65&pu=l&cur=$&n=4&fuel=gasoline (+ &b=&bu=&bp=&yr=&ev=&evu=&ep=&extra=)
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("fc");
	if (!root || !window.FC) return;
	var KEY = "mes-fuel-cost-calculator:v1";
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("fc-toast"); if (!t) { t = document.createElement("div"); t.id = "fc-toast"; t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function stat(l, v, s, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + (s || "") + "</div></div>"; }
	var N = FC.num, fx = FC.fixed;
	function pos(v) { var x = N(v); return x > 0 ? x : NaN; }

	/* defaults by locale: US = miles, mpg US, per US gallon; UK = miles, mpg UK, per litre; elsewhere km, L/100 km, per litre */
	var lang = (navigator.language || "en-US"), region = (lang.split("-")[1] || "").toUpperCase();
	var US = region === "US" || lang === "en", UK = region === "GB";
	var STR = ["d", "e", "p", "cur", "n", "from", "to", "fd", "fv", "b", "bp", "yr", "ev", "ep", "loss", "grid", "extra"];
	var DEF = { d: "", du: US || UK ? "mi" : "km", rt: false, e: "", eu: US ? "mpgus" : UK ? "mpguk" : "l100", p: "", pu: US ? "galus" : "l", cur: "", n: "", fuel: "gasoline",
		from: "", to: "", fd: "", fv: "", fvu: US ? "galus" : "l", b: "", bu: US ? "mpgus" : UK ? "mpguk" : "l100", bp: "", yr: "", ev: "", evu: US ? "mikwh" : "kwh100", ep: "", loss: "10", grid: "400", extra: "" };
	var S = JSON.parse(JSON.stringify(DEF));
	function clean(s) {
		var o = JSON.parse(JSON.stringify(DEF)); if (!s || typeof s !== "object") return o;
		STR.forEach(function (k) { if (s[k] != null) o[k] = String(s[k]).slice(0, k === "from" || k === "to" ? 120 : 14); });
		if (s.du === "km" || s.du === "mi") o.du = s.du;
		o.rt = s.rt === true || s.rt === "1";
		if (FC.ECON[s.eu]) o.eu = s.eu; if (FC.ECON[s.bu]) o.bu = s.bu; if (FC.EV[s.evu]) o.evu = s.evu;
		if (FC.VOL[s.pu]) o.pu = s.pu; if (FC.VOL[s.fvu]) o.fvu = s.fvu;
		if (FC.CO2[s.fuel]) o.fuel = s.fuel;
		return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) S = clean(s); } catch (e) {} }
	var saveT; function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150); }
	load();
	(function fromUrl() {
		var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
		if (!q.has("d") && !q.has("e") && !q.has("p")) return;
		var s = Object.assign({}, S); q.forEach(function (v, k) { s[k] = v; });
		if (q.has("e")) s.eu = q.get("eu") || "l100";
		S = clean(s); save();
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
	})();

	function l100() { return pos(S.e); }   // S.e is L/100 km
	function cur() { return (S.cur || "").trim() || (UK ? "£" : "$"); }
	function money(x, dp) { if (!isFinite(x)) return "–"; return (x < 0 ? "-" : "") + cur() + fx(Math.abs(x), dp == null ? 2 : dp); }
	function du() { return S.du; } function duName(n) { return S.du === "mi" ? (n === 1 ? "mile" : "miles") : "km"; }
	function volName(u) { return u === "galus" ? "US gal" : u === "galuk" ? "UK gal" : "L"; }

	/* ---------- trip inputs ---------- */
	function segSync(id, attr, val) { [].forEach.call($(id).children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute(attr) === String(val))); }); }
	function fillEcon(except) {
		var l = l100();
		[].forEach.call(root.querySelectorAll(".fc-econ input"), function (inp) {
			if (inp === except) return;
			var v = l > 0 ? FC.fromL100(l, inp.dataset.u) : NaN; inp.value = v > 0 ? FC.round(v, 2).toString() : "";
		});
	}
	[].forEach.call(root.querySelectorAll(".fc-econ input"), function (inp) {
		inp.addEventListener("input", function () {
			var v = pos(inp.value), l = v > 0 ? FC.toL100(v, inp.dataset.u) : NaN;
			S.e = l > 0 ? String(FC.round(l, 6)) : ""; S.eu = inp.dataset.u; fillEcon(inp); save(); render();
		});
		inp.addEventListener("blur", function () { if (l100() > 0) fillEcon(); });
	});
	[["fc-d", "d"], ["fc-p", "p"], ["fc-cur", "cur"], ["fc-n", "n"], ["fc-from", "from"], ["fc-to", "to"], ["fc-fd", "fd"], ["fc-fv", "fv"], ["fc-b", "b"], ["fc-bp", "bp"], ["fc-yr", "yr"], ["fc-ev", "ev"], ["fc-ep", "ep"], ["fc-loss", "loss"], ["fc-grid", "grid"], ["fc-extra", "extra"]].forEach(function (p) {
		$(p[0]).addEventListener("input", function () { S[p[1]] = this.value; save(); render(); });
	});
	[["fc-pu", "pu"], ["fc-fuel", "fuel"], ["fc-fvu", "fvu"], ["fc-bu", "bu"], ["fc-evu", "evu"]].forEach(function (p) {
		$(p[0]).addEventListener("change", function () {
			var old = S[p[1]]; S[p[1]] = this.value;
			// keep the value meaning the same thing when its unit changes
			if (p[1] === "bu" && pos(S.b) > 0) { S.b = String(FC.round(FC.fromL100(FC.toL100(pos(S.b), old), S.bu), 2)); $("fc-b").value = S.b; }
			if (p[1] === "evu" && pos(S.ev) > 0) { S.ev = String(FC.round(FC.fromKwh100(FC.toKwh100(pos(S.ev), old), S.evu), 3)); $("fc-ev").value = S.ev; }
			save(); render();
		});
	});
	$("fc-du").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b || b.dataset.u === S.du) return;
		var to = b.dataset.u;
		// convert the typed distances so they keep meaning the same road
		["d", "fd", "yr"].forEach(function (k) { var v = pos(S[k]); if (v > 0) { S[k] = String(FC.round(to === "mi" ? v / FC.MI : v * FC.MI, k === "yr" ? 0 : 2)); $("fc-" + k).value = S[k]; } });
		S.du = to; save(); syncAll(); render();
	});
	$("fc-rt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.rt = b.dataset.rt === "1"; segSync("fc-rt", "data-rt", S.rt ? 1 : 0); save(); render(); });
	function syncAll() {
		$("fc-d").value = S.d; $("fc-p").value = S.p; $("fc-cur").value = S.cur; $("fc-n").value = S.n; $("fc-pu").value = S.pu; $("fc-fuel").value = S.fuel;
		["from", "to", "fd", "fv", "b", "bp", "yr", "ev", "ep", "loss", "grid", "extra"].forEach(function (k) { $("fc-" + k).value = S[k]; });
		$("fc-fvu").value = S.fvu; $("fc-bu").value = S.bu; $("fc-evu").value = S.evu;
		segSync("fc-du", "data-u", S.du); segSync("fc-rt", "data-rt", S.rt ? 1 : 0);
		$("fc-fdu").textContent = du(); [].forEach.call(root.querySelectorAll(".fc-du-sfx"), function (s) { s.textContent = du(); });
		fillEcon();
	}
	var EX = [
		["350 km, 7.8 L/100 km, $1.65/L, 4 people", { d: "350", du: "km", rt: false, e: "7.8", p: "1.65", pu: "l", n: "4" }],
		["300 miles, 25 mpg, $3.50/gal", { d: "300", du: "mi", rt: false, e: String(FC.toL100(25, "mpgus")), p: "3.50", pu: "galus", n: "1" }],
		["UK: 200 miles return, 45 mpg, £1.45/L", { d: "200", du: "mi", rt: true, e: String(FC.toL100(45, "mpguk")), p: "1.45", pu: "l", n: "2", cur: "£" }]
	];
	$("fc-ex").innerHTML = EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("fc-ex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EX[+b.dataset.i][1]; Object.keys(x).forEach(function (k) { S[k] = x[k]; }); if (!x.cur) S.cur = ""; save(); syncAll(); render(); });

	/* ---------- render ---------- */
	var summary = "";
	function render() {
		var dist = pos(S.d), l = l100(), price = pos(S.p), ppl = price > 0 ? FC.pricePerL(price, S.pu) : NaN, out = $("fc-out");
		$("fc-map").href = S.from.trim() && S.to.trim() ? FC.mapUrl(S.from.trim(), S.to.trim()) : "https://www.google.com/maps/dir/";
		summary = "";
		if (!(dist > 0) || !(l > 0)) {
			out.innerHTML = stat("Trip cost", "&ndash;", "Enter the distance and the car's fuel economy" + (price > 0 ? "." : ", then the fuel price."), true); $("fc-sent").textContent = "";
		} else {
			var km = FC.toKm(dist, S.du), t = FC.trip({ km: km, l100: l, pricePerL: ppl > 0 ? ppl : 0, people: N(S.n), roundTrip: S.rt, fuel: S.fuel });
			var vu = S.pu === "l" ? "l" : S.pu, volMain = fx(FC.fromL(t.litres, vu), 1) + " " + volName(vu), volOther = vu === "l" ? fx(FC.fromL(t.litres, S.du === "mi" ? (UK ? "galuk" : "galus") : "galus"), 2) + " " + volName(S.du === "mi" && UK ? "galuk" : "galus") : fx(t.litres, 1) + " L";
			var totDist = FC.fromKm(t.km, S.du), html = stat("Fuel needed", volMain, "= " + volOther + " for " + fx(totDist, totDist < 10 ? 1 : 0) + " " + duName(totDist) + (S.rt ? " (there and back)" : ""));
			if (ppl > 0) {
				html = stat("Trip cost", esc(money(t.cost)), S.rt ? "round trip" : "one way", true) + (t.people > 1 ? stat("Each person pays", esc(money(t.perPerson)), "split " + t.people + " ways", true) : "") + html +
					stat("Cost per " + (S.du === "mi" ? "mile" : "km"), esc(money(S.du === "mi" ? t.perMi : t.perKm, 3)), "per 100 " + duName(100) + ": " + esc(money((S.du === "mi" ? t.perMi : t.perKm) * 100)));
			}
			html += stat("CO&#8322; (approx.)", fx(t.co2kg, t.co2kg < 100 ? 1 : 0) + " kg", (S.fuel === "diesel" ? "2.68" : "2.31") + " kg per litre of " + (S.fuel === "diesel" ? "diesel" : "gasoline"));
			out.innerHTML = html;
			summary = fx(totDist, totDist < 10 ? 1 : 0) + " " + duName(totDist) + (S.rt ? " round trip" : "") + " at " + fx(l, 2) + " L/100 km (" + fx(FC.fromL100(l, "mpgus"), 1) + " mpg US, " + fx(FC.fromL100(l, "mpguk"), 1) + " mpg UK) needs " + volMain +
				(ppl > 0 ? " of fuel; at " + money(price) + " per " + (S.pu === "l" ? "litre" : volName(S.pu)) + " that costs " + money(t.cost) + (t.people > 1 ? ", or " + money(t.perPerson) + " each for " + t.people + " people" : "") : " of fuel") + ".";
			$("fc-sent").textContent = summary;
		}
		renderFill(); renderCmp(); renderEv();
	}
	function econTiles(l) {
		return stat("L/100 km", fx(l, 2), "", true) + stat("km/L", fx(FC.fromL100(l, "kml"), 2), "") + stat("mpg (US)", fx(FC.fromL100(l, "mpgus"), 1), "") + stat("mpg (UK)", fx(FC.fromL100(l, "mpguk"), 1), "");
	}
	var fillL = NaN;
	function renderFill() {
		var d = pos(S.fd), v = pos(S.fv), out = $("fc-fout");
		fillL = d > 0 && v > 0 ? FC.fillup(FC.toKm(d, S.du), FC.toL(v, S.fvu)) : NaN;
		out.innerHTML = fillL > 0 ? econTiles(fillL) : "";
		$("fc-fuse").hidden = !(fillL > 0);
	}
	$("fc-fuse").addEventListener("click", function () { if (!(fillL > 0)) return; S.e = String(FC.round(fillL, 6)); save(); fillEcon(); render(); toast("Trip now uses " + fx(fillL, 2) + " L/100 km"); });

	function yearly(l100v, ppl, km) { return km * l100v / 100 * ppl; }
	function renderCmp() {
		var la = l100(), lbv = pos(S.b), lb = lbv > 0 ? FC.toL100(lbv, S.bu) : NaN, price = pos(S.p), ppa = price > 0 ? FC.pricePerL(price, S.pu) : NaN, pb = pos(S.bp), ppb = pb > 0 ? FC.pricePerL(pb, S.pu) : ppa;
		var dist = pos(S.d), km = dist > 0 ? FC.toKm(dist, S.du) * (S.rt ? 2 : 1) : NaN, yr = pos(S.yr), ykm = yr > 0 ? FC.toKm(yr, S.du) : NaN, tab = $("fc-cmp"), note = $("fc-cmpnote");
		if (!(la > 0) || !(lb > 0)) { tab.innerHTML = ""; note.textContent = la > 0 ? "Type the second car's fuel economy to compare." : "Fill in the first car above, then the second car here."; return; }
		function col(l, pp) { return [fx(l, 2), fx(FC.fromL100(l, "mpgus"), 1), fx(FC.fromL100(l, "mpguk"), 1), km > 0 ? fx(km * l / 100, 1) + " L" : "–", km > 0 && pp > 0 ? money(km * l / 100 * pp) : "–", ykm > 0 && pp > 0 ? money(yearly(l, pp, ykm), 0) : "–"]; }
		var A = col(la, ppa), B = col(lb, ppb), rows = ["L/100 km", "mpg (US)", "mpg (UK)", "Fuel for this trip", "Cost of this trip", "Fuel cost a year"];
		var diffTrip = km > 0 && ppa > 0 && ppb > 0 ? km * lb / 100 * ppb - km * la / 100 * ppa : NaN, diffYr = ykm > 0 && ppa > 0 && ppb > 0 ? yearly(lb, ppb, ykm) - yearly(la, ppa, ykm) : NaN;
		tab.innerHTML = "<thead><tr><th></th><th>This car</th><th>Second car</th><th>Difference</th></tr></thead><tbody>" + rows.map(function (r, i) {
			var d = i === 4 && isFinite(diffTrip) ? (diffTrip > 0 ? "+" : "") + money(diffTrip) : i === 5 && isFinite(diffYr) ? (diffYr > 0 ? "+" : "") + money(diffYr, 0) : "";
			return "<tr><td>" + r + "</td><td>" + esc(A[i]) + "</td><td>" + esc(B[i]) + "</td><td>" + esc(d) + "</td></tr>";
		}).join("") + "</tbody>";
		note.textContent = isFinite(diffYr) ? (diffYr < 0 ? "The second car saves about " + money(-diffYr, 0) + " a year." : diffYr > 0 ? "The second car costs about " + money(diffYr, 0) + " more a year in fuel." : "Same fuel cost.") : "Add the distance you drive in a year to see yearly costs.";
	}
	function renderEv() {
		var evv = pos(S.ev), e100 = evv > 0 ? FC.toKwh100(evv, S.evu) : NaN, ep = pos(S.ep), loss = Math.min(50, Math.max(0, N(S.loss) || 0)) / 100, grid = Math.max(0, N(S.grid) || 0);
		var la = l100(), price = pos(S.p), ppa = price > 0 ? FC.pricePerL(price, S.pu) : NaN, dist = pos(S.d), km = dist > 0 ? FC.toKm(dist, S.du) * (S.rt ? 2 : 1) : NaN, yr = pos(S.yr), ykm = yr > 0 ? FC.toKm(yr, S.du) : NaN, tab = $("fc-evt"), note = $("fc-evnote");
		if (!(e100 > 0)) { tab.innerHTML = ""; note.textContent = "Type how much electricity the electric car uses (typical: 15-20 kWh/100 km, about 3-4 miles/kWh) and the price per kWh."; return; }
		var rows = [], perKmEv = ep > 0 ? e100 / 100 / (1 - loss) * ep : NaN, perKmFuel = la > 0 && ppa > 0 ? la / 100 * ppa : NaN, unit = S.du === "mi" ? FC.MI : 1, u = S.du === "mi" ? "mile" : "km";
		rows.push(["Uses", fx(e100, 1) + " kWh/100 km (" + fx(FC.fromKwh100(e100, "mikwh"), 2) + " mi/kWh)", la > 0 ? fx(la, 2) + " L/100 km" : "–"]);
		rows.push(["Energy cost per " + u, isFinite(perKmEv) ? money(perKmEv * unit, 3) : "–", isFinite(perKmFuel) ? money(perKmFuel * unit, 3) : "–"]);
		if (km > 0) {
			var ev = FC.evTrip({ km: km, kwh100: e100, pricePerKwh: ep || 0, loss: loss, gridG: grid }), ft = la > 0 ? FC.trip({ km: km, l100: la, pricePerL: ppa || 0, fuel: S.fuel }) : null;
			rows.push(["This trip", fx(ev.kwh, 1) + " kWh" + (ep > 0 ? " = " + money(ev.cost) : ""), ft ? fx(ft.litres, 1) + " L" + (ppa > 0 ? " = " + money(ft.cost) : "") : "–"]);
			rows.push(["CO₂ this trip (approx.)", fx(ev.co2kg, 1) + " kg", ft ? fx(ft.co2kg, 1) + " kg" : "–"]);
		}
		var be = "";
		if (ykm > 0 && isFinite(perKmEv) && isFinite(perKmFuel)) {
			var yEv = ykm * perKmEv, yF = ykm * perKmFuel; rows.push(["Energy cost a year", money(yEv, 0), money(yF, 0)]);
			var extra = pos(S.extra), years = FC.breakEven(extra, yF, yEv);
			be = yF > yEv ? "The electric car saves about " + money(yF - yEv, 0) + " a year in energy" : "At these prices the electric car costs " + money(yEv - yF, 0) + " more a year in energy";
			if (extra > 0) be += years == null ? ", so it never pays back the extra " + money(extra, 0) + "." : "; the extra " + money(extra, 0) + " pays back in about " + fx(years, 1) + " years (" + fx(years * yr, 0) + " " + duName(2) + ").";
			else be += ".";
		} else be = "Add the distance a year (in the comparison above) and both prices to see yearly costs and the break-even.";
		tab.innerHTML = "<thead><tr><th></th><th>Electric car</th><th>This fuel car</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("") + "</tbody>";
		note.textContent = be + " Charging loss is the energy lost between the wall and the battery (about 10% at home). Maintenance, insurance and incentives are not included.";
	}

	/* ---------- buttons ---------- */
	$("fc-link").addEventListener("click", function () {
		var q = new URLSearchParams();
		["d", "du"].forEach(function (k) { if (S[k]) q.set(k, S[k]); }); if (S.rt) q.set("rt", "1");
		if (l100() > 0) q.set("e", String(FC.round(l100(), 4)));
		["p", "pu", "cur", "n"].forEach(function (k) { if (String(S[k]).trim()) q.set(k, String(S[k]).trim()); }); if (S.fuel !== "gasoline") q.set("fuel", S.fuel);
		["b", "bu", "bp", "yr", "ev", "evu", "ep", "extra"].forEach(function (k) { if ((k === "bu" ? S.b : k === "evu" ? S.ev : S[k]).trim()) q.set(k, String(S[k]).trim()); });
		copy(location.origin + location.pathname + "?" + q.toString(), "Link copied");
	});
	$("fc-copy").addEventListener("click", function () { if (summary) copy(summary, "Summary copied"); else toast("Enter a trip first"); });
	$("fc-reset").addEventListener("click", function () {
		var old = JSON.stringify(S); S = JSON.parse(JSON.stringify(DEF)); save(); syncAll(); render();
		toast("Cleared"); var t = $("fc-toast"), b = document.createElement("button"); b.type = "button"; b.className = "fc-undo"; b.textContent = "Undo";
		b.addEventListener("click", function () { S = clean(JSON.parse(old)); save(); syncAll(); render(); t.classList.remove("tu-toast--show"); });
		t.appendChild(document.createTextNode(" ")); t.appendChild(b); t.style.pointerEvents = "auto"; clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); t.style.pointerEvents = ""; }, 6000);
	});

	/* reference table in the explanation */
	$("fc-ref").innerHTML = "<thead><tr><th>mpg (US)</th><th>mpg (UK)</th><th>L/100 km</th><th>km/L</th></tr></thead><tbody>" + [15, 20, 25, 30, 35, 40, 50, 60].map(function (m) {
		var l = FC.toL100(m, "mpgus"); return "<tr><td>" + m + "</td><td>" + fx(FC.fromL100(l, "mpguk"), 1) + "</td><td>" + fx(l, 2) + "</td><td>" + fx(FC.fromL100(l, "kml"), 2) + "</td></tr>";
	}).join("") + "</tbody>";

	syncAll(); render();
})();
