/* MES Market Signals translations: the list of English strings to translate, and checks of every language file.
 *   node tool_apps_src/signals/i18n/extract.js           -> writes i18n/en.json (every key, the glossary, notes for translators)
 *   node tool_apps_src/signals/i18n/extract.js --check   -> checks every i18n/<code>.json: all keys present, same {placeholders}, same HTML tags, seo/<code>.html exists
 * Keys = the English text itself. Sources: T('...') / S.T('...') / N('...') literals in app.js + lib.js, {{tr:...}} in content.html, and
 * lib values that the page passes through T() at display time (labels, mood words, method texts ...). Language file layout: see README in en.json. */
'use strict';
const fs = require('fs'), path = require('path'), DIR = __dirname, SRC = path.join(DIR, '..');
const S = require(path.join(SRC, 'lib.js'));
function lits(code) {
	const out = [], re = /(^|[^\w.])(?:S\.)?([TN])\(/g; let m;
	while ((m = re.exec(code))) {
		let i = re.lastIndex, depth = 1, j = i, q = null;
		for (; j < code.length && depth; j++) { const c = code[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; } else if (c === "'" || c === '"') q = c; else if (c === '(') depth++; else if (c === ')') depth--; }
		let arg = code.slice(i, j - 1);
		// cut at the vars object ({ name: value }) so its literals are not taken
		let d = 0, qq = null, cut = arg.length;
		for (let k = 0; k < arg.length; k++) { const c = arg[k]; if (qq) { if (c === '\\') k++; else if (c === qq) qq = null; continue; } if (c === "'" || c === '"') qq = c; else if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && d === 0 && /^\s*\{/.test(arg.slice(k + 1))) { cut = k; break; } }
		arg = arg.slice(0, cut);
		const lre = /'((?:[^'\\]|\\.)*)'/g; let l;
		while ((l = lre.exec(arg))) { const t = l[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))); if (/[A-Za-z]/.test(t.replace(/<[^>]*>|&\w+;/g, ''))) out.push(t); }
	}
	return out;
}
function collect() {
	const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8'), lib = fs.readFileSync(path.join(SRC, 'lib.js'), 'utf8'), html = fs.readFileSync(path.join(SRC, 'content.html'), 'utf8');
	const keys = new Set(lits(app).concat(lits(lib)));
	(html.match(/\{\{tr:([\s\S]*?)\}\}/g) || []).forEach((x) => keys.add(x.slice(5, -2)));
	for (let v = 0; v <= 100; v++) { keys.add(S.fgLabel(v)); keys.add(S.sdLabel(v)); }
	[-1, 0, 0.0005, 0.001, 0.002, 0.01].forEach((f) => { const w = S.fundingLean(f); if (w) keys.add(w); });
	S.MOOD_RULES.forEach((r) => { keys.add(r[0]); keys.add(r[1]); });
	Object.keys(S.SNAP).forEach((k) => keys.add(S.SNAP[k][0]));
	S.NEWS_SECTIONS.forEach((x) => keys.add(x[1]));
	S.WAR_COSTS.forEach((w) => { keys.add(w[2]); keys.add(w[3]); });
	keys.add(S.STOCK_FG_METHOD); keys.add(S.SMART_DUMB_METHOD);
	// words built in lib (sector rows, cot reading, stock F&G parts) and names coming from the API (api/signals.js)
	['Falling', 'Slipping', 'Flat', 'Rising', 'Climbing', 'Surging', 'Info', 'Tightening', 'Easing', 'On hold', 'Inverted', 'Normal', 'Low', 'Elevated', 'High', 'Very high tension', 'High tension', 'Tense',
		'High, rising', 'High, falling', 'High, steady', 'Near target', 'Near target, rising', 'Near target, falling', 'Near target, steady', 'Low, rising', 'Low, falling', 'Low, steady',
		'Crypto market', 'Bitcoin', 'Ethereum', 'Large altcoins (SOL, XRP)', 'Stablecoins', 'US stocks', 'Gold', 'Oil (WTI)', 'US dollar (DXY)', 'Fed and US rates', 'Yield curve', 'US inflation', 'US recession odds', 'Geopolitics',
		'Smart money much more bullish than the crowd', 'Smart money more bullish than the crowd', 'The crowd much more bullish than smart money', 'The crowd more bullish than smart money', 'Both groups about as bullish',
		'Momentum: S&P 500 vs its 125-day average', 'Volatility: VIX', 'Junk-bond spread over Treasuries',
		'Nasdaq Composite', 'Dow Jones', 'Gold (oz)', 'Oil (WTI barrel)', 'US Dollar Index', 'Yahoo did not answer; FRED closing price (about a day behind)', 'Bitcoin prices did not load, so flows are shown in bitcoin only', 'Economy', 'Fed', 'Crypto', 'Politics'
	].forEach((k) => keys.add(k));
	['Kalshi', 'Polymarket', 'S&P 500', 'ECB'].forEach((k) => keys.delete(k));
	return [...keys].filter((k) => k && /[A-Za-z]/.test(k)).sort();
}
function phs(s) { return (String(s).match(/\{\w+\}/g) || []).sort().join(','); }
function tags(s) { return (String(s).match(/<\/?[a-z]+\b/gi) || []).map((t) => t.toLowerCase()).sort().join(','); }
const keys = collect(), G = {}; Object.keys(S.GLOSSARY).forEach((k) => { G[k] = S.GLOSSARY[k]; });
if (process.argv.includes('--check')) {
	let bad = 0;
	const files = fs.readdirSync(DIR).filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f) && f !== 'en.json');
	files.forEach((f) => {
		const code = f.slice(0, -5), L = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), miss = [], wrong = [];
		keys.forEach((k) => { const t = L.s && L.s[k]; if (typeof t !== 'string' || !t.trim()) miss.push(k); else if (phs(t) !== phs(k) || tags(t) !== tags(k)) wrong.push(k); });
		Object.keys(G).forEach((k) => { const g = L.g && L.g[k]; if (!Array.isArray(g) || g.length !== 2 || !g[0] || !g[1]) miss.push('glossary:' + k); });
		['name', 'title', 'page_title', 'tag', 'desc', 'doc_title', 'og_locale', 'locale', 'dir', 'lang_label'].forEach((k) => { if (!L.meta || !L.meta[k]) miss.push('meta:' + k); });
		if (!fs.existsSync(path.join(SRC, 'seo', code + '.html'))) miss.push('seo/' + code + '.html');
		const extra = Object.keys(L.s || {}).filter((k) => !keys.includes(k));
		console.log(code + ': ' + (keys.length - miss.filter((x) => !/:/.test(x)).length) + '/' + keys.length + ' strings' + (miss.length ? ', MISSING ' + miss.length : '') + (wrong.length ? ', PLACEHOLDER/TAG MISMATCH ' + wrong.length : '') + (extra.length ? ', ' + extra.length + ' unused' : ''));
		if (process.argv.includes('-v')) { miss.forEach((k) => console.log('   missing: ' + k.slice(0, 120))); wrong.forEach((k) => console.log('   mismatch: ' + k.slice(0, 120) + '  =>  ' + L.s[k].slice(0, 120))); }
		if (miss.length || wrong.length) bad++;
	});
	process.exitCode = bad ? 1 : 0;
} else {
	fs.writeFileSync(path.join(DIR, 'en.json'), JSON.stringify({
		README: 'Source list for translators. Make <code>.json with meta {name (the language in itself), title, page_title, tag, desc (~150 chars), doc_title (<title>), og_locale (fa_IR), locale (Intl, e.g. fa-IR), dir (ltr|rtl), lang_label (the word Language)}, s {English key: translation} for every key in strings, g {glossary key: [title, text]}. Keep {placeholders}, HTML tags, &entities;, numbers, brand and data-source names (Polymarket, Kalshi, CoinGecko, FRED, Hyperliquid, CFTC ...). Neutral, informational wording: never advice. Check: node tool_apps_src/signals/i18n/extract.js --check',
		strings: keys, glossary: G }, null, '\t') + '\n');
	console.log(keys.length + ' strings, ' + Object.keys(G).length + ' glossary entries -> i18n/en.json');
}
