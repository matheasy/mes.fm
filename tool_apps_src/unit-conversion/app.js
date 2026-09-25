/* MES Unit Conversion Calculator -- mes.fm/unit-conversion
 * Category converters + "all units" table + a search box that understands "10 miles to km".
 * Linear categories store a factor to a base unit; temperature and fuel economy use functions.
 * State is kept in ?c=<category>&v=<value>&f=<from>&t=<to>.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	function U(id, sym, name, f, al) { return { id: id, sym: sym, name: name, f: f, al: al || [] }; }
	function lin(u) { u.to = function (v) { return v * u.f; }; u.from = function (v) { return v / u.f; }; return u; }

	var CATS = [
		{ id: "length", name: "Length", icon: "📏", common: [["mi", "km"], ["ft", "m"], ["in", "cm"], ["yd", "m"]], units: [
			U("nm", "nm", "nanometer", 1e-9, ["nanometre"]), U("um", "µm", "micrometer", 1e-6, ["micrometre", "micron", "um"]), U("mm", "mm", "millimeter", 1e-3, ["millimetre"]),
			U("cm", "cm", "centimeter", 1e-2, ["centimetre"]), U("m", "m", "meter", 1, ["metre", "metres", "meters"]), U("km", "km", "kilometer", 1000, ["kilometre", "kilometres", "kilometers", "kms"]),
			U("in", "in", "inch", 0.0254, ["inches", "\""]), U("ft", "ft", "foot", 0.3048, ["feet", "'"]), U("yd", "yd", "yard", 0.9144, ["yards"]),
			U("mi", "mi", "mile", 1609.344, ["miles"]), U("nmi", "nmi", "nautical mile", 1852, ["nautical miles", "nm."]), U("ly", "ly", "light-year", 9.4607304725808e15, ["light year", "lightyear", "light years"]),
			U("au", "au", "astronomical unit", 1.495978707e11, ["astronomical units"])] },
		{ id: "mass", name: "Mass", icon: "⚖️", common: [["lb", "kg"], ["oz", "g"], ["kg", "lb"], ["st", "kg"]], units: [
			U("ug", "µg", "microgram", 1e-9, ["micrograms", "mcg"]), U("mg", "mg", "milligram", 1e-6, ["milligrams"]), U("g", "g", "gram", 1e-3, ["grams", "gm"]),
			U("kg", "kg", "kilogram", 1, ["kilograms", "kilo", "kilos", "kgs"]), U("t", "t", "tonne (metric ton)", 1000, ["tonnes", "metric ton", "metric tons", "tonne"]),
			U("oz", "oz", "ounce", 0.028349523125, ["ounces"]), U("lb", "lb", "pound", 0.45359237, ["pounds", "lbs"]), U("st", "st", "stone", 6.35029318, ["stones"]),
			U("ton", "ton", "US ton (short ton)", 907.18474, ["short ton", "short tons", "us ton", "us tons", "tons"]), U("lton", "long ton", "UK ton (long ton)", 1016.0469088, ["long ton", "long tons", "uk ton"]),
			U("ct", "ct", "carat", 0.0002, ["carats"])] },
		{ id: "temperature", name: "Temperature", icon: "🌡️", common: [["f", "c"], ["c", "f"], ["c", "k"]], units: [
			{ id: "c", sym: "°C", name: "degree Celsius", al: ["celsius", "centigrade", "degrees celsius", "deg c", "°c"], to: function (v) { return v + 273.15; }, from: function (v) { return v - 273.15; } },
			{ id: "f", sym: "°F", name: "degree Fahrenheit", al: ["fahrenheit", "degrees fahrenheit", "deg f", "°f"], to: function (v) { return (v - 32) * 5 / 9 + 273.15; }, from: function (v) { return (v - 273.15) * 9 / 5 + 32; } },
			{ id: "k", sym: "K", name: "kelvin", al: ["kelvins"], to: function (v) { return v; }, from: function (v) { return v; } },
			{ id: "r", sym: "°R", name: "degree Rankine", al: ["rankine"], to: function (v) { return v * 5 / 9; }, from: function (v) { return v * 9 / 5; } }] },
		{ id: "area", name: "Area", icon: "⬛", common: [["acre", "ha"], ["ft2", "m2"], ["mi2", "km2"]], units: [
			U("mm2", "mm²", "square millimeter", 1e-6, ["mm2", "sq mm"]), U("cm2", "cm²", "square centimeter", 1e-4, ["cm2", "sq cm"]), U("m2", "m²", "square meter", 1, ["m2", "sq m", "square metre", "square meters"]),
			U("ha", "ha", "hectare", 1e4, ["hectares"]), U("km2", "km²", "square kilometer", 1e6, ["km2", "sq km"]), U("in2", "in²", "square inch", 0.00064516, ["in2", "sq in", "square inches"]),
			U("ft2", "ft²", "square foot", 0.09290304, ["ft2", "sq ft", "square feet", "sqft"]), U("yd2", "yd²", "square yard", 0.83612736, ["yd2", "sq yd"]),
			U("acre", "ac", "acre", 4046.8564224, ["acres", "ac"]), U("mi2", "mi²", "square mile", 2589988.110336, ["mi2", "sq mi", "square miles"])] },
		{ id: "volume", name: "Volume", icon: "🧪", common: [["gal", "l"], ["floz", "ml"], ["cup", "ml"], ["l", "gal"]], units: [
			U("ml", "mL", "milliliter", 0.001, ["millilitre", "cc", "cm3"]), U("l", "L", "liter", 1, ["litre", "litres", "liters"]), U("m3", "m³", "cubic meter", 1000, ["m3", "cubic metre", "cubic meters"]),
			U("tsp", "tsp", "teaspoon (US)", 0.00492892159375, ["teaspoons"]), U("tbsp", "tbsp", "tablespoon (US)", 0.01478676478125, ["tablespoons"]),
			U("floz", "fl oz", "fluid ounce (US)", 0.0295735295625, ["fluid ounce", "fluid ounces", "fl oz", "floz"]), U("cup", "cup", "cup (US)", 0.2365882365, ["cups"]),
			U("pt", "pt", "pint (US)", 0.473176473, ["pints", "us pint"]), U("qt", "qt", "quart (US)", 0.946352946, ["quarts", "us quart"]), U("gal", "gal", "gallon (US)", 3.785411784, ["gallons", "us gallon", "us gallons"]),
			U("ukgal", "gal (UK)", "gallon (UK)", 4.54609, ["imperial gallon", "imperial gallons", "uk gallon", "uk gallons"]), U("ukpt", "pt (UK)", "pint (UK)", 0.56826125, ["imperial pint", "uk pint"]),
			U("in3", "in³", "cubic inch", 0.016387064, ["in3", "cubic inches"]), U("ft3", "ft³", "cubic foot", 28.316846592, ["ft3", "cubic feet"]), U("bbl", "bbl", "oil barrel", 158.987294928, ["barrel", "barrels", "oil barrel"])] },
		{ id: "speed", name: "Speed", icon: "🚗", common: [["mph", "kmh"], ["kmh", "mph"], ["kn", "kmh"], ["ms", "kmh"]], units: [
			U("ms", "m/s", "meter per second", 1, ["mps", "meters per second", "metres per second"]), U("kmh", "km/h", "kilometer per hour", 1 / 3.6, ["kph", "kmph", "km/hr", "kilometers per hour", "kilometres per hour"]),
			U("mph", "mph", "mile per hour", 0.44704, ["miles per hour", "mi/h", "mi/hr"]), U("kn", "kn", "knot", 1852 / 3600, ["knots", "kt", "kts"]),
			U("fts", "ft/s", "foot per second", 0.3048, ["fps", "feet per second"]), U("mach", "Mach", "Mach (sea level)", 340.29, ["mach number"])] },
		{ id: "time", name: "Time", icon: "⏱️", common: [["h", "min"], ["day", "h"], ["week", "day"], ["year", "day"]], units: [
			U("ns", "ns", "nanosecond", 1e-9, ["nanoseconds"]), U("us", "µs", "microsecond", 1e-6, ["microseconds"]), U("msec", "ms", "millisecond", 1e-3, ["milliseconds", "ms"]),
			U("s", "s", "second", 1, ["seconds", "sec", "secs"]), U("min", "min", "minute", 60, ["minutes", "mins"]), U("h", "h", "hour", 3600, ["hours", "hr", "hrs"]),
			U("day", "d", "day", 86400, ["days"]), U("week", "wk", "week", 604800, ["weeks", "wk", "wks"]), U("month", "mo", "month (30.4375 d)", 2629800, ["months", "mo"]), U("year", "yr", "year (365.25 d)", 31557600, ["years", "yrs", "yr"])] },
		{ id: "pressure", name: "Pressure", icon: "🎈", common: [["psi", "kpa"], ["bar", "psi"], ["atm", "pa"], ["mmhg", "kpa"]], units: [
			U("pa", "Pa", "pascal", 1, ["pascals"]), U("kpa", "kPa", "kilopascal", 1000, ["kilopascals"]), U("mpa", "MPa", "megapascal", 1e6, ["megapascals"]),
			U("bar", "bar", "bar", 1e5, ["bars"]), U("mbar", "mbar", "millibar", 100, ["millibars", "hpa"]), U("atm", "atm", "atmosphere", 101325, ["atmospheres"]),
			U("psi", "psi", "pound per square inch", 6894.757293168, ["pounds per square inch", "lb/in2"]), U("mmhg", "mmHg", "millimeter of mercury", 133.322387415, ["mm hg", "millimeters of mercury"]),
			U("inhg", "inHg", "inch of mercury", 3386.389, ["in hg", "inches of mercury"]), U("torr", "Torr", "torr", 133.322368421, [])] },
		{ id: "energy", name: "Energy", icon: "⚡", common: [["kwh", "mj"], ["kcal", "kj"], ["btu", "kj"], ["cal", "j"]], units: [
			U("j", "J", "joule", 1, ["joules"]), U("kj", "kJ", "kilojoule", 1000, ["kilojoules"]), U("mj", "MJ", "megajoule", 1e6, ["megajoules"]),
			U("cal", "cal", "calorie", 4.184, ["calories", "small calorie"]), U("kcal", "kcal", "kilocalorie (food Calorie)", 4184, ["kilocalories", "food calorie", "food calories", "Cal"]),
			U("wh", "Wh", "watt-hour", 3600, ["watt hour", "watt hours"]), U("kwh", "kWh", "kilowatt-hour", 3.6e6, ["kilowatt hour", "kilowatt hours"]),
			U("btu", "BTU", "British thermal unit", 1055.05585262, ["btus", "british thermal units"]), U("ftlbf", "ft·lbf", "foot-pound", 1.3558179483, ["foot pound", "foot pounds", "ft lb"]),
			U("ev", "eV", "electronvolt", 1.602176634e-19, ["electron volt", "electron volts"])] },
		{ id: "power", name: "Power", icon: "🔌", common: [["hp", "kw"], ["kw", "hp"], ["btuh", "w"]], units: [
			U("w", "W", "watt", 1, ["watts"]), U("kw", "kW", "kilowatt", 1000, ["kilowatts"]), U("mw", "MW", "megawatt", 1e6, ["megawatts"]),
			U("hp", "hp", "horsepower (mechanical)", 745.69987158227, ["horsepower", "mechanical horsepower"]), U("ps", "PS", "horsepower (metric)", 735.49875, ["metric horsepower", "cv", "pferdestarke"]),
			U("btuh", "BTU/h", "BTU per hour", 0.29307107, ["btu/hr", "btu per hour"])] },
		{ id: "force", name: "Force", icon: "💪", common: [["lbf", "n"], ["kgf", "n"]], units: [
			U("n", "N", "newton", 1, ["newtons"]), U("kn2", "kN", "kilonewton", 1000, ["kilonewtons"]), U("lbf", "lbf", "pound-force", 4.4482216152605, ["pound force", "pounds force"]),
			U("kgf", "kgf", "kilogram-force", 9.80665, ["kilogram force", "kilograms force"]), U("dyn", "dyn", "dyne", 1e-5, ["dynes"])] },
		{ id: "data", name: "Data", icon: "💾", common: [["gb", "mb"], ["gib", "gb"], ["mb", "kb"], ["tb", "gb"]], units: [
			U("bit", "bit", "bit", 0.125, ["bits"]), U("b", "B", "byte", 1, ["bytes"]), U("kb", "kB", "kilobyte (1000 B)", 1e3, ["kilobytes", "kb"]), U("mb", "MB", "megabyte", 1e6, ["megabytes", "mb"]),
			U("gb", "GB", "gigabyte", 1e9, ["gigabytes", "gb", "gig"]), U("tb", "TB", "terabyte", 1e12, ["terabytes", "tb"]), U("pb", "PB", "petabyte", 1e15, ["petabytes", "pb"]),
			U("kib", "KiB", "kibibyte (1024 B)", 1024, ["kibibytes"]), U("mib", "MiB", "mebibyte", 1048576, ["mebibytes"]), U("gib", "GiB", "gibibyte", 1073741824, ["gibibytes"]), U("tib", "TiB", "tebibyte", 1099511627776, ["tebibytes"])] },
		{ id: "angle", name: "Angle", icon: "📐", common: [["deg", "rad"], ["rad", "deg"], ["turn", "deg"]], units: [
			U("deg", "°", "degree", 1, ["degrees", "deg", "°"]), U("rad", "rad", "radian", 180 / Math.PI, ["radians"]), U("grad", "gon", "gradian", 0.9, ["gradians", "gon", "grad"]),
			U("arcmin", "′", "arcminute", 1 / 60, ["arcminutes", "arc minute", "arc minutes"]), U("arcsec", "″", "arcsecond", 1 / 3600, ["arcseconds", "arc second", "arc seconds"]), U("turn", "turn", "turn (revolution)", 360, ["turns", "revolution", "revolutions", "rev"])] },
		{ id: "frequency", name: "Frequency", icon: "〰️", common: [["mhz", "hz"], ["rpm", "hz"]], units: [
			U("hz", "Hz", "hertz", 1, ["hertz"]), U("khz", "kHz", "kilohertz", 1e3, ["kilohertz"]), U("mhz", "MHz", "megahertz", 1e6, ["megahertz"]), U("ghz", "GHz", "gigahertz", 1e9, ["gigahertz"]),
			U("rpm", "rpm", "revolution per minute", 1 / 60, ["rpm", "revolutions per minute"])] },
		{ id: "fuel", name: "Fuel economy", icon: "⛽", common: [["mpg", "l100"], ["l100", "mpg"], ["kml", "mpg"]], units: [
			{ id: "l100", sym: "L/100 km", name: "liter per 100 km", al: ["l/100km", "l per 100 km", "litres per 100 km", "lp100km"], to: function (v) { return v; }, from: function (v) { return v; } },
			{ id: "mpg", sym: "mpg", name: "mile per gallon (US)", al: ["mpg us", "miles per gallon", "us mpg"], to: function (v) { return 235.214583333 / v; }, from: function (v) { return 235.214583333 / v; } },
			{ id: "ukmpg", sym: "mpg (UK)", name: "mile per gallon (UK)", al: ["mpg uk", "imperial mpg", "uk mpg"], to: function (v) { return 282.480936331 / v; }, from: function (v) { return 282.480936331 / v; } },
			{ id: "kml", sym: "km/L", name: "kilometer per liter", al: ["km/l", "kmpl", "km per l"], to: function (v) { return 100 / v; }, from: function (v) { return 100 / v; } }] }
	];
	CATS.forEach(function (c) { c.units.forEach(function (u) { if (!u.to) lin(u); u.cat = c; }); });

	/* alias index: normalized key -> [unit] */
	function key(s) { return s.toLowerCase().replace(/[\s._\-]/g, ""); }
	var INDEX = {};
	function add(k, u) { k = key(k); if (!k) return; (INDEX[k] = INDEX[k] || []); if (INDEX[k].indexOf(u) === -1) INDEX[k].push(u); }
	CATS.forEach(function (c) {
		c.units.forEach(function (u) {
			add(u.id, u); add(u.sym, u); add(u.name.replace(/\s*\(.*\)/, ""), u); add(u.name, u);
			u.al.forEach(function (a) { add(a, u); });
			var nm = u.name.replace(/\s*\(.*\)/, ""); add(nm + "s", u);
		});
	});
	function lookup(text) {
		var k = key(text), out = INDEX[k];
		if (!out && k.slice(-1) === "s") out = INDEX[k.slice(0, -1)];
		if (!out && k.slice(-2) === "es") out = INDEX[k.slice(0, -2)];
		return out || [];
	}

	var state = { cat: CATS[0], from: "mi", to: "km", val: "1", dec: "auto" };

	function catById(id) { return CATS.filter(function (c) { return c.id === id; })[0]; }
	function unitOf(cat, id) { return cat.units.filter(function (u) { return u.id === id; })[0]; }
	function convert(v, from, to) { return to.from(from.to(v)); }
	function parseVal(s) {
		s = String(s).trim().replace(/\s/g, "");
		if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
		else s = s.replace(",", ".");
		var m = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.exec(s);
		return m ? parseFloat(s) : NaN;
	}
	function fmt(v, dec) {
		if (!isFinite(v)) return "—";
		if (v === 0) return "0";
		if (dec !== "auto") return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: +dec });
		var a = Math.abs(v);
		if (a >= 1e15 || a < 1e-6) return v.toExponential(6).replace(/\.?0+e/, "e");
		return parseFloat(v.toPrecision(10)).toLocaleString("en-US", { maximumFractionDigits: 12 });
	}
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
	function label(u) { return u.name.charAt(0).toUpperCase() + u.name.slice(1) + " (" + u.sym + ")"; }
	function plainFmt(v) { return fmt(v, state.dec); }

	/* ---------- rendering ---------- */
	function renderCats(visible) {
		$("uc-cats").innerHTML = CATS.map(function (c) {
			var show = !visible || visible.indexOf(c) !== -1;
			return '<button type="button" role="tab" class="uc-cat" data-c="' + c.id + '" aria-selected="' + (c === state.cat) + '"' + (show ? "" : " hidden") + '><span class="uc-cat__icon">' + c.icon + "</span><span>" + c.name + "</span></button>";
		}).join("");
		$("uc-nomatch").hidden = !visible || visible.length > 0;
	}
	function fillSelects() {
		var opts = state.cat.units.map(function (u) { return '<option value="' + u.id + '">' + esc(label(u)) + "</option>"; }).join("");
		$("uc-from").innerHTML = opts; $("uc-to").innerHTML = opts;
		if (!unitOf(state.cat, state.from)) state.from = state.cat.units[0].id;
		if (!unitOf(state.cat, state.to)) state.to = state.cat.units[Math.min(1, state.cat.units.length - 1)].id;
		$("uc-from").value = state.from; $("uc-to").value = state.to;
		$("uc-title").textContent = state.cat.name + " converter";
		$("uc-all-title").textContent = "All " + state.cat.name.toLowerCase() + " units";
		$("uc-common").innerHTML = '<span class="tu-note" style="align-self:center;">Common:</span>' + state.cat.common.map(function (p) {
			var a = unitOf(state.cat, p[0]), b = unitOf(state.cat, p[1]);
			return a && b ? '<button type="button" class="tu-chip" data-f="' + a.id + '" data-t="' + b.id + '">' + esc(a.sym) + " → " + esc(b.sym) + "</button>" : "";
		}).join("");
	}
	function update(skipUrl) {
		var from = unitOf(state.cat, state.from), to = unitOf(state.cat, state.to), v = parseVal(state.val);
		var out = $("uc-out");
		if (isNaN(v)) { out.textContent = "—"; $("uc-formula").textContent = "Enter a number to convert."; }
		else {
			var r = convert(v, from, to);
			out.textContent = plainFmt(r) + " " + to.sym;
			$("uc-formula").textContent = plainFmt(v) + " " + from.sym + " = " + plainFmt(r) + " " + to.sym;
		}
		$("uc-all").querySelector("tbody").innerHTML = state.cat.units.map(function (u) {
			var val = isNaN(v) ? NaN : convert(v, from, u);
			return '<tr data-u="' + u.id + '"' + (u.id === state.to ? ' class="is-active"' : "") + "><td>" + esc(u.name.charAt(0).toUpperCase() + u.name.slice(1)) + "<small>" + esc(u.sym) + '</small></td><td class="uc-val">' + fmt(val, state.dec) + "</td></tr>";
		}).join("");
		if (!skipUrl) { try { history.replaceState(null, "", "?c=" + state.cat.id + "&v=" + encodeURIComponent(state.val) + "&f=" + state.from + "&t=" + state.to); } catch (e) {} }
	}
	function selectCat(cat, from, to, val) {
		state.cat = cat;
		if (!from && !to) { from = cat.common[0][0]; to = cat.common[0][1]; }
		if (from) state.from = from;
		if (to) state.to = to;
		if (val !== undefined) { state.val = val; $("uc-val").value = val; }
		if (!unitOf(cat, state.from)) state.from = cat.common[0][0];
		if (!unitOf(cat, state.to) || state.to === state.from) {
			var pair = cat.common.filter(function (p) { return p[0] === state.from; })[0];
			var other = cat.units.filter(function (u) { return u.id !== state.from; })[0];
			state.to = pair ? pair[1] : other.id;
		}
		Array.prototype.forEach.call($("uc-cats").querySelectorAll(".uc-cat"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-c") === cat.id ? "true" : "false"); });
		fillSelects(); update();
	}

	/* ---------- search ---------- */
	function parseQuick(q) {
		var m = /^\s*([-+]?(?:\d[\d,]*\.?\d*|\.\d+)(?:e[-+]?\d+)?)?\s*(.+?)\s+(?:to|in|into|as|->|→|=>|=)\s+(.+?)\s*$/i.exec(q);
		if (!m) return null;
		var v = m[1] === undefined ? 1 : parseVal(m[1]);
		if (isNaN(v)) return null;
		var A = lookup(m[2]), B = lookup(m[3]);
		for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) if (A[i].cat === B[j].cat && A[i] !== B[j]) return { v: v, a: A[i], b: B[j] };
		return null;
	}
	function search() {
		var q = $("uc-q").value.trim(), quick = $("uc-quick"), matches = $("uc-matches");
		quick.hidden = true; matches.hidden = true;
		if (!q) { renderCats(null); return; }
		var p = parseQuick(q);
		if (p) {
			var r = convert(p.v, p.a, p.b);
			quick.hidden = false;
			quick.innerHTML = '<div class="uc-quick__text">' + esc(fmt(p.v, "auto")) + " " + esc(p.a.sym) + " = " + esc(fmt(r, "auto")) + " " + esc(p.b.sym) + "<small>" + esc(p.a.name) + " → " + esc(p.b.name) + "</small></div>" +
				'<div style="display:flex;gap:0.5em;flex-wrap:wrap;"><button type="button" class="tu-btn tu-btn--primary" data-act="open">Open in converter</button><button type="button" class="tu-btn tu-btn--ghost" data-act="copy">Copy</button></div>';
			quick._p = p; quick._r = r;
			renderCats(null);
			return;
		}
		var k = key(q), found = [], cats = [];
		CATS.forEach(function (c) {
			var hit = false;
			if (key(c.name).indexOf(k) !== -1) { hit = true; }
			c.units.forEach(function (u) {
				var names = [u.id, u.sym, u.name].concat(u.al).map(key);
				if (names.some(function (n) { return n === k || (k.length > 1 && n.indexOf(k) !== -1); })) { found.push(u); hit = true; }
			});
			if (hit) cats.push(c);
		});
		renderCats(cats);
		if (found.length) {
			matches.hidden = false;
			matches.innerHTML = '<span class="tu-note" style="align-self:center;">Units:</span>' + found.slice(0, 14).map(function (u) {
				return '<button type="button" class="tu-chip" data-c="' + u.cat.id + '" data-u="' + u.id + '">' + esc(u.name) + " (" + esc(u.sym) + ") · " + u.cat.name + "</button>";
			}).join("");
		}
	}

	function toast(msg) {
		var t = $("uc-toast");
		if (!t) { t = document.createElement("div"); t.id = "uc-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1300);
	}
	function copy(text, msg) {
		function done() { toast(msg || "Copied"); }
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}

	function init() {
		var q = {};
		try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
		var cat = catById(q.c) || CATS[0];
		if (q.v !== undefined) state.val = q.v;
		renderCats(null);
		state.cat = cat; state.from = q.f || cat.common[0][0]; state.to = q.t || cat.common[0][1];
		$("uc-val").value = state.val;
		Array.prototype.forEach.call($("uc-cats").querySelectorAll(".uc-cat"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-c") === cat.id ? "true" : "false"); });
		fillSelects(); update(true);

		$("uc-cats").addEventListener("click", function (e) { var b = e.target.closest(".uc-cat"); if (b) selectCat(catById(b.getAttribute("data-c"))); });
		$("uc-val").addEventListener("input", function () { state.val = $("uc-val").value; update(); });
		$("uc-from").addEventListener("change", function () { state.from = $("uc-from").value; update(); });
		$("uc-to").addEventListener("change", function () { state.to = $("uc-to").value; update(); });
		$("uc-swap").addEventListener("click", function () {
			var v = parseVal(state.val);
			if (!isNaN(v)) { state.val = String(parseFloat(convert(v, unitOf(state.cat, state.from), unitOf(state.cat, state.to)).toPrecision(10))); $("uc-val").value = state.val; }
			var t = state.from; state.from = state.to; state.to = t; $("uc-from").value = state.from; $("uc-to").value = state.to; update();
		});
		$("uc-dec").addEventListener("change", function () { state.dec = $("uc-dec").value; update(); });
		$("uc-common").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { state.from = b.getAttribute("data-f"); state.to = b.getAttribute("data-t"); $("uc-from").value = state.from; $("uc-to").value = state.to; update(); } });
		$("uc-copy").addEventListener("click", function () { copy($("uc-formula").textContent, "Result copied"); });
		$("uc-link").addEventListener("click", function () { copy(location.href, "Link copied"); });
		$("uc-all").addEventListener("click", function (e) {
			var tr = e.target.closest("tr[data-u]");
			if (!tr) return;
			if (e.target.closest(".uc-val")) { copy(tr.querySelector(".uc-val").textContent.replace(/,/g, ""), "Value copied"); return; }
			state.to = tr.getAttribute("data-u"); $("uc-to").value = state.to; update();
		});
		$("uc-q").addEventListener("input", search);
		$("uc-quick").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var quick = $("uc-quick");
			if (b.getAttribute("data-act") === "copy") copy($("uc-quick").querySelector(".uc-quick__text").firstChild.textContent, "Result copied");
			else { var p = quick._p; $("uc-q").value = ""; search(); selectCat(p.a.cat, p.a.id, p.b.id, fmt(p.v, "auto").replace(/,/g, "")); $("uc-panel").scrollIntoView({ behavior: "smooth", block: "center" }); }
		});
		$("uc-matches").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var c = catById(b.getAttribute("data-c")); $("uc-q").value = ""; search(); selectCat(c, b.getAttribute("data-u"));
			$("uc-panel").scrollIntoView({ behavior: "smooth", block: "center" });
		});
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
