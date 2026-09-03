const { lastNDayKeys, lastNHourKeys } = require('./_bucket-keys');

const TOP_N = 50;

// Must match the categories api/track.js's detectDevice() / detectSource() can produce.
const DEVICES = ['desktop', 'mobile', 'tablet', 'tv', 'bot', 'unknown'];
const SOURCES = ['direct', 'internal', 'google', 'search', 'social', 'referral'];

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
// categories.length scores per entity in `categories` order, unflatten it
// into one { <category>: n, ... } object per entity.
function unflattenScores(entityCount, scoresFlat, categories) {
  const perEntity = [];
  for (let i = 0; i < entityCount; i++) {
    const breakdown = {};
    categories.forEach((category, j) => {
      const raw = scoresFlat[i * categories.length + j];
      breakdown[category] = raw == null ? 0 : Number(raw);
    });
    perEntity.push(breakdown);
  }
  return perEntity;
}

// Same idea as unflattenScores but two-dimensional: members were built as
// devices.length * sources.length scores per entity, iterated device-outer/
// source-inner, into one { device: { source: n, ... }, ... } object per
// entity.
function unflattenMatrix(entityCount, scoresFlat, devices, sources) {
  const perEntity = [];
  const cellsPerEntity = devices.length * sources.length;
  for (let i = 0; i < entityCount; i++) {
    const matrix = {};
    devices.forEach((device, di) => {
      const bySource = {};
      sources.forEach((source, si) => {
        const raw = scoresFlat[i * cellsPerEntity + di * sources.length + si];
        bySource[source] = raw == null ? 0 : Number(raw);
      });
      matrix[device] = bySource;
    });
    perEntity.push(matrix);
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
  let deviceTotalsResultIndex;
  let sourceTotalsResultIndex;

  if (!config) {
    commands = [
      ['ZREVRANGE', 'pageviews:leaderboard', '0', String(TOP_N - 1), 'WITHSCORES'],
      ['HGETALL', 'pageviews:device-totals'],
      ['HGETALL', 'pageviews:source-totals'],
    ];
    leaderboardResultIndex = 0;
    deviceTotalsResultIndex = 1;
    sourceTotalsResultIndex = 2;
  } else {
    const leaderboardKeys = bucketKeys.map((k) => `pageviews:leaderboard:${config.unit}:${k}`);
    const deviceTotalsKeys = bucketKeys.map((k) => `pageviews:devicetotals:${config.unit}:${k}`);
    const sourceTotalsKeys = bucketKeys.map((k) => `pageviews:sourcetotals:${config.unit}:${k}`);
    const destLeaderboard = randomKey('lb');
    const destDeviceTotals = randomKey('dt');
    const destSourceTotals = randomKey('so');

    commands = [
      ['ZUNIONSTORE', destLeaderboard, String(leaderboardKeys.length), ...leaderboardKeys],
      ['ZREVRANGE', destLeaderboard, '0', String(TOP_N - 1), 'WITHSCORES'],
      ['DEL', destLeaderboard],
      ['ZUNIONSTORE', destDeviceTotals, String(deviceTotalsKeys.length), ...deviceTotalsKeys],
      ['ZREVRANGE', destDeviceTotals, '0', '-1', 'WITHSCORES'],
      ['DEL', destDeviceTotals],
      ['ZUNIONSTORE', destSourceTotals, String(sourceTotalsKeys.length), ...sourceTotalsKeys],
      ['ZREVRANGE', destSourceTotals, '0', '-1', 'WITHSCORES'],
      ['DEL', destSourceTotals],
    ];
    leaderboardResultIndex = 1;
    deviceTotalsResultIndex = 4;
    sourceTotalsResultIndex = 7;
  }

  let results;
  try {
    results = await runPipeline(commands);
  } catch {
    res.status(502).json({ error: 'stats unavailable' });
    return;
  }

  const topPagesRaw = results[leaderboardResultIndex]?.result || [];
  const deviceTotalsRaw = results[deviceTotalsResultIndex]?.result || [];
  const sourceTotalsRaw = results[sourceTotalsResultIndex]?.result || [];

  const topPages = [];
  for (let i = 0; i < topPagesRaw.length; i += 2) {
    topPages.push(parseMember(topPagesRaw[i], topPagesRaw[i + 1]));
  }

  const deviceTotals = [];
  for (let i = 0; i < deviceTotalsRaw.length; i += 2) {
    deviceTotals.push({ device: deviceTotalsRaw[i], views: Number(deviceTotalsRaw[i + 1]) });
  }
  deviceTotals.sort((a, b) => b.views - a.views);

  const sourceTotals = [];
  for (let i = 0; i < sourceTotalsRaw.length; i += 2) {
    sourceTotals.push({ source: sourceTotalsRaw[i], views: Number(sourceTotalsRaw[i + 1]) });
  }
  sourceTotals.sort((a, b) => b.views - a.views);

  // Second round trip: now that we know which pages made the cut, pull their
  // per-device and per-source breakdown via ZMSCORE (one command each, many
  // members -- order-based, so no need to parse composite members back
  // apart). This is best-effort: if it fails, the tables above still
  // render, just without the breakdown columns.
  const pageDeviceMembers = topPages.flatMap((p) => DEVICES.map((d) => `${p.site}|${p.path}|${d}`));
  const pageSourceMembers = topPages.flatMap((p) => SOURCES.map((s) => `${p.site}|${p.path}|${s}`));
  // Full cross-tab members (every device x source pair per page) for the
  // expand-to-drill-down view. Deliberately fetched eagerly for every
  // top-N page rather than lazily per click: this endpoint is already
  // response-cached (s-maxage=60), so the cost is paid once per minute
  // regardless of how many pages get expanded, and it avoids a second
  // endpoint plus per-row loading states on the client.
  const pageDeviceSourceMembers = topPages.flatMap((p) => DEVICES.flatMap((d) => SOURCES.map((s) => `${p.site}|${p.path}|${d}|${s}`)));

  const commands2 = [];
  let pageDeviceScoreIndex = -1;
  let pageSourceScoreIndex = -1;
  let pageDeviceSourceScoreIndex = -1;

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

  if (pageSourceMembers.length) {
    if (!config) {
      commands2.push(['ZMSCORE', 'pageviews:pagesources', ...pageSourceMembers]);
      pageSourceScoreIndex = commands2.length - 1;
    } else {
      const pageSourceKeys = bucketKeys.map((k) => `pageviews:pagesources:${config.unit}:${k}`);
      const destPageSources = randomKey('ps');
      commands2.push(['ZUNIONSTORE', destPageSources, String(pageSourceKeys.length), ...pageSourceKeys]);
      commands2.push(['ZMSCORE', destPageSources, ...pageSourceMembers]);
      pageSourceScoreIndex = commands2.length - 1;
      commands2.push(['DEL', destPageSources]);
    }
  }

  if (pageDeviceSourceMembers.length) {
    if (!config) {
      commands2.push(['ZMSCORE', 'pageviews:pagedevicesources', ...pageDeviceSourceMembers]);
      pageDeviceSourceScoreIndex = commands2.length - 1;
    } else {
      const pageDeviceSourceKeys = bucketKeys.map((k) => `pageviews:pagedevicesources:${config.unit}:${k}`);
      const destPageDeviceSources = randomKey('pds');
      commands2.push(['ZUNIONSTORE', destPageDeviceSources, String(pageDeviceSourceKeys.length), ...pageDeviceSourceKeys]);
      commands2.push(['ZMSCORE', destPageDeviceSources, ...pageDeviceSourceMembers]);
      pageDeviceSourceScoreIndex = commands2.length - 1;
      commands2.push(['DEL', destPageDeviceSources]);
    }
  }

  if (commands2.length) {
    try {
      const results2 = await runPipeline(commands2);
      if (pageDeviceScoreIndex !== -1) {
        const scores = results2[pageDeviceScoreIndex]?.result || [];
        unflattenScores(topPages.length, scores, DEVICES).forEach((deviceViews, i) => {
          topPages[i].deviceViews = deviceViews;
        });
      }
      if (pageSourceScoreIndex !== -1) {
        const scores = results2[pageSourceScoreIndex]?.result || [];
        unflattenScores(topPages.length, scores, SOURCES).forEach((sourceViews, i) => {
          topPages[i].sourceViews = sourceViews;
        });
      }
      if (pageDeviceSourceScoreIndex !== -1) {
        const scores = results2[pageDeviceSourceScoreIndex]?.result || [];
        unflattenMatrix(topPages.length, scores, DEVICES, SOURCES).forEach((matrix, i) => {
          topPages[i].deviceSourceMatrix = matrix;
        });
      }
    } catch {
      // best-effort -- leave deviceViews/sourceViews/deviceSourceMatrix unset, client falls back accordingly
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    range,
    devices: DEVICES,
    sources: SOURCES,
    topPages,
    deviceTotals,
    sourceTotals,
    updatedAt: new Date().toISOString(),
  });
};
