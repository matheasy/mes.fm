const { lastNDayKeys, lastNHourKeys } = require('./_bucket-keys');

const TOP_N = 50;

// Must match the categories api/track.js's detectDevice() can produce.
const DEVICES = ['desktop', 'mobile', 'tablet', 'tv', 'bot', 'unknown'];

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

async function runPipeline(commands) {
  const upstashRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  return upstashRes.json();
}

// Given a list of entities (already in the order the caller wants results
// attached in) and a flat ZMSCORE result whose members were built as
// DEVICES.length scores per entity in DEVICES order, unflatten it into one
// { desktop: n, mobile: n, ... } object per entity.
function unflattenDeviceScores(entityCount, scoresFlat) {
  const perEntity = [];
  for (let i = 0; i < entityCount; i++) {
    const deviceViews = {};
    DEVICES.forEach((device, j) => {
      const raw = scoresFlat[i * DEVICES.length + j];
      deviceViews[device] = raw == null ? 0 : Number(raw);
    });
    perEntity.push(deviceViews);
  }
  return perEntity;
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
  const bucketKeys = config
    ? (config.unit === 'hourly' ? lastNHourKeys(config.count, new Date()) : lastNDayKeys(config.count, new Date()))
    : null;

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
    results = await runPipeline(commands);
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

  // Second round trip: now that we know which pages/sites made the cut, pull
  // their per-device breakdown via ZMSCORE (one command, many members --
  // order-based, so no need to parse composite members back apart). This is
  // best-effort: if it fails, the tables above still render, just without
  // the device columns.
  const pageDeviceMembers = topPages.flatMap((p) => DEVICES.map((d) => `${p.site}|${p.path}|${d}`));
  const siteDeviceMembers = siteTotals.flatMap((s) => DEVICES.map((d) => `${s.site}|${d}`));

  const commands2 = [];
  let pageDeviceScoreIndex = -1;
  let siteDeviceScoreIndex = -1;

  if (pageDeviceMembers.length) {
    if (!config) {
      commands2.push(['ZMSCORE', 'pageviews:pagedevices', ...pageDeviceMembers]);
      pageDeviceScoreIndex = commands2.length - 1;
    } else {
      const pageDeviceKeys = bucketKeys.map((k) => `pageviews:pagedevices:${config.unit}:${k}`);
      const destPageDevices = randomKey('pd');
      commands2.push(['ZUNIONSTORE', destPageDevices, String(pageDeviceKeys.length), ...pageDeviceKeys]);
      commands2.push(['ZMSCORE', destPageDevices, ...pageDeviceMembers]);
      pageDeviceScoreIndex = commands2.length - 1;
      commands2.push(['DEL', destPageDevices]);
    }
  }

  if (siteDeviceMembers.length) {
    if (!config) {
      commands2.push(['ZMSCORE', 'pageviews:sitedevices', ...siteDeviceMembers]);
      siteDeviceScoreIndex = commands2.length - 1;
    } else {
      const siteDeviceKeys = bucketKeys.map((k) => `pageviews:sitedevices:${config.unit}:${k}`);
      const destSiteDevices = randomKey('sd');
      commands2.push(['ZUNIONSTORE', destSiteDevices, String(siteDeviceKeys.length), ...siteDeviceKeys]);
      commands2.push(['ZMSCORE', destSiteDevices, ...siteDeviceMembers]);
      siteDeviceScoreIndex = commands2.length - 1;
      commands2.push(['DEL', destSiteDevices]);
    }
  }

  if (commands2.length) {
    try {
      const results2 = await runPipeline(commands2);
      if (pageDeviceScoreIndex !== -1) {
        const scores = results2[pageDeviceScoreIndex]?.result || [];
        unflattenDeviceScores(topPages.length, scores).forEach((deviceViews, i) => {
          topPages[i].deviceViews = deviceViews;
        });
      }
      if (siteDeviceScoreIndex !== -1) {
        const scores = results2[siteDeviceScoreIndex]?.result || [];
        unflattenDeviceScores(siteTotals.length, scores).forEach((deviceViews, i) => {
          siteTotals[i].deviceViews = deviceViews;
        });
      }
    } catch {
      // best-effort -- leave deviceViews unset, client falls back to just the Views column
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    range,
    devices: DEVICES,
    topPages,
    siteTotals,
    deviceTotals,
    updatedAt: new Date().toISOString(),
  });
};
