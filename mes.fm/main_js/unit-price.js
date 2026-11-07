/* MES Unit Price -- grocery / produce price maths typed in words (no AI service, nothing leaves the browser).
 *   MESUnitPrice.parse("$3.72 per kilo to per pound")   -> {kind: "rate", v: 3.72, a: kg, b: lb, r: 1.687..., cur: "$", ...}
 *   MESUnitPrice.parse("3.72/kg in /lb")                 -> same
 *   MESUnitPrice.parse("$5.49 for 2 lb")                 -> {kind: "pack", price, qty, u, per: [[unit, price per unit] ...]}
 *   MESUnitPrice.parse("$5.49 for 2 lb vs $3.99 for 750 g") -> {kind: "compare", items: [...], cheaper: 0|1, pct, ...}
 *   MESUnitPrice.parse("2.5 lb at $3.72 per kg")         -> {kind: "cost", total ...}
 * Each result has .text (one line answer), .lines (details) and .expr (a calculator expression giving the main number).
 * Returns null when the text isn't a price question. Used by mes.fm/unit-conversion and mes.fm/calculator.
 * Works in node: require('./mes.fm/main_js/unit-price.js'). Tests: node tool_apps_src/unit-price-tests.js */
(function (root) {
	'use strict';
	// dim: m = mass (kg), v = volume (L), l = length (m), a = area (m²), n = count (each)
	var UNITS = [
		['mg', 'm', 1e-6, 'mg', 'milligram', ['milligrams']],
		['g', 'm', 1e-3, 'g', 'gram', ['grams', 'gm', 'gr', 'gramme', 'grammes']],
		['100g', 'm', 0.1, '100 g', '100 grams', ['100 g', '100 grams', '100gr']],
		['kg', 'm', 1, 'kg', 'kilogram', ['kilograms', 'kilo', 'kilos', 'kgs', 'kilogramme']],
		['oz', 'm', 0.028349523125, 'oz', 'ounce', ['ounces']],
		['lb', 'm', 0.45359237, 'lb', 'pound', ['pounds', 'lbs', 'pnd']],
		['st', 'm', 6.35029318, 'st', 'stone', ['stones']],
		['t', 'm', 1000, 't', 'tonne', ['tonnes', 'metric ton', 'metric tons']],
		['ton', 'm', 907.18474, 'ton', 'US ton', ['tons', 'short ton', 'short tons']],
		['ml', 'v', 1e-3, 'mL', 'millilitre', ['milliliter', 'millilitres', 'milliliters', 'mls']],
		['cl', 'v', 1e-2, 'cL', 'centilitre', ['centiliter']],
		['100ml', 'v', 0.1, '100 mL', '100 millilitres', ['100 ml', '100 milliliters']],
		['l', 'v', 1, 'L', 'litre', ['liter', 'litres', 'liters', 'ltr', 'lt']],
		['floz', 'v', 0.0295735295625, 'fl oz', 'US fluid ounce', ['fl oz', 'fluid ounce', 'fluid ounces', 'floz']],
		['cup', 'v', 0.2365882365, 'cup', 'US cup', ['cups']],
		['pt', 'v', 0.473176473, 'pt', 'US pint', ['pint', 'pints']],
		['qt', 'v', 0.946352946, 'qt', 'US quart', ['quart', 'quarts']],
		['gal', 'v', 3.785411784, 'gal', 'US gallon', ['gallon', 'gallons', 'gals']],
		['ukgal', 'v', 4.54609, 'UK gal', 'UK gallon', ['uk gallon', 'imperial gallon', 'uk gallons', 'imperial gallons']],
		['mm', 'l', 1e-3, 'mm', 'millimetre', ['millimeter', 'millimetres', 'millimeters']],
		['cm', 'l', 1e-2, 'cm', 'centimetre', ['centimeter', 'centimetres', 'centimeters']],
		['m', 'l', 1, 'm', 'metre', ['meter', 'metres', 'meters']],
		['km', 'l', 1000, 'km', 'kilometre', ['kilometer', 'kilometres', 'kilometers']],
		['in', 'l', 0.0254, 'in', 'inch', ['inches']],
		['ft', 'l', 0.3048, 'ft', 'foot', ['feet']],
		['yd', 'l', 0.9144, 'yd', 'yard', ['yards']],
		['mi', 'l', 1609.344, 'mi', 'mile', ['miles']],
		['m2', 'a', 1, 'm²', 'square metre', ['sq m', 'sqm', 'square meter', 'square metres', 'square meters', 'm^2', 'm²']],
		['ft2', 'a', 0.09290304, 'ft²', 'square foot', ['sq ft', 'sqft', 'square feet', 'ft^2', 'ft²']],
		['yd2', 'a', 0.83612736, 'yd²', 'square yard', ['sq yd', 'square yards', 'yd^2', 'yd²']],
		['ac', 'a', 4046.8564224, 'acre', 'acre', ['acres']],
		['ha', 'a', 10000, 'ha', 'hectare', ['hectares']],
		['ea', 'n', 1, 'each', 'each', ['item', 'items', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'one', 'count', 'ct']],
		['dz', 'n', 12, 'dozen', 'dozen', ['dozens', 'doz']],
		['pr', 'n', 2, 'pair', 'pair', ['pairs']]
	].map(function (r) { return { id: r[0], dim: r[1], f: r[2], sym: r[3], name: r[4], al: r[5] }; });
	var BY = {};
	function key(s) { return String(s).toLowerCase().replace(/[\s.\-]/g, ''); }
	UNITS.forEach(function (u) { [u.id, u.sym, u.name, u.name + 's'].concat(u.al).forEach(function (a) { if (!BY[key(a)]) BY[key(a)] = u; }); });
	function unit(s) {
		var k = key(s); if (!k) return null;
		return BY[k] || (k.slice(-1) === 's' && BY[k.slice(0, -1)]) || (k.slice(-2) === 'es' && BY[k.slice(0, -2)]) || null;
	}
	// what each dimension's answer lists
	var SHOW = { m: ['kg', 'lb', '100g', 'oz'], v: ['l', 'gal', '100ml', 'floz'], l: ['m', 'ft', 'yd', 'cm'], a: ['m2', 'ft2', 'yd2', 'ac'], n: ['ea', 'dz'] };
	function U(id) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i]; return null; }

	var CUR = '(?:\\$|US\\$|C\\$|CA\\$|A\\$|NZ\\$|€|£|¥|₫|₹|₩|₱|฿|R\\$|kr|CHF|USD|CAD|AUD|EUR|GBP|VND|JPY|INR)';
	var NUM = '(\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)';
	var PRICE = '(' + CUR + ')?\\s*' + NUM + '\\s*(' + CUR + '|dollars?|bucks|cents?|euros?|pounds sterling|dong)?';
	function num(s) {
		s = String(s);
		if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(',', '.');
		return parseFloat(s);
	}
	function priceOf(cur, n, after) {
		var v = num(n), c = cur || '';
		if (after) { var a = after.toLowerCase(); if (/^cents?$/.test(a)) v = v / 100, c = c || '$'; else if (/^dollars?|bucks$/.test(a)) c = c || '$'; else if (/^euros?$/.test(a)) c = '€'; else if (/sterling/.test(a)) c = '£'; else if (a === 'dong') c = '₫'; else c = c || after; }
		return { v: v, cur: c };
	}
	function money(v, cur) {
		var d = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.1 ? 3 : 4;
		if (/₫|VND|¥|JPY|₩/.test(cur || '')) d = Math.abs(v) >= 100 ? 0 : d;
		var s = v.toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
		if (!cur) return s;
		return /^[A-Z]{3}$|^kr$|^CHF$/.test(cur) ? s + ' ' + cur : cur + s;
	}
	function nfmt(v) { return parseFloat(v.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 }); }
	function perLabel(u) { return u.dim === 'n' ? (u.id === 'ea' ? 'each' : 'per ' + u.sym) : 'per ' + u.sym; }
	// unit-word pattern: up to 3 words, no digits except the "100 g" forms
	var UW = '((?:100\\s?(?:g|grams?|ml|millilit(?:re|er)s?))|(?!(?:for|at|costs?|is|vs|or)\\b)[a-zµ²^2\\.]+(?:\\s[a-z²^2]+){0,2}?)';
	var PER = '(?:per|a|an|each|every|/|for\\s+(?:a|an|one|each|1))';

	function clean(t) {
		return String(t || '').toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').replace(/^(?:what(?:'s| is)|how much is|convert|change|calculate|find)\s+/, '')
			.replace(/[?!]+$/, '').replace(/\s*\/\s*/g, ' / ').trim();
	}
	function rate(t) {
		// "$3.72 per kilo to per pound", "3.72/kg in /lb", "$3.72 a kg to lb", "3.72 dollars per kilogram in dollars per pound"
		var re = new RegExp('^' + PRICE + '\\s*' + PER + '\\s*' + UW + '\\s+(?:to|in|into|as|=|->|→)\\s+(?:' + CUR + '|dollars?|euros?)?\\s*(?:' + PER + '\\s*)?' + UW + '$', 'i');
		var m = re.exec(t); if (!m) return null;
		var p = priceOf(m[1], m[2], m[3]), a = unit(m[4]), b = unit(m[5]);
		if (!a || !b || a.dim !== b.dim || isNaN(p.v)) return null;
		var r = p.v * b.f / a.f;
		var res = { kind: 'rate', v: p.v, cur: p.cur, a: a, b: b, r: r, expr: nfmt(p.v) + ' * ' + String(b.f / a.f) };
		res.text = money(p.v, p.cur) + ' ' + perLabel(a) + ' = ' + money(r, p.cur) + ' ' + perLabel(b);
		res.lines = SHOW[a.dim].map(U).filter(function (u) { return u !== a && u !== b; }).map(function (u) { return '= ' + money(p.v * u.f / a.f, p.cur) + ' ' + perLabel(u); });
		res.lines.push('1 ' + b.sym + ' = ' + nfmt(b.f / a.f) + ' ' + a.sym + ', so multiply by ' + nfmt(b.f / a.f));
		return res;
	}
	// "$5.49 for 2 lb", "2 lb for $5.49", "750 g $3.99", "3 for $5", "$4.99 a dozen"
	function packOf(s) {
		var m, p, q, u;
		if ((m = new RegExp('^' + PRICE + '\\s*(?:for|/|per|a|an)?\\s*' + NUM + '?\\s*' + UW + '$', 'i').exec(s))) { p = priceOf(m[1], m[2], m[3]); q = m[4] ? num(m[4]) : 1; u = unit(m[5]); }
		else if ((m = new RegExp('^' + NUM + '\\s*' + UW + '?\\s*(?:for|at|=|costs?|is)?\\s*' + PRICE + '$', 'i').exec(s))) { q = num(m[1]); u = m[2] ? unit(m[2]) : U('ea'); p = priceOf(m[3], m[4], m[5]); }
		if (!m || !u || !p || isNaN(p.v) || !(q > 0)) return null;
		if (m[1] === undefined && !m[3] && !/for|at|costs?|is/.test(s)) { /* a plain "750 g 3.99" is ok; nothing else needed */ }
		return { price: p.v, cur: p.cur, qty: q, u: u, base: p.v / (q * u.f) };   // base = price per kg / L / m / m² / each
	}
	function pack(t) {
		if (!/\d/.test(t) || /\b(to|in|into|vs|versus|or)\b/.test(t.replace(/\b(?:per|for)\b.*$/, ''))) return null;
		var k = packOf(t); if (!k || (k.qty === 1 && k.u.dim === 'n' && !/for|dozen|pair/.test(t))) return null;
		if (!/(for|at|costs?|is)\b/.test(t) && !(new RegExp(CUR).test(t))) return null;   // "2 lb" alone is a conversion, not a price
		var res = { kind: 'pack', price: k.price, cur: k.cur, qty: k.qty, u: k.u, base: k.base };
		var main = k.qty === 1 ? null : k.u;
		res.per = SHOW[k.u.dim].map(U).map(function (u) { return [u, k.base * u.f]; });
		if (main && SHOW[k.u.dim].indexOf(main.id) === -1) res.per.unshift([main, k.base * main.f]);
		res.text = money(k.price, k.cur) + ' for ' + nfmt(k.qty) + ' ' + k.u.sym + ' = ' + res.per.slice(0, 2).map(function (x) { return money(x[1], k.cur) + ' ' + perLabel(x[0]); }).join(' = ');
		res.lines = res.per.slice(2).map(function (x) { return '= ' + money(x[1], k.cur) + ' ' + perLabel(x[0]); });
		res.expr = nfmt(k.price) + ' / ' + nfmt(k.qty);
		return res;
	}
	function compare(t) {
		var parts = t.split(/\s+(?:vs\.?|versus|or|compared to|compare with|and)\s+|\s*;\s*|\s*\|\s*/);
		if (parts.length < 2) return null;
		var items = parts.map(function (s) { return packOf(s.replace(/^(?:compare|which is cheaper:?|cheaper:?)\s+/, '').trim()); });
		if (items.some(function (x) { return !x; })) return null;
		var dim = items[0].u.dim;
		if (items.some(function (x) { return x.u.dim !== dim; })) return { kind: 'compare', error: 'Those amounts can\'t be compared (one is a weight, the other a volume / length / count).', items: items };
		var best = 0; items.forEach(function (x, i) { if (x.base < items[best].base) best = i; });
		var worst = 0; items.forEach(function (x, i) { if (x.base > items[worst].base) worst = i; });
		var show = U(SHOW[dim][0]), alt = U(SHOW[dim][1]), cur = items[0].cur || items[1].cur;
		var pct = (items[worst].base - items[best].base) / items[worst].base * 100;
		var res = { kind: 'compare', items: items, cheaper: best, pct: pct, unit: show, cur: cur };
		var L = String.fromCharCode(65);
		res.lines = items.map(function (x, i) { return String.fromCharCode(65 + i) + ': ' + money(x.price, x.cur || cur) + ' for ' + nfmt(x.qty) + ' ' + x.u.sym + ' = ' + money(x.base * show.f, x.cur || cur) + ' ' + perLabel(show) + ' (' + money(x.base * alt.f, x.cur || cur) + ' ' + perLabel(alt) + ')'; });
		res.text = pct < 0.05 ? 'Same price per ' + show.sym : String.fromCharCode(65 + best) + ' is cheaper: ' + nfmt(Math.round(pct * 10) / 10) + '% less per ' + show.sym + (items.length === 2 ? ' (saves ' + money((items[worst].base - items[best].base) * show.f, cur) + ' ' + perLabel(show) + ')' : '');
		res.expr = nfmt(items[best].base * show.f);
		return res;
	}
	// "2.5 lb at $3.72 per kg", "how much is 750 g at $8.99/kg", "3 kg at 1.99 a pound"
	function cost(t) {
		var re = new RegExp('^' + NUM + '\\s*' + UW + '\\s+(?:at|@|for|costs?)\\s+' + PRICE + '\\s*' + PER + '\\s*' + UW + '$', 'i');
		var m = re.exec(t); if (!m) return null;
		var q = num(m[1]), u = unit(m[2]), p = priceOf(m[3], m[4], m[5]), pu = unit(m[6]);
		if (!u || !pu || u.dim !== pu.dim) return null;
		var total = p.v * q * u.f / pu.f;
		return { kind: 'cost', total: total, cur: p.cur, text: nfmt(q) + ' ' + u.sym + ' at ' + money(p.v, p.cur) + ' ' + perLabel(pu) + ' = ' + money(total, p.cur),
			lines: [nfmt(q) + ' ' + u.sym + ' = ' + nfmt(q * u.f / pu.f) + ' ' + pu.sym], expr: nfmt(p.v) + ' * ' + String(q * u.f / pu.f) };
	}
	function parse(text) {
		var t = clean(text); if (!t || !/\d/.test(t)) return null;
		return rate(t) || cost(t) || compare(t) || pack(t) || null;
	}
	var API = { parse: parse, unit: unit, UNITS: UNITS, money: money };
	if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MESUnitPrice = API;
})(typeof window !== 'undefined' ? window : this);
