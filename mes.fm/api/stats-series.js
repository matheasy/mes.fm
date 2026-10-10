const { lastNDayKeys, lastNHourKeys } = require('./_bucket-keys');

// Same range set and hourly/daily split as api/stats.js's RANGES, so the
// client can pass the same range tab value to both endpoints. 24h alone
// gets hourly points -- a day-by-day chart of a single day is one point;
// everything else buckets by day. "all" is capped at the daily buckets'
// own TTL horizon (366 days in track.js) rather than actually unbounded,
// since nothing older than that can still exist to read.
const RANGES = {
  '24h': { unit: 'hourly', count: 24 },
  '7d': { unit: 'daily', count: 7 },
  '30d': { unit: 'daily', count: 30 },
  '365d': { unit: 'daily', count: 365 },
  all: { unit: 'daily', count: 366 },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const range = String(req.query.range || '30d');
  const config = RANGES[range];
  if (!config) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }

  // Reuses the same pageviews:devicetotals:{hourly,daily}:<key> buckets
  // api/stats.js already unions across a whole range -- here each bucket is
  // read on its own instead, since the story is the shape over time, not
  // one total. Summing a bucket's device scores (rather than reading the
  // leaderboard's per-page members) is the cheap way to get its total view
  // count: every view increments exactly one device slot in that bucket.
  const now = new Date();
  const keys = (config.unit === 'hourly' ? lastNHourKeys(config.count, now) : lastNDayKeys(config.count, now)).reverse(); // oldest first
  // ?by=source reads the sourcetotals buckets instead (one extra command per
  // bucket, so the client only asks when the Sources split is opened). The
  // device split rides along on the default call for free: the same bucket
  // read that gives the total already holds every device's score.
  const bySource = req.query.by === 'source';
  const bucketPrefix = `pageviews:${bySource ? 'source' : 'device'}totals:${config.unit === 'hourly' ? 'hourly' : 'daily'}:`;
  // ?pages=site|path,site|path (max 8): per-page series instead of the site
  // total. One ZMSCORE per bucket on the leaderboard bucket (members are
  // "site|path"), so the cost is the bucket count, not pages x buckets. The
  // client asks only for pages it has not already cached for this range.
  if (req.query.pages) {
    const pages = [...new Set(String(req.query.pages).split(','))]
      .filter((m) => m.includes('|') && m.length < 300)
      .slice(0, 8);
    if (!pages.length) {
      res.status(400).json({ error: 'invalid pages' });
      return;
    }
    const lbPrefix = `pageviews:leaderboard:${config.unit}:`;
    let pageResults;
    try {
      const upstashRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(keys.map((k) => ['ZMSCORE', `${lbPrefix}${k}`, ...pages])),
      });
      pageResults = await upstashRes.json();
    } catch {
      res.status(502).json({ error: 'stats unavailable' });
      return;
    }
    if (!Array.isArray(pageResults) || pageResults.some((r) => r && r.error)) {
      res.status(502).json({ error: 'stats unavailable' });
      return;
    }
    // { "site|path": { bucketKey: views } }, zero buckets left out.
    const series = {};
    pages.forEach((m) => { series[m] = {}; });
    keys.forEach((key, i) => {
      const scores = pageResults[i]?.result || [];
      pages.forEach((m, j) => {
        const v = Number(scores[j]);
        if (v > 0) series[m][key] = v;
      });
    });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ range, unit: config.unit, series, updatedAt: new Date().toISOString() });
    return;
  }

  const commands = keys.map((k) => ['ZRANGE', `${bucketPrefix}${k}`, '0', '-1', 'WITHSCORES']);

  let results;
  try {
    const upstashRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    results = await upstashRes.json();
  } catch {
    res.status(502).json({ error: 'stats unavailable' });
    return;
  }

  if (!Array.isArray(results) || results.some((r) => r && r.error)) {
    res.status(502).json({ error: 'stats unavailable' });
    return;
  }

  const points = keys.map((key, i) => {
    const raw = results[i]?.result || [];
    let views = 0;
    const parts = {};
    for (let j = 0; j + 1 < raw.length; j += 2) {
      const v = Number(raw[j + 1]);
      views += v;
      if (v > 0) parts[raw[j]] = v;
    }
    return bySource ? { key, views, s: parts } : { key, views, d: parts };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({
    range,
    unit: config.unit,
    points,
    updatedAt: new Date().toISOString(),
  });
};
