// node tool_apps_src/text-size-tests.js  -- pure helpers of the MES Text Size extension (the page engine is checked in a browser)
const T = require('../mes.fm/text-size/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }
eq(T.merge(null), { step: 10, min: 50, max: 300, allLevel: 100, siteLevels: {}, applyTo: 'site' }, 'defaults');
let S = T.merge({ step: 25, allLevel: 999, applyTo: 'all', siteLevels: { 'Example.com': 150, 'b.org': 'x', 'c.net': 10 } });
eq([S.step, S.allLevel, S.applyTo], [25, 300, 'all'], 'valid + clamped'); eq(S.siteLevels, { 'example.com': 150, 'b.org': 100, 'c.net': 50 }, 'site levels lowered and clamped'); eq(T.merge({ step: 7 }).step, 10, 'bad step');
eq(T.clampLevel(120), 120, 'in range'); eq(T.clampLevel(10), 50, 'floor'); eq(T.clampLevel(500), 300, 'ceiling'); eq(T.clampLevel('x'), 100, 'junk'); eq(T.clampLevel(149.6), 150, 'rounds');
eq(T.stepLevel(100, 1, 10, 50, 300), 110, 'up'); eq(T.stepLevel(100, -1, 10, 50, 300), 90, 'down'); eq(T.stepLevel(103, 1, 10, 50, 300), 110, 'snaps to the step grid'); eq(T.stepLevel(295, 1, 10, 50, 300), 300, 'top'); eq(T.stepLevel(55, -1, 10, 50, 300), 50, 'bottom');
const A = T.merge({ allLevel: 120, siteLevels: { 'example.com': 150, 'docs.example.com': 200 } });
eq(T.levelFor(A, 'example.com'), 150, 'exact'); eq(T.levelFor(A, 'www.example.com'), 150, 'suffix'); eq(T.levelFor(A, 'docs.example.com'), 200, 'longest wins'); eq(T.levelFor(A, 'notexample.com'), 120, 'needs a dot -> all-sites level'); eq(T.levelFor(A, 'other.org'), 120, 'default');
eq(T.siteKey(A, 'a.docs.example.com'), 'docs.example.com', 'siteKey'); eq(T.siteKey(A, 'x.org'), null, 'no key');
let W = T.withLevel(T.merge(null), 'www.a.com', 150, 'site'); eq(W.siteLevels, { 'www.a.com': 150 }, 'this site'); eq(W.allLevel, 100, 'all untouched');
W = T.withLevel(W, 'www.a.com', 175, 'site'); eq(W.siteLevels['www.a.com'], 175, 'updates the site entry');
W = T.withLevel(T.merge({ siteLevels: { 'a.com': 150 } }), 'www.a.com', 175, 'site'); eq(W.siteLevels, { 'a.com': 175 }, 'updates the matching parent entry, no duplicate');
W = T.withLevel(T.merge({ allLevel: 100, siteLevels: { 'a.com': 150 } }), 'www.a.com', 200, 'all'); eq([W.allLevel, W.siteLevels], [200, {}], 'all sites clears the site override');
eq(T.withLevel(T.merge(null), 'a.com', 999, 'all').allLevel, 300, 'clamped on write');
eq(T.parsePx('16px'), 16, 'px'); eq(T.parsePx('12.5px'), 12.5, 'fraction'); eq(T.parsePx('normal'), null, 'normal'); eq(T.scaled(16, 150), 24, '16 -> 24'); eq(T.scaled(13, 115), 14.95, '13 x 1.15'); eq(T.scaled(0.5, 200), null, 'tiny text left alone'); eq(T.scaled(null, 200), null, 'null');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
