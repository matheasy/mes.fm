// node tool_apps_src/dark-mode-tests.js  -- pure helpers of the MES Dark Mode extension (setups, decisions, colours, the CSS)
const V = require('../mes.fm/dark-mode/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }

// setups
const B = V.builtins();
eq(B.map(p => p.id), ['default', 'system', 'night', 'paper'], 'built-in setups'); eq(B[1].config.mode, 'system', 'system setup'); eq(B[3].config.mode, 'light', 'paper is light');
eq(B[2].config.brightness, 85, 'night is dimmer');
let m = V.merge(null); eq(m.profiles.length, 4, 'merge null'); eq(m.enabled, true, 'enabled by default'); eq(m.active, 'default', 'active');
m = V.merge({ enabled: false, active: 'x', profiles: [{ id: 'a', name: 'A', config: { mode: 'bogus', brightness: 999, contrast: 'x', sepia: -5, scheduleFrom: '7pm', keepImages: 'no' } }, { id: 'a' }], siteModes: { 'Y.com': 'dark', 'z.com': 'blue', 'w.org': 'off' } });
eq(m.enabled, false, 'disabled kept'); eq(m.profiles.length, 1, 'dup ids dropped'); eq(m.active, 'a', 'bad active falls back');
eq(m.profiles[0].config.mode, 'dark', 'bad mode'); eq(m.profiles[0].config.brightness, 150, 'brightness clamped'); eq(m.profiles[0].config.contrast, 100, 'bad contrast'); eq(m.profiles[0].config.sepia, 0, 'sepia floor');
eq(m.profiles[0].config.scheduleFrom, '19:00', 'bad time'); eq(m.profiles[0].config.keepImages, true, 'non-boolean ignored'); eq(m.siteModes, { 'y.com': 'dark', 'w.org': 'off' }, 'site modes');
eq(V.normConfig(JSON.parse(JSON.stringify(B[2].config))), B[2].config, 'config round trip'); eq(V.normConfig(null), V.defaultConfig(), 'null config');

// per-site choices
const S = V.merge({ siteModes: { 'example.com': 'off', 'docs.example.com': 'light' } });
eq(V.siteMode(S, 'example.com'), 'off', 'exact'); eq(V.siteMode(S, 'www.example.com'), 'off', 'suffix'); eq(V.siteMode(S, 'docs.example.com'), 'light', 'longest match wins');
eq(V.siteMode(S, 'notexample.com'), '', 'needs a dot'); eq(V.siteMode(S, 'other.org'), '', 'none');

// what should the page be?
const D = V.defaultConfig();
eq(V.wantDark(Object.assign({}, D, { mode: 'dark' }), false), true, 'dark'); eq(V.wantDark(Object.assign({}, D, { mode: 'light' }), true), false, 'light');
eq(V.wantDark(Object.assign({}, D, { mode: 'system' }), true), true, 'system dark'); eq(V.wantDark(Object.assign({}, D, { mode: 'system' }), false), false, 'system light');
const sched = Object.assign({}, D, { mode: 'schedule', scheduleFrom: '19:00', scheduleTo: '07:00' });
const at = (h, mi) => { const d = new Date(2026, 0, 1, h, mi); return d; };
eq(V.wantDark(sched, false, at(20, 0)), true, '20:00 dark'); eq(V.wantDark(sched, false, at(3, 30)), true, '03:30 dark (past midnight)'); eq(V.wantDark(sched, false, at(12, 0)), false, 'noon light');
eq(V.wantDark(sched, false, at(19, 0)), true, 'start inclusive'); eq(V.wantDark(sched, false, at(7, 0)), false, 'end exclusive'); eq(V.wantDark(sched, false, at(18, 59)), false, '18:59 light');
eq(V.inWindow(600, '09:00', '17:00'), true, 'same-day window'); eq(V.inWindow(1100, '09:00', '17:00'), false, 'after same-day window'); eq(V.inWindow(100, '08:00', '08:00'), false, 'empty window');

// colours
eq(V.parseColor('rgb(255, 255, 255)'), { r: 255, g: 255, b: 255, a: 1 }, 'rgb'); eq(V.parseColor('rgba(0, 0, 0, 0)').a, 0, 'transparent rgba'); eq(V.parseColor('rgba(10,20,30,0.5)'), { r: 10, g: 20, b: 30, a: 0.5 }, 'rgba');
eq(V.parseColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 }, 'space syntax'); eq(V.parseColor('transparent').a, 0, 'transparent');
eq(V.parseColor('color(srgb 1 0.5 0 / 0.25)'), { r: 255, g: 127.5, b: 0, a: 0.25 }, 'color(srgb)'); eq(V.parseColor('tomato'), null, 'named colour is not computed style'); eq(V.parseColor(''), null, 'empty');
eq(V.lightness({ r: 255, g: 255, b: 255 }), 1, 'white'); eq(V.lightness({ r: 0, g: 0, b: 0 }), 0, 'black'); eq(V.lightness({ r: 255, g: 0, b: 0 }) < 0.3, true, 'red is dark-ish');
eq(V.isDarkPage([0.05, 0.1, 0.08]), true, 'dark samples'); eq(V.isDarkPage([1, 1, 0.98]), false, 'light samples'); eq(V.isDarkPage([null, null]), null, 'unknown');
eq(V.isDarkPage([0.05, null, 0.1, 1]), true, 'median ignores nulls (3 values: .05 .1 1 -> .1)'); eq(V.isDarkPage([0.1, 1, 1, 1]), false, 'mostly light'); eq(V.isDarkPage([0.12, 0.2, 0.9, 1]), false, 'median .55 = light');

// the stylesheet
eq(V.buildCss(false, D), '', 'nothing to do');
let css = V.buildCss(true, D);
eq(css.includes('html{filter:invert(1) hue-rotate(180deg) !important}'), true, 'inverts the page'); eq(css.includes('html{background-color:#fff}'), true, 'white behind transparent pages');
eq(css.includes('img,picture,video,canvas,embed,object,iframe,[data-mesdm-img],[style*="background-image"]{filter:invert(1) hue-rotate(180deg) !important}'), true, 'flips media back');
eq(css.includes(':is(img,picture') && css.includes('{filter:none !important}'), true, 'no double flip for media inside media'); eq(css.endsWith('@media print{html{filter:none !important}}'), true, 'prints normally');
css = V.buildCss(true, Object.assign({}, D, { keepImages: false })); eq(css.includes('picture'), false, 'keepImages off: everything inverts');
css = V.buildCss(true, Object.assign({}, D, { brightness: 80, contrast: 90, sepia: 25, grayscale: 10 }));
eq(css.includes('filter:invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.9) sepia(0.25) grayscale(0.1) !important'), true, 'tweaks come after the flip');
css = V.buildCss(false, Object.assign({}, D, { sepia: 18 })); eq(css.startsWith('html{filter:sepia(0.18) !important}'), true, 'tweak without inversion'); eq(css.includes('hue-rotate'), false, 'no flip when not inverting'); eq(css.includes('background-color:#fff'), false, 'no forced background');
eq(V.uid() !== V.uid(), true, 'uid unique');
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
