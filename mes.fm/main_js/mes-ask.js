/* MES Ask -- "type it in words" for the calculators (no AI service, nothing leaves the browser).
 * Turns plain-English requests into what each MES calculator understands:
 *   MESAsk.calc("what is 38 percent of 75")        -> {expr: "38% of 75", said: "38% of 75"}
 *   MESAsk.percent("what percent of 80 is 20")      -> {eq: 1, a: 20, b: 80}   (rows of mes.fm/percentagecalculator)
 *   MESAsk.percent("cuánto es el 15 % de 80", "es") -> {eq: 2, a: 15, b: 80}   (es, pt, id, fr, de: the translated pages; English also works there)
 *   MESAsk.graph("graph a sphere with radius 7", 3) -> {rows: ["x^2 + y^2 + z^2 = 49"], dom: [...], said: ...}
 *   MESAsk.cas("derivative of x^2 sin x")           -> {op: "diff", q: "x^2 sin x", said: ...}
 * Each returns null when the text doesn't look like a request it knows, so the page can fall back to its normal parser.
 * Works in node too: require('./mes.fm/main_js/mes-ask.js'). Tests: node tool_apps_src/mes-ask-tests.js */
(function (root) {
	'use strict';

	/* ---------- number words ---------- */
	var ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
		fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
	var TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
	var SCALES = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
	var FRACW = { half: 0.5, halves: 0.5, third: 1 / 3, thirds: 1 / 3, quarter: 0.25, quarters: 0.25, fourth: 0.25, fourths: 0.25, fifth: 0.2, fifths: 0.2, tenth: 0.1, tenths: 0.1 };
	function wordsToNumbers(s) {
		// "twenty five" -> 25, "one hundred and two" -> 102, "3 million" -> 3000000, "a half" stays (handled by callers)
		var re = /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|\d+(?:\.\d+)?)(?:[\s-]+(?:and[\s-]+)?(?=(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion)\b))?)+)\b/gi;
		return s.replace(re, function (m) {
			var parts = m.toLowerCase().split(/[\s-]+/).filter(function (w) { return w && w !== 'and'; });
			if (parts.length === 1 && /^\d/.test(parts[0])) return m;
			var total = 0, cur = 0, any = false;
			for (var i = 0; i < parts.length; i++) {
				var w = parts[i];
				if (/^\d/.test(w)) { cur += parseFloat(w); any = true; }
				else if (ONES.hasOwnProperty(w)) { cur += ONES[w]; any = true; }
				else if (TENS.hasOwnProperty(w)) { cur += TENS[w]; any = true; }
				else if (w === 'hundred') { cur = (cur || 1) * 100; any = true; }
				else if (SCALES.hasOwnProperty(w)) { total += (cur || 1) * SCALES[w]; cur = 0; any = true; }
				else return m;
			}
			return any ? String(total + cur) : m;
		});
	}

	var NUM = '(-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?)';
	function clean(text) {
		var s = String(text || '').trim().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[−–—]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
		s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');                    // 1,234 -> 1234
		s = s.replace(/\$\s?(\d)/g, '$1');                             // $50 -> 50
		s = wordsToNumbers(s);
		s = s.replace(/\s+/g, ' ').replace(/[?!]+$/, '').replace(/\.$/, '').trim();
		return s;
	}
	function lead(s) {                                               // strip polite / question openers
		return s.replace(/^(?:hey |ok |okay |please |pls |can you |could you |would you |i want to |i need to |help me |tell me |show me |find |calculate |compute |work out |figure out |evaluate |solve for me |what(?:'s| is| are| does| do)? |how much is |how many is |whats )+/i, '').replace(/\b(?:please|for me|thanks|thank you)\b/gi, '').replace(/\s+/g, ' ').replace(/[ ,=]+$/, '').trim();
	}
	function n(x) { return parseFloat(x); }
	function fmtN(x) { return String(+(+x).toPrecision(12)); }

	/* ---------- arithmetic in words -> expression for mes.fm/calculator ---------- */
	var OPS = [
		[/\bmultiplied by\b|\btimes\b|\bmultiply by\b|\bx(?=\s*\d)/gi, '*'],
		[/\bdivided by\b|\bdivide by\b|\bover\b|\bper\b/gi, '/'],
		[/\bplus\b|\badded to\b|\band\b(?=\s*-?\d)/gi, '+'],
		[/\bminus\b|\bless\b(?! than)/gi, '-'],
		[/\bto the power of\b|\braised to(?: the power(?: of)?)?\b|\bto the\b(?=\s*\d)/gi, '^'],
		[/\bmod(?:ulo)?\b/gi, ' mod '],
		[/\bpercent\b|\bper cent\b|\bpct\b/gi, '%']
	];
	function calc(text) {
		var s = lead(clean(text)).toLowerCase(), s0;
		if (!s || !/\d|\bpi\b|π/.test(s)) return null;
		var m; s0 = s;
		// "x percent of y", "x% of y"
		if ((m = new RegExp('^' + NUM + '\\s*(?:%|percent|per cent)\\s*of\\s*' + NUM + '$').exec(s))) return out(m[1] + '% of ' + m[2]);
		// "x is what percent of y" / "what percent of y is x"
		if ((m = new RegExp('^' + NUM + ' is what (?:%|percent(?:age)?) of ' + NUM + '$').exec(s)) || (m = new RegExp('^(?:what )?(?:%|percent(?:age)?) of ' + NUM + ' is ' + NUM + '$').exec(s)))
			return /of (\S+) is/.test(s) ? out('(' + m[2] + ' / ' + m[1] + ') * 100', '%') : out('(' + m[1] + ' / ' + m[2] + ') * 100', '%');
		// "increase 80 by 15 percent", "80 plus 15 percent", "decrease 80 by 15%"
		if ((m = new RegExp('^(increase|raise|add) ' + NUM + ' by ' + NUM + '\\s*(?:%|percent)$').exec(s))) return out(m[2] + ' + ' + m[3] + '%');
		if ((m = new RegExp('^(decrease|reduce|lower|discount|take) ' + NUM + ' by ' + NUM + '\\s*(?:%|percent)(?: off)?$').exec(s))) return out(m[2] + ' - ' + m[3] + '%');
		if ((m = new RegExp('^' + NUM + '\\s*(?:%|percent) off(?: of)? ' + NUM + '$').exec(s))) return out(m[2] + ' - ' + m[1] + '%');
		// "percent change from a to b"
		if ((m = new RegExp('^(?:the )?(?:percent(?:age)? )?(?:change|increase|decrease|difference) from ' + NUM + ' to ' + NUM + '$').exec(s))) return out('(' + m[2] + ' - ' + m[1] + ') / ' + m[1] + ' * 100', '%');
		// roots / powers in words
		s = s.replace(/\b(?:the )?cube root of\b/g, 'cbrt ').replace(/\b(\d+)(?:st|nd|rd|th) root of (\S+)/g, 'root($1, $2)').replace(/\b(?:the )?(?:square root|sqrt|root) of\b/g, 'sqrt ');
		s = s.replace(/(\S+) squared\b/g, '$1^2').replace(/(\S+) cubed\b/g, '$1^3');
		s = s.replace(/\b(\d+)(?:st|nd|rd|th) root of (\S+)/g, 'root($1, $2)');
		s = s.replace(/\bfactorial of (\S+)/g, '$1!').replace(/(\d+) factorial\b/g, '$1!');
		s = s.replace(/\b(?:sum|total) of ([\d.\s,and]+)$/, function (_, l) { return l.replace(/\s*(?:,|and)\s*/g, ' + '); });
		s = s.replace(/\b(?:average|mean) of ([\d.\s,and]+)$/, function (_, l) { return 'avg(' + l.trim().split(/\s*(?:,|and|\s)\s*/).filter(Boolean).join(', ') + ')'; });
		s = s.replace(/\b(?:the )?(sine|cosine|tangent|sin|cos|tan|log|ln) of (\S+)/g, function (_, f, x) { return { sine: 'sin', cosine: 'cos', tangent: 'tan' }[f] ? { sine: 'sin', cosine: 'cos', tangent: 'tan' }[f] + '(' + x + ')' : f + '(' + x + ')'; });
		s = s.replace(/\bdegrees?\b/g, '');
		// "subtract a from b" / "divide a by b" / "multiply a by b" / "add a to b" / "a into b"
		if ((m = new RegExp('^subtract ' + NUM + ' from ' + NUM + '$').exec(s))) return out(m[2] + ' - ' + m[1]);
		if ((m = new RegExp('^add ' + NUM + ' (?:to|and) ' + NUM + '$').exec(s))) return out(m[1] + ' + ' + m[2]);
		if ((m = new RegExp('^multiply ' + NUM + ' (?:by|and|with) ' + NUM + '$').exec(s))) return out(m[1] + ' * ' + m[2]);
		if ((m = new RegExp('^divide ' + NUM + ' (?:by|into) ' + NUM + '$').exec(s))) return out(m[1] + ' / ' + m[2]);
		if ((m = new RegExp('^(?:the )?(?:product) of ' + NUM + ' and ' + NUM + '$').exec(s))) return out(m[1] + ' * ' + m[2]);
		if ((m = new RegExp('^(?:the )?(?:quotient) of ' + NUM + ' and ' + NUM + '$').exec(s))) return out(m[1] + ' / ' + m[2]);
		if ((m = new RegExp('^(?:the )?(?:difference) (?:of|between) ' + NUM + ' and ' + NUM + '$').exec(s))) return out(m[1] + ' - ' + m[2]);
		if ((m = new RegExp('^half of ' + NUM + '$').exec(s))) return out(m[1] + ' / 2');
		if ((m = new RegExp('^(?:a )?(third|quarter|fifth|tenth) of ' + NUM + '$').exec(s))) return out(m[2] + ' * ' + fmtN(FRACW[m[1]]));
		if ((m = new RegExp('^(double|twice|triple) ' + NUM + '$').exec(s))) return out(m[2] + ' * ' + (m[1] === 'triple' ? 3 : 2));
		var e = s;
		OPS.forEach(function (o) { e = e.replace(o[0], o[1]); });
		e = e.replace(/\s+/g, ' ').trim();
		if (e === s0 && !/[a-z]{3,}/.test(s0.replace(/\b(sqrt|cbrt|root|sin|cos|tan|log|ln|avg|pi|mod|of|e)\b/g, ''))) return null;   // no words translated: let the normal parser take it
		if (/[a-z]{3,}/.test(e.replace(/\b(sqrt|cbrt|root|sin|cos|tan|asin|acos|atan|log|ln|exp|avg|pi|mod|of|abs|round|floor|ceil|fact)\b/g, ''))) return null;   // words we don't understand
		return out(e);
		function out(x, unit) { return { expr: x, unit: unit || '', said: x }; }
	}

	/* ---------- the ten rows of mes.fm/percentagecalculator ---------- */
	// eq 1: A is what % of B | 2: what is A % of B | 3: A is B % of what | 4: % change from A to B | 5: % difference between A and B
	// eq 7: A x B % | 8: A / B % | 9: increase A by B % | 10: decrease A by B %
	function percent(text, lang) {
		if (lang && lang !== 'en') { var rl = percentLang(text, lang); if (rl) return rl; }    // then the English phrasings, which work on every page
		var s = lead(clean(text)).toLowerCase().replace(/\bper cent\b|\bpercentage\b/g, 'percent').replace(/\s*%/g, ' percent').replace(/\s+/g, ' '), m;
		var P = ' ?percent';
		function r(eq, a, b) { return { eq: eq, a: n(a), b: n(b) }; }
		if ((m = new RegExp('^' + NUM + ' is what percent of ' + NUM + '$').exec(s))) return r(1, m[1], m[2]);
		if ((m = new RegExp('^(?:what )?percent of ' + NUM + ' is ' + NUM + '$').exec(s))) return r(1, m[2], m[1]);
		if ((m = new RegExp('^' + NUM + ' (?:out )?of ' + NUM + ' (?:as a|in) percent$').exec(s))) return r(1, m[1], m[2]);
		if ((m = new RegExp('^' + NUM + P + ' of ' + NUM + '$').exec(s))) return r(2, m[1], m[2]);
		if ((m = new RegExp('^' + NUM + ' is ' + NUM + P + ' of what$').exec(s)) || (m = new RegExp('^' + NUM + P + ' of what (?:number )?is ' + NUM + '$').exec(s)))
			return /of what/.test(s) && /^\S+ percent/.test(s) ? r(3, m[2], m[1]) : r(3, m[1], m[2]);
		if ((m = new RegExp('^(?:the )?percent (?:change|increase|decrease) from ' + NUM + ' to ' + NUM + '$').exec(s)) || (m = new RegExp('^(?:increase|decrease|change) from ' + NUM + ' to ' + NUM + '$').exec(s))) return r(4, m[1], m[2]);
		if ((m = new RegExp('^(?:the )?percent difference between ' + NUM + ' and ' + NUM + '$').exec(s))) return r(5, m[1], m[2]);
		if ((m = new RegExp('^(?:increase|raise|add) ' + NUM + ' by ' + NUM + P + '$').exec(s)) || (m = new RegExp('^' + NUM + ' plus ' + NUM + P + '$').exec(s))) return r(9, m[1], m[2]);
		if ((m = new RegExp('^(?:decrease|reduce|lower|discount) ' + NUM + ' by ' + NUM + P + '$').exec(s)) || (m = new RegExp('^' + NUM + ' minus ' + NUM + P + '$').exec(s))) return r(10, m[1], m[2]);
		if ((m = new RegExp('^' + NUM + P + ' off(?: of)? ' + NUM + '$').exec(s))) return r(10, m[2], m[1]);
		if ((m = new RegExp('^' + NUM + ' (?:times|x|\\*) ' + NUM + P + '$').exec(s))) return r(7, m[1], m[2]);
		if ((m = new RegExp('^' + NUM + ' (?:divided by|/) ' + NUM + P + '$').exec(s))) return r(8, m[1], m[2]);
		return null;
	}

	/* ---------- the same ten rows in Spanish, Portuguese, Indonesian, French and German (the translated Percentage Calculator pages) ---------- */
	// MESAsk.percent(text, 'es' | 'pt' | 'id' | 'fr' | 'de'). Accents are ignored (cuanto = cuánto), decimal commas are read (12,5 = 12.5;
	// 1.234,5 and 1 234 = thousands), "por ciento", "por cento", "persen", "pour cent", "Prozent" mean %. Numbers must be written in digits.
	// Each rule = [row, 'ab' | 'ba' (which number is A), pattern]; in a pattern # = a number and % = an optional space + "%". First match wins.
	var LRULES = {
		es: [
			[1, 'ab', '# (?:es|son|representa|representan|supone) (?:que|cual|cuanto|cuantos) (?:%|porcentaje|tanto ?%) (?:de|del|sobre|respecto a|respecto de) #'],
			[1, 'ab', '(?:que|cual es el|cual|cuanto|cuantos) (?:%|porcentaje|tanto ?%) (?:es|son|representa|representan|supone) # (?:de|del|sobre|respecto a|en) #'],
			[1, 'ba', '(?:que|cual es el|cual|cuanto|cuantos) (?:%|porcentaje) de # (?:es|son|representa|representan) #'],
			[1, 'ab', '(?:el )?porcentaje de # (?:sobre|en|respecto a|respecto de) #'],
			[1, 'ab', '# (?:de|sobre) # en (?:%|porcentaje)'],
			[3, 'ab', '# (?:es|son|representa|representan) (?:el |un )?#% (?:de|del) (?:que numero|que cantidad|que|cual numero|cual|cuanto)'],
			[3, 'ba', '(?:el |un )?#% (?:de|del) (?:que numero|que cantidad|que|cual numero|cuanto) (?:es|son|da|seria) #'],
			[5, 'ab', '(?:la )?diferencia (?:porcentual|en %|en porcentaje|%) entre # y #'],
			[5, 'ab', '(?:el )?(?:%|porcentaje) de diferencia entre # y #'],
			[2, 'ab', '(?:(?:cuanto|cual|que) (?:es|son|seria|serian|da) )?(?:el |un )?#% (?:de|del) #'],
			[4, 'ab', '(?:la |el |una? )?(?:variacion|cambio|aumento|disminucion|incremento|descenso|reduccion|subida|bajada|crecimiento)(?: porcentual| en %| en porcentaje| %)? (?:de|desde|del) # (?:a|al|hasta) #'],
			[4, 'ab', '(?:el |la )?(?:%|porcentaje|tasa) de (?:variacion|cambio|aumento|disminucion|incremento|descenso|reduccion|crecimiento) (?:de|desde|del) # (?:a|al|hasta) #'],
			[4, 'ab', '(?:de|desde) # (?:a|hasta) #'],
			[9, 'ab', '(?:aumentar|aumenta|aumente|aumentale|incrementar|incrementa|incremente|subir|sube|suba|sumar|suma|sumale|anadir) (?:a )?# (?:en )?(?:un |el )?#%'],
			[9, 'ab', '# (?:\\+|mas) (?:un |el )?#%'],
			[9, 'ba', '(?:sumar|suma|sumale|anadir|anade|agregar|agrega|aplicar|aplica) (?:un |el )?#% (?:a|al) #'],
			[9, 'ab', '# con (?:un )?(?:aumento|incremento|recargo) (?:del|de un|de) #%'],
			[10, 'ab', '(?:disminuir|disminuye|disminuya|reducir|reduce|reduzca|rebajar|rebaja|bajar|baja|descontar|descuenta) (?:a )?# (?:en )?(?:un |el )?#%'],
			[10, 'ab', '# (?:-|menos) (?:un |el )?#%'],
			[10, 'ba', '(?:restar|resta|restale|quitar|quita|quitale|descontar|descuenta) (?:un |el )?#% (?:a|al|de|del) #'],
			[10, 'ba', '(?:un |el )?(?:descuento|rebaja) (?:del|de un|de) #% (?:a|al|en|sobre|de) #'],
			[10, 'ba', '(?:un |el )?#% de (?:descuento|rebaja) (?:a|al|en|sobre|de) #'],
			[10, 'ab', '# con (?:un )?(?:descuento|rebaja) (?:del|de un|de) #%'],
			[7, 'ab', '# (?:x|\\*|por|veces) #%'],
			[8, 'ab', '# (?:/|entre|dividido (?:por|entre)) #%']
		],
		pt: [
			[1, 'ab', '# (?:e|sao|representa|representam) (?:quantos|qual|que|quanto) (?:%|porcentagem|percentagem|porcento) (?:de|do|da|sobre|em relacao a) #'],
			[1, 'ab', '(?:quantos|qual (?:e )?(?:a )?|que|quanto) (?:%|porcentagem|percentagem) (?:e|sao|representa|representam) # (?:de|do|da|sobre|em) #'],
			[1, 'ab', '(?:qual (?:e )?)?(?:a )?(?:%|porcentagem|percentagem) de # (?:em|sobre|no total de|em relacao a) #'],
			[1, 'ba', '(?:quantos|qual (?:e )?(?:a )?|que|quanto) (?:%|porcentagem|percentagem) de # (?:e|sao|representa|representam|da) #'],
			[1, 'ab', '# (?:de|em|sobre) # em (?:%|porcentagem|percentagem)'],
			[3, 'ab', '# (?:e|sao|representa|representam) (?:o |a )?#% de (?:quanto|que numero|qual numero|qual valor|que valor)'],
			[3, 'ba', '(?:o |a )?#% de (?:quanto|que numero|qual numero|qual valor|que valor) (?:e|sao|da|dao) #'],
			[5, 'ab', '(?:a )?diferenca (?:percentual|em %|em porcentagem|%) entre # e #'],
			[5, 'ab', '(?:a )?(?:%|porcentagem|percentagem) de diferenca entre # e #'],
			[2, 'ab', '(?:(?:quanto|qual|quantos) (?:e|sao|da|dao|sera|seria) )?(?:o |a )?#% (?:de|do|da|sobre) #'],
			[4, 'ab', '(?:a |o |uma? )?(?:variacao|mudanca|aumento|reducao|diminuicao|queda|crescimento|alta|subida|baixa)(?: percentual| em %| em porcentagem| %)? (?:de|desde|do) # (?:para|a|ate|pra) #'],
			[4, 'ab', '(?:a |o )?(?:%|porcentagem|percentagem|taxa) de (?:variacao|mudanca|aumento|reducao|diminuicao|crescimento|queda) (?:de|desde|do) # (?:para|a|ate|pra) #'],
			[4, 'ab', '(?:de|desde) # (?:para|ate|pra) #'],
			[9, 'ab', '(?:aumentar|aumente|aumenta|acrescentar|acrescente|acrescenta|subir|suba|somar|some|soma|reajustar|reajuste) # (?:em )?(?:mais )?#%'],
			[9, 'ab', '# (?:\\+|mais) #%'],
			[9, 'ba', '(?:acrescentar|acrescente|acrescenta|somar|some|soma|adicionar|adicione|adiciona|aplicar|aplique) #% (?:a|ao|em|sobre|de) #'],
			[9, 'ab', '# com (?:um )?(?:aumento|acrescimo|reajuste) de #%'],
			[10, 'ab', '(?:diminuir|diminua|diminui|reduzir|reduza|reduz|baixar|baixe|descontar|desconte|desconta|abater|abata) # (?:em )?#%'],
			[10, 'ab', '# (?:-|menos) #%'],
			[10, 'ba', '(?:tirar|tire|tira|subtrair|subtraia|descontar|desconte|desconta|abater|abata) #% (?:de|do|da|em|sobre) #'],
			[10, 'ba', '(?:um |o )?desconto de #% (?:em|sobre|de|no|na) #'],
			[10, 'ba', '#% de desconto (?:em|sobre|de|no|na) #'],
			[10, 'ab', '# com (?:um )?desconto de #%'],
			[7, 'ab', '# (?:x|\\*|vezes) #%'],
			[8, 'ab', '# (?:/|dividido por) #%']
		],
		id: [
			[1, 'ab', '# (?:adalah |itu |merupakan |sama dengan )?berapa ?% (?:dari|terhadap) #'],
			[1, 'ab', 'berapa ?% (?:dari )?# (?:dari|terhadap) #'],
			[1, 'ba', 'berapa ?% dari # (?:adalah|itu|yaitu) #'],
			[1, 'ab', '(?:persentase|prosentase) # (?:dari|terhadap) #'],
			[1, 'ab', '# (?:dari|per) # (?:dalam|jadi|dalam bentuk|ke) (?:%|persentase)'],
			[3, 'ab', '# (?:adalah |itu |merupakan |sama dengan )?#% dari (?:angka |bilangan |nilai )?berapa'],
			[3, 'ba', '#% dari (?:angka |bilangan |nilai )?berapa (?:adalah |itu |sama dengan )?#'],
			[5, 'ab', '(?:selisih|perbedaan|beda)(?: persen| persentase| %| dalam %)? (?:antara )?# dan #'],
			[2, 'ab', '(?:berapa |berapa nilai |nilai |hasil )?#% dari #(?: (?:adalah |itu |sama dengan )?berapa)?'],
			[4, 'ab', '(?:perubahan|kenaikan|penurunan|peningkatan|pertumbuhan|naik|turun)(?: persen| persentase| %| dalam %)? (?:dari )?# (?:ke|menjadi|jadi|hingga|sampai) #'],
			[4, 'ab', '(?:persentase|prosentase|%) (?:perubahan|kenaikan|penurunan|peningkatan|pertumbuhan) (?:dari )?# (?:ke|menjadi|jadi|hingga|sampai) #'],
			[4, 'ab', 'dari # (?:ke|menjadi|jadi) #'],
			[9, 'ab', '(?:naikkan|naikan|tambah|tambahkan|tingkatkan) # (?:sebesar |dengan |sebanyak )?#%'],
			[9, 'ab', '# (?:\\+|tambah|ditambah|plus|naik) #%'],
			[9, 'ba', '(?:tambahkan|tambah) #% (?:ke|pada|untuk|dari) #'],
			[10, 'ab', '(?:turunkan|kurangi|kurangkan|potong) # (?:sebesar |dengan |sebanyak )?#%'],
			[10, 'ab', '# (?:-|kurang|dikurangi|minus|turun|diskon|potongan|potong) #%'],
			[10, 'ba', '(?:diskon|potongan|potong) #% (?:dari|untuk|pada|atas|harga) #'],
			[7, 'ab', '# (?:x|\\*|kali|dikali|dikalikan) #%'],
			[8, 'ab', '# (?:/|bagi|dibagi|dibagi dengan) #%']
		],
		fr: [
			[1, 'ab', '# (?:represente|representent|est|fait|font|sont|correspond a|correspondent a) (?:quel ?%|quel pourcentage|combien de ?%|combien de pourcentage|quelle proportion|quelle part) (?:de|du|des|sur|par rapport a) #'],
			[1, 'ab', '(?:quel ?%|quel pourcentage|combien de ?%|combien de pourcentage)(?: de)? (?:represente|representent|est|fait|font|sont) # (?:de|du|sur|par rapport a) #'],
			[1, 'ba', '(?:quel ?%|quel pourcentage|combien de ?%) (?:de|du) # (?:est|font|fait|sont|represente|representent) #'],
			[1, 'ab', '(?:le )?pourcentage de # (?:sur|par rapport a|dans) #'],
			[1, 'ab', '# sur # en (?:%|pourcentage)'],
			[3, 'ab', '# (?:est|sont|represente|representent|font|fait|correspond a) (?:les |le )?#% (?:de|du) (?:combien|quel nombre|quoi|quelle valeur|quelle somme)'],
			[3, 'ba', '(?:les |le )?#% (?:de|du) (?:combien|quel nombre|quoi|quelle valeur|quelle somme) (?:font|fait|est|sont|donnent|donne|valent|vaut) #'],
			[5, 'ab', '(?:le |la )?(?:ecart|difference)(?: relatif| relative)?(?: en %| en pourcentage| %)? entre # et #'],
			[5, 'ab', '(?:le )?pourcentage de (?:difference|ecart) entre # et #'],
			[2, 'ab', '(?:(?:combien|que|quel|quels|quelle|ca) (?:font|fait|vaut|valent|est|sont|donne|donnent|represente) )?(?:les |le )?#% (?:de|du|des) #'],
			[4, 'ab', '(?:le |la |une? )?(?:evolution|variation|augmentation|diminution|baisse|hausse|changement|progression|croissance)(?: en %| en pourcentage| %)? (?:de|depuis|du) # (?:a|jusqu a|vers) #'],
			[4, 'ab', '(?:le )?(?:taux|pourcentage) de (?:evolution|variation|augmentation|diminution|baisse|hausse|progression|croissance) (?:de|du|depuis) # (?:a|jusqu a) #'],
			[4, 'ab', '(?:de|depuis) # (?:a|jusqu a) #'],
			[9, 'ab', '(?:augmenter|augmente|augmentez|majorer|majore|majorez|hausser|rehausser) # de #%'],
			[9, 'ab', '# (?:\\+|plus) #%'],
			[9, 'ba', '(?:ajouter|ajoute|ajoutez|appliquer|applique) #% (?:a|au|sur) #'],
			[9, 'ab', '# (?:avec une |apres une )?(?:augmentation|hausse|majoration) de #%'],
			[10, 'ab', '(?:diminuer|diminue|diminuez|reduire|reduis|reduisez|baisser|baisse|baissez|minorer|minore) # de #%'],
			[10, 'ab', '# (?:-|moins) #%'],
			[10, 'ba', '(?:enlever|enleve|enlevez|retirer|retire|retirez|soustraire|soustrais|deduire|deduis) #% (?:a|au|de|du|sur) #'],
			[10, 'ba', '(?:une |la )?(?:remise|reduction|rabais|ristourne|promo|promotion|solde) de #% (?:sur|a|de|au) #'],
			[10, 'ba', '#% de (?:remise|reduction|rabais|ristourne) (?:sur|a|de|au) #'],
			[10, 'ab', '# (?:avec une |apres une )?(?:remise|reduction|baisse|rabais|diminution) de #%'],
			[7, 'ab', '# (?:x|\\*|fois) #%'],
			[8, 'ab', '# (?:/|divise par) #%']
		],
		de: [
			[1, 'ab', '# (?:sind|ist|macht|machen|entspricht|entsprechen|ergibt|ergeben) wie viel ?% (?:von|aus|an) #'],
			[1, 'ab', 'wie viel ?% (?:sind|ist|macht|machen|ergibt|ergeben) # (?:von|aus|an) #'],
			[1, 'ba', 'wie viel ?% von # (?:sind|ist|macht|machen|ergibt|ergeben) #'],
			[1, 'ab', '(?:welcher|der) (?:prozentsatz|anteil)(?: in %)? (?:ist|sind|von|entspricht) # (?:von|aus|an) #'],
			[1, 'ab', '# (?:sind|ist) welcher (?:prozentsatz|anteil) von #'],
			[1, 'ab', '# von # in (?:%|prozentsatz)'],
			[3, 'ab', '# (?:sind|ist|entspricht|entsprechen|ergibt|ergeben) #% von (?:wie viel|was|welcher zahl|welchem wert|welchem betrag)'],
			[3, 'ba', '#% von (?:wie viel|was|welcher zahl|welchem wert|welchem betrag) (?:sind|ist|ergeben|ergibt|machen|macht) #'],
			[5, 'ab', '(?:der |die )?(?:prozentuale[rns]? |relative[rns]? )?(?:unterschied|differenz|abweichung)(?: in %| %)? zwischen # und #'],
			[2, 'ab', '(?:(?:wie viel|was|wieviel) (?:sind|ist|macht|machen|ergeben|ergibt|sind denn) )?#% (?:von|aus) #'],
			[4, 'ab', '(?:die |der |das )?(?:prozentuale[rns]? |relative[rns]? )?(?:veranderung|anderung|steigerung|zunahme|abnahme|anstieg|ruckgang|wachstum|senkung|erhohung|verringerung)(?: in %| %)? von # (?:auf|zu|nach|bis) #'],
			[4, 'ab', 'von # (?:auf|zu|nach) #'],
			[9, 'ab', '# um #% (?:erhohen|erhoht|steigern|gesteigert|vergrossern|anheben|angehoben|erhoht werden)'],
			[9, 'ab', '(?:erhohe|erhohen|steigere|steigern|hebe) # um #%(?: an)?'],
			[9, 'ab', '# (?:\\+|plus|zuzuglich|zzgl\\.?) #%'],
			[9, 'ba', '#% (?:auf|zu) # (?:aufschlagen|addieren|dazurechnen|dazu|hinzufugen|draufrechnen)'],
			[9, 'ab', '# (?:mit|plus) #% aufschlag'],
			[10, 'ab', '# um #% (?:verringern|verringert|reduzieren|reduziert|senken|gesenkt|vermindern|vermindert|kurzen|gekurzt|mindern|gemindert)'],
			[10, 'ab', '(?:verringere|verringern|reduziere|reduzieren|senke|senken|vermindere|vermindern|kurze|kurzen) # um #%'],
			[10, 'ab', '# (?:-|minus|abzuglich|abzgl\\.?|weniger) #%'],
			[10, 'ba', '#% (?:rabatt|nachlass|skonto|abzug|ermassigung) (?:auf|von|bei) #'],
			[10, 'ab', '# (?:mit|abzuglich|nach) #% (?:rabatt|nachlass|skonto|ermassigung)'],
			[10, 'ba', '#% von # (?:abziehen|abgezogen)'],
			[7, 'ab', '# (?:x|\\*|mal) #%'],
			[8, 'ab', '# (?:/|durch|geteilt durch|dividiert durch) #%']
		]
	};
	// words that only make the request polite, per language (removed from the start / end)
	var LOPEN = {
		es: /^(?:hola |oye |por favor |porfa |calcula(?:r|me)? |calcule |dime |digame |quiero saber |necesito saber |me puedes decir |puedes calcular |ayudame a calcular )+|(?: por favor| gracias)$/,
		pt: /^(?:ola |oi |por favor |calcule |calcular |calcula |me diga |me fala |quero saber |preciso saber |pode calcular |voce pode calcular )+|(?: por favor| obrigad[oa])$/,
		id: /^(?:halo |tolong |mohon |hitunglah |hitung |coba hitung |coba |saya ingin tahu |saya mau tahu )+|(?: ya| dong| tolong| terima kasih)$/,
		fr: /^(?:bonjour |salut |s il (?:te|vous) plait |calcule(?:r|z)? |dis-moi |dites-moi |je veux savoir |je voudrais savoir |peux-tu calculer |pouvez-vous calculer )+|(?: s il (?:te|vous) plait| merci)$/,
		de: /^(?:hallo |hi |bitte |berechne(?:n)? |rechne |rechnen sie |sag mir |sagen sie mir |ich mochte wissen |ich will wissen |kannst du ausrechnen |kannst du berechnen )+|(?: bitte| danke| aus| ausrechnen| berechnen)$/
	};
	// text -> one form: lower case, no accents, digits with a decimal point, every way of saying "percent" as %, no punctuation
	function normLang(text, lang) {
		var s = String(text || '').toLowerCase();
		if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
		s = s.replace(/ß/g, 'ss').replace(/[‘’´`ʼ]/g, "'").replace(/[−–—]/g, '-').replace(/×/g, 'x').replace(/÷/g, '/').replace(/[  ]/g, ' ');
		s = s.replace(/\b(d|l|qu|j)'\s*/g, '$1e ').replace(/\b(s|jusqu)'\s*/g, '$1 ');     // d'augmentation -> de augmentation, s'il, jusqu'à
		s = s.replace(/(?:r\$|us\$|rp\.?|\$|€|£)\s*(?=\d)/g, '').replace(/(\d)\s*(?:€|\$|£|eur|euros?|reais|real|rupiah|dolares|dolars?|dollars?)(?![a-z])/g, '$1');
		// thousands: 1.234 / 1.234.567 / 1'234, and 1 234 in French and German (a dot with exactly three digits after it; 0.125 stays a decimal)
		for (var i = 0; i < 3; i++) s = s.replace(/(^|[^\d.,])([1-9]\d{0,2}(?:\d{3})*)[.'](\d{3})(?!\d)/g, '$1$2$3').replace(/(^|[^\d.,])(\d{1,3}) (\d{3})(?!\d)/g, function (m, p, a, b) { return lang === 'fr' || lang === 'de' ? p + a + b : m; });
		s = s.replace(/(\d),(\d)/g, '$1.$2');                                              // 12,5 -> 12.5
		s = s.replace(/\bpor ?cientos?\b|\bpor ?cento\b|\bporcentos?\b|\bpour ?cents?\b|\bprozent\b|\bpersen\b|\bpct\b/g, '%');
		s = s.replace(/\bwieviel\b/g, 'wie viel').replace(/\bberapakah\b/g, 'berapa').replace(/\bque est-ce que\b/g, '').replace(/\bcombien de pour\b/g, 'combien de %');
		s = s.replace(/[¿¡?!;:"«»“”„()]/g, ' ').replace(/(\D)\.(?=\s|$)/g, '$1 ').replace(/\.$/, '').replace(/,(?=\s|$)/g, ' ');
		s = s.replace(/(\d)\s+%/g, '$1%').replace(/([^\d\s])%/g, '$1 %').replace(/%(?=[^\s])/g, '% ').replace(/\s+/g, ' ').trim();   // 15 % -> 15%, but "quel %" keeps its space
		var o = LOPEN[lang]; if (o) for (var k = 0; k < 3; k++) s = s.replace(o, '').trim();
		return s;
	}
	var LRX = {};
	function percentLang(text, lang) {
		var rules = LRULES[lang]; if (!rules) return null;
		var s = normLang(text, lang);
		if (!LRX[lang]) LRX[lang] = rules.map(function (r) { return [r[0], r[1], new RegExp('^' + r[2].replace(/#/g, '(-?\\d+(?:\\.\\d+)?)').replace(/%/g, '\\s?%') + '$')]; });
		for (var i = 0; i < LRX[lang].length; i++) {
			var R = LRX[lang][i], m = R[2].exec(s);
			if (m) return R[1] === 'ab' ? { eq: R[0], a: n(m[1]), b: n(m[2]) } : { eq: R[0], a: n(m[2]), b: n(m[1]) };
		}
		return null;
	}

	/* ---------- shapes and equations in words -> rows for the 2D / 3D graphing calculators ---------- */
	function val(s, words, def) {          // "radius 7", "radius of 7", "r = 7", "with a radius of 7"
		for (var i = 0; i < words.length; i++) {
			var m = new RegExp('\\b' + words[i] + '(?: of| is| =|=|:)?\\s*' + NUM).exec(s);
			if (m) return n(m[1]);
		}
		return def;
	}
	function pt(s, after) {                // "(1, 2, 3)" or "1,2,3" after a word
		var m = new RegExp((after ? after + '\\s*' : '') + '\\(?\\s*' + NUM + '\\s*,\\s*' + NUM + '(?:\\s*,\\s*' + NUM + ')?\\s*\\)?').exec(s);
		return m ? [n(m[1]), n(m[2]), m[3] != null ? n(m[3]) : 0] : null;
	}
	function sq(a, c) { return c ? '(' + a + (c > 0 ? ' - ' + fmtN(c) : ' + ' + fmtN(-c)) + ')^2' : a + '^2'; }
	function box(r) { var b = Math.max(2, Math.ceil(r * 1.25)); return [-b, b, -b, b, -b, b]; }
	function graph(text, dim) {
		var raw = lead(clean(text)), s = raw.toLowerCase(), m;
		var asked = /^(?:graph|plot|draw|sketch|show|make|render|visuali[sz]e)\b/.test(s);
		s = s.replace(/^(?:graph|plot|draw|sketch|show|make|render|visuali[sz]e)\s+(?:me\s+)?(?:an?\s+|the\s+)?/, '');
		var c = pt(s, '(?:centered|centred|center|centre|at)(?: at)?') || [0, 0, 0];
		var r = val(s, ['radius', 'r'], null), d = val(s, ['diameter', 'd'], null); if (r == null && d != null) r = d / 2;
		var h = val(s, ['height', 'h', 'tall'], null), Rr = val(s, ['major radius', 'big radius', 'outer radius', 'r1', 'ring radius', 'distance'], null), rr = val(s, ['minor radius', 'tube radius', 'small radius', 'inner radius', 'thickness', 'r2'], null);
		var X = sq('x', c[0]), Y = sq('y', c[1]), Z = sq('z', c[2]);
		// equations typed after "graph": pass them straight through
		var eq = raw.replace(/^(?:graph|plot|draw|sketch|show)\s+(?:me\s+)?(?:the\s+)?(?:(?:function|equation|curve|surface|line)\s+)?/i, '');
		if (asked && /[=<>]|^[-\d(xyzt]/.test(eq) && /[xyzt]/.test(eq) && !/\b(sphere|circle|cube|cylinder|cone|torus|plane|line|parabola|ellipse|helix|spiral|heart|through)\b/i.test(raw)) {
			var e2 = eq.replace(/\s*\bsquared\b/g, '^2').replace(/\s*\bcubed\b/g, '^3');
			if (!/[=<>]/.test(e2)) e2 = (dim === 3 ? 'z = ' : 'y = ') + e2;
			return { rows: [e2], said: e2 };
		}
		if (dim === 3) {
			if (/\bsphere|ball\b/.test(s)) { r = r || 3; return res([X + ' + ' + Y + ' + ' + Z + ' = ' + fmtN(r * r)], box(r + Math.max.apply(null, c.map(Math.abs))), 'sphere, radius ' + fmtN(r)); }
			if (/\bcube|box\b/.test(s)) { var sd = val(s, ['side', 'edge', 'size', 'length', 's'], 4) / 2; return res(['max(abs(x' + off(c[0]) + '), abs(y' + off(c[1]) + '), abs(z' + off(c[2]) + ')) = ' + fmtN(sd)], box(sd * 1.5), 'cube, side ' + fmtN(sd * 2)); }
			if (/\bcylinder\b/.test(s)) { r = r || 2; h = h || 6; return res([X + ' + ' + Y + ' = ' + fmtN(r * r) + ' {' + fmtN(c[2]) + ' <= z <= ' + fmtN(c[2] + h) + '}'], box(Math.max(r, h)), 'cylinder, radius ' + fmtN(r) + ', height ' + fmtN(h)); }
			if (/\bcone\b/.test(s)) { r = r || 3; h = h || 6; return res(['sqrt(' + X + ' + ' + Y + ') = ' + fmtN(r) + ' (1 - (z' + off(c[2]) + ')/' + fmtN(h) + ') {' + fmtN(c[2]) + ' <= z <= ' + fmtN(c[2] + h) + '}'], box(Math.max(r, h)), 'cone, radius ' + fmtN(r) + ', height ' + fmtN(h)); }
			if (/\btorus|donut|doughnut|ring\b/.test(s)) { var R = Rr || (r && rr ? r : 3), q = rr || (Rr && r ? r : 1); return res(['((' + fmtN(R) + ' + ' + fmtN(q) + ' cos(v)) cos(u), (' + fmtN(R) + ' + ' + fmtN(q) + ' cos(v)) sin(u), ' + fmtN(q) + ' sin(v))'], box(R + q), 'torus, R = ' + fmtN(R) + ', r = ' + fmtN(q)); }
			if (/\bellipsoid\b/.test(s)) { var ea = val(s, ['a'], 4), eb = val(s, ['b'], 3), ec = val(s, ['c'], 2); return res(['x^2/' + fmtN(ea * ea) + ' + y^2/' + fmtN(eb * eb) + ' + z^2/' + fmtN(ec * ec) + ' = 1'], box(Math.max(ea, eb, ec)), 'ellipsoid'); }
			if (/\bparaboloid\b/.test(s)) return res(['z = (x^2 + y^2)/4'], null, 'paraboloid');
			if (/\bsaddle|hyperbolic paraboloid\b/.test(s)) return res(['z = (x^2 - y^2)/4'], null, 'saddle');
			if (/\bhelix|spiral|spring\b/.test(s)) { r = r || 3; var turns = val(s, ['turns'], 3), pitch = val(s, ['pitch'], 1.5); return res(['(' + fmtN(r) + ' cos(t), ' + fmtN(r) + ' sin(t), ' + fmtN(pitch / (2 * Math.PI)) + ' t) {0 <= t <= ' + fmtN(2 * turns) + 'π}'], box(Math.max(r, turns * pitch)), 'helix'); }
			if (/\bplane\b/.test(s)) { var p3 = /(-?\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)\s*y\s*([+-]\s*\d*\.?\d*)\s*z\s*=\s*(-?\d+\.?\d*)/.exec(s); if (p3) return res([s.slice(s.indexOf(p3[0])).trim()], null, 'plane'); return res(['z = ' + fmtN(val(s, ['z', 'height', 'at'], 0))], null, 'plane'); }
			if ((m = /spherical harmonic.*?\bl\s*=?\s*(\d+).*?\bm\s*=?\s*(-?\d+)/.exec(s)) || /spherical harmonic/.test(s)) { var L = m ? m[1] : 2, Mm = m ? m[2] : 1, Yl = '6 abs(ylm(l, m, v, u))'; var o = res(['l = ' + L, 'm = ' + Mm, '(' + Yl + ' sin(v) cos(u), ' + Yl + ' sin(v) sin(u), ' + Yl + ' cos(v)) {0<=u<=2π, 0<=v<=π}'], [-3, 3, -3, 3, -3, 3], 'spherical harmonic l = ' + L + ', m = ' + Mm); o.meta = { l: [0, 6, 1], m: [-6, 6, 1] }; return o; }
			if (/\bpoint\b/.test(s) && (m = pt(s, ''))) return res(['(' + m.map(fmtN).join(', ') + ')'], null, 'point');
		} else {
			if (/\bcircle\b/.test(s)) { r = r || 3; return res([X + ' + ' + Y + ' = ' + fmtN(r * r)], null, 'circle, radius ' + fmtN(r)); }
			if (/\bellipse\b/.test(s)) { var a2 = val(s, ['a', 'width', 'semi-major axis'], 4), b2 = val(s, ['b', 'semi-minor axis'], 2); return res([X.replace('x', 'x') + '/' + fmtN(a2 * a2) + ' + ' + Y + '/' + fmtN(b2 * b2) + ' = 1'], null, 'ellipse'); }
			if (/\bline\b/.test(s)) {
				var two = /\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)\s*(?:and|to)\s*\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/.exec(s);
				if (two) { var x1 = n(two[1]), y1 = n(two[2]), x2 = n(two[3]), y2 = n(two[4]); if (x1 === x2) return res(['x = ' + fmtN(x1)], null, 'vertical line'); var k = (y2 - y1) / (x2 - x1); return res(['y = ' + fmtN(k) + '(x' + off(x1) + ')' + (y1 ? (y1 > 0 ? ' + ' : ' - ') + fmtN(Math.abs(y1)) : '')], null, 'line through two points'); }
				var sl = val(s, ['slope', 'gradient', 'm'], null), yi = val(s, ['y-intercept', 'intercept', 'b'], 0);
				if (sl != null) return res(['y = ' + fmtN(sl) + 'x' + (yi ? (yi > 0 ? ' + ' : ' - ') + fmtN(Math.abs(yi)) : '')], null, 'line');
			}
			if (/\bparabola\b/.test(s)) { var v = pt(s, 'vertex(?: at)?'); return res([v ? 'y = (x' + off(v[0]) + ')^2' + (v[1] ? (v[1] > 0 ? ' + ' : ' - ') + fmtN(Math.abs(v[1])) : '') : 'y = x^2'], null, 'parabola'); }
			if (/\bheart\b/.test(s)) return res(['(x^2 + y^2 - 1)^3 = x^2 y^3'], null, 'heart');
			if (/\bsine wave|sin wave\b/.test(s)) { var amp = val(s, ['amplitude'], 1), per = val(s, ['period'], 2 * Math.PI); return res(['y = ' + fmtN(amp) + ' sin(' + fmtN(2 * Math.PI / per) + 'x)'], null, 'sine wave'); }
			if (/\bspiral\b/.test(s)) return res(['r = θ/2'], null, 'spiral');
		}
		return null;
		function res(rows, dom, said) { return { rows: rows, dom: dom || null, said: said }; }
	}
	function off(c) { return c ? (c > 0 ? ' - ' + fmtN(c) : ' + ' + fmtN(-c)) : ''; }

	/* ---------- CAS requests ---------- */
	function cas(text) {
		var raw = lead(clean(text)), s = raw.toLowerCase(), m;
		function rest(re) { var k = re.exec(raw); return k ? raw.slice(k.index + k[0].length).trim() : ''; }
		function tidy(x) { return x.replace(/\bsquared\b/gi, '^2').replace(/\bcubed\b/gi, '^3').replace(/\btimes\b/gi, '*').replace(/\bdivided by\b|\bover\b/gi, '/').replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-').replace(/\bto the power of\b/gi, '^').replace(/\bthe square root of\b|\bsquare root of\b/gi, 'sqrt ').trim(); }
		if ((m = /^(?:convert )?(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*([a-zA-Zµ°'"\/\^\d·*]+(?:\s(?:per|squared|cubed)\s[a-zA-Z]+)?)\s+(?:to|in|into|as)\s+([a-zA-Zµ°'"\/\^\d·*]+(?:\s(?:per|squared|cubed)\s?[a-zA-Z]*)?)$/i.exec(raw)) && !/^\d+$/.test(m[2])) return { op: 'units', q: m[1] + ' ' + m[2] + ' to ' + m[3], said: 'convert ' + m[1] + ' ' + m[2] + ' to ' + m[3] };
		if (/^(?:the )?(?:derivative|differentiate|d\/dx|derive|slope of)\b/.test(s)) {
			var body = rest(/^(?:the )?(?:derivative|differentiate|d\/dx|derive|slope)(?: of)?\s*/i), wrt = /\s+(?:with respect to|wrt|w\.r\.t\.?)\s+([a-z])\s*$/i.exec(body);
			if (wrt) body = body.slice(0, wrt.index);
			return body ? { op: 'diff', q: tidy(body), v: wrt ? wrt[1] : null, said: 'derivative of ' + tidy(body) } : null;
		}
		if (/^(?:the )?(?:integral|integrate|antiderivative|area under)\b/.test(s)) {
			var ib = rest(/^(?:the )?(?:integral|integrate|antiderivative|area under)(?: of| the curve)?\s*/i), lim = /\s+from\s+(\S+)\s+to\s+(\S+)\s*$/i.exec(ib);
			if (lim) ib = ib.slice(0, lim.index);
			ib = ib.replace(/\s*d[xyt]$/, '');
			return ib ? { op: 'integrate', q: tidy(ib), a: lim ? lim[1] : null, b: lim ? lim[2] : null, said: 'integral of ' + tidy(ib) + (lim ? ' from ' + lim[1] + ' to ' + lim[2] : '') } : null;
		}
		if (/^(?:solve|find x|roots of|zeros of)\b/.test(s)) { var sb = tidy(rest(/^(?:solve|find x(?: in| when| if)?|roots of|zeros of)\s*(?:for [a-z]\s*)?:?\s*/i)); return sb ? { op: 'solve', q: sb, said: 'solve ' + sb } : null; }
		var verbs = { factor: 'factor', factorise: 'factor', factorize: 'factor', expand: 'expand', simplify: 'simplify', 'partial fractions of': 'apart' };
		for (var k in verbs) if (s.indexOf(k + ' ') === 0) return { op: 'cas', fn: verbs[k], q: tidy(raw.slice(k.length + 1)), said: k + ' ' + tidy(raw.slice(k.length + 1)) };
		if ((m = /^(?:the )?limit of (.+?) as ([a-z]) (?:goes to|approaches|->|tends to) (\S+)$/i.exec(raw))) return { op: 'cas', fn: 'limit', q: 'limit(' + tidy(m[1]) + ', ' + m[2] + ', ' + m[3].replace(/infinity/i, 'oo') + ')', said: 'limit of ' + tidy(m[1]) + ' as ' + m[2] + ' → ' + m[3] };
		var c0 = calc(text); if (c0) return { op: 'cas', fn: 'evaluate', q: c0.expr, said: c0.said };
		return null;
	}

	var API = { clean: clean, wordsToNumbers: wordsToNumbers, calc: calc, percent: percent, normLang: normLang, LANGS: Object.keys(LRULES), graph: graph, cas: cas };
	if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MESAsk = API;
})(this);
