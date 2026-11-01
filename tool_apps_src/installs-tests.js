// Tests for mes.fm/installs: the shared lib (TSV, UTF-16 CSV, dataset, sums) and api/installs.js with a mocked fetch.
// Run: node tool_apps_src/installs-tests.js
const path = require('path'), fs = require('fs'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', 'mes.fm');
let fails = 0, passes = 0;
function ok(c, m) { if (c) passes++; else { fails++; console.log('FAIL', m); } }

const L = require('./installs/lib.js');
ok(fs.readFileSync(path.join(__dirname, 'installs/lib.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'api/_installs-lib.js'), 'utf8'), 'api/_installs-lib.js is a byte-identical copy of tool_apps_src/installs/lib.js');

// ---- product types
ok(L.iosKind('1') === 'dl' && L.iosKind('1F') === 'dl' && L.iosKind('1T') === 'dl' && L.iosKind('F1') === 'dl', 'first downloads');
ok(L.iosKind('7') === 'up' && L.iosKind('7F') === 'up' && L.iosKind('3F') === 're' && L.iosKind('IA1') === null, 'updates / re-downloads / in-app');
ok(L.usDate('10/7/2026') === '2026-10-07', 'US date');

// ---- Apple sales TSV
const H = ['Provider', 'Provider Country', 'SKU', 'Developer', 'Title', 'Version', 'Product Type Identifier', 'Units', 'Developer Proceeds', 'Begin Date', 'End Date', 'Customer Currency', 'Country Code', 'Currency of Proceeds', 'Apple Identifier', 'Customer Price', 'Promo Code', 'Parent Identifier', 'Subscription', 'Period', 'Category', 'CMB', 'Device', 'Supported Platforms', 'Proceeds Reason', 'Preserved Pricing', 'Client', 'Order Type'];
const row = (o) => H.map((h) => o[h] == null ? '' : o[h]).join('\t');
const base = { Provider: 'APPLE', 'Begin Date': '10/27/2026', 'End Date': '10/27/2026', 'Developer Proceeds': '0', 'Customer Price': '0' };
const TSV = [H.join('\t'),
  row(Object.assign({}, base, { SKU: 'pct1', Title: 'MES Percentage Calculator', Version: '1.1', 'Product Type Identifier': '1F', Units: '3', 'Country Code': 'US', 'Apple Identifier': '6809222891', Device: 'iPhone' })),
  row(Object.assign({}, base, { SKU: 'pct1', Title: 'MES Percentage Calculator', Version: '1.1', 'Product Type Identifier': '1F', Units: '2', 'Country Code': 'US', 'Apple Identifier': '6809222891', Device: 'iPhone' })),
  row(Object.assign({}, base, { SKU: 'pct1', Title: 'MES Percentage Calculator', Version: '1.1', 'Product Type Identifier': '7F', Units: '4', 'Country Code': 'CA', 'Apple Identifier': '6809222891', Device: 'iPad' })),
  row(Object.assign({}, base, { SKU: 'bmi1', Title: 'MES BMI Calculator', Version: '1.0', 'Product Type Identifier': '3F', Units: '1', 'Country Code': 'IN', 'Apple Identifier': '6899999999', Device: 'iPhone' })),
  row(Object.assign({}, base, { SKU: 'x', Title: 'Remove Ads', 'Product Type Identifier': 'IA1', Units: '5', 'Country Code': 'US', 'Apple Identifier': '1', 'Parent Identifier': 'pct1', Device: 'iPhone' })),
  row(Object.assign({}, base, { SKU: 'zz', Title: 'Someone else', 'Product Type Identifier': '1', Units: '9', 'Country Code': 'US', 'Apple Identifier': '42', Device: 'iPhone' })),
].join('\n') + '\n';
const ir = L.iosRows(TSV);
ok(ir.length === 3, 'iOS rows: duplicates merged, in-app and other apps dropped (' + ir.length + ')');
ok(ir[0].join() === 'pct,dl,US,iPhone,1.1,5', 'merged first downloads');
ok(ir.some((r) => r[0] === 'bmi' && r[1] === 're'), 'BMI matched by title while its App Store id is unknown');

// ---- UTF-16 Play CSV
const CSV = 'Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Daily User Installs,Daily User Uninstalls,Active Device Installs,Install events,Update events,Uninstall events\n' +
  '2026-10-26,fm.mes.percentagecalculator,4,1,2,40,4,1,30,5,2,1\n2026-10-27,fm.mes.percentagecalculator,6,0,0,46,6,0,36,6,0,0\n';
const u16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(CSV, 'utf16le')]);
ok(L.decodeText(new Uint8Array(u16)) === CSV, 'UTF-16LE with BOM decodes');
ok(L.decodeText(Buffer.from(CSV, 'utf16le')) === CSV, 'UTF-16LE without BOM decodes');
ok(L.decodeText(Buffer.from(CSV, 'utf8')) === CSV, 'UTF-8 passes through');
const ov = L.playParse(L.decodeText(u16), 'overview');
ok(ov.daily.length === 2 && ov.daily[0].join() === '2026-10-26,4,2,1,30', 'overview: installs, upgrades, uninstalls, active');
const CC = 'Date,Package Name,Country,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Active Device Installs\n2026-10-27,fm.mes.percentagecalculator,us,3,0,1,20\n2026-10-27,fm.mes.percentagecalculator,"IN",0,0,0,5\n';
const cr = L.playParse(CC, 'country');
ok(cr.dims.length === 1 && cr.dims[0].join() === '2026-10-27,US,3,1', 'country file: upper-cased, zero rows dropped');
ok(L.parseCsv('a,"b,""c"""\r\n1,2').length === 2 && L.parseCsv('a,"b,""c"""\r\n1,2')[0][1] === 'b,"c"', 'CSV quotes');
const OSV = 'Date,Package Name,Android OS Version,Daily Device Installs,Daily Device Upgrades\n2026-10-27,fm.mes.bmicalculator,Android 14,2,0\n';
ok(L.playParse(OSV, 'os_version').dims[0][1] === 'Android 14', 'OS version file');
ok(JSON.stringify(L.playName('stats/installs/installs_fm.mes.gpacalculator_202610_app_version.csv')) === '{"pkg":"fm.mes.gpacalculator","month":"202610","dim":"app_version"}', 'file name parsed');
ok(L.playRating('Date,Package Name,Daily Average Rating,Total Average Rating\n2026-10-26,x,5,4.5\n2026-10-27,x,NA,4.62\n') === 4.62, 'Play rating');

// ---- dataset + sums
const ds = L.buildDataset({ '2026-10-27': ir }, { pct: { overview: ov.daily, country: cr.dims } });
const s = L.summarize(ds, { from: '2026-10-26', to: '2026-10-27' });
ok(s.totals.iosIns === 6 && s.totals.dl === 5 && s.totals.re === 1 && s.totals.up === 6, 'iOS installs = downloads + re-downloads; updates counted');
ok(s.totals.andIns === 10 && s.totals.un === 1 && s.totals.active === 36, 'Android installs, uninstalls, latest active devices');
ok(s.countries[0].key === 'US' && s.countries[0].ins === 8 && s.countries[0].i === 5 && s.countries[0].a === 3, 'countries merged across platforms');
const sI = L.summarize(ds, { plat: 'i', app: 'pct' });
ok(sI.totals.ins === 5 && sI.totals.andIns === 0 && sI.devices.length === 2, 'filter by platform + app (updates-only device rows have no installs but are kept)');
ok(L.rangeDates('7d', '2026-10-27').length === 7 && L.rangeDates('all', '2026-10-27', '2026-10-20').length === 8, 'range dates');

// ---- JWTs
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const ecPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
const api = require(path.join(ROOT, 'api/installs.js'));
const jw = api.appleJwt('ISS-1', 'KEY1', ecPem.replace(/\n/g, '\\n'), Date.parse('2026-10-28T00:00:00Z'));
const [h64, b64, s64] = jw.split('.');
const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
ok(dec(h64).alg === 'ES256' && dec(h64).kid === 'KEY1', 'Apple JWT header');
ok(dec(b64).aud === 'appstoreconnect-v1' && dec(b64).iss === 'ISS-1' && dec(b64).exp - dec(b64).iat <= 1200, 'Apple JWT claims (<= 20 minutes)');
ok(crypto.verify('sha256', Buffer.from(h64 + '.' + b64), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url')), 'Apple JWT signature verifies (escaped \\n key)');
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'installs@x.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const gj = api.googleJwt(SA, 'scope-x').split('.');
ok(dec(gj[1]).iss === SA.client_email && dec(gj[1]).scope === 'scope-x', 'Google JWT claims');
ok(crypto.verify('sha256', Buffer.from(gj[0] + '.' + gj[1]), rsa.publicKey, Buffer.from(gj[2], 'base64url')), 'Google JWT signature verifies');
ok(api.serviceAccount(Buffer.from(JSON.stringify(SA)).toString('base64')).client_email === SA.client_email, 'service account as base64');
ok(api.serviceAccount('{bad') === null && api.bucketName('gs://pubsite_prod_rev_123/stats') === 'pubsite_prod_rev_123', 'bad key / bucket name');

// ---- handler with mocked fetch + fake Redis
function mockRes() { return { h: {}, code: 0, body: null, setHeader(k, v) { this.h[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; }
const store = {};
const calls = [];
global.fetch = async (url, opt) => {
  url = String(url); calls.push(url);
  const resp = (status, body, bin) => ({ ok: status < 300, status, json: async () => JSON.parse(body), text: async () => String(body), arrayBuffer: async () => { const b = bin || Buffer.from(String(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  if (url.startsWith('https://redis.test/pipeline')) {
    const cmds = JSON.parse(opt.body);
    return resp(200, JSON.stringify(cmds.map((c) => {
      if (c[0] === 'MGET') return { result: c.slice(1).map((k) => store[k] || null) };
      if (c[0] === 'GET') return { result: store[c[1]] || null };
      if (c[0] === 'SET') { store[c[1]] = c[2]; return { result: 'OK' }; }
      return { result: null };
    })));
  }
  if (url.includes('itunes.apple.com/lookup')) return resp(200, url.includes('percentage') ? JSON.stringify({ results: [{ trackId: 6809222891, trackViewUrl: 'https://apps.apple.com/us/app/x/id6809222891?uo=4', averageUserRating: 4.8, userRatingCount: 5 }] }) : '{"results":[]}');
  if (url.includes('api.appstoreconnect.apple.com/v1/salesReports')) {
    ok(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(opt.headers.Authorization), 'Apple request carries the JWT');
    if (url.includes('reportDate]=2026-10-27')) return resp(200, '', zlib.gzipSync(Buffer.from(TSV)));
    return resp(404, '{"errors":[{"detail":"There were no sales for the date specified."}]}');
  }
  if (url === 'https://oauth2.googleapis.com/token') { ok(/assertion=/.test(opt.body), 'token request has an assertion'); return resp(200, '{"access_token":"tok"}'); }
  if (url.includes('storage.googleapis.com') && url.includes('/o?')) {
    if (url.includes('installs_fm.mes.percentagecalculator_')) return resp(200, JSON.stringify({ items: [{ name: 'stats/installs/installs_fm.mes.percentagecalculator_202610_overview.csv', generation: '11' }, { name: 'stats/installs/installs_fm.mes.percentagecalculator_202610_country.csv', generation: '12' }] }));
    return resp(200, '{}');
  }
  if (url.includes('storage.googleapis.com') && url.includes('alt=media')) {
    ok(opt.headers.Authorization === 'Bearer tok', 'GCS download uses the token');
    return resp(200, '', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(url.includes('overview') ? CSV : CC, 'utf16le')]));
  }
  return resp(500, 'unexpected ' + url);
};

(async () => {
  // nothing set up: 200 with the missing env names, no store calls
  const saveEnv = Object.assign({}, process.env);
  for (const k of Object.keys(process.env)) if (/^(APPSTORE|PLAY|UPSTASH|INSTALLS)_/.test(k)) delete process.env[k];
  let r = mockRes();
  await api({ query: {} }, r);
  ok(r.code === 200 && r.body.sources.ios.setup === false && r.body.sources.ios.missing.length === 4 && r.body.sources.play.missing.includes('PLAY_BUCKET'), 'not set up: lists the missing env vars');
  ok(!calls.some((u) => /appstoreconnect|storage\.googleapis/.test(u)), 'not set up: no store calls');
  ok(/s-maxage=300/.test(r.h['Cache-Control']), 'not set up: short edge cache');
  ok(r.body.apps.find((a) => a.k === 'pct').ios.rating === 4.8, 'public iOS rating from the lookup');

  Object.assign(process.env, {
    UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't',
    APPSTORE_ISSUER_ID: 'ISS', APPSTORE_KEY_ID: 'K', APPSTORE_PRIVATE_KEY: ecPem, APPSTORE_VENDOR_NUMBER: '8',
    PLAY_SERVICE_ACCOUNT: JSON.stringify(SA), PLAY_BUCKET: 'gs://pubsite_prod_rev_1', INSTALLS_SINCE: '2026-10-20',
  });
  r = mockRes(); calls.length = 0;
  await api({ query: { anything: 'ignored' } }, r);
  const b = r.body;
  ok(r.code === 200 && b.sources.ios.ok && b.sources.play.ok, 'both sources ok: ' + JSON.stringify([b.sources.ios.error, b.sources.play.error]));
  const t = L.summarize(b, {}).totals;
  ok(t.iosIns === 6 && t.andIns === 10, 'handler dataset sums (' + t.iosIns + ', ' + t.andIns + ')');
  ok(JSON.stringify(b).indexOf('PRIVATE KEY') === -1 && JSON.stringify(b).indexOf('ISS') === -1, 'no key material in the answer');
  ok(store['inst:ios:2026-10-27'] && store['inst:play:stats/installs/installs_fm.mes.percentagecalculator_202610_overview.csv'], 'reports cached in Redis');
  // second run: everything fresh -> served from inst:data without store calls
  r = mockRes(); calls.length = 0;
  await api({ query: {} }, r);
  ok(!calls.some((u) => /appstoreconnect|storage\.googleapis\.com\/storage\/v1\/b\/[^/]+\/o\//.test(u) && /alt=media|salesReports/.test(u)) || !b.done, 'cached run does not download again');
  // bad Apple key -> error shown, page still answers
  process.env.APPSTORE_PRIVATE_KEY = 'nonsense'; delete store['inst:data'];
  r = mockRes();
  await api({ query: {} }, r);
  ok(r.code === 200 && r.body.sources.ios.ok === false && r.body.sources.ios.error, 'a broken key is reported, not thrown');
  Object.assign(process.env, saveEnv);

  // sample file is valid
  const sm = JSON.parse(fs.readFileSync(path.join(ROOT, 'installs/data/sample.json'), 'utf8'));
  ok(sm.sample === true && sm.daily.length > 100 && L.summarize(sm, {}).totals.ins > 0, 'sample.json is marked sample and has data');

  console.log(passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
