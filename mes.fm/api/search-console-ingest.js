// Receives Google Search Console numbers for the private mes.fm/search-console page.
//
// google-ads/search-console-gsc-script.js (Google Apps Script, runs in the owner's Google account, calls the Search
// Console API searchanalytics.query) POSTs here. Same shared key as api/earnings-ingest.js: header X-Ingest-Key =
// Vercel env EARNINGS_INGEST_KEY (a plain project-level variable).
//
// Body: { source: "gsc", meta: { property, tz, fresh: "YYYY-MM-DD" (Search Console's firstIncompleteDate) },
//         days: { "YYYY-MM-DD": { t: [clicks, impressions, position], dev: [[device, clicks, impressions, position], ...],
//                                 f: 1 when Google still calls the day incomplete ("fresh data"),
//                                 h: [[hour 0-23 Pacific, clicks, impressions, position], ...] (hourly, the last few days only) } },
//         dims: { "YYYY-MM-DD": { a: SET, p: SET, b: SET, q: SET } }  (day-by-day breakdowns, the last ~180 days, used for filters)
//         SET = { s: [strings], r: [[string indexes..., clicks, impressions, position]] }, a dictionary-encoded table:
//           a = [country, device] (complete: no query / page dimension, so Google hides nothing),
//           p = [page] (complete page totals: the fewer dimensions, the less Search Console leaves out; script v3+),
//           b = [page, country, device], q = [query, page, country, device] (rare queries hidden by Google).
//         sums: { "7": { cur: SUM, prev: SUM }, "28": ..., "90": ..., "365": ... } }
// SUM = { start, end, pages: [[page, c, i, pos]], queries: [[query, c, i, pos]], countries: [[cc, c, i, pos]],
//         devices: [[device, c, i, pos]], pq: [[page, query, c, i, pos]] }
// Why range summaries and not only day rows: Search Console works out positions and the top lists over a whole range
// itself (an average of daily top-N rows is wrong for the long tail), and reading 2 x 365 day blobs per request would be
// tens of MB. Day rows (totals + devices, tiny) give the chart; the summaries give the tables.
// Stored: gscdash:day:<date> (one key per day), gscdash:sum:<range>:<cur|prev>, gscdash:meta (written with day rows),
// gscdash:at (time of the last POST), gscdash:da|dp|db|dq:<date> (breakdowns, 200 days). ~16 months expiry.
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
const DIM_TTL = 200 * 86400;
const MAX_DIM_DATES = 45; // per POST (the script sends a few days at a time)
// indexes per row and the most strings / rows one day may carry
const DIMSETS = { a: { n: 2, s: 3000, r: 4000 }, p: { n: 1, s: 6000, r: 6000 }, b: { n: 3, s: 6000, r: 8000 }, q: { n: 4, s: 14000, r: 8000 } };

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

function cleanDimSet(x, spec) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.s) || !Array.isArray(x.r)) return null;
  if (x.s.length > spec.s || x.r.length > spec.r) return null;
  const s = [];
  for (const v of x.s) {
    if (typeof v !== 'string' || v.length > 400) return null;
    s.push(v.replace(/[\u0000-\u001f]/g, ''));
  }
  const r = [];
  for (const row of x.r) {
    if (!Array.isArray(row) || row.length !== spec.n + 3) return null;
    const out = [];
    for (let k = 0; k < spec.n; k++) {
      const ix = row[k];
      if (!Number.isInteger(ix) || ix < 0 || ix >= s.length) return null;
      out.push(ix);
    }
    for (let k = spec.n; k < spec.n + 3; k++) {
      const n = Number(row[k]);
      if (!Number.isFinite(n) || n < 0) return null;
      out.push(Math.round(n * 100) / 100);
    }
    r.push(out);
  }
  return { s, r };
}

function cleanHours(h) {
  if (!Array.isArray(h)) return null;
  const out = [];
  for (const row of h.slice(0, 24)) {
    const c = cleanRow(row, ['n', 'n', 'n', 'n']);
    if (c && Number.isInteger(c[0]) && c[0] <= 23) out.push(c);
  }
  return out.length ? out.sort((a, b) => a[0] - b[0]) : null;
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
    const blob = { t, dev };
    if (src.f) blob.f = 1;
    const h = cleanHours(src.h);
    if (h) blob.h = h;
    days.push([d, JSON.stringify(blob)]);
  }
  const dimDates = Object.keys(body.dims || {});
  if (dimDates.length > MAX_DIM_DATES) return { error: 'dims: at most ' + MAX_DIM_DATES + ' days per request' };
  const dims = [];
  for (const d of dimDates) {
    if (!inRange(d, todayMs, 200)) return { error: 'bad dims date ' + d };
    const src = body.dims[d] || {};
    for (const set of Object.keys(src)) {
      if (!DIMSETS[set]) return { error: 'bad dims set ' + set };
      const clean = cleanDimSet(src[set], DIMSETS[set]);
      if (!clean) return { error: 'bad dims ' + set + ' ' + d };
      dims.push(['d' + set + ':' + d, JSON.stringify(clean)]);
    }
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
  if (!days.length && !sums.length && !dims.length) return { error: 'nothing to store' };
  const fresh = String((body.meta || {}).fresh || '');
  const meta = {
    property: String((body.meta || {}).property || '').slice(0, 100),
    tz: String((body.meta || {}).tz || '').slice(0, 60),
    fresh: DATE.test(fresh) ? fresh : null,
  };
  return { meta, days, sums, dims };
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
      .concat(p.sums.map(([k, json]) => ['SET', `gscdash:sum:${k}`, json, 'EX', String(TTL)]))
      .concat(p.dims.map(([k, json]) => ['SET', `gscdash:${k}`, json, 'EX', String(DIM_TTL)]));
    let batch = [], size = 0;
    for (const c of cmds) {
      if (size + c[2].length > 700000 && batch.length) { await pipeline(batch); batch = []; size = 0; }
      batch.push(c); size += c[2].length;
    }
    const at = new Date().toISOString();
    // meta (newest day, fresh-data start) only comes with day rows, so a summaries- or breakdowns-only POST never blanks it
    if (p.days.length) {
      const last = p.days.map((x) => x[0]).sort().pop() || null;
      batch.push(['SET', 'gscdash:meta', JSON.stringify({ at, property: p.meta.property, tz: p.meta.tz, lastDay: last, fresh: p.meta.fresh, days: p.days.length }), 'EX', String(TTL)]);
    }
    batch.push(['SET', 'gscdash:at', at, 'EX', String(TTL)]);
    await pipeline(batch);
  } catch (e) {
    return res.status(502).json({ error: 'storage failed' });
  }
  return res.status(200).json({ ok: true, days: p.days.length, sums: p.sums.length, dims: p.dims.length });
}

module.exports = handler;
module.exports.parse = parse;
module.exports.sameKey = sameKey;
