/* MES AI translations (same scheme as Market Signals): the list of English strings to translate, and checks of every language file.
 *   node tool_apps_src/ai/i18n/extract.js           -> writes i18n/en.json (every key + notes for translators)
 *   node tool_apps_src/ai/i18n/extract.js --check   -> checks every i18n/<code>.json: all keys, same {placeholders}, same HTML tags, seo/<code>.html exists
 * Keys = the English text. Sources: T("...") / T('...') literals in app.js, {{tr:...}} in content.html, and lib labels the page passes through T(). */
'use strict';
const fs = require('fs'), path = require('path'), DIR = __dirname, SRC = path.join(DIR, '..');
const A = require(path.join(SRC, 'lib.js'));
function unq(t, q) { return t.replace(q === "'" ? /\\'/g : /\\"/g, q).replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))); }
function lits(code) {
	const out = [], re = /(^|[^\w.$])T\(\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/g; let m;
	while ((m = re.exec(code))) { const t = unq(m[3], m[2]); if (/[A-Za-z]/.test(t.replace(/<[^>]*>|&\w+;|\{\w+\}/g, ''))) out.push(t); }
	return out;
}
function collect() {
	const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8') + fs.readFileSync(path.join(SRC, 'rich.js'), 'utf8'), html = fs.readFileSync(path.join(SRC, 'content.html'), 'utf8');
	const keys = new Set(lits(app));
	(html.match(/\{\{tr:([\s\S]*?)\}\}/g) || []).forEach((x) => keys.add(x.slice(5, -2)));
	Object.keys(A.MODELS).forEach((k) => keys.add(A.MODELS[k].blurb));
	Object.keys(A.LENGTHS).forEach((k) => keys.add(A.LENGTHS[k]));
	Object.keys(A.IMAGES).forEach((k) => keys.add(A.IMAGES[k].name));
	Object.keys(A.XIMAGE.res).forEach((k) => keys.add(A.XIMAGE.res[k]));
	Object.keys(A.VIDEO.models).forEach((k) => keys.add(A.VIDEO.models[k].name));
	return [...keys].filter((k) => k && /[A-Za-z]/.test(k)).sort();
}
function phs(s) { return (String(s).match(/\{\w+\}/g) || []).sort().join(','); }
function tags(s) { return (String(s).match(/<\/?[a-z]+\b/gi) || []).map((t) => t.toLowerCase()).sort().join(','); }
const keys = collect();
if (process.argv.includes('--check')) {
	let bad = 0;
	const files = fs.readdirSync(DIR).filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f) && f !== 'en.json');
	files.forEach((f) => {
		const code = f.slice(0, -5), L = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), miss = [], wrong = [];
		keys.forEach((k) => { const t = L.s && L.s[k]; if (typeof t !== 'string' || !t.trim()) miss.push(k); else if (phs(t) !== phs(k) || tags(t) !== tags(k)) wrong.push(k); });
		['name', 'title', 'page_title', 'tag', 'desc', 'meta_desc', 'doc_title', 'og_locale', 'locale', 'dir', 'lang_label'].forEach((k) => { if (!L.meta || !L.meta[k]) miss.push('meta:' + k); });
		if (!fs.existsSync(path.join(SRC, 'seo', code + '.html'))) miss.push('seo/' + code + '.html');
		const extra = Object.keys(L.s || {}).filter((k) => !keys.includes(k));
		console.log(code + ': ' + (keys.length - miss.filter((x) => !/^(meta:|seo\/)/.test(x)).length) + '/' + keys.length + ' strings' + (miss.length ? ', MISSING ' + miss.length : '') + (wrong.length ? ', PLACEHOLDER/TAG MISMATCH ' + wrong.length : '') + (extra.length ? ', ' + extra.length + ' unused' : ''));
		if (process.argv.includes('-v')) { miss.forEach((k) => console.log('   missing: ' + k.slice(0, 120))); wrong.forEach((k) => console.log('   mismatch: ' + k.slice(0, 120) + '  =>  ' + L.s[k].slice(0, 120))); extra.forEach((k) => console.log('   unused: ' + k.slice(0, 120))); }
		if (miss.length || wrong.length) bad++;
	});
	process.exitCode = bad ? 1 : 0;
} else {
	fs.writeFileSync(path.join(DIR, 'en.json'), JSON.stringify({
		README: 'Source list for translators. Make <code>.json with meta {name (the language in itself), title, page_title, tag, desc (~200 chars), meta_desc (~150 chars), doc_title (<title>), og_locale (es_ES), locale (Intl, e.g. es), dir (ltr|rtl), lang_label (the word Language)} and s {English key: translation} for every key in strings. Keep {placeholders}, HTML tags and their attributes (ids, classes, hrefs) exactly, &entities;, emoji, numbers and names (MES AI, Claude, ChatGPT, GPT Image 2, Grok Imagine, HBD, Hive, Keychain, @mes, Anthropic, OpenAI, xAI, OneDrive ...). Never use the ASCII double quote character inside a translation (use typographic quotes): some strings go into HTML attributes. Check: node tool_apps_src/ai/i18n/extract.js --check',
		strings: keys }, null, '\t') + '\n');
	console.log(keys.length + ' strings -> i18n/en.json');
}
