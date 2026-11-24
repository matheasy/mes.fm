// Live aircraft for mes.fm/flights, from adsb.lol (ODbL; https://api.adsb.lol). Informational only.
//
// GET /api/flights?lat=49.00&lon=-123.00&r=100  planes within r nautical miles of a grid point (lat / lon / r must be a cell from
//                                               L.cellFor: r in 25, 50, 100, 175, 250 and the centre on that radius' grid; anything
//                                               else is refused, so this is not a general proxy and nearby visitors share one cache)
// GET /api/flights?mil=1                        every military aircraft adsb.lol sees, worldwide
// GET /api/flights?find=ACA855                  look one aircraft up by callsign, registration (C-GHAZ, N123AB) or ICAO hex
// GET /api/flights?trace=71c081                 the last ~hour of positions of one aircraft (its trail)
//
// adsb.lol allows 500 calls a day per address without a key (env ADSBLOL_API_KEY raises it: sent as x-api-key), so every answer is
// kept in Upstash (fl:c:<key>, same vars as api/fav.js) and in a warm-instance memo: a cell is asked upstream at most once every
// TTL seconds whoever is looking. On a 429 the last copy is served with `limited` and no new upstream call is made until Retry-After.
// fl:n:<UTC date> counts upstream calls (monitoring). Answers: { now, ac: [compact planes, see _flights-lib.js slim()], age, limited? }
const L = require('./_flights-lib.js');

const UA = 'mes.fm-flights/1.0 (+https://mes.fm/flights)';
const BASE = 'https://api.adsb.lol';
const TTL = { cell: 8, mil: 30, find: 20, trace: 45 };
const KEEP = 900; // seconds a copy stays usable as a stale fallback
const memo = new Map();
let blockedUntil = 0;

async function redis(commands) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return (await r.json()).map((x) => x.result);
  } catch (e) { return null; }
}

async function upstream(path, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 9000);
  const headers = { 'user-agent': UA, accept: 'application/json' };
  if (process.env.ADSBLOL_API_KEY) headers['x-api-key'] = process.env.ADSBLOL_API_KEY;
  try {
    const r = await fetch(BASE + path, { headers, signal: ctl.signal });
    if (r.status === 429) { const e = new Error('busy'); e.retry = Math.min(3600, Math.max(30, parseInt(r.headers.get('retry-after'), 10) || 300)); throw e; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timed out');
    throw e;
  } finally { clearTimeout(t); }
}

// which upstream path, cache key, TTL and parser a request means; null = refused
function plan(q) {
  if (q.trace != null) {
    const h = String(q.trace).toLowerCase(); if (!/^~?[0-9a-f]{6}$/.test(h)) return null;
    return { key: 'tr:' + h, ttl: TTL.trace, path: '/1/trace/recent/' + encodeURIComponent(h), parse: L.parseTrace };
  }
  if (q.find != null) {
    const k = L.findKind(q.find); if (!k) return null;
    return { key: 'f:' + k.kind + ':' + k.v, ttl: TTL.find, path: '/v2/' + k.kind + '/' + encodeURIComponent(k.v), parse: L.parseAc, kind: k.kind };
  }
  if (q.mil != null) return { key: 'mil', ttl: TTL.mil, path: '/v2/mil', parse: L.parseAc };
  const c = L.validCell(q.lat, q.lon, q.r);
  if (!c) return null;
  return { key: 'c:' + c.key, ttl: TTL.cell, path: '/v2/point/' + c.lat + '/' + c.lon + '/' + c.r, parse: L.parseAc, cell: c };
}

async function answer(q) {
  const p = plan(q || {});
  if (!p) return { status: 400, body: { error: 'Ask for a map cell (lat, lon, r from the page), mil=1, find=<callsign / registration / hex> or trace=<hex>.' } };
  const now = Date.now();
  let have = memo.get(p.key);
  if (!have || now - have.t > p.ttl * 1000) {
    const got = await redis([['GET', 'fl:c:' + p.key], ['GET', 'fl:block']]);
    if (got) {
      if (got[0]) { try { const x = JSON.parse(got[0]); if (!have || x.t > have.t) have = x; } catch (e) { /* ignore */ } }
      if (got[1]) blockedUntil = Math.max(blockedUntil, +got[1] || 0);
    }
  }
  const fresh = have && now - have.t <= p.ttl * 1000;
  if (fresh) { memo.set(p.key, have); return { status: 200, ttl: Math.max(1, p.ttl - Math.floor((now - have.t) / 1000)), body: Object.assign({ age: Math.round((now - have.t) / 1000) }, have.d) }; }
  const stale = (msg, retry) => {
    if (have && now - have.t <= KEEP * 1000) return { status: 200, ttl: 5, body: Object.assign({}, have.d, { age: Math.round((now - have.t) / 1000), limited: msg, retry: retry || null }) };
    return { status: 503, ttl: 0, body: { error: msg, retry: retry || null } };
  };
  if (blockedUntil > now) return stale('The free flight data feed is busy right now, so the planes are not updating. Trying again soon.', Math.round((blockedUntil - now) / 1000));
  let raw;
  try { raw = await upstream(p.path, p.key.startsWith('tr:') ? 12000 : 9000); }
  catch (e) {
    if (e.retry) {
      blockedUntil = now + e.retry * 1000;
      await redis([['SET', 'fl:block', String(blockedUntil), 'EX', e.retry]]);
      return stale('The free flight data feed is busy right now, so the planes are not updating. Trying again soon.', e.retry);
    }
    return stale('Could not reach the flight data feed (' + String(e.message || e).slice(0, 80) + ').');
  }
  const day = new Date(now).toISOString().slice(0, 10);
  let d;
  if (raw == null) d = p.key.startsWith('tr:') ? { pts: [] } : { now, ac: [] };
  else { try { d = p.parse(raw); } catch (e) { return stale('The flight data feed sent something unreadable.'); } }
  if (p.cell) d.cell = { lat: p.cell.lat, lon: p.cell.lon, r: p.cell.r };
  const rec = { t: now, d };
  memo.set(p.key, rec);
  if (memo.size > 400) memo.delete(memo.keys().next().value);
  await redis([['SET', 'fl:c:' + p.key, JSON.stringify(rec), 'EX', KEEP], ['INCR', 'fl:n:' + day], ['EXPIRE', 'fl:n:' + day, 864000]]);
  return { status: 200, ttl: p.ttl, body: Object.assign({ age: 0 }, d) };
}

module.exports = async (req, res) => {
  try {
    if (req.method && req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
    const out = await answer(req.query || {});
    res.setHeader('Cache-Control', out.ttl ? `public, s-maxage=${out.ttl}, stale-while-revalidate=20` : 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(out.status).json(out.body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'flights failed' });
  }
};
module.exports.answer = answer;
module.exports.plan = plan;
module.exports._reset = () => { memo.clear(); blockedUntil = 0; };

// node mes.fm/api/flights.js --sample  -> records a real answer for the page's local preview (mes.fm/flights/data/sample.json)
if (require.main === module && process.argv.includes('--sample')) {
  const fs = require('fs'), path = require('path');
  (async () => {
    const c = L.cellFor(49.2, -123.1, 150), d = L.parseAc(await upstream('/v2/point/' + c.lat + '/' + c.lon + '/' + c.r, 15000));
    d.cell = { lat: c.lat, lon: c.lon, r: c.r };
    const pick = d.ac.filter((p) => !p.g && p.f && p.gs > 200).sort((a, b) => b.a - a.a)[0];
    let trace = null; if (pick) { try { trace = L.parseTrace(await upstream('/1/trace/recent/' + pick.h, 15000)); } catch (e) { trace = null; } }
    const mil = L.parseAc(await upstream('/v2/mil', 15000));
    mil.ac = mil.ac.slice(0, 120);
    fs.writeFileSync(path.join(__dirname, '..', 'flights', 'data', 'sample.json'), JSON.stringify({ cell: d, trace, mil }));
    console.log('planes', d.ac.length, 'trace', trace && trace.pts.length, 'mil', mil.ac.length);
  })().catch((e) => { console.error(e); process.exit(1); });
}
