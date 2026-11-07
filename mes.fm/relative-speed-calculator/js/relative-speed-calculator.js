/* MES Relative Speed, Jump & Fall Calculator -- pure maths (global RS; node: require("./lib.js")). SI units inside (m, s, kg).
 * Speed: body lengths per second, scaled to another body length (straight scaling) and the Froude-fair speed v * sqrt(Lref / L)
 *        (equal Froude number v^2 / gL, the rule engineers use to compare walking and running animals of different sizes).
 * Jump:  height or distance in body lengths, scaled; take-off speed (sqrt(2gh) up, sqrt(g d) for a 45-degree long jump) and the push acceleration.
 * Fall:  quadratic air drag, terminal speed vt = sqrt(2 m g / (rho CdA)), impact speed after a drop h: v = vt sqrt(1 - exp(-2 g h / vt^2)). */
(function (root) {
	"use strict";
	var G = 9.80665, RHO = 1.204, SOUND = 343;
	var LEN = { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
	var SPD = { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, "ft/s": 0.3048, "cm/s": 0.01, "mm/s": 0.001, knots: 1852 / 3600 };
	var MASS = { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, t: 1000 };
	var ALIAS = { meter: "m", meters: "m", metre: "m", metres: "m", centimeter: "cm", centimeters: "cm", millimeter: "mm", millimeters: "mm", inch: "in", inches: "in", '"': "in", foot: "ft", feet: "ft", "'": "ft", yard: "yd", yards: "yd", mile: "mi", miles: "mi", kilometer: "km", kilometers: "km",
		kph: "km/h", "km/hr": "km/h", kmh: "km/h", "kilometers per hour": "km/h", "miles per hour": "mph", mi_h: "mph", fps: "ft/s", "feet per second": "ft/s", "ft/sec": "ft/s", "m/sec": "m/s", "meters per second": "m/s", mps: "m/s", kn: "knots", knot: "knots", kt: "knots",
		kilogram: "kg", kilograms: "kg", kgs: "kg", gram: "g", grams: "g", milligram: "mg", milligrams: "mg", pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz", tonne: "t", tonnes: "t", ton: "t" };
	function num(s) { s = String(s == null ? "" : s).trim().toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/,(\d)/g, ".$1"); return s; }
	/* "1.75 m", "5 ft 9 in", "5'9\"", "20 mm" -> metres; bare number -> def unit */
	function parseLen(text, def) {
		var s = num(text); if (!s) return null;
		var fi = s.match(/^(\d*\.?\d+)\s*(?:ft|feet|foot|')\s*(\d*\.?\d+)\s*(?:in|inch|inches|")?$/); if (fi) return (+fi[1]) * LEN.ft + (+fi[2]) * LEN.in;
		var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z'"]*)$/); if (!m) return null;
		var u = m[2] ? (ALIAS[m[2]] || m[2]) : def; if (!LEN[u]) return null; var v = +m[1] * LEN[u]; return v > 0 && isFinite(v) ? v : null;
	}
	function parseSpeed(text, def) {
		var s = num(text); if (!s) return null;
		var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*(.*)$/); if (!m) return null; var u = m[2].trim().replace(/\s+/g, " ");
		u = u ? (ALIAS[u] || u) : def; if (!SPD[u]) return null; var v = +m[1] * SPD[u]; return v > 0 && isFinite(v) ? v : null;
	}
	function parseMass(text, def) {
		var s = num(text); if (!s) return null; var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)$/); if (!m) return null;
		var u = m[2] ? (ALIAS[m[2]] || m[2]) : def; if (!MASS[u]) return null; var v = +m[1] * MASS[u]; return v > 0 && isFinite(v) ? v : null;
	}

	/* speed */
	function bodyLengths(v, L) { return v / L; }
	function scaledSpeed(v, L, Lref) { return v / L * Lref; }
	function froudeSpeed(v, L, Lref) { return v * Math.sqrt(Lref / L); }
	function froude(v, L) { return v * v / (G * L); }
	/* jump */
	function takeoffUp(h) { return Math.sqrt(2 * G * h); }
	function takeoffLong(d) { return Math.sqrt(G * d); } /* 45 degrees, no drag */
	function pushG(v, push) { return push > 0 ? v * v / (2 * push) / G : NaN; } /* average acceleration over the push, in g */
	/* fall */
	function terminal(m, cda, rho) { return Math.sqrt(2 * m * G / ((rho || RHO) * cda)); }
	function impactSpeed(h, vt) { return vt * Math.sqrt(-Math.expm1(-2 * G * h / (vt * vt))); }
	function noDragSpeed(h) { return Math.sqrt(2 * G * h); }
	/* drop height needed to reach speed v when terminal speed is vt (Infinity if v >= vt) */
	function heightFor(v, vt) { if (v >= vt) return Infinity; return -(vt * vt) / (2 * G) * Math.log1p(-(v * v) / (vt * vt)); }
	function fallTime(h, vt) { var k = G / vt; return Math.acosh(Math.exp(G * h / (vt * vt))) / k; }
	function cdaGuess(L) { return 0.3 * L * L; }

	/* formatting */
	function round(x, sig) {
		if (!isFinite(x)) return String(x); if (x === 0) return "0"; sig = sig || 3;
		var d = Math.min(6, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x))))), s = x.toFixed(d);
		if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
		var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	}
	function fmtLen(m, imp) {
		if (!isFinite(m)) return "∞";
		if (imp) { if (m < 0.3048) return round(m / LEN.in, 3) + " in"; if (m < 1609.344) return round(m / LEN.ft, 3) + " ft"; return round(m / LEN.mi, 3) + " mi"; }
		if (m < 0.01) return round(m * 1000, 3) + " mm"; if (m < 1) return round(m * 100, 3) + " cm"; if (m < 1000) return round(m, 3) + " m"; return round(m / 1000, 3) + " km";
	}
	function fmtSpeed(v, imp) { return imp ? round(v / SPD.mph, 3) + " mph" : round(v * 3.6, 3) + " km/h"; }

	/* presets: commonly cited values (rounded; individual animals vary a lot) */
	var RUNNERS = [
		{ id: "mite", name: "Paratarsotomus mite", v: 0.225, L: 0.0007, note: "322 body lengths/s, the fastest land animal for its size (Rubin et al., 2014)" },
		{ id: "tigerbeetle", name: "Tiger beetle", v: 2.5, L: 0.02, note: "Cicindela hudsoni, about 2.5 m/s" },
		{ id: "silverant", name: "Saharan silver ant", v: 0.855, L: 0.0079, note: "about 108 body lengths/s on hot sand" },
		{ id: "cockroach", name: "American cockroach", v: 1.5, L: 0.035, note: "about 50 body lengths/s (Full and Tu, 1991)" },
		{ id: "mouse", name: "House mouse", v: 3.6, L: 0.08, note: "about 13 km/h" },
		{ id: "snail", name: "Garden snail", v: 0.0013, L: 0.03, note: "about 1.3 mm/s" },
		{ id: "cat", name: "House cat", v: 13, L: 0.46, note: "sprint about 48 km/h" },
		{ id: "greyhound", name: "Greyhound", v: 19.5, L: 1.0, note: "about 70 km/h" },
		{ id: "horse", name: "Racehorse", v: 19.5, L: 2.4, note: "Thoroughbred, about 70 km/h" },
		{ id: "pronghorn", name: "Pronghorn", v: 24.6, L: 1.4, note: "about 88 km/h" },
		{ id: "cheetah", name: "Cheetah", v: 29, L: 1.2, note: "about 104 km/h, head and body length" },
		{ id: "bolt", name: "Usain Bolt", v: 12.4, L: 1.95, note: "top speed in the 2009 100 m world record" },
		{ id: "falcon", name: "Peregrine falcon (dive)", v: 108, L: 0.42, note: "about 389 km/h in a stoop" },
		{ id: "car", name: "Car at highway speed", v: 100 / 3.6, L: 4.5, note: "100 km/h, 4.5 m long" }
	];
	var JUMPERS = [
		{ id: "flea", name: "Cat flea", kind: "up", h: 0.18, L: 0.002, push: 0.0004, note: "about 18 cm high" },
		{ id: "froghopper", name: "Froghopper (spittlebug)", kind: "up", h: 0.7, L: 0.006, push: 0.002, note: "up to 70 cm high (Burrows, 2003)" },
		{ id: "grasshopper", name: "Grasshopper", kind: "up", h: 0.5, L: 0.04, push: 0.02, note: "about 50 cm high" },
		{ id: "spider", name: "Jumping spider", kind: "long", h: 0.1, L: 0.01, push: 0.005, note: "about 10 cm, 10 body lengths" },
		{ id: "squirrel", name: "Grey squirrel", kind: "up", h: 1.5, L: 0.25, push: 0.08, note: "about 1.5 m straight up, head and body 25 cm" },
		{ id: "squirrel-long", name: "Grey squirrel (leap across)", kind: "long", h: 3, L: 0.25, push: 0.08, note: "about 3 m between branches" },
		{ id: "cat", name: "House cat", kind: "up", h: 1.5, L: 0.46, push: 0.2, note: "about 1.5 m onto a fence" },
		{ id: "kangaroo", name: "Red kangaroo", kind: "long", h: 8, L: 1.4, push: 0.5, note: "about 8 m per bound" },
		{ id: "impala", name: "Impala", kind: "up", h: 3, L: 1.4, push: 0.5, note: "about 3 m high" },
		{ id: "highjump", name: "Human high jump record", kind: "up", h: 2.45, L: 1.95, push: 0.5, note: "Javier Sotomayor, 1993 (bar height)" },
		{ id: "longjump", name: "Human long jump record", kind: "long", h: 8.95, L: 1.88, push: 0.5, note: "Mike Powell, 1991" }
	];
	var FALLERS = [
		{ id: "ant", name: "Ant", m: 3e-6, cda: 1.2e-5, L: 0.006, note: "a few milligrams" },
		{ id: "mouse", name: "Mouse", m: 0.02, cda: 0.003, L: 0.08, note: "20 g" },
		{ id: "squirrel", name: "Squirrel (spread out)", m: 0.5, cda: 0.03, L: 0.25, note: "uses its tail and body as a parachute" },
		{ id: "cat", name: "Cat (spread out)", m: 4, cda: 0.09, L: 0.46, note: "cats spread their legs after turning over" },
		{ id: "human", name: "Person (belly down)", m: 80, cda: 0.47, L: 1.75, note: "a skydiver's usual terminal speed, about 190 km/h" },
		{ id: "horse", name: "Horse", m: 500, cda: 1.0, L: 2.4, note: "500 kg" },
		{ id: "elephant", name: "Elephant", m: 5000, cda: 4, L: 6, note: "5 tonnes" }
	];
	var REFS = [{ id: "human", name: "a person (1.75 m)", L: 1.75 }, { id: "car", name: "a car (4.5 m)", L: 4.5 }, { id: "giraffe", name: "a giraffe (5 m)", L: 5 }, { id: "bus", name: "a bus (12 m)", L: 12 }, { id: "custom", name: "my own height or length", L: null }];
	function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
	var RS = { G: G, RHO: RHO, SOUND: SOUND, LEN: LEN, SPD: SPD, MASS: MASS, parseLen: parseLen, parseSpeed: parseSpeed, parseMass: parseMass,
		bodyLengths: bodyLengths, scaledSpeed: scaledSpeed, froudeSpeed: froudeSpeed, froude: froude, takeoffUp: takeoffUp, takeoffLong: takeoffLong, pushG: pushG,
		terminal: terminal, impactSpeed: impactSpeed, noDragSpeed: noDragSpeed, heightFor: heightFor, fallTime: fallTime, cdaGuess: cdaGuess,
		round: round, fmtLen: fmtLen, fmtSpeed: fmtSpeed, RUNNERS: RUNNERS, JUMPERS: JUMPERS, FALLERS: FALLERS, REFS: REFS, find: find };
	if (typeof module === "object" && module.exports) module.exports = RS; else root.RS = RS;
})(this);

/* MES Relative Speed, Jump & Fall Calculator -- mes.fm/relative-speed-calculator (UI; maths in lib.js, global RS).
 * localStorage "mes-relative-speed:v1" = { t, imp, ref, refc, sp, sv, sl, jp, jk, jh, jl, jpush, fp, fh, fm, fa }.
 * Links: ?t=speed&v=2.5m/s&l=20mm | ?t=jump&k=up&h=18cm&l=2mm | ?t=fall&p=cat&h=20m  (+ &r=car / &r=1.8m, &u=us) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("rs"); if (!root || !window.RS) return;
	var KEY = "mes-relative-speed:v1", SVGNS = "http://www.w3.org/2000/svg";
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
	var DEF = { t: "speed", imp: false, ref: "human", refc: "", sp: "tigerbeetle", sv: "2.5 m/s", sl: "20 mm", jp: "flea", jk: "up", jh: "18 cm", jl: "2 mm", jpush: "0.4 mm", fp: "cat", fh: "20 m", fm: "4 kg", fa: "0.09" };
	var st = JSON.parse(JSON.stringify(DEF));
	function clean(s) {
		var o = JSON.parse(JSON.stringify(DEF)); if (!s || typeof s !== "object") return o;
		if (["speed", "jump", "fall"].indexOf(s.t) >= 0) o.t = s.t; o.imp = s.imp === true;
		if (RS.find(RS.REFS, s.ref)) o.ref = s.ref;
		["refc", "sv", "sl", "jh", "jl", "jpush", "fh", "fm", "fa"].forEach(function (k) { if (typeof s[k] === "string") o[k] = s[k].slice(0, 40); });
		if (s.sp === "custom" || RS.find(RS.RUNNERS, s.sp)) o.sp = s.sp; if (s.jp === "custom" || RS.find(RS.JUMPERS, s.jp)) o.jp = s.jp; if (s.fp === "custom" || RS.find(RS.FALLERS, s.fp)) o.fp = s.fp;
		if (s.jk === "long") o.jk = "long"; return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function toast(msg) { var t = $("rs-toast"); if (!t) { t = document.createElement("div"); t.id = "rs-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	function lenText(m) { return RS.fmtLen(m, false).replace(/,/g, ""); }
	function spdText(v) { return v >= 1 ? RS.round(v, 3).replace(/,/g, "") + " m/s" : RS.round(v * 100, 3) + " cm/s"; }
	function fromUrl() {
		var q = new URLSearchParams(location.search); if (!q.has("t")) return; var s = JSON.parse(JSON.stringify(st)); s.t = q.get("t");
		if (q.get("u") === "us") s.imp = true; var r = q.get("r"); if (r) { if (RS.find(RS.REFS, r)) s.ref = r; else { s.ref = "custom"; s.refc = r; } }
		if (s.t === "speed") { if (q.get("p") && RS.find(RS.RUNNERS, q.get("p"))) pickRunner(s, q.get("p")); if (q.get("v")) { s.sv = q.get("v"); s.sp = "custom"; } if (q.get("l")) { s.sl = q.get("l"); s.sp = "custom"; } }
		if (s.t === "jump") { if (q.get("p") && RS.find(RS.JUMPERS, q.get("p"))) pickJumper(s, q.get("p")); if (q.get("k")) s.jk = q.get("k"); if (q.get("h")) { s.jh = q.get("h"); s.jp = "custom"; } if (q.get("l")) { s.jl = q.get("l"); s.jp = "custom"; } }
		if (s.t === "fall") { if (q.get("p") && RS.find(RS.FALLERS, q.get("p"))) pickFaller(s, q.get("p")); if (q.get("h")) s.fh = q.get("h"); if (q.get("m")) { s.fm = q.get("m"); s.fp = "custom"; } if (q.get("a")) { s.fa = q.get("a"); s.fp = "custom"; } }
		st = clean(s);
	}
	function pickRunner(s, id) { var r = RS.find(RS.RUNNERS, id); s.sp = id; s.sv = spdText(r.v); s.sl = lenText(r.L); }
	function pickJumper(s, id) { var j = RS.find(RS.JUMPERS, id); s.jp = id; s.jk = j.kind; s.jh = lenText(j.h); s.jl = lenText(j.L); s.jpush = lenText(j.push); }
	function pickFaller(s, id) { var f = RS.find(RS.FALLERS, id); s.fp = id; s.fm = f.m < 0.001 ? RS.round(f.m * 1e6, 3) + " mg" : f.m < 1 ? RS.round(f.m * 1000, 3) + " g" : RS.round(f.m, 3) + " kg"; s.fa = String(f.cda); }

	function opts(list) { return list.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + "</option>"; }).join("") + '<option value="custom">Your own numbers</option>'; }
	$("rs-sp").innerHTML = opts(RS.RUNNERS); $("rs-jp").innerHTML = opts(RS.JUMPERS); $("rs-fp").innerHTML = opts(RS.FALLERS);
	$("rs-ref").innerHTML = RS.REFS.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");

	function refLen() { if (st.ref === "custom") return RS.parseLen(st.refc, "m"); return RS.find(RS.REFS, st.ref).L; }
	function refName() { if (st.ref === "custom") { var L = refLen(); return L ? "your size (" + L_(L) + ")" : "your size"; } return RS.find(RS.REFS, st.ref).name.replace(/^a /, "a "); }
	function L_(m) { return RS.fmtLen(m, st.imp); } function V_(v) { return RS.fmtSpeed(v, st.imp); } function V2(v) { return RS.fmtSpeed(v, st.imp) + " (" + RS.fmtSpeed(v, !st.imp) + ")"; }
	function read(id, ok, txt) { var el = $(id); if (!el) return; el.textContent = ok ? txt : "Can't read that"; el.classList.toggle("is-bad", !ok); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + esc(label) + '</div><div class="tu-stat__value">' + esc(value) + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }
	function empty(msg) { $("rs-big").textContent = "—"; $("rs-sub").textContent = ""; $("rs-say").textContent = msg; $("rs-stats").innerHTML = ""; $("rs-chart").innerHTML = ""; $("rs-why").innerHTML = ""; }

	function syncInputs() {
		[].forEach.call($("rs-tab").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === st.t)); });
		[].forEach.call(root.querySelectorAll(".rs-pane"), function (p) { p.hidden = p.dataset.pane !== st.t; });
		[].forEach.call($("rs-units").children, function (b) { b.setAttribute("aria-pressed", String((b.dataset.u === "1") === st.imp)); });
		[].forEach.call($("rs-jk").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.k === st.jk)); });
		$("rs-ref").value = st.ref; $("rs-refc").hidden = st.ref !== "custom"; $("rs-refc").value = st.refc;
		$("rs-sp").value = st.sp; $("rs-sv").value = st.sv; $("rs-sl").value = st.sl;
		$("rs-jp").value = st.jp; $("rs-jh").value = st.jh; $("rs-jl").value = st.jl; $("rs-jpush").value = st.jpush; $("rs-jh-label").textContent = st.jk === "up" ? "Jump height" : "Jump distance";
		$("rs-fp").value = st.fp; $("rs-fh").value = st.fh; $("rs-fm").value = st.fm; $("rs-fa").value = st.fa;
		var h = RS.parseLen(st.fh, "m"); if (h) $("rs-fhs").value = Math.round(clamp((Math.log10(h) + 1) / 4, 0, 1) * 1000);
		$("rs-ch-h").textContent = st.t === "fall" ? "Impact speed for every drop height" : "Everyone side by side";
	}
	function update() {
		var Lr = refLen(); if (st.ref === "custom") read("rs-refc", !!Lr, "");
		if (!Lr) return empty("Type your height or length in the Compare with box.");
		if (st.t === "speed") return speed(Lr); if (st.t === "jump") return jump(Lr); return fall(Lr);
	}

	function speed(Lr) {
		var v = RS.parseSpeed(st.sv, "m/s"), L = RS.parseLen(st.sl, "cm");
		read("rs-sv-read", !!v, v ? V2(v) : ""); read("rs-sl-read", !!L, L ? RS.fmtLen(L, false) + " (" + RS.fmtLen(L, true) + ")" : "");
		if (!v || !L) return empty("Type a speed and a body length.");
		var n = RS.bodyLengths(v, L), vs = RS.scaledSpeed(v, L, Lr), vf = RS.froudeSpeed(v, L, Lr), p = st.sp === "custom" ? null : RS.find(RS.RUNNERS, st.sp), name = p ? p.name : "It";
		$("rs-big").textContent = RS.round(n, 3) + " body lengths per second";
		$("rs-sub").textContent = p ? p.note : "your own numbers";
		var mach = vs / RS.SOUND;
		$("rs-say").innerHTML = "At the size of " + esc(refName()) + " that would be <b>" + esc(V2(vs)) + "</b>" + (mach >= 0.8 ? " (" + RS.round(mach, 2) + " times the speed of sound)" : "") + ". The fair comparison (same Froude number) is <b>" + esc(V_(vf)) + "</b>.";
		var bolt = 12.4 * Math.sqrt(Lr / 1.95);
		$("rs-stats").innerHTML = stat("Body lengths per second", RS.round(n, 3), "Real speed " + esc(V2(v)) + ", body " + esc(L_(L)), true)
			+ stat("Straight scaling", V_(vs), "Same body lengths per second at " + esc(L_(Lr)) + (mach >= 0.8 ? ". That is Mach " + RS.round(mach, 2) : ""))
			+ stat("Fair (Froude) speed", V_(vf), vf > bolt ? "Faster than Usain Bolt at this size (" + esc(V_(bolt)) + ")" : "Usain Bolt at this size: " + esc(V_(bolt)))
			+ stat("A person doing it", RS.round(n, 3) + " × 1.75 m", "= " + esc(RS.round(n * 1.75, 3)) + " m every second");
		var rows = RS.RUNNERS.map(function (r) { return { id: r.id, name: r.name, val: r.v / r.L, sub: V_(r.v) }; });
		if (!p) rows.push({ id: "custom", name: "Your numbers", val: n, sub: V_(v) });
		bars(rows, st.sp, function (x) { return RS.round(x, 3) + " BL/s"; }, function (id) { if (id === "custom") return; pickRunner(st, id); save(); syncInputs(); update(); });
		$("rs-chnote").textContent = "Body lengths per second on a log scale (each grid line is 10 times more). Click a bar to load that animal. Small animals win easily, which is exactly why the fair comparison matters.";
		$("rs-why").innerHTML = "<h3>Why two answers?</h3><p>Straight scaling keeps the body lengths per second the same. But legs swing like pendulums, and a pendulum's natural speed grows only with the square root of its length, so bigger animals cannot keep up the same stride rate. The Froude number <i>v</i>&sup2;/<i>gL</i> captures that: " + esc(name === "It" ? "this runner" : "the " + name.toLowerCase()) + " has a Froude number of " + esc(RS.round(RS.froude(v, L), 3)) + ", and " + esc(refName()) + " would need " + esc(V_(vf)) + " to match it.</p>";
	}
	var LANDMARKS = [[6, "a house"], [30, "a 10-storey building"], [46, "Niagara Falls"], [93, "the Statue of Liberty"], [169, "the Washington Monument"], [330, "the Eiffel Tower"], [553, "the CN Tower"], [828, "the Burj Khalifa"]];
	function landmark(h) { var best = null; LANDMARKS.forEach(function (l) { if (h >= l[0]) best = l; }); return best; }
	function jump(Lr) {
		var h = RS.parseLen(st.jh, "m"), L = RS.parseLen(st.jl, "cm"), push = RS.parseLen(st.jpush, "cm"), up = st.jk === "up";
		read("rs-jh-read", !!h, h ? RS.fmtLen(h, false) + " (" + RS.fmtLen(h, true) + ")" : ""); read("rs-jl-read", !!L, L ? RS.fmtLen(L, false) + " (" + RS.fmtLen(L, true) + ")" : "");
		read("rs-jpush-read", !!push, push ? "Roughly how far the body moves while the legs push" : "");
		if (!h || !L) return empty("Type the jump and the body length.");
		var n = h / L, hs = n * Lr, v0 = up ? RS.takeoffUp(h) : RS.takeoffLong(h), g = push ? RS.pushG(v0, push) : NaN, p = st.jp === "custom" ? null : RS.find(RS.JUMPERS, st.jp), lm = landmark(hs);
		$("rs-big").textContent = RS.round(n, 3) + " body lengths " + (up ? "high" : "long");
		$("rs-sub").textContent = p ? p.note : "your own numbers";
		$("rs-say").innerHTML = "Scaled to " + esc(refName()) + ", that is a jump of <b>" + esc(L_(hs)) + "</b>" + (up ? " (about " + RS.round(hs / 3, 2) + " storeys)" : "") + (lm ? ", more than " + esc(lm[1]) + " (" + esc(L_(lm[0])) + ")" : "") + ".";
		var person = up ? 0.5 : 2.5;
		$("rs-stats").innerHTML = stat("Body lengths", RS.round(n, 3), "Jump " + esc(L_(h)) + ", body " + esc(L_(L)), true)
			+ stat("Straight scaling", L_(hs), "Same body lengths at " + esc(L_(Lr)))
			+ stat("Take-off speed", V_(v0), up ? "√(2gh): the speed needed to rise " + esc(L_(h)) : "√(gd): the speed for " + esc(L_(h)) + " at 45°, no air drag")
			+ stat("Push acceleration", isFinite(g) ? RS.round(g, 3) + " g" : "—", isFinite(g) ? "Average while pushing off over " + esc(L_(push)) + ". People manage about 2–3 g" : "Type a push-off distance");
		var rows = RS.JUMPERS.filter(function (j) { return j.kind === st.jk; }).map(function (j) { return { id: j.id, name: j.name, val: j.h / j.L, sub: L_(j.h) }; });
		if (!p || p.kind !== st.jk) rows.push({ id: "custom", name: p ? p.name : "Your numbers", val: n, sub: L_(h) });
		bars(rows, st.jp, function (x) { return RS.round(x, 3) + " BL"; }, function (id) { if (id === "custom") return; pickJumper(st, id); save(); syncInputs(); update(); });
		$("rs-chnote").textContent = (up ? "Height" : "Distance") + " in body lengths on a log scale. Click a bar to load that animal; switch Straight up / Long jump for the other list.";
		$("rs-why").innerHTML = "<h3>But nobody could really jump " + esc(L_(hs)) + "</h3><p>Muscle energy grows with muscle mass, and so does the weight to lift, so animals of very different sizes jump to roughly the same absolute height (Borelli noticed this in the 1680s). A person's standing jump raises the body about " + esc(L_(person)) + (up ? "" : " in a standing long jump") + "; the " + esc(p ? p.name.toLowerCase() : "jumper") + " goes " + esc(L_(h)) + ". The real difference is the push: a small body has very little distance to speed up in, so it needs huge accelerations" + (isFinite(g) && g > 30 ? " (" + esc(RS.round(g, 3)) + " g here), which is why fleas and froghoppers use springs that store energy before the jump" : "") + ".</p>";
	}
	function fall(Lr) {
		var h = RS.parseLen(st.fh, "m"), m = RS.parseMass(st.fm, "kg"), a = parseFloat(String(st.fa).replace(",", ".")), p = st.fp === "custom" ? null : RS.find(RS.FALLERS, st.fp);
		if (!(a > 0)) a = null;
		read("rs-fh-read", !!h, h ? RS.fmtLen(h, false) + " (" + RS.fmtLen(h, true) + "), about " + RS.round(h / 3, 2) + " storeys" : ""); read("rs-fm-read", !!m, m ? (m < 1 ? RS.round(m * 1000, 3) + " g" : RS.round(m, 3) + " kg") + " (" + RS.round(m / RS.MASS.lb, 3) + " lb)" : ""); read("rs-fa-read", !!a, "Rough guess for a new animal: 0.3 × body length²");
		if (!h || !m || !a) return empty("Type a drop height, a mass and a drag area.");
		var vt = RS.terminal(m, a), v = RS.impactSpeed(h, vt), v0 = RS.noDragSpeed(h), human = RS.find(RS.FALLERS, "human"), vth = RS.terminal(human.m, human.cda), eq = RS.heightFor(v, vth), h95 = RS.heightFor(0.95 * vt, vt), t = RS.fallTime(h, vt), name = p ? p.name.replace(/ \(.*\)$/, "") : "It";
		$("rs-big").textContent = "Hits the ground at " + V_(v);
		$("rs-sub").textContent = (p ? p.note + " · " : "") + "terminal speed " + V_(vt);
		$("rs-say").innerHTML = (p ? "A " + esc(name.toLowerCase()) : "It") + " falling " + esc(L_(h)) + " reaches <b>" + esc(RS.round(v / vt * 100, 3)) + "%</b> of its terminal speed. " + (isFinite(eq) ? "For a person, hitting the ground that fast is like falling from <b>" + esc(L_(eq)) + "</b> (about " + RS.round(eq / 3, 2) + " storeys)." : "That is faster than a person's own terminal speed: no fall could make a person hit this hard.");
		$("rs-stats").innerHTML = stat("Impact speed", V_(v), "Without air it would be " + esc(V_(v0)), true)
			+ stat("Terminal speed", V_(vt), "Reached (95%) after a drop of " + esc(L_(h95)))
			+ stat("Like a person falling from", isFinite(eq) ? L_(eq) : "never", isFinite(eq) ? "Same impact speed for a person (terminal " + esc(V_(vth)) + ")" : "Faster than a person's terminal speed")
			+ stat("Time to fall", RS.round(t, 3) + " s", "Energy per kilogram: " + esc(RS.round(v * v / 2, 3)) + " J/kg");
		fallChart(h, p ? p.id : "custom", m, a);
		$("rs-chnote").textContent = "Impact speed against drop height (log scale) for every animal, with air drag. Each curve flattens at its terminal speed. The dashed line is a fall with no air. Move over the chart to read a height.";
		$("rs-why").innerHTML = "<h3>Why small animals survive long falls</h3><p>Double the size of an animal and its weight goes up 8 times but the area pushing on the air only 4 times, so its terminal speed rises by about &radic;2. A mouse can never fall faster than about " + esc(V_(RS.terminal(0.02, 0.003))) + ", the speed a person reaches after a drop of only " + esc(L_(RS.heightFor(RS.terminal(0.02, 0.003), vth))) + ". Haldane put it this way in 1926: drop a mouse down a mine shaft and it walks away, a rat is killed, a man is broken, a horse splashes. Please don't test it.</p>";
	}

	function el(tag, attrs, text) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
	function boxW() { return Math.round(clamp($("rs-chart").clientWidth || 640, 300, 720)); }
	function bars(rows, sel, fmt, onPick) {
		rows.sort(function (a, b) { return b.val - a.val; });
		var W = boxW(), small = W < 480, lw = small ? 0 : 190, rowH = small ? 42 : 26, top = 6, H = top + rows.length * rowH + 22, x0 = lw + 8, x1 = W - (small ? 70 : 90);
		var lo = Math.floor(Math.log10(Math.min.apply(null, rows.map(function (r) { return r.val; })))), hi = Math.ceil(Math.log10(Math.max.apply(null, rows.map(function (r) { return r.val; }))));
		if (hi === lo) hi = lo + 1; var X = function (v) { return x0 + (Math.log10(v) - lo) / (hi - lo) * (x1 - x0); };
		var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
		for (var e = lo; e <= hi; e++) { svg.appendChild(el("line", { x1: X(Math.pow(10, e)), x2: X(Math.pow(10, e)), y1: top, y2: H - 18, "class": "rs-gl" })); svg.appendChild(el("text", { x: X(Math.pow(10, e)), y: H - 4, "text-anchor": "middle", "class": "rs-ax" }, RS.round(Math.pow(10, e), 1))); }
		rows.forEach(function (r, i) {
			var y = top + i * rowH, on = r.id === sel || (sel === "custom" && r.id === "custom"), g = el("g", { "class": "rs-row" + (on ? " is-on" : ""), tabindex: r.id === "custom" ? "-1" : "0", role: "button", "aria-label": r.name + ": " + fmt(r.val) });
			var by = small ? y + 18 : y + 4, bh = small ? 16 : 18;
			g.appendChild(el("text", small ? { x: x0, y: y + 13, "class": "rs-bl" } : { x: lw, y: y + 17, "text-anchor": "end", "class": "rs-bl" }, r.name));
			g.appendChild(el("rect", { x: x0, y: by, width: Math.max(2, X(r.val) - x0), height: bh, rx: 3, "class": "rs-bar" }));
			g.appendChild(el("text", { x: X(r.val) + 5, y: by + bh - 4, "class": "rs-bv" }, fmt(r.val)));
			g.addEventListener("click", function () { onPick(r.id); }); g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPick(r.id); } });
			svg.appendChild(g);
		});
		var box = $("rs-chart"); box.innerHTML = ""; box.appendChild(svg); box.setAttribute("aria-label", rows.map(function (r) { return r.name + " " + fmt(r.val); }).join(", ")); $("rs-chread").textContent = "";
	}
	var fg = null;
	function fallChart(h, selId, m, a) {
		var W = boxW(), H = W < 480 ? 300 : 340, ml = 60, mr = 18, mt = 12, mb = 40, pw = W - ml - mr, ph = H - mt - mb, list = RS.FALLERS.slice();
		if (selId === "custom") list.push({ id: "custom", name: "Your numbers", m: m, cda: a });
		var vmax = Math.max.apply(null, list.map(function (f) { return RS.impactSpeed(1000, RS.terminal(f.m, f.cda)); })) * 1.05;
		var X = function (hh) { return ml + (Math.log10(hh) + 1) / 4 * pw; }, Y = function (v) { return mt + (1 - v / vmax) * ph; };
		var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" }), i;
		var step = st.imp ? 20 * 0.44704 : 50 / 3.6, unit = st.imp ? " mph" : " km/h", k = st.imp ? 1 / 0.44704 : 3.6;
		if (vmax / step > 8) step *= 2; if (vmax / step > 8) step *= 2;
		for (var v = 0; v <= vmax; v += step) { svg.appendChild(el("line", { x1: ml, x2: W - mr, y1: Y(v), y2: Y(v), "class": "rs-gl" })); svg.appendChild(el("text", { x: ml - 5, y: Y(v) + 4, "text-anchor": "end", "class": "rs-ax" }, String(Math.round(v * k)))); }
		svg.appendChild(el("text", { x: 14, y: mt + ph / 2, "class": "rs-ax", transform: "rotate(-90 14 " + (mt + ph / 2) + ")", "text-anchor": "middle" }, "impact speed (" + unit.trim() + ")"));
		[0.1, 1, 10, 100, 1000].forEach(function (hh) { svg.appendChild(el("line", { x1: X(hh), x2: X(hh), y1: mt, y2: mt + ph, "class": "rs-gl" })); svg.appendChild(el("text", { x: X(hh), y: H - mb + 16, "text-anchor": hh === 1000 ? "end" : hh === 0.1 ? "start" : "middle", "class": "rs-ax" }, st.imp ? RS.round(hh / 0.3048, 2) + " ft" : (hh < 1 ? hh * 100 + " cm" : hh + " m"))); });
		svg.appendChild(el("text", { x: W - mr, y: H - 4, "text-anchor": "end", "class": "rs-ax" }, "drop height"));
		function path(fn) { var d = "", n = 160; for (var j = 0; j <= n; j++) { var hh = Math.pow(10, -1 + 4 * j / n), vv = fn(hh); if (vv > vmax) break; d += (j ? "L" : "M") + X(hh).toFixed(1) + " " + Y(vv).toFixed(1); } return d; }
		svg.appendChild(el("path", { d: path(RS.noDragSpeed), "class": "rs-c rs-c--free" }));
		list.forEach(function (f) { var vt = RS.terminal(f.m, f.cda), on = f.id === selId; svg.appendChild(el("path", { d: path(function (hh) { return RS.impactSpeed(hh, vt); }), "class": "rs-c" + (on ? " rs-c--on" : "") })); var yy = Y(Math.min(RS.impactSpeed(1000, vt), vmax)); svg.appendChild(el("text", { x: W - mr - 2, y: Math.max(mt + 10, yy - 4), "text-anchor": "end", "class": "rs-cl" + (on ? " rs-cl--on" : "") }, f.name.replace(/ \(.*\)$/, ""))); });
		var vt0 = RS.terminal(m, a), vh = RS.impactSpeed(h, vt0);
		if (h >= 0.1 && h <= 1000) { svg.appendChild(el("line", { x1: X(h), x2: X(h), y1: mt, y2: mt + ph, "class": "rs-mk" })); svg.appendChild(el("circle", { cx: X(h), cy: Y(vh), r: 5.5, "class": "rs-dot" })); }
		var guide = el("line", { x1: 0, x2: 0, y1: mt, y2: mt + ph, "class": "rs-guide", visibility: "hidden" }); svg.appendChild(guide);
		svg.appendChild(el("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent", "class": "rs-hit" }));
		var box = $("rs-chart"); box.innerHTML = ""; box.appendChild(svg); box.setAttribute("aria-label", "Impact speed against drop height for each animal");
		fg = { svg: svg, guide: guide, W: W, ml: ml, pw: pw, X: X, list: list };
		readFall(h, false);
	}
	function readFall(h, hover) {
		if (!fg) return; var parts = fg.list.map(function (f) { return f.name.replace(/ \(.*\)$/, "") + " " + V_(RS.impactSpeed(h, RS.terminal(f.m, f.cda))); });
		$("rs-chread").innerHTML = "From <b>" + esc(L_(h)) + "</b>: " + esc(parts.join(" · "));
		if (hover) { var x = fg.X(h); fg.guide.setAttribute("x1", x); fg.guide.setAttribute("x2", x); fg.guide.setAttribute("visibility", "visible"); }
	}
	function chartMove(e) { if (st.t !== "fall" || !fg) return; var r = fg.svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * fg.W, f = clamp((sx - fg.ml) / fg.pw, 0, 1); readFall(Math.pow(10, -1 + 4 * f), true); }
	$("rs-chart").addEventListener("pointermove", chartMove); $("rs-chart").addEventListener("pointerdown", chartMove);
	$("rs-chart").addEventListener("pointerleave", function () { if (st.t !== "fall" || !fg) return; fg.guide.setAttribute("visibility", "hidden"); var h = RS.parseLen(st.fh, "m"); if (h) readFall(h, false); });

	/* events */
	$("rs-tab").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.t = b.dataset.t; save(); syncInputs(); update(); });
	$("rs-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.imp = b.dataset.u === "1"; save(); syncInputs(); update(); });
	$("rs-jk").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.jk = b.dataset.k; var p = RS.find(RS.JUMPERS, st.jp); if (p && p.kind !== st.jk) { var alt = RS.JUMPERS.filter(function (j) { return j.kind === st.jk; })[0]; pickJumper(st, alt.id); } save(); syncInputs(); update(); });
	$("rs-ref").addEventListener("change", function () { st.ref = this.value; save(); syncInputs(); if (st.ref === "custom") $("rs-refc").focus(); update(); });
	$("rs-refc").addEventListener("input", function () { st.refc = this.value; save(); update(); });
	$("rs-sp").addEventListener("change", function () { if (this.value === "custom") st.sp = "custom"; else pickRunner(st, this.value); save(); syncInputs(); update(); });
	$("rs-jp").addEventListener("change", function () { if (this.value === "custom") st.jp = "custom"; else pickJumper(st, this.value); save(); syncInputs(); update(); });
	$("rs-fp").addEventListener("change", function () { if (this.value === "custom") st.fp = "custom"; else pickFaller(st, this.value); save(); syncInputs(); update(); });
	[["rs-sv", "sv", "sp"], ["rs-sl", "sl", "sp"], ["rs-jh", "jh", "jp"], ["rs-jl", "jl", "jp"], ["rs-jpush", "jpush", null], ["rs-fm", "fm", "fp"], ["rs-fa", "fa", "fp"], ["rs-fh", "fh", null]].forEach(function (x) {
		$(x[0]).addEventListener("input", function () { st[x[1]] = this.value; if (x[2] && st[x[2]] !== "custom") { st[x[2]] = "custom"; $("rs-" + x[2]).value = "custom"; } if (x[1] === "fh") { var h = RS.parseLen(st.fh, "m"); if (h) $("rs-fhs").value = Math.round(clamp((Math.log10(h) + 1) / 4, 0, 1) * 1000); } save(); update(); });
	});
	$("rs-fhs").addEventListener("input", function () { var h = Math.pow(10, -1 + 4 * (+this.value) / 1000); h = h < 1 ? Math.round(h * 100) / 100 : h < 10 ? Math.round(h * 10) / 10 : Math.round(h); st.fh = h + " m"; $("rs-fh").value = st.fh; save(); update(); });
	$("rs-reset").onclick = function () { var t = st.t, imp = st.imp; st = JSON.parse(JSON.stringify(DEF)); st.t = t; st.imp = imp; save(); syncInputs(); update(); toast("Back to the starting numbers"); };
	$("rs-link").onclick = function () {
		var q = new URLSearchParams(); q.set("t", st.t); if (st.imp) q.set("u", "us"); if (st.ref === "custom") { var L = refLen(); if (L) q.set("r", RS.round(L, 4) + "m"); } else if (st.ref !== "human") q.set("r", st.ref);
		var nospace = function (s) { return String(s).replace(/\s+/g, ""); };
		if (st.t === "speed") { if (st.sp !== "custom") q.set("p", st.sp); else { q.set("v", nospace(st.sv)); q.set("l", nospace(st.sl)); } }
		if (st.t === "jump") { if (st.jp !== "custom") q.set("p", st.jp); else { q.set("k", st.jk); q.set("h", nospace(st.jh)); q.set("l", nospace(st.jl)); } }
		if (st.t === "fall") { if (st.fp !== "custom") q.set("p", st.fp); else { q.set("m", nospace(st.fm)); q.set("a", nospace(st.fa)); } q.set("h", nospace(st.fh)); }
		copy(location.origin + location.pathname + "?" + q.toString(), "Link copied");
	};
	var lastW = 0; window.addEventListener("resize", function () { clearTimeout(window.__rsRs); window.__rsRs = setTimeout(function () { var w = $("rs-chart").clientWidth; if (Math.abs(w - lastW) > 20) { lastW = w; update(); } }, 150); });
	load(); fromUrl(); syncInputs(); update(); lastW = $("rs-chart").clientWidth;
	if (location.search) try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
})();
