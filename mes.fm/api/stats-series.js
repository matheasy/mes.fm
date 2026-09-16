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
  const bucketPrefix = config.unit === 'hourly' ? 'pageviews:devicetotals:hourly:' : 'pageviews:devicetotals:daily:';
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

  const points = keys.map((key, i) => {
    const raw = results[i]?.result || [];
    let views = 0;
    for (let j = 1; j < raw.length; j += 2) views += Number(raw[j]);
    return { key, views };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({
    range,
    unit: config.unit,
    points,
    updatedAt: new Date().toISOString(),
  });
};
