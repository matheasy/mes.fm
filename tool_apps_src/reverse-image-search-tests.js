/* node tool_apps_src/reverse-image-search-tests.js */
var M = require('./reverse-image-search/lib.js'), fails = 0, n = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': got ' + a + ', want ' + b); } }
eq(M.build(M.byId('tineye'), 'https://a.com/x.jpg?w=1&h=2'), 'https://tineye.com/search?url=https%3A%2F%2Fa.com%2Fx.jpg%3Fw%3D1%26h%3D2', 'tineye encodes the link');
eq(M.build(M.byId('lens'), 'https://a.com/b c.png'), 'https://lens.google.com/uploadbyurl?url=https%3A%2F%2Fa.com%2Fb%20c.png', 'lens');
eq(M.cleanLink('  "https://a.com/x.jpg"  '), 'https://a.com/x.jpg', 'trim and quotes');
eq(M.cleanLink('//cdn.a.com/x.jpg'), 'https://cdn.a.com/x.jpg', 'protocol-relative');
eq(M.cleanLink('a.com/x.jpg'), 'https://a.com/x.jpg', 'bare domain');
eq(M.cleanLink('https://www.google.com/imgres?imgurl=https%3A%2F%2Fa.com%2Fx.jpg&tbnid=1'), 'https://a.com/x.jpg', 'imgres unwrapped');
eq(M.cleanLink('data:image/png;base64,AAA'), 'data:image/png;base64,AAA', 'data url left alone');
eq(M.isImageUrl('https://a.com/x.jpg'), true, 'valid'); eq(M.isImageUrl('hello world'), false, 'invalid'); eq(M.isImageUrl('ftp://a.com/x'), false, 'ftp invalid');
eq(M.customUrl('https://x.test/?img=%s&r={raw}', 'https://a.com/x y.jpg'), 'https://x.test/?img=https%3A%2F%2Fa.com%2Fx%20y.jpg&r=https://a.com/x y.jpg', 'custom template');
eq(M.validTemplate('https://x.test/?i={u}'), true, 'template ok'); eq(M.validTemplate('https://x.test/'), false, 'template needs a token'); eq(M.validTemplate('javascript:{u}'), false, 'no js');
M.ENGINES.forEach(function (e) { eq(/^https?:\/\/[^{]+\{u\}/.test(e.url) || /\{u\}/.test(e.url), true, e.id + ' has {u}'); eq(e.url.indexOf('{u}') > 0, true, e.id + ' token placed'); });
M.SETS.forEach(function (s) { s[2].forEach(function (id) { eq(!!M.byId(id), true, s[0] + ' set id ' + id); }); });
var ids = M.ENGINES.map(function (e) { return e.id; }); eq(ids.length, new Set(ids).size, 'unique ids');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
