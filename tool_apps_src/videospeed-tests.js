// node tool_apps_src/videospeed-tests.js  -- pure helpers of the MES Video Speed Controller extension
const V = require('../mes.fm/videospeed/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', a, 'want', b); } }
eq(V.clamp(0), 0.1, 'clamp low'); eq(V.clamp(99), 16, 'clamp high'); eq(V.clamp('1.234'), 1.23, 'clamp rounds'); eq(V.clamp('x'), 1, 'clamp junk');
eq(V.fmt(1), '1.0', 'fmt 1'); eq(V.fmt(1.5), '1.5', 'fmt 1.5'); eq(V.fmt(1.25), '1.25', 'fmt 1.25'); eq(V.fmt(2.0000001), '2.0', 'fmt float');
eq(V.stepSpeed(1, 1, 0.1), 1.1, 'step up'); eq(V.stepSpeed(1.1, -1, 0.1), 1, 'step down float'); eq(V.stepSpeed(0.1, -1, 0.1), 0.1, 'floor'); eq(V.stepSpeed(16, 1, 0.1), 16, 'ceiling');
let s = 1; for (let i = 0; i < 10; i++) s = V.stepSpeed(s, 1, 0.1); eq(s, 2, 'ten steps from 1 = 2 (no float drift)');
eq(V.holdSpeed(2, 0), 2, 'hold 0'); eq(V.holdSpeed(2, 5), 2.5, 'hold +5'); eq(V.holdSpeed(2, 20), 4, 'hold to 4'); eq(V.holdSpeed(2, 21), 5, 'hold 21 = 5');
eq(V.holdSpeed(2, 26), 10, 'hold 26 = 10'); eq(V.holdSpeed(2, 99), 10, 'hold cap'); eq(V.holdSpeed(2, -5), 1.5, 'hold -5'); eq(V.holdSpeed(2, -99), 0.1, 'hold floor'); eq(V.holdSpeed(5, 2), 7, 'hold base 5');
eq(V.matchesSite('www.youtube.com', ['youtube.com']), true, 'site suffix'); eq(V.matchesSite('youtube.com', ['youtube.com']), true, 'site exact');
eq(V.matchesSite('notyoutube.com', ['youtube.com']), false, 'site not substring'); eq(V.matchesSite('a.com', []), false, 'empty list'); eq(V.matchesSite('A.com', [' A.COM ']), true, 'case/trim');
eq(V.keyName({ key: 'S' }), 's', 'key lower'); eq(V.keyName({ key: ' ' }), 'space', 'space'); eq(V.keyName({ key: 's', ctrlKey: true }), null, 'ctrl ignored');
eq(V.keyName({ key: 'Meta' }), null, 'bare modifier'); eq(V.keyName({ key: 'ArrowLeft' }), 'arrowleft', 'arrow');
eq(V.actionForKey('d', V.DEFAULTS.keys), 'faster', 'D = faster'); eq(V.actionForKey('q', V.DEFAULTS.keys), null, 'unbound'); eq(V.actionForKey(null, V.DEFAULTS.keys), null, 'null key');
let m = V.merge({ keys: { faster: 'f', bogus: 'x' }, step: 'abc', remember: 'nope', overlay: 'always', disabledSites: 'x' });
eq(m.keys.faster, 'f', 'merge key'); eq(m.keys.bogus, undefined, 'merge drops unknown action'); eq(m.step, 0.1, 'merge bad step'); eq(m.remember, 'global', 'merge bad enum'); eq(m.overlay, 'always', 'merge ok enum'); eq(m.disabledSites, [], 'merge bad list');
eq(V.merge(null).keys, V.DEFAULTS.keys, 'merge null'); eq(V.merge({ step: 0 }).step, 0.1, 'step 0 -> default');
eq(Object.keys(V.DEFAULTS.keys).length, V.ACTIONS.length, 'every action listed');
const vals = Object.values(V.DEFAULTS.keys); eq(new Set(vals).size, vals.length, 'default keys unique');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
