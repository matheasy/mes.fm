const { dayKey, hourKey } = require('./_bucket-keys');

const MAX_LEN = 200;
// Only accept mes.fm itself and its subdomains -- rejects Vercel preview/
// deployment hostnames (*.vercel.app) and anything else spoofed in.
const SITE_RE = /^([a-z0-9-]+\.)*mes\.fm$/i;

const HOUR_TTL = 26 * 3600; // covers the rolling 24h window plus buffer
const DAY_TTL = 366 * 86400; // covers the rolling 365d window plus buffer

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = req.body || {};
  const site = String(body.site || '').trim();
  const path = String(body.path || '/').trim().slice(0, MAX_LEN);

  if (!SITE_RE.test(site) || !path.startsWith('/')) {
    res.status(400).json({ error: 'invalid site or path' });
    return;
  }

  const member = `${site}|${path}`;
  const now = new Date();
  const hk = hourKey(now);
  const dk = dayKey(now);
  const hourlyLeaderboard = `pageviews:leaderboard:hourly:${hk}`;
  const hourlySiteTotals = `pageviews:sitetotals:hourly:${hk}`;
  const dailyLeaderboard = `pageviews:leaderboard:daily:${dk}`;
  const dailySiteTotals = `pageviews:sitetotals:daily:${dk}`;

  const commands = [
    ['ZINCRBY', 'pageviews:leaderboard', '1', member],
    ['HINCRBY', 'pageviews:site-totals', site, '1'],
    ['ZINCRBY', hourlyLeaderboard, '1', member],
    ['EXPIRE', hourlyLeaderboard, String(HOUR_TTL)],
    ['ZINCRBY', hourlySiteTotals, '1', site],
    ['EXPIRE', hourlySiteTotals, String(HOUR_TTL)],
    ['ZINCRBY', dailyLeaderboard, '1', member],
    ['EXPIRE', dailyLeaderboard, String(DAY_TTL)],
    ['ZINCRBY', dailySiteTotals, '1', site],
    ['EXPIRE', dailySiteTotals, String(DAY_TTL)],
  ];

  try {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
  } catch {
    // best-effort tracking, never block the page for it
  }

  res.status(204).end();
};
