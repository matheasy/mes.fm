const MAX_LEN = 200;
const SITE_RE = /^[a-z0-9.-]{1,64}$/i;

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
  const commands = [
    ['ZINCRBY', 'pageviews:leaderboard', '1', member],
    ['HINCRBY', 'pageviews:site-totals', site, '1'],
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
