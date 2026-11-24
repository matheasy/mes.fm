// node tool_apps_src/flights-tests.js : MESFlights (tool_apps_src/flights/lib.js) + the Vercel function mes.fm/api/flights.js with a mocked fetch.
const fs = require('fs'), path = require('path'), assert = require('assert');
const F = require('./flights/lib.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// byte-identical copy for the server
eq(fs.readFileSync(path.join(__dirname, 'flights/lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../mes.fm/api/_flights-lib.js'), 'utf8'), 'mes.fm/api/_flights-lib.js must equal tool_apps_src/flights/lib.js (cp it)');

// cells: snapped, covering, valid, and the server accepts exactly them
for (let i = 0; i < 3000; i++) {
  const lat = (Math.random() * 176) - 88, lon = Math.random() * 360 - 180, need = Math.random() * 300 + 1, c = F.cellFor(lat, lon, need);
  ok(F.RADII.includes(c.r), 'bucket');
  ok(F.validCell(c.lat, c.lon, c.r), 'server accepts ' + c.key);
  if (!c.partial) ok(F.distNm(lat, lon, +c.lat, +c.lon) + need <= c.r + 1e-6, 'cell covers the view ' + c.key + ' need ' + need.toFixed(1));
  else ok(c.r === 250, 'partial = biggest');
}
eq(F.cellFor(49.21, -123.11, 10).key, '49.25,-123.00,25', 'small cell');
eq(F.cellFor(0.1, -0.1, 10).key, '0.00,0.00,25', 'no -0');
ok(!F.validCell('49.2', '-123.1', 25), 'off-grid refused');
ok(!F.validCell('49.25', '-123.00', 30), 'odd radius refused');
ok(!F.validCell('49.250', '-123.00', 25), 'other spelling refused');
ok(!F.validCell('1e1', '0', 100), 'exponent refused');
ok(F.validCell('49', '-123', 100), 'whole degrees');
eq(F.wrapLon(190), -170); eq(F.wrapLon(-180), 180);

// geometry
ok(Math.abs(F.distNm(49.19, -123.18, 47.45, -122.31) - 110) < 3, 'YVR-SEA ~110 nm');
const p = F.project(0, 0, 360, 90, 60); ok(Math.abs(p[1] - 0.1) < 0.002 && Math.abs(p[0]) < 1e-6, '360 kt east for a minute = 6 nm');
eq(F.project(10, 10, 0, 90, 30), [10, 10]); eq(F.project(10, 10, 400, null, 30), [10, 10]);
ok(F.project(0, 0, 360, 90, 1000)[1] < 0.16, 'capped at 90 s');

// parsing a real answer
const S = JSON.parse(fs.readFileSync(path.join(__dirname, '../mes.fm/flights/data/sample.json'), 'utf8'));
ok(S.cell.ac.length > 20, 'sample has planes'); ok(S.cell.cell && S.cell.cell.r, 'sample cell');
S.cell.ac.forEach((a) => { ok(/^~?[0-9a-f]{6}$/.test(a.h) && typeof a.la === 'number' && typeof a.lo === 'number', 'compact plane'); });
const raw = { now: 1795552000.5, ac: [
  { hex: 'C0573E', flight: 'CGHAZ   ', r: 'C-GHAZ', t: 'DHC3', alt_baro: 1100, gs: 107, track: 232.59, geom_rate: -64, squawk: '6737', category: 'A1', lat: 49.2, lon: -123.9, seen_pos: 1.2, type: 'adsb_icao', dbFlags: 0 },
  { hex: 'ae1234', alt_baro: 'ground', lat: 1, lon: 2, dbFlags: 1, category: 'A7', squawk: '7700', emergency: 'general', type: 'mlat' },
  { hex: 'bad', lat: 1, lon: 2 }, { hex: 'abcdef' }, { hex: 'abcdef', lat: 1, lon: 1, seen_pos: 120 }] };
const pa = F.parseAc(raw);
eq(pa.now, 1795552000500); eq(pa.ac.length, 2, 'bad / no position / stale dropped');
eq(pa.ac[0].h, 'c0573e'); eq(pa.ac[0].f, 'CGHAZ'); eq(pa.ac[0].a, 1100); eq(pa.ac[0].vr, -64); eq(pa.ac[0].tr, 232.6);
eq(pa.ac[1].g, 1); eq(pa.ac[1].m, 1); eq(pa.ac[1].src, 'mlat'); ok(F.isEmerg(pa.ac[1])); ok(F.isHeli(pa.ac[1].c, pa.ac[1].t));
ok(F.isHeli('', 'EC35') && F.isHeli('A3', 'b407') && !F.isHeli('A3', 'B738'), 'helicopter types');
assert.throws(() => F.parseAc({}), /no aircraft/); n++;

// colours
ok(F.altHue(0) === 20 && F.altHue(40000) === 300 && F.altHue(60000) === 300, 'hue ends');
ok(F.altHue(10000) > F.altHue(5000), 'hue rises'); eq(F.altColor({ g: 1 }), '#8a8f98'); ok(/^hsl\(/.test(F.altColor({ a: 35000 })));

// filters
const L = [{ h: 'aaaaa1', f: 'ACA855', a: 35000, t: 'B789' }, { h: 'aaaaa2', r: 'C-GHAZ', a: 900, t: 'DHC3' }, { h: 'aaaaa3', g: 1, f: 'WJA1' },
  { h: 'aaaaa4', a: 1500, c: 'A7', t: 'EC35', m: 1 }, { h: 'aaaaa5', a: 20000, sq: '7700' }];
eq(F.filter(L).length, 5);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { ground: false })).length, 4);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { heli: false })).length, 4);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { onlyMil: true })).map((x) => x.h), ['aaaaa4']);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { onlyEmerg: true })).map((x) => x.h), ['aaaaa5']);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { minAlt: 10000 })).map((x) => x.h), ['aaaaa1', 'aaaaa3', 'aaaaa5'], 'ground kept by its own switch');
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { maxAlt: 10000, ground: false })).map((x) => x.h), ['aaaaa2', 'aaaaa4']);
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { q: 'cghaz' })).map((x) => x.h), ['aaaaa2'], 'registration without dash');
eq(F.filter(L, Object.assign({}, F.DEFAULT_FILTER, { q: 'aca' })).map((x) => x.h), ['aaaaa1']);
eq(F.sort(L, 'alt', 'desc')[0].h, 'aaaaa1'); eq(F.sort(L, 'alt', 'asc')[0].h, 'aaaaa3');

// search kinds
eq(F.findKind('ACA855'), { kind: 'callsign', v: 'ACA855' });
eq(F.findKind('c-ghaz'), { kind: 'reg', v: 'C-GHAZ' });
eq(F.findKind('N123AB'), { kind: 'reg', v: 'N123AB' });
eq(F.findKind('c0573e'), { kind: 'hex', v: 'c0573e' });
eq(F.findKind('ABC123'), { kind: 'callsign', v: 'ABC123' }, 'airline-looking wins');
eq(F.findKind('a b'), { kind: 'callsign', v: 'AB' }); eq(F.findKind(''), null); eq(F.findKind('../etc'), null); eq(F.findKind('X'.repeat(11)), null);

// routes
eq(F.routeUrl('KAL032'), 'https://vrs-standing-data.adsb.lol/routes/KA/KAL32.json');
eq(F.routeUrl('asa453 '), 'https://vrs-standing-data.adsb.lol/routes/AS/ASA453.json');
eq(F.routeUrl('CGHAZ'), null, 'private registration has no route'); eq(F.routeUrl('N123AB'), null);
const rt = F.parseRoute({ callsign: 'JZA845', airline_code: 'JZA', _airports: [{ name: 'San Francisco International Airport', icao: 'KSFO', iata: 'SFO', location: 'San Francisco', countryiso2: 'US', lat: 37.62, lon: -122.37 }, { name: 'Vancouver International Airport', icao: 'CYVR', iata: 'YVR', location: 'Vancouver', countryiso2: 'CA', lat: 49.19, lon: -123.18 }] });
eq(rt.airports[1].iata, 'YVR'); ok(F.routePlausible(rt, 45, -123), 'on the way'); ok(!F.routePlausible(rt, 40, -74), 'New York is not');
ok(Math.abs(F.routeProgress(rt, 49.0, -123.1) - 0.97) < 0.05, 'nearly there'); eq(F.parseRoute({ _airports: [] }), null);

// traces
const tr = F.parseTrace({ icao: '71c081', r: 'HL8081', t: 'B789', desc: 'BOEING 787-9', timestamp: 1000, trace: [[0, 46.4, -120.4, 33975], [10.5, 46.5, -120.5, 'ground'], ['x'], [20, 1, 2, null]] });
eq(tr.pts, [[1000000, 46.4, -120.4, 33975], [1010500, 46.5, -120.5, -1], [1020000, 1, 2, null]]); eq(tr.d, 'BOEING 787-9');
if (S.trace) ok(S.trace.pts.length > 5, 'sample trace');

// formatting + query
eq(F.fmtAlt({ a: 35000 }, 'aviation'), '35,000 ft'); eq(F.fmtAlt({ a: 1000 }, 'metric'), '305 m'); eq(F.fmtAlt({ g: 1 }), 'On the ground');
eq(F.fmtSpeed(100, 'metric'), '185 km/h'); eq(F.fmtSpeed(100, 'imperial'), '115 mph'); eq(F.fmtVr(1500), '↑ 1,500 ft/min'); eq(F.fmtVr(30), 'Level');
eq(F.compass(350), 'N'); eq(F.compass(225), 'SW');
eq(F.parseQuery('?ll=49.2,-123.1&z=8&icao=C0573E'), { ll: [49.2, -123.1], z: 8, icao: 'c0573e' });
eq(F.parseQuery('?ll=200,5&z=99&icao=zzz'), {});
eq(F.placeFor('America/Vancouver'), [49.2, -123.1]); eq(F.placeFor('Europe/Oslo'), [50.1, 8.6]); eq(F.placeFor('x'), [51.5, -0.3]);

// ---- the function, with fake Redis + fake adsb.lol ----
(async () => {
  const api = require('../mes.fm/api/flights.js');
  const store = {}; let calls = 0, mode = 'ok';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://redis.test')) {
      const cmds = JSON.parse(opts.body);
      return { ok: true, json: async () => cmds.map((c) => { const [op, k, v] = c; if (op === 'GET') return { result: store[k] || null }; if (op === 'SET') { store[k] = v; return { result: 'OK' }; } if (op === 'INCR') { store[k] = String((+store[k] || 0) + 1); return { result: +store[k] }; } return { result: 1 }; }) };
    }
    calls++;
    if (mode === '429') return { ok: false, status: 429, headers: { get: () => '120' } };
    if (mode === 'down') throw new Error('ECONNRESET');
    if (/\/1\/trace\//.test(url)) return { ok: true, status: 200, json: async () => ({ icao: 'c0573e', timestamp: 5, trace: [[0, 1, 2, 300]] }) };
    if (/\/v2\/callsign\/NOPE/.test(url)) return { ok: true, status: 200, json: async () => ({ now: 1, ac: [] }) };
    return { ok: true, status: 200, json: async () => raw };
  };
  const run = (query) => new Promise((resolve) => { const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(s) { this.s = s; return this; }, json(b) { resolve({ s: this.s, h: this.h, b }); } }; api({ method: 'GET', query }, res); });
  let r = await run({ lat: '49.2', lon: '-123', r: '25' }); eq(r.s, 400, 'off-grid refused'); eq(calls, 0);
  r = await run({}); eq(r.s, 400);
  r = await run({ lat: '49.25', lon: '-123.00', r: '25' }); eq(r.s, 200); eq(r.b.ac.length, 2); eq(r.b.cell.r, 25); ok(/s-maxage=8/.test(r.h['Cache-Control'])); eq(calls, 1);
  r = await run({ lat: '49.25', lon: '-123.00', r: '25' }); eq(calls, 1, 'second visitor served from cache'); ok(r.b.age >= 0);
  api._reset(); r = await run({ lat: '49.25', lon: '-123.00', r: '25' }); eq(calls, 1, 'other instance served from Redis'); eq(r.b.ac.length, 2);
  r = await run({ trace: 'C0573E' }); eq(r.s, 200); eq(r.b.pts.length, 1);
  r = await run({ trace: '../x' }); eq(r.s, 400);
  r = await run({ find: 'nope' }); eq(r.s, 200); eq(r.b.ac.length, 0);
  r = await run({ mil: '1' }); eq(r.s, 200);
  // 429: stale copy + no more upstream calls until Retry-After
  mode = '429'; api._reset(); store['fl:c:c:49.25,-123.00,25'] = JSON.stringify({ t: Date.now() - 60000, d: { now: 1, ac: [{ h: 'aaaaaa', la: 1, lo: 1 }] } });
  r = await run({ lat: '49.25', lon: '-123.00', r: '25' }); eq(r.s, 200); ok(r.b.limited, 'limited flagged'); eq(r.b.retry, 120); eq(r.b.ac.length, 1);
  const before = calls; r = await run({ lat: '50.00', lon: '-123.00', r: '25' }); eq(calls, before, 'no upstream while blocked'); eq(r.s, 503);
  mode = 'down'; api._reset(); delete store['fl:block'];
  r = await run({ lat: '51.00', lon: '-123.00', r: '25' }); eq(r.s, 503); ok(/Could not reach/.test(r.b.error)); eq(r.h['Cache-Control'], 'no-store');
  r = await new Promise((resolve) => { const res = { h: {}, setHeader() {}, status(s) { this.s = s; return this; }, json(b) { resolve({ s: this.s, b }); } }; api({ method: 'POST', query: {} }, res); }); eq(r.s, 405);
  console.log('flights tests: ' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
