var M = require('./archive/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
var u = 'https://example.com/a b?x=1&y=2#frag';
eq(M.build(M.byId('wb-save'), 'https://example.com/p?q=1'), 'https://web.archive.org/save/https://example.com/p?q=1', 'wayback save uses the raw address');
eq(M.build(M.byId('at-save'), 'https://example.com/p?q=1'), 'https://archive.ph/?run=1&url=https%3A%2F%2Fexample.com%2Fp%3Fq%3D1', 'archive.today default domain');
eq(M.build(M.byId('at-save'), 'https://example.com/', 'is'), 'https://archive.is/?run=1&url=https%3A%2F%2Fexample.com%2F', 'archive.today variant');
eq(M.build(M.byId('at-find'), 'https://example.com/', 'md'), 'https://archive.md/newest/https://example.com/', 'archive.today newest');
eq(M.build(M.byId('hive'), 'https://example.com/a?b=c&d=e'), 'https://dhenz14.github.io/archive/?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc%26d%3De', 'hive tool gets an encoded url');
eq(M.build(M.byId('wb-all'), 'https://example.com/'), 'https://web.archive.org/web/*/https://example.com/', 'calendar');
eq(M.cleanUrl('  "https://example.com/x"  '), 'https://example.com/x', 'quotes and spaces'); eq(M.cleanUrl('example.com/x'), 'https://example.com/x', 'bare domain'); eq(M.cleanUrl('//cdn.example.com/a.js'), 'https://cdn.example.com/a.js', 'protocol relative');
eq(M.cleanUrl('hello world'), '', 'not a url'); eq(M.cleanUrl('javascript:alert(1)'), '', 'js rejected'); eq(M.cleanUrl('ftp://example.com/x'), '', 'ftp rejected'); eq(M.cleanUrl('http://intranet/x'), '', 'no dot rejected'); eq(M.cleanUrl('example'), '', 'single word');
eq(M.cleanUrl('https://example.com/a?utm_source=x&id=5&fbclid=abc#top', true), 'https://example.com/a?id=5#top', 'tracking removed, keeps real params and hash'); eq(M.cleanUrl('https://example.com/a?utm_source=x', false), 'https://example.com/a?utm_source=x', 'tracking kept when off');
eq(M.customUrl('https://x.test/save?u=%s&r={raw}', 'https://a.com/p q'), 'https://x.test/save?u=https%3A%2F%2Fa.com%2Fp%20q&r=https://a.com/p q', 'custom template'); eq(M.validTemplate('https://x.test/?u=%s'), true, 'valid template'); eq(M.validTemplate('https://x.test/'), false, 'needs a token'); eq(M.validTemplate('javascript:%s'), false, 'no js');
M.SETS.forEach(function (s) { s[2].forEach(function (id) { eq(!!M.byId(id), true, s[0] + ' has ' + id); }); });
var ids = M.ENGINES.map(function (e) { return e.id; }); eq(ids.length, new Set(ids).size, 'unique ids');
M.ENGINES.forEach(function (e) { eq(/\{u\}|\{raw\}/.test(e.url), true, e.id + ' has a token'); eq(M.GROUPS.some(function (g) { return g[0] === e.g; }), true, e.id + ' group'); });
// extension settings helper (mes.fm/archive/extension/shared.js reads engines.js, a copy of lib.js)
var path = require('path'), fs = require('fs'), ext = path.join(__dirname, '..', 'mes.fm', 'archive', 'extension');
if (fs.existsSync(path.join(ext, 'engines.js'))) {
	global.MESArchive = require(path.join(ext, 'engines.js')); var X = require(path.join(ext, 'shared.js')), s = X.normalise({});
	eq(X.targets(s, 'https://example.com/a?utm_source=x&id=1').length, 3, 'default set is three sites'); eq(X.targets(s, 'https://example.com/a?utm_source=x&id=1')[0].url, 'https://web.archive.org/save/https://example.com/a?id=1', 'first target strips tracking');
	eq(X.targets(s, 'chrome://extensions').length, 0, 'chrome pages are not archived'); eq(X.targets(s, '').length, 0, 'empty page');
	var s2 = X.normalise({ sel: ['at-save', 'mine'], vars: { 'at-save': 'is' }, custom: [{ id: 'mine', name: 'Mine', tpl: 'https://my.example/save?u=%s' }, { id: 'bad', name: 'Bad', tpl: 'javascript:%s' }] });
	eq(s2.custom.length, 1, 'invalid custom engine dropped'); var t2 = X.targets(s2, 'https://example.com/'); eq(t2.length, 2, 'ticked engine + custom'); eq(t2[0].url, 'https://archive.is/?run=1&url=https%3A%2F%2Fexample.com%2F', 'variant used'); eq(t2[1].url, 'https://my.example/save?u=https%3A%2F%2Fexample.com%2F', 'custom template used');
	eq(X.normalise({ sel: 'x', strip: 'y' }).sel.length, 3, 'garbage falls back to defaults');
}
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
