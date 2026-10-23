// Receives the daily numbers for the private mes.fm/ads page.
//
// Two scripts that run inside the owner's own Google accounts POST here once a day:
//   source "gads"    -> Google Ads Script (google-ads/ads-dashboard-gads-script.js): spend per campaign x device,
//                       per country and per landing page, in the Ads account currency (VND), cost in micros
//   source "adsense" -> Google Apps Script with the AdSense service (google-ads/ads-dashboard-adsense-script.js):
//                       earnings / page views per page URL, country, platform and domain, in CAD
// The request must carry the shared key in the X-Ingest-Key header (Vercel env EARNINGS_INGEST_KEY,
// a plain project-level variable: Shared Environment Variables never reach functions on this account).
// Named "earnings" rather than "ads" so ad blockers don't block it.
//
// Body: { source, meta: { currency, tz }, days: { "YYYY-MM-DD": { <table>: [[...row], ...] } } }
// Each day is stored whole as adsdash:<source>:<date> (JSON, 400-day expiry) so a re-run replaces it.
const crypto = require('crypto');

const TTL = 400 * 86400;
const MAX_DAYS = 120;
const MAX_ROWS = 5000;
// table -> [column types]: s = string (<= 300 chars), n = finite number >= 0
const SHAPES = {
  gads: {
    camps: ['s', 's', 'n', 'n', 'n'], // campaign, device, impressions, clicks, cost micros
    geo: ['s', 's', 's', 'n', 'n', 'n'], // country code, country name, campaign, impressions, clicks, cost micros
    lp: ['s', 's', 'n', 'n'], // landing page URL, campaign, clicks, cost micros
  },
  adsense: {
    pages: ['s', 'n', 'n', 'n', 'n'], // page URL, earnings, page views, impressions, clicks
    geo: ['s', 's', 'n', 'n'], // country code, country name, earnings, page views
    dev: ['s', 'n', 'n'], // platform, earnings, page views
    dom: ['s', 'n', 'n'], // domain, earnings, page views
  },
};

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
      if (typeof v !== 'string' || v.length > 300) return null;
      out.push(v.replace(/[\u0000-\u001f]/g, ''));
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      out.push(Math.round(n * 1e4) / 1e4);
    }
  }
  return out;
}

// Pure: validate a payload. Returns { error } or { source, meta, days: [[date, json]] }.
function parse(body, today) {
  if (!body || typeof body !== 'object') return { error: 'no body' };
  const shapes = SHAPES[body.source];
  if (!shapes) return { error: 'unknown source' };
  const dates = Object.keys(body.days || {});
  if (!dates.length || dates.length > MAX_DAYS) return { error: 'days: 1-' + MAX_DAYS };
  const todayMs = Date.parse(today);
  const days = [];
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'bad date ' + d };
    const age = (todayMs - Date.parse(d)) / 86400000;
    if (!(age >= -1 && age <= 400)) return { error: 'date out of range ' + d };
    const src = body.days[d] || {};
    const day = {};
    for (const t of Object.keys(shapes)) {
      const rows = Array.isArray(src[t]) ? src[t] : [];
      if (rows.length > MAX_ROWS) return { error: t + ' has too many rows' };
      day[t] = rows.map((r) => cleanRow(r, shapes[t])).filter(Boolean);
    }
    days.push([d, JSON.stringify(day)]);
  }
  const meta = {
    currency: /^[A-Z]{3}$/.test(String((body.meta || {}).currency)) ? body.meta.currency : '',
    tz: String((body.meta || {}).tz || '').slice(0, 60),
  };
  return { source: body.source, meta, days };
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
  // Upstash caps a request at ~1 MB: send the days in batches well under that.
  try {
    let batch = [];
    let size = 0;
    for (const [d, json] of p.days) {
      if (size + json.length > 700000 && batch.length) { await pipeline(batch); batch = []; size = 0; }
      batch.push(['SET', `adsdash:${p.source}:${d}`, json, 'EX', String(TTL)]);
      size += json.length;
    }
    batch.push(['SET', `adsdash:meta:${p.source}`, JSON.stringify({ at: new Date().toISOString(), currency: p.meta.currency, tz: p.meta.tz, days: p.days.length }), 'EX', String(TTL)]);
    await pipeline(batch);
  } catch (e) {
    return res.status(502).json({ error: 'storage failed' });
  }
  return res.status(200).json({ ok: true, source: p.source, days: p.days.length });
}

module.exports = handler;
module.exports.parse = parse;
module.exports.sameKey = sameKey;
