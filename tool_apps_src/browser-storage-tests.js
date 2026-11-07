// node tool_apps_src/browser-storage-tests.js
const BS = require('./browser-storage/lib.js');
let n = 0, bad = 0;
function eq(a, b, m) { n++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } }

eq(BS.fmt(0), '0 B', 'fmt 0'); eq(BS.fmt(999), '999 B', 'fmt 999'); eq(BS.fmt(1500), '1.50 KB', 'fmt KB');
eq(BS.fmt(92600000), '92.6 MB', 'fmt MB'); eq(BS.fmt(3.2e9), '3.20 GB', 'fmt GB'); eq(BS.fmt(null), '?', 'fmt null');
eq(BS.pct(1, 3), '33%', 'pct'); eq(BS.pct(1, 100000), '<0.1%', 'pct tiny'); eq(BS.pct(5, 0), '0%', 'pct 0');
eq(BS.strBytes('ab'), 4, 'utf16');

eq(BS.sizeOf('abcd'), 8, 'size string');
eq(BS.sizeOf(new Uint8Array(1000)), 1000, 'size typed');
eq(BS.sizeOf(new ArrayBuffer(64)), 64, 'size buffer');
eq(BS.sizeOf(new Blob(['x'.repeat(5000)])), 5000, 'size blob');
const cyc = { a: 'xx' }; cyc.self = cyc;
eq(BS.sizeOf(cyc) > 0 && BS.sizeOf(cyc) < 100, true, 'cycle safe');
eq(BS.sizeOf({ k: new Uint8Array(10) }), 8 + 2 + 10, 'object');
eq(BS.sizeOf(new Array(1e6).fill(1), 1000) < 9000, true, 'node limit');

const T = { '/photo': 'Photo Editor', '/timer': 'Timer', '/storage': 'Storage Analyzer', '/copy-text': 'Copy Text', '/percentagecalculator': 'Percentage Calculator', '/bmicalculator': 'BMI Calculator', '/3d-studio': '3D Studio' };
eq(BS.owner('mes-photo-editor', T), { tool: 'Photo Editor', path: '/photo' }, 'idb photo');
eq(BS.owner('mes-photo-editor-models', T), { tool: 'Photo Editor', path: '/photo' }, 'cache photo');
eq(BS.owner('mes-timer:v1', T), { tool: 'Timer', path: '/timer' }, 'ls timer');
eq(BS.owner('mes-timer:v1:tab', T), { tool: 'Timer', path: '/timer' }, 'ss timer');
eq(BS.owner('mes-copytext:v1:hiverec', T), { tool: 'Copy Text', path: '/copy-text' }, 'copytext');
eq(BS.owner('mes-bmicalculator:v1:es', T), { tool: 'BMI Calculator', path: '/bmicalculator' }, 'bmi lang');
eq(BS.owner('mes-3d-studio', T), { tool: '3D Studio', path: '/3d-studio' }, '3d studio');
eq(BS.owner('mes-stage:/fluid-simulator', T).tool, 'Simulator box sizes', 'stage');
eq(BS.owner('mes-denoise-models', T).tool, 'Noise removal model (Audio & Video editors)', 'denoise');
eq(BS.owner('pageMode', T).tool, 'Site settings', 'plain setting');
eq(BS.owner('pcLayout', T), { tool: 'Percentage Calculator', path: '/percentagecalculator' }, 'pc layout');
eq(BS.owner('transformers-cache', T).path, '/photo', 'transformers');
eq(BS.owner('keyval-store', T).path, '/image-to-text', 'tesseract');
eq(BS.owner('randomThing', T), { tool: 'Other', path: '' }, 'other');
eq(BS.owner('mes-some-new-tool:v1', {}), { tool: 'Some New Tool', path: '/some-new-tool' }, 'unknown mes key titled');

const g = BS.group([
	{ kind: 'ls', name: 'mes-timer:v1', size: 100, owner: { tool: 'Timer', path: '/timer' } },
	{ kind: 'idb', name: 'mes-photo-editor', size: 9000, owner: { tool: 'Photo Editor', path: '/photo' } },
	{ kind: 'cache', name: 'mes-photo-editor-models', size: null, owner: { tool: 'Photo Editor', path: '/photo' } },
	{ kind: 'ss', name: 'mes-timer:v1:tab', size: 50, owner: { tool: 'Timer', path: '/timer' } }
]);
eq(g.map(x => [x.tool, x.size, x.items.length, x.partial]), [['Photo Editor', 9000, 2, true], ['Timer', 150, 2, false]], 'group');
eq(Object.keys(g[0].kinds).sort(), ['cache', 'idb'], 'group kinds');

const q = BS.quota({ usage: 300, quota: 1000, usageDetails: { indexedDB: 200, caches: 100, serviceWorkerRegistrations: 0 } });
eq([q.free, q.frac, q.parts.map(p => p.label)], [700, 0.3, ['Databases', 'Downloaded files']], 'quota');
eq(BS.quota({}).frac, 0, 'quota empty');

eq(BS.browser('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36', [{ brand: 'Brave' }]), 'brave', 'brave');
eq(BS.browser('Mozilla/5.0 Chrome/130 Safari/537.36 Edg/130'), 'edge', 'edge');
eq(BS.browser('Mozilla/5.0 Gecko/20100101 Firefox/132.0'), 'firefox', 'firefox');
eq(BS.browser('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/18 Safari/605.1.15'), 'safari', 'safari');
eq(BS.browser('Mozilla/5.0 Chrome/130 Safari/537.36 OPR/115'), 'opera', 'opera');
Object.keys(BS.GUIDE).forEach(k => eq(!!(BS.GUIDE[k].name && BS.GUIDE[k].mem && (BS.GUIDE[k].data || BS.GUIDE[k].dataHow)), true, 'guide ' + k));

eq(BS.heap(null), null, 'heap none');
eq(BS.heap({ usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 100 }).frac, 0.1, 'heap frac');

const bk = BS.backup([['a', '1'], ['b', 2]], 5);
eq(BS.readBackup(JSON.stringify(bk)).pairs, [['a', '1'], ['b', '2']], 'backup round trip');
eq(!!BS.readBackup('nope').error, true, 'backup bad json');
eq(!!BS.readBackup('[1,2]').error, true, 'backup array');

console.log(bad ? bad + ' of ' + n + ' FAILED' : 'all ' + n + ' passed');
process.exit(bad ? 1 : 0);
