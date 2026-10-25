// node tool_apps_src/text-size-tests.js  -- pure helpers of the MES Text Size extension (the page engine is checked in a browser)
const T = require('../mes.fm/text-size/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }
eq(T.merge(null), { v: 2, step: 10, min: 50, max: 300, allLevel: 100, siteLevels: {}, applyTo: 'tab' }, 'defaults: this tab only');
let S = T.merge({ v: 2, step: 25, allLevel: 999, applyTo: 'all', siteLevels: { 'Example.com': 150, 'b.org': 'x', 'c.net': 10 } });
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

// 1.0.x -> 1.1.0 migration (stored without v: 2)
let M = T.merge({ step: 10, allLevel: 100, applyTo: 'site', siteLevels: { 'a.com': 150, 'b.com': 100 } });
eq([M.applyTo, M.siteLevels, M.v], ['tab', { 'a.com': 150 }, 2], "1.0 'site' default -> 'tab'; its stray 100% entries dropped; sizes kept");
eq(T.merge({ allLevel: 120, applyTo: 'all', siteLevels: { 'b.com': 100 } }).siteLevels, { 'b.com': 100 }, '100% entry kept when the all-sites size is not 100');
eq(T.merge({ allLevel: 100, applyTo: 'all' }).applyTo, 'all', "an explicit 1.0 'all sites' stays");
eq(T.merge({ v: 2, applyTo: 'site', siteLevels: { 'b.com': 100 } }), { v: 2, step: 10, min: 50, max: 300, allLevel: 100, siteLevels: { 'b.com': 100 }, applyTo: 'site' }, '1.1 settings untouched');
eq(T.merge(T.merge({ applyTo: 'site' })).applyTo, 'tab', 'migration is idempotent');
// tab level wins over site and all-sites; 'tab' scope never touches stored settings
const E = T.merge({ v: 2, allLevel: 120, siteLevels: { 'a.com': 150 } });
eq([T.effective(E, 'a.com', null), T.effective(E, 'a.com', 175), T.effective(E, 'x.org', null), T.effective(E, 'x.org', 100), T.effective(E, 'x.org', 999)], [150, 175, 120, 100, 300], 'effective');
eq([T.sourceOf(E, 'a.com', null), T.sourceOf(E, 'a.com', 90), T.sourceOf(E, 'x.org', null)], ['site', 'tab', 'all'], 'sourceOf');
eq(T.withLevel(E, 'a.com', 200, 'tab'), E, "withLevel 'tab' leaves the stored settings alone");
// the tab record rules
const now = 1760000000000, ctx = (o) => Object.assign({ now: now, host: 'a.com', origin: 'https://a.com', nav: 'reload', ref: '', opened: false }, o);
const rec = T.parseTabRec(T.tabRec(150, 'a.com', now - 1000));
eq(rec, { l: 150, h: 'a.com', t: now - 1000 }, 'record round trip'); eq(T.parseTabRec('150'), null, 'junk record'); eq(T.parseTabRec('{"l":"x","h":"a","t":1}'), null, 'bad level');
eq(T.tabKeep(rec, ctx()), 150, 'reload keeps'); eq(T.tabKeep(rec, ctx({ nav: 'back_forward' })), 150, 'back / forward keeps');
eq(T.tabKeep(rec, ctx({ nav: 'navigate', ref: 'https://a.com/x' })), 150, 'same-site link keeps'); eq(T.tabKeep(rec, ctx({ nav: 'navigate', ref: 'https://b.com/' })), null, 'from another site: dropped');
eq(T.tabKeep(rec, ctx({ nav: 'navigate' })), null, 'typed / restored: dropped'); eq(T.tabKeep(rec, ctx({ opened: true })), null, 'opened by another page: dropped');
eq(T.tabKeep(rec, ctx({ host: 'b.com' })), null, 'other host'); eq(T.tabKeep(rec, ctx({ now: now + T.TAB_AWAY + 1 })), null, 'gone too long');
eq([T.tabFinal(150, undefined, true), T.tabFinal(150, 150, true), T.tabFinal(150, null, true), T.tabFinal(null, 150, true), T.tabFinal(null, 150, false)], [150, 150, null, null, 150], 'tabFinal');
const tabs = {}; T.bgSet(tabs, '7', 'a.com', 150); eq(tabs, { 7: { h: 'a.com', l: 150 } }, 'bgSet'); eq(T.bgHello(tabs, '7', 'a.com', false), 150, 'bgHello same site');
eq(T.bgHello(tabs, '7', 'b.com', true), null, 'frame of another host only reads'); eq(tabs['7'] != null, true, 'passive keeps the record');
eq(T.bgHello(tabs, '7', 'b.com', false), null, 'tab left the site'); eq(tabs['7'], undefined, '... and the record is gone'); T.bgSet(tabs, '8', 'a.com', 150); T.bgSet(tabs, '8', 'a.com', null); eq(tabs['8'], undefined, 'bgSet null clears');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
