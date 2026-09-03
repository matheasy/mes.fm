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
  // Composite members so a single sorted set can hold the per-page and
  // per-site device breakdowns -- same "|"-joined-member trick the plain
  // leaderboard/site-totals sets already use, just one level deeper.
  const pageDeviceMember = `${site}|${path}|${device}`;
  const siteDeviceMember = `${site}|${device}`;
  const now = new Date();
  const hk = hourKey(now);
  const dk = dayKey(now);
  const hourlyLeaderboard = `pageviews:leaderboard:hourly:${hk}`;
  const hourlySiteTotals = `pageviews:sitetotals:hourly:${hk}`;
  const hourlyDeviceTotals = `pageviews:devicetotals:hourly:${hk}`;
  const hourlySourceTotals = `pageviews:sourcetotals:hourly:${hk}`;
  const hourlyPageDevices = `pageviews:pagedevices:hourly:${hk}`;
  const hourlySiteDevices = `pageviews:sitedevices:hourly:${hk}`;
  const dailyLeaderboard = `pageviews:leaderboard:daily:${dk}`;
  const dailySiteTotals = `pageviews:sitetotals:daily:${dk}`;
  const dailyDeviceTotals = `pageviews:devicetotals:daily:${dk}`;
  const dailySourceTotals = `pageviews:sourcetotals:daily:${dk}`;
  const dailyPageDevices = `pageviews:pagedevices:daily:${dk}`;
  const dailySiteDevices = `pageviews:sitedevices:daily:${dk}`;

  const commands = [
    ['ZINCRBY', 'pageviews:leaderboard', '1', member],
    ['HINCRBY', 'pageviews:site-totals', site, '1'],
    ['HINCRBY', 'pageviews:device-totals', device, '1'],
    ['HINCRBY', 'pageviews:source-totals', source, '1'],
    ['ZINCRBY', 'pageviews:pagedevices', '1', pageDeviceMember],
    ['ZINCRBY', 'pageviews:sitedevices', '1', siteDeviceMember],
    ['ZINCRBY', hourlyLeaderboard, '1', member],
    ['EXPIRE', hourlyLeaderboard, String(HOUR_TTL)],
    ['ZINCRBY', hourlySiteTotals, '1', site],
    ['EXPIRE', hourlySiteTotals, String(HOUR_TTL)],
    ['ZINCRBY', hourlyDeviceTotals, '1', device],
    ['EXPIRE', hourlyDeviceTotals, String(HOUR_TTL)],
    ['ZINCRBY', hourlySourceTotals, '1', source],
    ['EXPIRE', hourlySourceTotals, String(HOUR_TTL)],
    ['ZINCRBY', hourlyPageDevices, '1', pageDeviceMember],
    ['EXPIRE', hourlyPageDevices, String(HOUR_TTL)],
    ['ZINCRBY', hourlySiteDevices, '1', siteDeviceMember],
    ['EXPIRE', hourlySiteDevices, String(HOUR_TTL)],
    ['ZINCRBY', dailyLeaderboard, '1', member],
    ['EXPIRE', dailyLeaderboard, String(DAY_TTL)],
    ['ZINCRBY', dailySiteTotals, '1', site],
    ['EXPIRE', dailySiteTotals, String(DAY_TTL)],
    ['ZINCRBY', dailyDeviceTotals, '1', device],
    ['EXPIRE', dailyDeviceTotals, String(DAY_TTL)],
    ['ZINCRBY', dailySourceTotals, '1', source],
    ['EXPIRE', dailySourceTotals, String(DAY_TTL)],
    ['ZINCRBY', dailyPageDevices, '1', pageDeviceMember],
    ['EXPIRE', dailyPageDevices, String(DAY_TTL)],
    ['ZINCRBY', dailySiteDevices, '1', siteDeviceMember],
    ['EXPIRE', dailySiteDevices, String(DAY_TTL)],
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
