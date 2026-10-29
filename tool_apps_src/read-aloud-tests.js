// node tool_apps_src/read-aloud-tests.js  -- pure helpers of the MES Read Aloud extension (setups, page text <-> offsets map)
const R = require('../mes.fm/read-aloud/extension/shared.js');
const SR = require('./speedreader/lib.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }

// setups
const B = R.builtins();
eq(B.map(p => p.id), ['default', 'study', 'quick'], 'built-in setups'); eq(B[2].config.rate, 1.5, 'quick rate'); eq(B[1].config.readTitle, true, 'study reads title');
let m = R.merge(null); eq(m.profiles.length, 3, 'merge null'); eq(m.active, 'default', 'active');
m = R.merge({ active: 'x', profiles: [{ id: 'a', name: 'A', config: { rate: 99, pitch: 'x', wordColor: 'red', scope: 'bad', highlightWord: 'no', voice: 5 } }, { id: 'a', name: 'dup' }], siteProfiles: { 'Y.com': 'a', 'z.com': 'ghost' } });
eq(m.profiles.length, 1, 'dup ids dropped'); eq(m.active, 'a', 'bad active falls back'); eq(m.profiles[0].config.rate, 4, 'rate clamped');
eq(m.profiles[0].config.pitch, 1, 'bad pitch -> default'); eq(m.profiles[0].config.wordColor, '#ffd54a', 'bad colour -> default'); eq(m.profiles[0].config.scope, 'smart', 'bad scope');
eq(m.profiles[0].config.highlightWord, true, 'non-boolean ignored'); eq(m.profiles[0].config.voice, '', 'non-string voice ignored'); eq(m.siteProfiles, { 'y.com': 'a' }, 'site map');
eq(R.resolveProfile(m, 'www.y.com').id, 'a', 'site suffix'); eq(R.resolveProfile(m, 'noty.com').id, 'a', 'falls back to active (only one)');
const S2 = R.merge({ active: 'default', profiles: R.builtins(), siteProfiles: { 'x.org': 'quick' } });
eq(R.resolveProfile(S2, 'a.x.org').id, 'quick', 'site setup'); eq(R.resolveProfile(S2, 'xx.org').id, 'default', 'suffix needs a dot');
eq(R.normConfig(JSON.parse(JSON.stringify(B[1].config))), B[1].config, 'config round trip'); eq(R.normConfig({textScale: 9}).textScale, 2.5, 'text scale clamps high'); eq(R.normConfig({textScale: 0.1}).textScale, 0.7, 'text scale clamps low'); eq(R.defaultConfig().textScale, 1, 'text scale default');
eq(R.normConfig(null), R.defaultConfig(), 'null config');
eq(R.defaultConfig().textPanel, 'auto', 'text box default auto'); eq(R.normConfig({textPanel: 'on'}).textPanel, 'on', 'text box on'); eq(R.normConfig({textPanel: 'x'}).textPanel, 'auto', 'bad text box mode'); eq(R.normConfig({panelScale: 9}).panelScale, 2.5, 'panel scale clamps');
eq(R.contrastText('#ffd54a'), '#000000', 'dark text on amber'); eq(R.contrastText('#102030'), '#ffffff', 'light text on navy'); eq(R.contrastText('nope'), '#000000', 'bad colour');

// page text map
let map = R.buildText([{ t: '  Hello  world ', b: 1 }, { t: 'Next para', b: 2 }]);
eq(map.text, 'Hello world\n\nNext para', 'whitespace collapsed, blocks separated');
eq(R.locate(map, map.text.indexOf('w')), { item: 0, off: 9 }, 'w maps back to the node offset');
eq(R.locate(map, map.text.indexOf('N')), { item: 1, off: 0 }, 'N is in item 1');
eq(R.posOf(map, 0, 9), 6, 'posOf: offset 9 of item 0 = char 6'); eq(R.posOf(map, 1, 5), map.text.indexOf('p'), 'posOf in item 1'); eq(R.posOf(map, 1, 999), map.last[1], 'posOf past the end');
eq(R.locate(map, 9999), null, 'locate out of range');
map = R.buildText([{ t: 'inline ', b: 1 }, { t: 'bold', b: 1 }, { t: ', then more.', b: 1 }]);
eq(map.text, 'inline bold, then more.', 'inline pieces join in one block');
map = R.buildText([{ t: 'foo', b: 1 }, { t: 'bar', b: 1 }]); eq(map.text, 'foobar', 'adjacent text nodes without space stay joined');
map = R.buildText([{ t: 'a​b c', b: 1 }]); eq(map.text, 'ab c', 'zero-width removed, nbsp is a space');
map = R.buildText([{ t: '   ', b: 1 }, { t: 'x', b: 2 }]); eq(map.text, 'x', 'leading blanks dropped');
map = R.buildText([{ t: 'Title', b: -1, base: 0 }, { t: 'Body text here.', b: 3, base: 4 }]);
eq(R.locate(map, map.text.indexOf('B')).off, 4, 'base offset added');
eq(R.buildText([]).text, '', 'empty');

// the text we build is already clean, so SRLib.tokenize keeps every offset
const big = R.buildText([{ t: 'Heading', b: 1 }, { t: 'Dr. Smith went to Washington. ', b: 2 }, { t: 'He said, "Why?" ', b: 2 }, { t: 'Then left.\n\n\n', b: 2 }, { t: ' Last   one  ', b: 3 }]);
const tk = SR.tokenize(big.text);
eq(tk.text, big.text, 'tokenize does not change the built text');
eq(tk.words.every(w => big.text.slice(w.s, w.e) === w.w), true, 'every word offset points at its word');
eq(tk.sentStarts.length >= 4, true, 'sentences found');
// word -> DOM position: the word "Washington." comes from item 1
const wi = tk.words.findIndex(w => w.w === 'Washington.'); eq(R.locate(big, tk.words[wi].s).item, 1, 'word -> item');
const ch = SR.speechChunk(tk.words, tk.text, 0, 200); eq(ch.text.length, ch.end - ch.start, 'chunk text length matches its offsets');
eq(ch.text, big.text.slice(ch.start, ch.end), 'chunk text = slice of the page text (no blank lines inside a chunk)');
for (let from = 0; from < tk.words.length;) { const c = SR.speechChunk(tk.words, tk.text, from, 200); if (!c) break; if (c.text.length !== c.end - c.start) { bad++; console.log('FAIL chunk length at', from); } from = c.b; }
n++;

function ok(c, m) { eq(!!c, true, m); }
/* Google Docs: the id comes from the URL and the plain-text export becomes one node-less item per paragraph */
ok(R.docsId('https://docs.google.com/document/d/1tDsVMwtTusn0KFnyLTQW5Xq0lpPgyjU2NpAIS5a-xfs/edit?tab=t.0') === '1tDsVMwtTusn0KFnyLTQW5Xq0lpPgyjU2NpAIS5a-xfs', 'docs id from an edit url');
ok(R.docsId('https://docs.google.com/document/u/1/d/abcdefghij1234/edit') === 'abcdefghij1234', 'docs id with /u/1/');
ok(R.docsId('https://docs.google.com/spreadsheets/d/abcdefghij1234/edit') === '' && R.docsId('https://example.com/document/d/abcdefghij1234') === '' && R.docsId('') === '', 'not a doc');
{ const it = R.docsItems('\uFEFFTitle line\r\n\r\nFirst paragraph.\n \u200b \nSecond one.\n'); ok(it.length === 3 && it[0].t === 'Title line' && it[2].t === 'Second one.' && it.every(x => x.node === null) && it[0].b === 0 && it[2].b === 2, 'docsItems splits into paragraphs'); const m = R.buildText(it); ok(m.text.indexOf('Title line') === 0 && m.text.indexOf('First paragraph.') > 0, 'buildText accepts them'); }

/* 1.9: Docs addresses (account /u/N/ kept), the mobilebasic HTML, PDF paragraphs, voice groups and search */
{ const u = R.docsUrls('https://docs.google.com/document/u/1/d/abcdefghij1234/edit?tab=t.0#heading=h.x');
  ok(u && u.mobile === 'https://docs.google.com/document/u/1/d/abcdefghij1234/mobilebasic' && u.exportTxt === 'https://docs.google.com/document/u/1/d/abcdefghij1234/export?format=txt', 'docsUrls keeps /u/1/, drops ?tab and #');
  ok(R.docsUrls('https://docs.google.com/document/d/abcdefghij1234/edit').mobile === 'https://docs.google.com/document/d/abcdefghij1234/mobilebasic', 'docsUrls default account');
  ok(R.docsUrls('https://docs.google.com/document/d/e/2PACX-1vabc/pub') === null, 'published-to-web docs are normal pages'); }
{ const html = '<html><head><style>.c{x:1}</style></head><body><div class="app"><a>Open in app</a></div><div class="doc-content" style="x"><p class="title"><span>My &amp; Title</span></p><p><span>First </span><span style="font-weight:700">bold</span><span> part.</span></p><p><span></span></p><ul><li><span>Item &#8220;one&#8221;</span></li><li>Two&nbsp;x</li></ul><table><tr><td><p>Cell A</p></td><td><p>Cell B</p></td></tr></table><script>var x="<p>no</p>"</script></div></body></html>';
  const p = R.docsHtmlParas(html);
  eq(p, ['My & Title', 'First bold part.', 'Item “one”', 'Two x', 'Cell A', 'Cell B'], 'docsHtmlParas: paragraphs, entities, lists, tables; no scripts, nothing before .doc-content');
  ok(R.parasToItems(p)[1].t === 'First bold part.' && R.parasToItems(p)[1].b === 1, 'parasToItems'); }
ok(R.decodeEntities('&lt;a&gt; &#x41;&#66; &bogus;') === '<a> AB &bogus;', 'decodeEntities');
ok(R.isPdfUrl('file:///Users/me/A%20b.pdf') && R.isPdfUrl('https://x.org/f.PDF?dl=1') && !R.isPdfUrl('https://x.org/pdf/page') && !R.isPdfUrl('chrome://x/a.pdf'), 'isPdfUrl');
ok(R.isDocxUrl('https://x.org/a.docx') && !R.isDocxUrl('https://x.org/a.doc'), 'isDocxUrl');
eq(R.pdfParas([{ text: 'Heading', y: 700, size: 18 }, { text: 'First line of a para-', y: 670, size: 11 }, { text: 'graph goes on', y: 657, size: 11 }, { text: 'here.', y: 644, size: 11 }, { text: 'Next paragraph.', y: 610, size: 11 }, { text: '  ', y: 600, size: 11 }]),
  ['Heading', 'First line of a paragraph goes on here.', 'Next paragraph.'], 'pdfParas: heading, hyphen join, gap = new paragraph');
eq(R.pdfParas([]), [], 'pdfParas empty');
{ const V = [{ name: 'Zed', lang: 'en-GB' }, { name: 'Amelie', lang: 'fr-FR' }, { name: 'Bad', lang: 'en-US' }, { name: 'Ann', lang: 'en-US' }, { name: 'Hans', lang: 'de-DE' }];
  const names = { en: 'English', fr: 'French', de: 'German' };
  const g = R.voiceGroups(V, 'fr', 'en-US', c => names[c.split('-')[0]], v => v.name === 'Bad');
  eq(g.map(x => x.label), ['French', 'English', 'Other languages: German'], 'voiceGroups: text language, browser language, then others');
  eq(g[1].voices.map(v => v.name), ['Ann', 'Zed', 'Bad'], 'voices A-Z inside a group, voices that did not speak last');
  const g2 = R.voiceGroups(V, '', 'de', c => names[c.split('-')[0]]); eq(g2[0].label, 'German', 'no text language: browser language first'); }
ok(R.voiceMatches('eng kingdom', 'Daniel en-GB English United Kingdom') && R.voiceMatches('', 'x') && !R.voiceMatches('french', 'Daniel en-GB English') && R.voiceMatches('amelie', 'Amélie fr-CA'), 'voiceMatches: every word, accents ignored');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
