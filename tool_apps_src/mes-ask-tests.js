/* node tool_apps_src/mes-ask-tests.js -- tests for mes.fm/main_js/mes-ask.js ("type it in words") */
var A = require('../mes.fm/main_js/mes-ask.js'), MC = require('./calculator/lib.js');
var pass = 0, fail = 0;
function eq(name, got, want) { var g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); } }
function val(text, want) { var r = A.calc(text); if (!r) { fail++; console.log('FAIL (null)', text); return; } var v = MC.evaluate(r.expr, { deg: true }); if (Math.abs(v - want) < 1e-9 * Math.max(1, Math.abs(want))) pass++; else { fail++; console.log('FAIL', text, '->', r.expr, '=', v, 'want', want); } }
eq('words', A.wordsToNumbers('twenty five plus one hundred and two'), '25 plus 102');
eq('words2', A.wordsToNumbers('three million'), '3000000');
val('what is 38 percent of 75', 28.5);
val('What is 38% of 75?', 28.5);
val('100 multiplied by 84', 8400);
val('one hundred times eighty four', 8400);
val('what is 12 divided by 4', 3);
val('20 is what percent of 80', 25);
val('what percent of 80 is 20', 25);
val('increase 80 by 15 percent', 92);
val('decrease 200 by 10%', 180);
val('15% off 60', 51);
val('percent change from 50 to 75', 50);
val('square root of 144', 12);
val('5 squared plus 3 cubed', 52);
val('2 to the power of 10', 1024);
val('the cube root of 27', 3);
val('subtract 7 from 20', 13);
val('divide 81 by 9', 9);
val('half of 90', 45);
val('average of 2, 4 and 9', 5);
val('sine of 30', 0.5);
val('5 factorial', 120);
val('$1,250 times 3', 3750);
eq('plain expression is left alone', A.calc('2+2'), null);
eq('nonsense', A.calc('hello there'), null);
eq('p1', A.percent('what percent of 80 is 20'), { eq: 1, a: 20, b: 80 });
eq('p1b', A.percent('20 is what % of 80'), { eq: 1, a: 20, b: 80 });
eq('p2', A.percent('what is 38 percent of 75'), { eq: 2, a: 38, b: 75 });
eq('p3', A.percent('15 is 30% of what'), { eq: 3, a: 15, b: 30 });
eq('p4', A.percent('percent change from 50 to 75'), { eq: 4, a: 50, b: 75 });
eq('p5', A.percent('percentage difference between 10 and 12'), { eq: 5, a: 10, b: 12 });
eq('p9', A.percent('increase 80 by 15%'), { eq: 9, a: 80, b: 15 });
eq('p10', A.percent('20% off 60'), { eq: 10, a: 60, b: 20 });
eq('p10b', A.percent('decrease 200 by 10 percent'), { eq: 10, a: 200, b: 10 });
// the translated Percentage Calculator pages: [lang, text, row, A, B]
[
	['es', '¿Cuánto es el 15% de 80?', 2, 15, 80], ['es', 'cuanto es el 15 por ciento de 80', 2, 15, 80], ['es', 'el 12,5 % de 1.200', 2, 12.5, 1200], ['es', 'calcula el 15% de 80 por favor', 2, 15, 80],
	['es', '20 es qué porcentaje de 80', 1, 20, 80], ['es', '¿Qué porcentaje de 80 es 20?', 1, 20, 80], ['es', 'qué porcentaje representa 20 sobre 80', 1, 20, 80], ['es', '20 de 80 en porcentaje', 1, 20, 80],
	['es', '15 es el 30% de qué número', 3, 15, 30], ['es', '¿el 30 % de cuánto es 15?', 3, 15, 30],
	['es', 'variación porcentual de 50 a 75', 4, 50, 75], ['es', 'porcentaje de aumento de 50 a 75', 4, 50, 75], ['es', 'disminución de 80 a 60', 4, 80, 60],
	['es', 'diferencia porcentual entre 50 y 75', 5, 50, 75], ['es', 'porcentaje de diferencia entre 10 y 12', 5, 10, 12],
	['es', '80 x 15%', 7, 80, 15], ['es', '80 por 15 %', 7, 80, 15], ['es', '80 entre 15%', 8, 80, 15], ['es', '80 dividido por 15%', 8, 80, 15],
	['es', 'aumentar 80 en un 15%', 9, 80, 15], ['es', '80 más 15%', 9, 80, 15], ['es', 'sumar el 21% a 100', 9, 100, 21], ['es', 'incrementar 1.500 € en un 3,5%', 9, 1500, 3.5],
	['es', 'disminuir 80 en un 15%', 10, 80, 15], ['es', 'reducir 200 un 10 por ciento', 10, 200, 10], ['es', '80 menos 15%', 10, 80, 15], ['es', 'descuento del 20% sobre 60', 10, 60, 20], ['es', '20% de descuento en 60 €', 10, 60, 20],
	['pt', 'Quanto é 15% de 80?', 2, 15, 80], ['pt', 'quanto são 15 por cento de 80', 2, 15, 80], ['pt', '12,5% de R$ 1.200', 2, 12.5, 1200],
	['pt', '20 é quantos por cento de 80', 1, 20, 80], ['pt', 'qual a porcentagem de 20 em 80', 1, 20, 80], ['pt', 'que porcentagem de 80 é 20', 1, 20, 80], ['pt', 'quantos por cento é 20 de 80', 1, 20, 80],
	['pt', '15 é 30% de quanto', 3, 15, 30], ['pt', '30% de que número é 15', 3, 15, 30],
	['pt', 'variação percentual de 50 para 75', 4, 50, 75], ['pt', 'aumento de 50 para 75', 4, 50, 75], ['pt', 'de 80 para 60', 4, 80, 60],
	['pt', 'diferença percentual entre 50 e 75', 5, 50, 75], ['pt', 'diferença em porcentagem entre 10 e 12', 5, 10, 12],
	['pt', '80 vezes 15%', 7, 80, 15], ['pt', '80 dividido por 15%', 8, 80, 15],
	['pt', 'aumentar 80 em 15%', 9, 80, 15], ['pt', '80 mais 15%', 9, 80, 15], ['pt', 'acrescentar 10% a 250', 9, 250, 10],
	['pt', 'diminuir 80 em 15%', 10, 80, 15], ['pt', 'desconto de 20% em R$ 60', 10, 60, 20], ['pt', '80 menos 15 por cento', 10, 80, 15], ['pt', '20% de desconto em 60', 10, 60, 20],
	['id', 'berapa 15% dari 80', 2, 15, 80], ['id', '15 persen dari 80', 2, 15, 80], ['id', 'Berapakah 12,5% dari Rp 1.200.000?', 2, 12.5, 1200000], ['id', 'hitung 15% dari 80', 2, 15, 80],
	['id', '20 adalah berapa persen dari 80', 1, 20, 80], ['id', 'berapa persen 20 dari 80', 1, 20, 80], ['id', 'berapa persen dari 80 adalah 20', 1, 20, 80], ['id', 'persentase 20 dari 80', 1, 20, 80],
	['id', '15 adalah 30% dari berapa', 3, 15, 30], ['id', '30% dari berapa adalah 15', 3, 15, 30],
	['id', 'perubahan persen dari 50 ke 75', 4, 50, 75], ['id', 'kenaikan dari 50 menjadi 75', 4, 50, 75], ['id', 'persentase penurunan dari 80 ke 60', 4, 80, 60],
	['id', 'selisih persentase antara 50 dan 75', 5, 50, 75], ['id', 'perbedaan persen antara 10 dan 12', 5, 10, 12],
	['id', '80 kali 15%', 7, 80, 15], ['id', '80 dibagi 15%', 8, 80, 15],
	['id', 'naikkan 80 sebesar 15%', 9, 80, 15], ['id', '80 ditambah 15 persen', 9, 80, 15], ['id', 'tambahkan 10% ke 250', 9, 250, 10],
	['id', 'turunkan 80 sebesar 15%', 10, 80, 15], ['id', 'diskon 20% dari 60', 10, 60, 20], ['id', '80 dikurangi 15%', 10, 80, 15], ['id', 'kurangi 200 sebesar 10 persen', 10, 200, 10],
	['fr', 'Combien font 15 % de 80 ?', 2, 15, 80], ['fr', 'calculer 15 pour cent de 80', 2, 15, 80], ['fr', '12,5 % de 1 200 €', 2, 12.5, 1200], ['fr', 'quel est 15% de 80', 2, 15, 80],
	['fr', '20 représente quel pourcentage de 80', 1, 20, 80], ['fr', 'quel pourcentage de 80 est 20', 1, 20, 80], ['fr', 'quel pourcentage représente 20 sur 80', 1, 20, 80], ['fr', '20 sur 80 en pourcentage', 1, 20, 80],
	['fr', '15 représente 30 % de quel nombre', 3, 15, 30], ['fr', '30 % de combien font 15', 3, 15, 30],
	['fr', 'évolution de 50 à 75', 4, 50, 75], ['fr', "taux d'évolution de 50 à 75", 4, 50, 75], ['fr', 'pourcentage de baisse de 80 à 60', 4, 80, 60],
	['fr', 'écart en pourcentage entre 50 et 75', 5, 50, 75], ['fr', 'différence en pourcentage entre 10 et 12', 5, 10, 12],
	['fr', '80 fois 15 %', 7, 80, 15], ['fr', '80 divisé par 15 %', 8, 80, 15],
	['fr', 'augmenter 80 de 15 %', 9, 80, 15], ['fr', '80 plus 15%', 9, 80, 15], ['fr', 'ajouter 20 % à 250', 9, 250, 20],
	['fr', 'diminuer 80 de 15 %', 10, 80, 15], ['fr', 'remise de 20 % sur 60 €', 10, 60, 20], ['fr', '80 moins 15 pour cent', 10, 80, 15], ['fr', 'réduire 200 de 10%', 10, 200, 10],
	['de', 'Wie viel sind 15 % von 80?', 2, 15, 80], ['de', 'was sind 15 Prozent von 80', 2, 15, 80], ['de', '12,5 % von 1.200 €', 2, 12.5, 1200], ['de', 'berechne 15% von 80', 2, 15, 80],
	['de', '20 sind wie viel Prozent von 80', 1, 20, 80], ['de', 'wieviel Prozent sind 20 von 80', 1, 20, 80], ['de', 'wie viel Prozent von 80 sind 20', 1, 20, 80], ['de', '20 von 80 in Prozent', 1, 20, 80],
	['de', '15 sind 30 % von wie viel', 3, 15, 30], ['de', '30 % von welcher Zahl sind 15', 3, 15, 30],
	['de', 'Veränderung von 50 auf 75', 4, 50, 75], ['de', 'prozentuale Steigerung von 50 auf 75', 4, 50, 75], ['de', 'Rückgang von 80 auf 60', 4, 80, 60],
	['de', 'prozentualer Unterschied zwischen 50 und 75', 5, 50, 75], ['de', 'Unterschied in Prozent zwischen 10 und 12', 5, 10, 12],
	['de', '80 mal 15 %', 7, 80, 15], ['de', '80 geteilt durch 15 %', 8, 80, 15],
	['de', '80 um 15 % erhöhen', 9, 80, 15], ['de', '80 plus 15%', 9, 80, 15], ['de', 'erhöhe 250 um 10 Prozent', 9, 250, 10],
	['de', '80 um 15 % verringern', 10, 80, 15], ['de', '20 % Rabatt auf 60 €', 10, 60, 20], ['de', '80 minus 15%', 10, 80, 15], ['de', '200 abzüglich 10 %', 10, 200, 10]
].forEach(function (t) { eq(t[0] + ': ' + t[1], A.percent(t[1], t[0]), { eq: t[2], a: t[3], b: t[4] }); });
['es', 'pt', 'id', 'fr', 'de'].forEach(function (l) {
	eq(l + ': English still works', A.percent('what is 38 percent of 75', l), { eq: 2, a: 38, b: 75 });
	eq(l + ': nonsense', A.percent('hola hello 12', l), null);
});
eq('en unaffected by the new languages', A.percent('cuanto es el 15% de 80'), null);
eq('fr: qu est-ce que', A.percent("Qu'est-ce que 15 % de 80 ?", 'fr'), { eq: 2, a: 15, b: 80 });
eq('a dot before three digits is a thousands separator, 0.125 is not', [A.normLang('1.500 y 0.125', 'es'), A.normLang('1 234,5', 'fr'), A.normLang('1 234,5', 'es')], ['1500 y 0.125', '1234.5', '1 234.5']);
// every example the translated pages show (ASK in build_percentage_translations.py) must be understood
(function () {
	var py = require('fs').readFileSync(require('path').join(__dirname, '..', 'build_percentage_translations.py'), 'utf8'), re = /^"(\w\w)": dict\(label=[\s\S]*?examples=\[([^\]]*)\]/gm, m, seen = 0;
	while ((m = re.exec(py))) { seen++; JSON.parse('[' + m[2] + ']').forEach(function (e) { var r = A.percent(e, m[1]); if (r) pass++; else { fail++; console.log('FAIL page example', m[1], e); } }); }
	eq('examples found for all five languages', seen, 5);
})();
eq('g sphere', A.graph('graph a sphere with radius 7', 3).rows, ['x^2 + y^2 + z^2 = 49']);
eq('g sphere centre', A.graph('plot a sphere of radius 2 centered at (1, -2, 3)', 3).rows, ['(x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 4']);
eq('g cylinder', A.graph('draw a cylinder radius 2 height 5', 3).rows, ['x^2 + y^2 = 4 {0 <= z <= 5}']);
eq('g torus', A.graph('graph a torus', 3).rows[0].indexOf('cos(v)') > 0, true);
eq('g eq3', A.graph('graph z = x^2 - y^2', 3).rows, ['z = x^2 - y^2']);
eq('g eq2', A.graph('plot x squared', 2).rows, ['y = x^2']);
eq('g circle', A.graph('graph a circle with radius 3', 2).rows, ['x^2 + y^2 = 9']);
eq('g line', A.graph('graph the line through (1, 2) and (3, 6)', 2).rows, ['y = 2(x - 1) + 2']);
eq('g sh', A.graph('graph spherical harmonic l=3 m=-2', 3).rows.slice(0, 2), ['l = 3', 'm = -2']);
eq('g none', A.graph('hello', 3), null);
eq('cas diff', A.cas('derivative of x^2 sin x'), { op: 'diff', q: 'x^2 sin x', v: null, said: 'derivative of x^2 sin x' });
eq('cas int', A.cas('integrate x squared from 0 to 1').a, '0');
eq('cas solve', A.cas('solve x^2 - 4 = 0').q, 'x^2 - 4 = 0');
eq('cas units', A.cas('convert 5 km to miles').op, 'units');
eq('cas units2', A.cas('60 mph in km/h').q, '60 mph to km/h');
eq('cas factor', A.cas('factor x^2 - 1').fn, 'factor');
eq('cas limit', A.cas('limit of sin(x)/x as x goes to 0').q, 'limit(sin(x)/x, x, 0)');
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
