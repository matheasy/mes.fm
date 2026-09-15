const { lastNDayKeys } = require('./_bucket-keys');

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  let days = parseInt(req.query.days, 10);
  if (!Number.isFinite(days) || days < 1) days = DEFAULT_DAYS;
  days = Math.min(days, MAX_DAYS);

  // Reuses the same pageviews:devicetotals:daily:<date> buckets api/stats.js
  // already unions across a whole range -- here each day's bucket is read on
  // its own instead, since the story is the day-by-day shape, not one total.
  // Summing that day's device scores (rather than reading the leaderboard's
  // per-page members) is the cheap way to get the day's total view count:
  // every view increments exactly one device slot in that bucket.
  const dayKeys = lastNDayKeys(days, new Date()).reverse(); // oldest first
  const commands = dayKeys.map((k) => ['ZRANGE', `pageviews:devicetotals:daily:${k}`, '0', '-1', 'WITHSCORES']);

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

  const series = dayKeys.map((date, i) => {
    const raw = results[i]?.result || [];
    let views = 0;
    for (let j = 1; j < raw.length; j += 2) views += Number(raw[j]);
    return { date, views };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({
    days: series,
    updatedAt: new Date().toISOString(),
  });
};
