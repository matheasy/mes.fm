// node tool_apps_src/dark-mode-tests.js  -- pure helpers of the MES Dark Mode extension (setups, decisions, colours, the CSS)
const V = require('../mes.fm/dark-mode/extension/shared.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }

// setups
const B = V.builtins();
eq(B.map(p => p.id), ['default', 'always', 'system', 'night', 'paper'], 'built-in setups'); eq(B[0].config.mode, 'manual', 'default setup leaves pages alone'); eq(B[1].config.mode, 'dark', 'always dark setup'); eq(B[2].config.mode, 'system', 'system setup'); eq(B[4].config.mode, 'light', 'paper is light');
eq(B[3].config.brightness, 85, 'night is dimmer'); eq(B[3].config.mode, 'dark', 'night is dark');
let m = V.merge(null); eq(m.profiles.length, 5, 'merge null'); eq(m.enabled, true, 'enabled by default'); eq(m.toolbar, 'toggle', 'toolbar button switches by default'); eq(V.merge({ toolbar: 'menu' }).toolbar, 'menu', 'toolbar menu option kept'); eq(V.merge({ toolbar: 'x' }).toolbar, 'toggle', 'bad toolbar value ignored'); eq(m.active, 'default', 'active');
m = V.merge({ v: 3, enabled: false, active: 'x', profiles: [{ id: 'a', name: 'A', config: { mode: 'bogus', brightness: 999, contrast: 'x', sepia: -5, scheduleFrom: '7pm', keepImages: 'no' } }, { id: 'a' }], siteModes: { 'Y.com': 'dark', 'z.com': 'blue', 'w.org': 'off' } });
eq(m.enabled, false, 'disabled kept'); eq(m.profiles.length, 1, 'dup ids dropped'); eq(m.active, 'a', 'bad active falls back');
eq(m.profiles[0].config.mode, 'manual', 'bad mode falls back to manual'); eq(m.profiles[0].config.brightness, 150, 'brightness clamped'); eq(m.profiles[0].config.contrast, 100, 'bad contrast'); eq(m.profiles[0].config.sepia, 0, 'sepia floor');
eq(m.profiles[0].config.scheduleFrom, '19:00', 'bad time'); eq(m.profiles[0].config.keepImages, true, 'non-boolean ignored'); eq(m.siteModes, { 'y.com': 'dark', 'w.org': 'off' }, 'site modes');
eq(V.normConfig(JSON.parse(JSON.stringify(B[2].config))), B[2].config, 'config round trip'); eq(V.normConfig(null), V.defaultConfig(), 'null config');

// per-site choices
const S = V.merge({ v: 3, siteModes: { 'example.com': 'off', 'docs.example.com': 'light' } });
eq(V.siteMode(S, 'example.com'), 'off', 'exact'); eq(V.siteMode(S, 'www.example.com'), 'off', 'suffix'); eq(V.siteMode(S, 'docs.example.com'), 'light', 'longest match wins');
eq(V.siteMode(S, 'notexample.com'), '', 'needs a dot'); eq(V.siteMode(S, 'other.org'), '', 'none');

// what should the page be?
const D = V.defaultConfig();
eq(V.wantDark(Object.assign({}, D, { mode: 'manual' }), true), null, 'manual has no opinion'); eq(V.merge({ v: 1, profiles: [{ id: 'default', name: 'Dark', config: { mode: 'dark' } }] }).profiles[0].config.mode, 'manual', 'v1 default dark setup migrated to manual'); eq(V.merge({ v: 2, profiles: [{ id: 'default', name: 'Dark', config: { mode: 'dark' } }] }).profiles[0].config.mode, 'dark', 'v2 choice kept'); eq(V.wantDark(Object.assign({}, D, { mode: 'dark' }), false), true, 'dark'); eq(V.wantDark(Object.assign({}, D, { mode: 'light' }), true), false, 'light');
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

// ---- 1.5.0: one-time clean-up of old settings (stored v < 3) ----
const DEF = V.BUILTIN_DEFAULT;
let r = V.migrate({ v: 2, scope: 'all', active: 'default', profiles: [{ id: 'default', name: DEF, config: { mode: 'dark' } }, { id: 'night', name: 'Night', config: { mode: 'dark' } }], siteModes: { 'Mail.Google.com': 'dark', 'x.com': 'light', 'y.org': 'off' } });
eq(r.S.v, 3, 'migrated settings are v3'); eq(r.S.siteModes, { 'y.org': 'off' }, 'old Dark / Light site entries removed, Off kept'); eq(r.reset.sites, ['mail.google.com', 'x.com'], 'removed sites reported');
eq(r.S.scope, 'tab', 'scope all reset to this tab'); eq(r.reset.scope, true, 'scope reset reported');
eq(r.S.profiles[0].config.mode, 'manual', 'built-in default setup back to manual'); eq(r.reset.setup, 'dark', 'setup reset reported'); eq(r.S.profiles[1].config.mode, 'dark', 'another setup is not touched');
eq(r.reset.kept, '', 'active default is not dark any more: nothing kept'); eq(V.anyReset(r.reset), true, 'something to tell');
eq(V.resetText(r.reset).includes('mail.google.com, x.com') && V.resetText(r.reset).includes('Only this tab'), true, 'reset line names the sites and the scope');
r = V.migrate({ v: 2, active: 'always', profiles: V.builtins().map(p => p.id === 'always' ? p : p), siteModes: {} });
eq(r.S.active, 'always', 'a chosen darkening setup is kept'); eq(r.reset.kept, 'Always dark (every page)', 'kept setup reported'); eq(V.resetText(r.reset).startsWith('Version 1.5.0 checked'), true, 'kept-only note');
r = V.migrate({ v: 2, profiles: [{ id: 'default', name: 'My own', config: { mode: 'dark' } }] }); eq(r.S.profiles[0].config.mode, 'dark', 'a renamed default setup is the person\'s own: kept'); eq(r.reset.kept, 'My own', 'and reported as kept');
r = V.migrate({ v: 2, profiles: [{ id: 'default', name: DEF, config: { mode: 'light' } }] }); eq(r.S.profiles[0].config.mode, 'manual', 'default flipped to light by "All pages" is reset too'); eq(r.reset.setup, 'light', 'light reported');
r = V.migrate({ v: 1, profiles: [{ id: 'default', name: 'Dark', config: { mode: 'dark' } }], siteModes: { 'a.com': 'dark' } }); eq(r.S.profiles[0].config.mode, 'manual', 'v1 default still migrated'); eq(r.S.profiles[0].name, DEF, 'v1 default renamed'); eq(r.reset.setup, 'dark', 'v1 reset reported'); eq(r.S.siteModes, {}, 'v1 site click removed');
r = V.migrate({ enabled: true, siteModes: { 'a.com': 'dark' } }); eq(r.S.siteModes, {}, 'no version = old: site click removed');
r = V.migrate({ v: 3, scope: 'all', siteModes: { 'a.com': 'dark', 'b.com': 'light' }, profiles: [{ id: 'default', name: DEF, config: { mode: 'dark' } }] });
eq([r.S.scope, r.S.siteModes, r.S.profiles[0].config.mode, V.anyReset(r.reset)], ['all', { 'a.com': 'dark', 'b.com': 'light' }, 'dark', false], 'v3 settings are the person\'s own: nothing reset');
r = V.migrate(null); eq([r.S.v, V.anyReset(r.reset)], [3, false], 'fresh install: nothing to clean'); eq(V.resetText(r.reset), '', 'no line');
eq(V.migrate(V.migrate({ v: 2, scope: 'all', siteModes: { 'a.com': 'dark' } }).S).reset, { sites: [], scope: false, setup: '', kept: '' }, 'migration runs once');
eq(V.resetText({ sites: 'junk', scope: true }).includes('Only this tab'), true, 'a damaged note does not break the options page');

// ---- what happens to a page, and why ----
const base = { enabled: true, tab: '', site: '', own: false, want: null, pageDark: false };
const dec = o => V.decide(Object.assign({}, base, o));
eq(dec({}).why, 'none', 'manual setup: nothing'); eq(dec({}).invert, false, 'manual: no invert');
eq(dec({ tab: 'dark' }), { why: 'tab', off: false, want: true, invert: true, on: true }, 'tab dark inverts'); eq(dec({ tab: 'dark', pageDark: true }).invert, true, 'tab dark is literal (even on a dark-looking page)');
eq(dec({ tab: 'light', want: true }).invert, false, 'tab light beats the setup'); eq(dec({ tab: 'dark', site: 'off' }).why, 'tab', 'the tab switch beats a site Off'); eq(dec({ tab: 'dark', enabled: false }).why, 'disabled', 'the On switch beats everything');
eq(dec({ own: true, want: true }).why, 'mesfm', 'mes.fm left alone'); eq(dec({ own: true, tab: 'dark' }).invert, true, 'mes.fm switched by hand'); eq(dec({ own: true, site: 'dark' }).why, 'site', 'mes.fm in the site list');
eq(dec({ site: 'dark' }).invert, true, 'site dark on a light page'); eq(dec({ site: 'dark', pageDark: true }).invert, false, 'site dark on a dark page: left alone'); eq(dec({ site: 'light', pageDark: true }).invert, true, 'site light on a dark page');
eq(dec({ site: 'off', want: true }).off, true, 'site off'); eq(dec({ want: true }).on, true, 'setup dark: on'); eq(dec({ want: false, pageDark: true }), { why: 'setup', off: false, want: false, invert: true, on: false }, 'setup light inverts a dark page but is not "on"');
eq(V.clickTab(base), 'dark', 'click on a plain page: dark'); eq(V.clickTab(Object.assign({}, base, { tab: 'dark' })), '', 'click again: back to nothing (no light record left behind)');
eq(V.clickTab(Object.assign({}, base, { want: true })), 'light', 'click on a page the setup darkened: light'); eq(V.clickTab(Object.assign({}, base, { want: true, tab: 'light' })), 'dark', 'and again: dark');
eq(V.clickTab(Object.assign({}, base, { site: 'dark' })), 'light', 'click on a page the site list darkened: light');

// ---- this tab's own switch: the page's record ----
const T0 = 1760000000000, MIN = 60000, H = 'mail.google.com', O = 'https://mail.google.com';
const rec = (m, t, h) => V.parseTabRec(V.tabRec(m, h || H, t));
const cx = o => Object.assign({ now: T0 + 2 * MIN, host: H, origin: O, nav: 'navigate', ref: '', opened: false }, o);
eq(V.parseTabRec(V.tabRec('dark', H, T0)), { m: 'dark', h: H, t: T0 }, 'record round trip'); eq(V.parseTabRec('dark'), null, 'bare value of an old version is not trusted');
eq(V.parseTabRec('{"m":"blue","h":"x","t":1}'), null, 'bad mode'); eq(V.parseTabRec('{"m":"dark","h":"x"}'), null, 'no time'); eq(V.parseTabRec('{oops'), null, 'broken JSON'); eq(V.parseTabRec(null), null, 'nothing');
eq(V.tabKeep(rec('dark', T0), cx({ nav: 'reload' })), 'dark', 'reload keeps it'); eq(V.tabKeep(rec('dark', T0), cx({ nav: 'back_forward' })), 'dark', 'back / forward keeps it');
eq(V.tabKeep(rec('dark', T0), cx({ ref: O + '/mail/u/0/#inbox' })), 'dark', 'same-site link keeps it'); eq(V.tabKeep(rec('light', T0), cx({ nav: 'prerender', ref: O + '/x' })), 'light', 'prerendered same-site link keeps it');
eq(V.tabKeep(rec('dark', T0), cx({ ref: 'https://www.google.com/' })), '', 'link from another site drops it'); eq(V.tabKeep(rec('dark', T0), cx({ ref: 'http://mail.google.com/' })), '', 'another scheme is another origin');
eq(V.tabKeep(rec('dark', T0), cx({ ref: '' })), '', 'typed / bookmarked / restored (no referrer) drops it'); eq(V.tabKeep(rec('dark', T0), cx({ nav: 'reload', opened: true })), '', 'opened from another page drops it');
eq(V.tabKeep(rec('dark', T0), cx({ nav: 'reload', now: T0 + 29 * MIN })), 'dark', 'gone 29 minutes: kept'); eq(V.tabKeep(rec('dark', T0), cx({ nav: 'back_forward', now: T0 + 31 * MIN })), '', 'gone 31 minutes: dropped');
eq(V.tabKeep(rec('dark', T0), cx({ nav: 'reload', now: T0 + 3 * 86400000 })), '', 'restored days later: dropped'); eq(V.tabKeep(rec('dark', T0 + 60 * MIN), cx({ nav: 'reload' })), '', 'record from the future (clock moved back): dropped');
eq(V.tabKeep(rec('dark', T0, 'mail.google.com:8443'), cx({ nav: 'reload' })), '', 'another host / port'); eq(V.tabKeep(null, cx({ nav: 'reload' })), '', 'no record'); eq(V.tabKeep(rec('dark', T0), cx({ nav: '' })), '', 'unknown navigation');
eq(V.tabKeep(rec('dark', T0), cx({ ref: 'about:blank', origin: 'null' })), '', 'opaque origin');

// the service worker's record of the tab, and the final word
const tabs = {};
V.bgSet(tabs, '7', H, 'dark'); eq(V.bgHello(tabs, '7', H, false), 'dark', 'same tab, same site: still dark'); eq(V.bgHello(tabs, '8', H, false), '', 'a duplicated / opened / restored tab has another id');
eq(V.bgHello(tabs, '7', 'www.google.com', true), '', 'a prerendered page of another site reads only'); eq(tabs['7'], { h: H, m: 'dark' }, '... and drops nothing');
eq(V.bgHello(tabs, '7', 'www.google.com', false), '', 'the tab went to another site'); eq(tabs['7'], undefined, '... so its switch is dropped'); eq(V.bgHello(tabs, '7', H, false), '', 'and back again: gone');
V.bgSet(tabs, '9', H, 'light'); V.bgSet(tabs, '9', H, ''); eq(tabs['9'], undefined, 'clearing'); V.bgSet(tabs, '9', '', 'dark'); eq(tabs['9'], undefined, 'no host, no record');
eq(V.tabFinal('dark', 'dark', true), 'dark', 'page and worker agree'); eq(V.tabFinal('dark', '', true), '', 'duplicated tab (worker has none): dropped'); eq(V.tabFinal('', 'dark', true), '', 'typed again in the same tab: dropped');
eq(V.tabFinal('dark', 'light', true), '', 'disagreeing: dropped'); eq(V.tabFinal('dark', null, true), 'dark', 'worker did not answer: the page decides'); eq(V.tabFinal('', 'dark', false), 'dark', 'no sessionStorage: the worker decides'); eq(V.tabFinal('', 'junk', false), '', 'junk answer');
// whole scenarios: page verdict x worker verdict
const scen = (r, c, w) => V.tabFinal(V.tabKeep(r, cx(c)), w, true);
eq(scen(rec('dark', T0), { nav: 'reload' }, 'dark'), 'dark', 'scenario: reload'); eq(scen(rec('dark', T0), { ref: O + '/a' }, 'dark'), 'dark', 'scenario: same-site link');
eq(scen(rec('dark', T0), { nav: 'back_forward' }, ''), '', 'scenario: duplicate tab (copied record, new tab id)'); eq(scen(rec('dark', T0), { nav: 'back_forward' }, ''), '', 'scenario: restored after a restart within 30 minutes (worker forgot)');
eq(scen(rec('dark', T0), { nav: 'back_forward' }, ''), '', 'scenario: back after visiting another site (that page said hello)'); eq(scen(rec('dark', T0), { ref: O + '/a', opened: true }, ''), '', 'scenario: window opened by the page');

// ---- telling the person why ----
const st = o => Object.assign({ why: 'none', invert: false, want: null, on: false, host: H, tab: '', site: '', setup: { name: DEF, mode: 'manual', from: '19:00', to: '07:00' }, sys: false, scope: 'tab', toolbar: 'toggle' }, o);
eq(V.explain(st({})).text, 'Nothing is changed on this page.', 'nothing'); eq(V.explain(st({})).click, 'Click to make this tab dark.', 'click hint');
eq(V.explain(st({ why: 'tab', tab: 'dark', invert: true, want: true, on: true })), { on: true, text: 'You switched this tab to dark.', click: 'Click to switch this tab back.' }, 'tab dark');
eq(V.explain(st({ why: 'site', site: 'dark', invert: true, want: true, on: true })).text, 'mail.google.com is set to Dark in your site list.', 'site dark');
eq(V.explain(st({ why: 'site', site: 'dark', want: true })).text.includes('already looks dark'), true, 'site dark, page already dark');
eq(V.explain(st({ why: 'setup', invert: true, want: true, on: true, setup: { name: 'Always dark (every page)', mode: 'dark' } })).text, 'Setup “Always dark (every page)”: dark on every page.', 'setup always');
eq(V.explain(st({ why: 'setup', invert: true, want: true, on: true, setup: { name: 'Evening', mode: 'schedule', from: '19:00', to: '07:00' } })).text, 'Setup “Evening”: dark on a schedule, 19:00 to 07:00.', 'schedule');
eq(V.explain(st({ why: 'setup', invert: true, want: true, sys: true, setup: { name: 'Follow system', mode: 'system' } })).text.includes('which is dark now'), true, 'system');
eq(V.explain(st({ why: 'siteoff' })).text, 'mail.google.com is set to Off in your site list.', 'site off'); eq(V.explain(st({ why: 'mesfm', host: 'mes.fm' })).text.startsWith('mes.fm has its own'), true, 'mes.fm');
eq(V.explain(st({ why: 'disabled' })).text.includes('switched off'), true, 'disabled'); eq(V.explain(st({ toolbar: 'menu' })).click, 'Click to open the panel.', 'menu mode');
eq(V.explain(st({ why: 'setup', scope: 'all', invert: true, want: true, on: true, setup: { name: DEF, mode: 'dark' } })).text, 'Every page is dark: the toolbar button is set to change all pages (setup “' + DEF + '”).', 'all pages: the reason names the button');
eq(V.explain(st({ scope: 'all', want: true })).click, 'Click: every page back to normal.', 'all pages, on'); eq(V.explain(st({ scope: 'all' })).click, 'Click: every page dark.', 'all pages, off'); eq(V.explain(null).on, false, 'no content script');
eq(V.siteKey(V.merge({ v: 3, siteModes: { 'example.com': 'dark', 'docs.example.com': 'off' } }), 'a.docs.example.com'), 'docs.example.com', 'site key: longest match');

// ---- reading the settings ----
function fake(sync, local, opts) {
  opts = opts || {};
  return { runtime: { lastError: null }, storage: {
    sync: { get: (k, cb) => { if (opts.syncThrows) throw new Error('no sync'); if (!opts.never) setTimeout(() => cb(sync ? { mesdm: sync } : {}), 1); } },
    local: { get: (k, cb) => { if (!opts.never) setTimeout(() => cb(local ? { mesdm: local } : {}), 1); } } } };
}
let pend = 0;
function load(api, want, label, wait) { pend++; let calls = 0; V.loadStored(api, v => { calls++; setTimeout(() => { eq(calls, 1, label + ' (called once)'); eq(v, want, label); if (!--pend) done(); }, 5); }, wait); }
load(fake({ v: 3, a: 1 }, { v: 3, b: 1 }), { v: 3, a: 1 }, 'sync first');
load(fake(null, { v: 3, b: 1 }), { v: 3, b: 1 }, 'local when sync is empty');
load(fake(null, { v: 3, b: 1 }, { syncThrows: true }), { v: 3, b: 1 }, 'local when sync throws (Brave)');
load(fake(null, null), null, 'nothing stored');
load(fake(null, null, { never: true }), null, 'storage never answers: defaults after the wait', 30);
function done() {
console.log(bad ? bad + ' FAILED of ' + n : 'all ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
}
