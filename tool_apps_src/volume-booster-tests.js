// node tool_apps_src/volume-booster-tests.js  -- pure helpers of the MES Volume Booster extension (the Web Audio graph is checked in a browser: see the commit notes)
const V = require('../mes.fm/volume-booster/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }
eq(V.merge(null), { max: 600, step: 25, limiter: true, remember: true }, 'defaults');
eq(V.merge({ max: 400, step: 10, limiter: false, remember: false }), { max: 400, step: 10, limiter: false, remember: false }, 'valid settings kept');
eq(V.merge({ max: 999, step: 7, limiter: 'no', remember: 1 }), { max: 600, step: 25, limiter: true, remember: true }, 'bad settings fall back');
eq(V.merge('junk'), V.DEFAULTS, 'junk');
eq(V.clampLevel(150, 600), 150, 'in range'); eq(V.clampLevel(-5, 600), 0, 'floor'); eq(V.clampLevel(9999, 400), 400, 'ceiling'); eq(V.clampLevel('x', 600), 100, 'junk -> 100'); eq(V.clampLevel(149.6, 600), 150, 'rounds');
eq(V.stepLevel(100, 1, 25, 600), 125, 'step up'); eq(V.stepLevel(100, -1, 25, 600), 75, 'step down'); eq(V.stepLevel(590, 1, 25, 600), 600, 'top'); eq(V.stepLevel(10, -1, 25, 600), 0, 'bottom');
eq(V.stepLevel(130, 1, 25, 600), 150, 'snaps to the step grid first (130 -> 125 -> 150)'); eq(V.stepLevel(200, 1, 10, 200), 200, 'respects a lower max');
eq(V.gainFor(300), 3, '300% = 3x'); eq(V.gainFor(0), 0, 'mute'); eq(V.gainFor(50), 0.5, 'half'); eq(V.gainFor(5000), 10, 'capped at 1000%');
eq(V.badge(100), '', 'no badge at normal'); eq(V.badge(300), '300%', 'badge'); eq(V.badge(50), '50%', 'badge below 100');
eq(V.decibels(200), 6, '200% = +6 dB'); eq(V.decibels(100), 0, '0 dB'); eq(V.decibels(50), -6, '-6 dB'); eq(V.decibels(600), 15.6, '600% = +15.6 dB'); eq(V.decibels(0), -Infinity, 'mute dB');
eq(V.PRESETS.every((p, i, a) => i === 0 || p > a[i - 1]), true, 'presets ascend'); eq(Math.max.apply(null, V.PRESETS) <= V.DEFAULTS.max, true, 'presets within the default max');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
