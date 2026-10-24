// Receives Google Search Console numbers for the private mes.fm/search-console page.
//
// google-ads/search-console-gsc-script.js (Google Apps Script, runs in the owner's Google account, calls the Search
// Console API searchanalytics.query) POSTs here. Same shared key as api/earnings-ingest.js: header X-Ingest-Key =
// Vercel env EARNINGS_INGEST_KEY (a plain project-level variable).
//
// Body: { source: "gsc", meta: { property, tz },
//         days: { "YYYY-MM-DD": { t: [clicks, impressions, position], dev: [[device, clicks, impressions, position], ...] } },
//         sums: { "7": { cur: SUM, prev: SUM }, "28": ..., "90": ..., "365": ... } }
// SUM = { start, end, pages: [[page, c, i, pos]], queries: [[query, c, i, pos]], countries: [[cc, c, i, pos]],
//         devices: [[device, c, i, pos]], pq: [[page, query, c, i, pos]] }
// Why range summaries and not only day rows: Search Console works out positions and the top lists over a whole range
// itself (an average of daily top-N rows is wrong for the long tail), and reading 2 x 365 day blobs per request would be
// tens of MB. Day rows (totals + devices, tiny) give the chart; the summaries give the tables.
// Stored: gscdash:day:<date> (one key per day), gscdash:sum:<range>:<cur|prev>, gscdash:meta. ~16 months expiry.
const crypto = require('crypto');

const TTL = 490 * 86400; // ~16 months
const MAX_DAYS = 500;
const RANGES = ['7', '28', '90', '365'];
const LIMITS = { pages: 1000, queries: 1000, countries: 250, devices: 10, pq: 3000 };
const SHAPES = {
  pages: ['s', 'n', 'n', 'n'],
  queries: ['s', 'n', 'n', 'n'],
  countries: ['s', 'n', 'n', 'n'],
  devices: ['s', 'n', 'n', 'n'],
  pq: ['s', 's', 'n', 'n', 'n'],
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sameKey(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanRow(row, types) {
  if (!Array.isArray(row) || row.length !== types.length) return null;
  const out = [];
  for (let i = 0; i < types.length; i++) {
    const v = row[i];
    if (types[i] === 's') {
      if (typeof v !== 'string' || v.length > 400) return null;
      out.push(v.replace(/[\u0000-\u001f]/g, ''));
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      out.push(Math.round(n * 100) / 100);
    }
  }
  return out;
}

function inRange(d, todayMs, maxAge) {
  if (!DATE.test(String(d))) return false;
  const age = (todayMs - Date.parse(d)) / 86400000;
  return age >= -1 && age <= (maxAge || 490);
}

function cleanSum(s, todayMs) {
  if (!s || typeof s !== 'object' || !inRange(s.start, todayMs, 800) || !inRange(s.end, todayMs, 800) || s.start > s.end) return null;
  const out = { start: s.start, end: s.end };
  for (const t of Object.keys(SHAPES)) {
    const rows = Array.isArray(s[t]) ? s[t] : [];
    if (rows.length > LIMITS[t]) return null;
    out[t] = rows.map((r) => cleanRow(r, SHAPES[t])).filter(Boolean);
  }
  return out;
}

// Pure: validate a payload. Returns { error } or { meta, days: [[date, json]], sums: [[key, json]] }.
function parse(body, today) {
  if (!body || typeof body !== 'object') return { error: 'no body' };
  if (body.source !== 'gsc') return { error: 'unknown source' };
  const todayMs = Date.parse(today);
  const dates = Object.keys(body.days || {});
  if (dates.length > MAX_DAYS) return { error: 'days: at most ' + MAX_DAYS };
  const days = [];
  for (const d of dates) {
    if (!inRange(d, todayMs)) return { error: 'bad date ' + d };
    const src = body.days[d] || {};
    const t = cleanRow(src.t, ['n', 'n', 'n']);
    if (!t) return { error: 'bad totals ' + d };
    const dev = (Array.isArray(src.dev) ? src.dev.slice(0, 10) : []).map((r) => cleanRow(r, SHAPES.devices)).filter(Boolean);
    days.push([d, JSON.stringify({ t, dev })]);
  }
  const sums = [];
  for (const r of Object.keys(body.sums || {})) {
    if (!RANGES.includes(r)) return { error: 'bad range ' + r };
    for (const which of ['cur', 'prev']) {
      if (!body.sums[r][which]) continue;
      const s = cleanSum(body.sums[r][which], todayMs);
      if (!s) return { error: 'bad summary ' + r + ' ' + which };
      sums.push([r + ':' + which, JSON.stringify(s)]);
    }
  }
  if (!days.length && !sums.length) return { error: 'nothing to store' };
  const meta = {
    property: String((body.meta || {}).property || '').slice(0, 100),
    tz: String((body.meta || {}).tz || '').slice(0, 60),
  };
  return { meta, days, sums };
}

async function pipeline(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.EARNINGS_INGEST_KEY) return res.status(503).json({ error: 'not set up' });
  if (!sameKey(req.headers['x-ingest-key'], process.env.EARNINGS_INGEST_KEY)) return res.status(401).json({ error: 'bad key' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad json' }); }
  }
  const p = parse(body, new Date().toISOString().slice(0, 10));
  if (p.error) return res.status(400).json({ error: p.error });
  // Upstash caps a request at ~1 MB: send in batches well under that.
  try {
    const cmds = p.days.map(([d, json]) => ['SET', `gscdash:day:${d}`, json, 'EX', String(TTL)])
      .concat(p.sums.map(([k, json]) => ['SET', `gscdash:sum:${k}`, json, 'EX', String(TTL)]));
    let batch = [], size = 0;
    for (const c of cmds) {
      if (size + c[2].length > 700000 && batch.length) { await pipeline(batch); batch = []; size = 0; }
      batch.push(c); size += c[2].length;
    }
    const last = p.days.map((x) => x[0]).sort().pop() || null;
    batch.push(['SET', 'gscdash:meta', JSON.stringify({ at: new Date().toISOString(), property: p.meta.property, tz: p.meta.tz, lastDay: last, days: p.days.length, sums: p.sums.length }), 'EX', String(TTL)]);
    await pipeline(batch);
  } catch (e) {
    return res.status(502).json({ error: 'storage failed' });
  }
  return res.status(200).json({ ok: true, days: p.days.length, sums: p.sums.length });
}

module.exports = handler;
module.exports.parse = parse;
module.exports.sameKey = sameKey;
