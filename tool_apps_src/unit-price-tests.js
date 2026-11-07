// node tool_apps_src/unit-price-tests.js
var P = require('../mes.fm/main_js/unit-price.js'), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log('FAIL', m); } }
function near(a, b, m) { ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), m + ' got ' + a + ' want ' + b); }
var r = P.parse('$3.72 per kilo to per pound'); ok(r && r.kind === 'rate', 'rate kind'); near(r.r, 3.72 * 0.45359237, 'kg->lb'); ok(r.text === '$3.72 per kg = $1.69 per lb', r.text);
near(P.parse('3.72/kg in /lb').r, 3.72 * 0.45359237, 'slash form');
near(P.parse('$3.72 a kg to lb').r, 3.72 * 0.45359237, 'a kg to lb');
near(P.parse('1.99 per pound to per kilo').r, 1.99 / 0.45359237, 'lb->kg');
near(P.parse('$3.89 per gallon to per liter').r, 3.89 / 3.785411784, 'gal->L');
near(P.parse('1.65 per litre in per gallon').r, 1.65 * 3.785411784, 'L->gal');
near(P.parse('$1.65/L to /gal').r, 1.65 * 3.785411784, 'L->gal slash');
near(P.parse('€2 per 100g to per kg').r, 20, '100g->kg'); ok(P.parse('€2 per 100g to per kg').cur === '€', 'euro');
near(P.parse('What is $12 per square foot to per square metre?').r, 12 / 0.09290304, 'area');
near(P.parse('$4.99 per yard to per meter').r, 4.99 / 0.9144, 'length');
var p = P.parse('$5.49 for 2 lb'); ok(p && p.kind === 'pack', 'pack'); near(p.base, 5.49 / (2 * 0.45359237), 'pack base');
p = P.parse('750 g for $3.99'); ok(p && p.kind === 'pack', 'pack 2'); near(p.base, 3.99 / 0.75, 'pack2 base');
p = P.parse('3 for $5'); ok(p && p.kind === 'pack', 'count pack'); near(p.base, 5 / 3, 'count');
var c = P.parse('$5.49 for 2 lb vs $3.99 for 750 g'); ok(c && c.kind === 'compare' && c.cheaper === 1, 'compare ' + (c && c.text));
c = P.parse('$4 for 1 gal vs $1.10 for 1 L'); ok(c && c.cheaper === 0, 'compare vol');
c = P.parse('$4 for 1 gal vs $3 for 1 lb'); ok(c && c.error, 'compare mismatch');
var k = P.parse('2.5 lb at $3.72 per kg'); ok(k && k.kind === 'cost', 'cost'); near(k.total, 3.72 * 2.5 * 0.45359237, 'cost total');
ok(P.parse('10 miles to km') === null, 'plain conversion is not a price');
ok(P.parse('2 lb') === null, 'bare amount');
ok(P.parse('38 percent of 75') === null, 'percent');
ok(P.parse('5 * 3') === null, 'arith');
console.log(bad ? bad + ' of ' + n + ' failed' : 'all ' + n + ' passed');
process.exit(bad ? 1 : 0);
