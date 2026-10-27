// AI search numbers for the private mes.fm/search-console page (behind the middleware.js password: /api/search-console-ai
// is in its matcher). Neither Google's "Generative AI performance" report nor Bing's "AI Performance" report has an API
// (checked 2026-10-26: searchanalytics.query has no AI search type / appearance, the Bing Webmaster API has no AI method),
// so the owner exports the reports from each console and drops the files on the page; the page parses them in the browser
// (tool_apps_src/search-console/lib.js) and POSTs the clean tables here.
//
// GET                 -> { google: BLOB|null, bing: BLOB|null }
// POST {source: "google", daily: [[date, impressions]], pages: [[url, impressions]], countries: [[name, impressions]], devices: [[name, impressions]], files: [names]}
// POST {source: "bing", daily: [[date, citations, citedPages]], queries: [[query, intent, topic, citations, share %, avgCitedPages]], pages: [[url, citations]], files}
//                     -> merges: days are added / replaced by date (an export of the last 3 months does not wipe older months),
//                        tables (pages, countries, ...) replace the stored ones and keep the period of the export they came from.
// DELETE ?src=google|bing -> removes that source's imported numbers.
// POST / DELETE must be JSON from https://mes.fm itself (Origin checked: the password the browser remembers would otherwise
// also ride along on a form another site posts here).
// Stored: gscdash:ai:google, gscdash:ai:bing (one JSON blob each, ~2 years, renewed on every import).
const TTL = 730 * 86400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY = 1500000;
const MAX_DAYS = 800;
const LIMITS = { pages: 5000, countries: 300, devices: 10, queries: 5000 };
const SHAPES = {
  google: { daily: ['d', 'n'], pages: ['s', 'n'], countries: ['s', 'n'], devices: ['s', 'n'] },
  bing: { daily: ['d', 'n', 'n'], queries: ['s', 's', 's', 'n', 'n', 'n'], pages: ['s', 'n'] },
};
const ORIGINS = ['https://mes.fm', 'https://www.mes.fm'];

async function redis(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}
const pj = (v) => { if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };

function cleanRow(row, types) {
  if (!Array.isArray(row) || row.length !== types.length) return null;
  const out = [];
  for (let i = 0; i < types.length; i++) {
    const v = row[i];
    if (types[i] === 'd') { if (typeof v !== 'string' || !DATE.test(v) || v < '2000-01-01' || v > '2100-01-01') return null; out.push(v); }
    else if (types[i] === 's') { if (typeof v !== 'string' || v.length > 500) return null; out.push(v.replace(/[\u0000-\u001f\u007f]/g, '').trim()); }
    else { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e12) return null; out.push(Math.round(n * 100) / 100); }
  }
  return out;
}

// -> { source, daily?, tables: {...}, files } or { error }
function parse(body) {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };
  const source = body.source;
  if (!SHAPES[source]) return { error: 'source must be google or bing' };
  const out = { source, tables: {}, files: [] };
  let any = false;
  for (const key of Object.keys(body)) {
    if (key === 'source' || key === 'files' || key === 'period') continue;
    const types = SHAPES[source][key];
    if (!types) return { error: 'unknown table: ' + key };
    const rows = body[key];
    if (!Array.isArray(rows)) return { error: key + ' must be a list' };
    const lim = key === 'daily' ? MAX_DAYS : LIMITS[key];
    if (rows.length > lim) return { error: key + ': at most ' + lim + ' rows' };
    const clean = [];
    for (const r of rows) {
      const c = cleanRow(r, types);
      if (!c) return { error: key + ': bad row ' + JSON.stringify(r).slice(0, 80) };
      clean.push(c);
    }
    if (key === 'daily') out.daily = clean; else out.tables[key] = clean;
    if (clean.length) any = true;
  }
  if (!any) return { error: 'nothing to import' };
  if (Array.isArray(body.files)) out.files = body.files.filter((f) => typeof f === 'string').slice(0, 30).map((f) => f.replace(/[\u0000-\u001f]/g, '').slice(0, 120));
  return out;
}

// merge a parsed import into the stored blob
function merge(old, p, now) {
  const blob = old && typeof old === 'object' ? old : { daily: {} };
  blob.daily = blob.daily || {};
  if (p.daily) for (const r of p.daily) blob.daily[r[0]] = p.source === 'google' ? r[1] : [r[1], r[2]];
  const days = Object.keys(blob.daily).sort();
  while (days.length > MAX_DAYS) delete blob.daily[days.shift()];
  const period = p.daily && p.daily.length ? { from: p.daily.map((r) => r[0]).sort()[0], to: p.daily.map((r) => r[0]).sort().pop() } : null;
  for (const k of Object.keys(p.tables)) {
    blob[k] = p.tables[k].slice().sort((a, b) => (p.source === 'bing' && k === 'queries' ? b[3] - a[3] : b[1] - a[1]));
    blob.tp = blob.tp || {};
    blob.tp[k] = period || (blob.tp[k] || null); // the export period the table covers (unknown when the file had no dates)
  }
  blob.at = new Date(now || Date.now()).toISOString();
  blob.imports = [{ at: blob.at, files: p.files, days: p.daily ? p.daily.length : 0, tables: Object.keys(p.tables) }].concat(blob.imports || []).slice(0, 10);
  return blob;
}

// deps = { get(key) -> string|null, set(key, string), del(key) } (Redis in production, a Map in tests and sc-mock.js)
async function respond(req, deps) {
  const method = req.method || 'GET';
  if (method === 'GET') {
    const [g, b] = await Promise.all([deps.get('gscdash:ai:google'), deps.get('gscdash:ai:bing')]);
    return { status: 200, body: { google: pj(g), bing: pj(b) } };
  }
  if (method !== 'POST' && method !== 'DELETE') return { status: 405, body: { error: 'GET, POST or DELETE' } };
  if (!req.local && !ORIGINS.includes(String(req.origin || ''))) return { status: 403, body: { error: 'wrong origin' } };
  if (method === 'DELETE') {
    const src = String((req.query || {}).src || '');
    if (!SHAPES[src]) return { status: 400, body: { error: 'src must be google or bing' } };
    await deps.del('gscdash:ai:' + src);
    return { status: 200, body: { ok: true } };
  }
  if (!/^application\/json/i.test(String(req.contentType || ''))) return { status: 415, body: { error: 'JSON only' } };
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY) return { status: 413, body: { error: 'too large' } };
    try { body = JSON.parse(body); } catch (e) { return { status: 400, body: { error: 'bad JSON' } }; }
  } else if (JSON.stringify(body || {}).length > MAX_BODY) return { status: 413, body: { error: 'too large' } };
  const p = parse(body);
  if (p.error) return { status: 400, body: { error: p.error } };
  const key = 'gscdash:ai:' + p.source;
  const blob = merge(pj(await deps.get(key)), p, req.now);
  const s = JSON.stringify(blob);
  if (s.length > 4000000) return { status: 413, body: { error: 'stored data would be too large' } };
  await deps.set(key, s);
  return { status: 200, body: { ok: true, source: p.source, days: Object.keys(blob.daily).length, blob } };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const out = await respond({
      method: req.method, query: req.query, body: req.body, origin: req.headers.origin,
      contentType: req.headers['content-type'],
    }, {
      get: async (k) => { const r = await redis([['GET', k]]); return r[0] && r[0].result; },
      set: async (k, v) => { await redis([['SET', k, v, 'EX', String(TTL)]]); },
      del: async (k) => { await redis([['DEL', k]]); },
    });
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
Object.assign(module.exports, { parse, merge, respond, SHAPES, LIMITS });
