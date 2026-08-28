const { lastNDayKeys, lastNHourKeys } = require('./_bucket-keys');

const TOP_N = 50;

const RANGES = {
  '24h': { unit: 'hourly', count: 24 },
  '7d': { unit: 'daily', count: 7 },
  '30d': { unit: 'daily', count: 30 },
  '365d': { unit: 'daily', count: 365 },
  all: null,
};

function parseMember(member, score) {
  const sep = member.indexOf('|');
  return {
    site: sep === -1 ? member : member.slice(0, sep),
    path: sep === -1 ? '' : member.slice(sep + 1),
    views: Number(score),
  };
}

function randomKey(label) {
  return `pageviews:tmp:${label}:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const range = String(req.query.range || 'all');
  if (!Object.prototype.hasOwnProperty.call(RANGES, range)) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  const config = RANGES[range];

  let commands;
  let leaderboardResultIndex;
  let siteTotalsResultIndex;
  let deviceTotalsResultIndex;

  if (!config) {
    commands = [
      ['ZREVRANGE', 'pageviews:leaderboard', '0', String(TOP_N - 1), 'WITHSCORES'],
      ['HGETALL', 'pageviews:site-totals'],
      ['HGETALL', 'pageviews:device-totals'],
    ];
    leaderboardResultIndex = 0;
    siteTotalsResultIndex = 1;
    deviceTotalsResultIndex = 2;
  } else {
    const now = new Date();
    const bucketKeys = config.unit === 'hourly' ? lastNHourKeys(config.count, now) : lastNDayKeys(config.count, now);
    const leaderboardKeys = bucketKeys.map((k) => `pageviews:leaderboard:${config.unit}:${k}`);
    const siteTotalsKeys = bucketKeys.map((k) => `pageviews:sitetotals:${config.unit}:${k}`);
    const deviceTotalsKeys = bucketKeys.map((k) => `pageviews:devicetotals:${config.unit}:${k}`);
    const destLeaderboard = randomKey('lb');
    const destSiteTotals = randomKey('st');
    const destDeviceTotals = randomKey('dt');

    commands = [
      ['ZUNIONSTORE', destLeaderboard, String(leaderboardKeys.length), ...leaderboardKeys],
      ['ZREVRANGE', destLeaderboard, '0', String(TOP_N - 1), 'WITHSCORES'],
      ['DEL', destLeaderboard],
      ['ZUNIONSTORE', destSiteTotals, String(siteTotalsKeys.length), ...siteTotalsKeys],
      ['ZREVRANGE', destSiteTotals, '0', '-1', 'WITHSCORES'],
      ['DEL', destSiteTotals],
      ['ZUNIONSTORE', destDeviceTotals, String(deviceTotalsKeys.length), ...deviceTotalsKeys],
      ['ZREVRANGE', destDeviceTotals, '0', '-1', 'WITHSCORES'],
      ['DEL', destDeviceTotals],
    ];
    leaderboardResultIndex = 1;
    siteTotalsResultIndex = 4;
    deviceTotalsResultIndex = 7;
  }

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

  const topPagesRaw = results[leaderboardResultIndex]?.result || [];
  const siteTotalsRaw = results[siteTotalsResultIndex]?.result || [];
  const deviceTotalsRaw = results[deviceTotalsResultIndex]?.result || [];

  const topPages = [];
  for (let i = 0; i < topPagesRaw.length; i += 2) {
    topPages.push(parseMember(topPagesRaw[i], topPagesRaw[i + 1]));
  }

  const siteTotals = [];
  for (let i = 0; i < siteTotalsRaw.length; i += 2) {
    siteTotals.push({ site: siteTotalsRaw[i], views: Number(siteTotalsRaw[i + 1]) });
  }
  siteTotals.sort((a, b) => b.views - a.views);

  const deviceTotals = [];
  for (let i = 0; i < deviceTotalsRaw.length; i += 2) {
    deviceTotals.push({ device: deviceTotalsRaw[i], views: Number(deviceTotalsRaw[i + 1]) });
  }
  deviceTotals.sort((a, b) => b.views - a.views);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    range,
    topPages,
    siteTotals,
    deviceTotals,
    updatedAt: new Date().toISOString(),
  });
};
