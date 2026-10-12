// node tool_apps_src/videospeed-tests.js  -- pure helpers of the MES Video Speed Controller extension (setups, bindings, speeds)
const V = require('../mes.fm/videospeed/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }
eq(V.clamp(0), 0.1, 'clamp low'); eq(V.clamp(99), 16, 'clamp high'); eq(V.clamp('1.234'), 1.23, 'clamp rounds'); eq(V.clamp('x'), 1, 'clamp junk');
eq(V.fmt(1), '1.0', 'fmt 1'); eq(V.fmt(1.5), '1.5', 'fmt 1.5'); eq(V.fmt(1.25), '1.25', 'fmt 1.25'); eq(V.fmt(2.0000001), '2.0', 'fmt float'); eq(V.fmt2(1), '1.00', 'fmt2 1'); eq(V.fmt2(1.05), '1.05', 'fmt2 1.05'); eq(V.fmt2(0.5), '0.50', 'fmt2 .5'); eq(V.fmt2(2.0000001), '2.00', 'fmt2 float');
eq(V.stepSpeed(1, 1, 0.1), 1.1, 'step up'); eq(V.stepSpeed(1.1, -1, 0.1), 1, 'step down float'); eq(V.stepSpeed(0.1, -1, 0.1), 0.1, 'floor'); eq(V.stepSpeed(16, 1, 0.1), 16, 'ceiling');
let s = 1; for (let i = 0; i < 10; i++) s = V.stepSpeed(s, 1, 0.1); eq(s, 2, 'ten steps from 1 = 2 (no float drift)');
s = 1; for (let i = 0; i < 20; i++) s = V.stepSpeed(s, 1, 0.05); eq(s, 2, 'twenty 0.05 steps = 2');
eq(V.holdSpeed(2, 0), 2, 'hold 0'); eq(V.holdSpeed(2, 5), 2.5, 'hold +5'); eq(V.holdSpeed(2, 20), 4, 'hold to 4'); eq(V.holdSpeed(2, 21), 5, 'hold 21 = 5');
eq(V.holdSpeed(2, 26), 10, 'hold 26 = 10'); eq(V.holdSpeed(2, 99), 10, 'hold cap'); eq(V.holdSpeed(2, -5), 1.5, 'hold -5'); eq(V.holdSpeed(2, -99), 0.1, 'hold floor'); eq(V.holdSpeed(5, 2), 7, 'hold base 5');
eq(V.matchesSite('www.youtube.com', ['youtube.com']), true, 'site suffix'); eq(V.matchesSite('youtube.com', ['youtube.com']), true, 'site exact');
eq(V.matchesSite('notyoutube.com', ['youtube.com']), false, 'site not substring'); eq(V.matchesSite('a.com', []), false, 'empty list'); eq(V.matchesSite('A.com', [' A.COM ']), true, 'case/trim');
eq(V.keyName({ key: 'S' }), 's', 'key lower'); eq(V.keyName({ key: ' ' }), 'space', 'space'); eq(V.keyName({ key: 's', ctrlKey: true }), null, 'ctrl ignored');
eq(V.keyName({ key: 'Meta' }), null, 'bare modifier'); eq(V.keyName({ key: 'ArrowLeft' }), 'arrowleft', 'arrow'); eq(V.keyName({ key: '[' }), '[', 'bracket');

// built-in setups
const B = V.builtins();
eq(B.map(p => p.id), ['default', 'mes'], 'two built-in setups'); eq(B[1].name, "MES's setup", 'second setup name');
const D = B[0].config, M = B[1].config;
eq(V.bindingForKey('d', D.bindings), { action: 'faster', key: 'd', value: 0.1 }, 'default D = faster 0.1');
eq(V.bindingForKey('q', D.bindings), null, 'unbound key'); eq(V.bindingForKey(null, D.bindings), null, 'null key');
eq(V.bindingForKey(']', M.bindings), { action: 'faster', key: ']', value: 0.05 }, 'MES ] = faster 0.05');
eq(V.bindingForKey('[', M.bindings).value, 0.05, 'MES [ step'); eq(V.bindingForKey('z', M.bindings), { action: 'rewind', key: 'z', value: 1 }, 'MES Z rewind 1');
eq(V.bindingForKey('x', M.bindings).value, 1, 'MES X advance 1'); eq(V.bindingForKey('y', M.bindings), { action: 'reset', key: 'y', value: 1 }, 'MES Y reset 1');
eq(V.bindingForKey('p', M.bindings), { action: 'preferred', key: 'p', value: 2 }, 'MES P preferred 2');
eq(V.bindingForKey('m', M.bindings).action, 'setMarker', 'MES M marker'); eq(V.bindingForKey('j', M.bindings).action, 'jumpMarker', 'MES J jump');
eq(V.bindingForKey('v', M.bindings).action, 'toggleUi', 'MES V toggle');
eq([M.audio, M.remember, M.hideByDefault, M.exclusive], [false, 'off', false, false], 'MES preferences: controller shown by default');
eq([D.remember, D.hideByDefault, D.exclusive], ['global', false, true], 'default preferences');
for (const c of [D, M]) { const keys = c.bindings.map(b => b.key); eq(new Set(keys).size, keys.length, 'keys unique'); eq(c.bindings.length, V.ACTIONS.length, 'every action bound once'); }
eq(V.bindingFor('faster', M.bindings).value, 0.05, 'bindingFor');

// merge / normalise
let m = V.merge(null); eq(m.profiles.map(p => p.id), ['default', 'mes'], 'merge null = built-ins'); eq(m.active, 'default', 'active default');
m = V.merge({ active: 'nope', profiles: [{ id: 'a', name: 'A', config: { remember: 'bad', bindings: [{ action: 'faster', key: 'F', value: 9 }, { action: 'bogus', key: 'q' }, { action: 'toggleUi', key: 'v', value: 5 }] } }], siteProfiles: { 'X.com': 'a', 'y.com': 'ghost' }, disabledSites: ['z.com'] });
eq(m.active, 'a', 'bad active falls back'); eq(m.profiles[0].config.remember, 'global', 'bad enum'); eq(m.profiles[0].config.bindings.length, 2, 'unknown action dropped');
eq(m.profiles[0].config.bindings[0], { action: 'faster', key: 'f', value: 2 }, 'key lowered, value clamped to max'); eq(m.profiles[0].config.bindings[1], { action: 'toggleUi', key: 'v' }, 'no value on toggle');
eq(m.siteProfiles, { 'x.com': 'a' }, 'site map lowered + ghosts dropped'); eq(m.disabledSites, ['z.com'], 'disabled kept');
eq(V.merge({ profiles: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }] }).profiles.length, 1, 'duplicate ids dropped');
eq(V.normConfig({ opacity: 5, holdSpeed: 'x' }).opacity, 1, 'opacity max'); eq(V.normConfig({ holdSpeed: 'x' }).holdSpeed, 2, 'bad hold speed');
eq(V.normConfig({ bindings: [] }).bindings, [], 'empty bindings stay empty');
eq(V.normConfig(null), V.defaultConfig(), 'null config');
eq(V.normConfig(JSON.parse(JSON.stringify(M))), M, 'MES config survives a round trip');

// resolve
const S2 = V.merge({ active: 'mes', profiles: V.builtins(), siteProfiles: { 'youtube.com': 'default' } });
eq(V.resolveProfile(S2, 'www.youtube.com').id, 'default', 'site setup wins'); eq(V.resolveProfile(S2, 'rumble.com').id, 'mes', 'else active'); eq(V.resolveProfile(S2, 'notyoutube.com').id, 'mes', 'suffix needs a dot');
eq(V.uid() !== V.uid(), true, 'uid unique');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
