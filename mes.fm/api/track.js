const { dayKey, hourKey } = require('./_bucket-keys');

const MAX_LEN = 200;
// Only accept mes.fm itself and its subdomains -- rejects Vercel preview/
// deployment hostnames (*.vercel.app) and anything else spoofed in.
const SITE_RE = /^([a-z0-9-]+\.)*mes\.fm$/i;

const HOUR_TTL = 26 * 3600; // covers the rolling 24h window plus buffer
const DAY_TTL = 366 * 86400; // covers the rolling 365d window plus buffer

// Device type is classified server-side from the User-Agent header rather than
// trusting a client-supplied field -- one place to get right, and it can't be
// spoofed any more easily than the UA itself already can be.
function detectDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|curl\/|wget\/|python-requests|headlesschrome|pingdom|uptimerobot/.test(ua)) {
    return 'bot';
  }
  if (/smart-tv|smarttv|googletv|appletv|hbbtv|netcast|viera|aquos|roku|tvos|crkey|web0s|dtv|tizen.+tv/.test(ua)) {
    return 'tv';
  }
  if (/ipad|tablet|playbook|silk|kindle|nexus (7|9|10)|sm-t\d|gt-p\d/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android|windows phone|blackberry|bb10|iemobile|opera mini/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Traffic source, classified server-side from the client-reported
// document.referrer (the client is trusted here since a referrer, unlike a
// device/site claim, has no cheaper-to-fake alternative -- the User-Agent
// classification above only works because the browser sends UA on every
// request regardless; document.referrer has no server-visible equivalent).
// An empty referrer covers typed URLs, bookmarks, and browsers/extensions
// that strip it -- lumped into "direct" the way most simple analytics do.
const REFERRAL_MAX_LEN = 500;
function detectSource(referrerRaw, site) {
  const ref = String(referrerRaw || '').trim().slice(0, REFERRAL_MAX_LEN);
  if (!ref) return 'direct';
  let host;
  try {
    host = new URL(ref).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  if (!host) return 'direct';
  if (host === site.toLowerCase() || /(^|\.)mes\.fm$/i.test(host)) return 'internal';
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
  if (/(^|\.)(bing|yahoo|duckduckgo|baidu|yandex|ecosia|ask)\./.test(host)) return 'search';
  if (/(^|\.)(facebook|fb|instagram|reddit|tiktok|linkedin|pinterest|threads|youtube|youtu)\.[a-z.]+$/.test(host) || host === 't.co' || host === 'x.com') return 'social';
  return 'referral';
}

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
  const device = detectDevice(req.headers['user-agent']);
  const source = detectSource(body.referrer, site);
  // Composite members so a single sorted set can hold a per-page breakdown --
  // same "|"-joined-member trick the plain leaderboard already uses, just
  // one level deeper. (No more per-SITE breakdown: every property lives
  // under mes.fm/<slug> now, so "site" is no longer a useful dimension --
  // it's still embedded in `member`/these composite members for page
  // identity, just not aggregated on its own anymore.)
  const pageDeviceMember = `${site}|${path}|${device}`;
  const pageSourceMember = `${site}|${path}|${source}`;
  // Full cross-tab member (device AND source together) for the per-page
  // expand-to-drill-down view -- one write per view either way, the cost is
  // the same shape as pageDeviceMember/pageSourceMember above, just a
  // finer-grained key.
  const pageDeviceSourceMember = `${site}|${path}|${device}|${source}`;
  const now = new Date();
  const hk = hourKey(now);
  const dk = dayKey(now);
  const hourlyLeaderboard = `pageviews:leaderboard:hourly:${hk}`;
  const hourlyDeviceTotals = `pageviews:devicetotals:hourly:${hk}`;
  const hourlySourceTotals = `pageviews:sourcetotals:hourly:${hk}`;
  const hourlyPageDevices = `pageviews:pagedevices:hourly:${hk}`;
  const hourlyPageSources = `pageviews:pagesources:hourly:${hk}`;
  const hourlyPageDeviceSources = `pageviews:pagedevicesources:hourly:${hk}`;
  const dailyLeaderboard = `pageviews:leaderboard:daily:${dk}`;
  const dailyDeviceTotals = `pageviews:devicetotals:daily:${dk}`;
  const dailySourceTotals = `pageviews:sourcetotals:daily:${dk}`;
  const dailyPageDevices = `pageviews:pagedevices:daily:${dk}`;
  const dailyPageSources = `pageviews:pagesources:daily:${dk}`;
  const dailyPageDeviceSources = `pageviews:pagedevicesources:daily:${dk}`;

  const commands = [
    ['ZINCRBY', 'pageviews:leaderboard', '1', member],
    ['HINCRBY', 'pageviews:device-totals', device, '1'],
    ['HINCRBY', 'pageviews:source-totals', source, '1'],
    ['ZINCRBY', 'pageviews:pagedevices', '1', pageDeviceMember],
    ['ZINCRBY', 'pageviews:pagesources', '1', pageSourceMember],
    ['ZINCRBY', 'pageviews:pagedevicesources', '1', pageDeviceSourceMember],
    ['ZINCRBY', hourlyLeaderboard, '1', member],
    ['EXPIRE', hourlyLeaderboard, String(HOUR_TTL)],
    ['ZINCRBY', hourlyDeviceTotals, '1', device],
    ['EXPIRE', hourlyDeviceTotals, String(HOUR_TTL)],
    ['ZINCRBY', hourlySourceTotals, '1', source],
    ['EXPIRE', hourlySourceTotals, String(HOUR_TTL)],
    ['ZINCRBY', hourlyPageDevices, '1', pageDeviceMember],
    ['EXPIRE', hourlyPageDevices, String(HOUR_TTL)],
    ['ZINCRBY', hourlyPageSources, '1', pageSourceMember],
    ['EXPIRE', hourlyPageSources, String(HOUR_TTL)],
    ['ZINCRBY', hourlyPageDeviceSources, '1', pageDeviceSourceMember],
    ['EXPIRE', hourlyPageDeviceSources, String(HOUR_TTL)],
    ['ZINCRBY', dailyLeaderboard, '1', member],
    ['EXPIRE', dailyLeaderboard, String(DAY_TTL)],
    ['ZINCRBY', dailyDeviceTotals, '1', device],
    ['EXPIRE', dailyDeviceTotals, String(DAY_TTL)],
    ['ZINCRBY', dailySourceTotals, '1', source],
    ['EXPIRE', dailySourceTotals, String(DAY_TTL)],
    ['ZINCRBY', dailyPageDevices, '1', pageDeviceMember],
    ['EXPIRE', dailyPageDevices, String(DAY_TTL)],
    ['ZINCRBY', dailyPageSources, '1', pageSourceMember],
    ['EXPIRE', dailyPageSources, String(DAY_TTL)],
    ['ZINCRBY', dailyPageDeviceSources, '1', pageDeviceSourceMember],
    ['EXPIRE', dailyPageDeviceSources, String(DAY_TTL)],
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
