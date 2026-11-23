/* MES Audio Editor translations (same scheme as Market Signals / MES AI): the list of English strings to translate, and checks of every language file.
 *   node tool_apps_src/audio/i18n/extract.js           -> writes i18n/en.json (every key + notes for translators)
 *   node tool_apps_src/audio/i18n/extract.js --check   -> checks every i18n/<code>.json: all keys, same {placeholders}, same HTML tags, no ASCII ", seo/<code>.html exists
 * Keys = the English text. Sources: T("...") literals in app.js, {{tr:...}} in content.html, lib.js labels the page passes through T()
 * (EQ preset names) and the progress messages of /main_js/denoise.js and the Video Converter engine (busy().set passes them through T()). */
'use strict';
const fs = require('fs'), path = require('path'), DIR = __dirname, SRC = path.join(DIR, '..');
const A = require(path.join(SRC, 'lib.js'));
function unq(t, q) { return t.replace(q === "'" ? /\\'/g : /\\"/g, q).replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))); }
function lits(code) {
	const out = [], re = /(^|[^\w.$])T\(\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/g; let m;
	while ((m = re.exec(code))) { const t = unq(m[3], m[2]); if (/[A-Za-z]/.test(t.replace(/<[^>]*>|&\w+;|\{\w+\}/g, ''))) out.push(t); }
	// T(cond ? "a" : "b", ...) : both literals
	const re2 = /(^|[^\w.$])T\([^()"]*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
	while ((m = re2.exec(code))) { out.push(unq(m[2], '"'), unq(m[3], '"')); }
	return out;
}
const MENUS = ['File', 'Edit', 'Effects', 'View', 'Help'];   // menu ids, shown with T(m)
const PROGRESS = ['Downloading the AI model', 'Removing noise (AI)', 'Loading RNNoise', 'Removing noise (RNNoise)', 'Removing noise (spectral)', 'Done', 'Setting loudness', 'Encoding MP3', 'Encoding AAC', 'Reading the sound with ffmpeg', 'Starting the converter...'];
function collect() {
	const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(SRC, 'content.html'), 'utf8');
	const keys = new Set(lits(app));
	(html.match(/\{\{tr:([\s\S]*?)\}\}/g) || []).forEach((x) => keys.add(x.slice(5, -2)));
	Object.keys(A.EQ_PRESETS).forEach((k) => keys.add(A.EQ_PRESETS[k].name));
	PROGRESS.forEach((k) => keys.add(k)); MENUS.forEach((k) => keys.add(k));
	return [...keys].filter((k) => k && /[A-Za-z]/.test(k.replace(/\{\w+\}/g, ''))).sort();
}
function phs(s) { return (String(s).match(/\{\w+\}/g) || []).sort().join(','); }
function tags(s) { return (String(s).match(/<\/?[a-z]+\b/gi) || []).map((t) => t.toLowerCase()).sort().join(','); }
const keys = collect();
module.exports = { keys, phs, tags };
if (require.main !== module) return;
if (process.argv.includes('--check')) {
	let bad = 0;
	const files = fs.readdirSync(DIR).filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f) && f !== 'en.json');
	files.forEach((f) => {
		const code = f.slice(0, -5), L = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), miss = [], wrong = [];
		keys.forEach((k) => { const t = L.s && L.s[k]; if (typeof t !== 'string' || !t.trim()) miss.push(k); else if (phs(t) !== phs(k) || tags(t) !== tags(k) || (t.includes('"') && !k.includes('"'))) wrong.push(k); });
		['name', 'title', 'page_title', 'tag', 'desc', 'meta_desc', 'doc_title', 'og_locale', 'locale', 'dir', 'lang_label'].forEach((k) => { if (!L.meta || !L.meta[k]) miss.push('meta:' + k); });
		if (!fs.existsSync(path.join(SRC, 'seo', code + '.html'))) miss.push('seo/' + code + '.html');
		const extra = Object.keys(L.s || {}).filter((k) => !keys.includes(k));
		console.log(code + ': ' + (keys.length - miss.filter((x) => !/^(meta:|seo\/)/.test(x)).length) + '/' + keys.length + ' strings' + (miss.length ? ', MISSING ' + miss.length : '') + (wrong.length ? ', PLACEHOLDER/TAG/QUOTE MISMATCH ' + wrong.length : '') + (extra.length ? ', ' + extra.length + ' unused' : ''));
		if (process.argv.includes('-v')) { miss.forEach((k) => console.log('   missing: ' + k.slice(0, 120))); wrong.forEach((k) => console.log('   mismatch: ' + k.slice(0, 120) + '  =>  ' + L.s[k].slice(0, 120))); extra.forEach((k) => console.log('   unused: ' + k.slice(0, 120))); }
		if (miss.length || wrong.length) bad++;
	});
	process.exitCode = bad ? 1 : 0;
} else {
	fs.writeFileSync(path.join(DIR, 'en.json'), JSON.stringify({
		README: 'Source list for translators. Make <code>.json with meta {name (the language in itself), title, page_title, tag, desc (~200 chars), meta_desc (~150 chars), doc_title (<title>), og_locale (hi_IN), locale (Intl, e.g. hi-IN), dir (ltr|rtl), lang_label (the word Language)} and s {English key: translation} for every key in strings. Keep {placeholders}, HTML tags and their attributes exactly, &entities;, emoji, numbers, units (dB, LUFS, dBTP, Hz, kbps, MB), keyboard keys (Space, Ctrl+Z, B, N, Esc ...) and names (MES Audio Editor, DeepFilterNet, RNNoise, Audacity, Camtasia, YouTube, Spotify, MP3, WAV, M4A, AAC ...). Never use the ASCII double quote character inside a translation (use typographic quotes): many strings go into HTML attributes. Natural, everyday wording, not word for word. Check: node tool_apps_src/audio/i18n/extract.js --check',
		strings: keys }, null, '\t') + '\n');
	console.log(keys.length + ' strings -> i18n/en.json');
}
