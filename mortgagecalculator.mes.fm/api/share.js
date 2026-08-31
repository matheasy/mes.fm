// Vercel serverless function backing the "Share Results" feature.
//
// Replaces the old GoDaddy PHP endpoints (php/createShareUrl.php,
// php/getShareUrl.php) which read/wrote a MySQL table (sharecalcdb.mc)
// that doesn't exist on static hosting. Uses the same Upstash Redis REST
// API mes.fm/api/track.js already talks to (same Upstash account -- copy
// the same two env vars, UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
// into this project's Vercel settings) -- no new database to provision,
// just a "share:mc:<id>" string key per share. Same pattern as
// inflationcalculator.mes.fm/api/share.js.
//
// POST { data: {...} }        -> { id }
// GET  ?id=<id>                -> the original equation object
const crypto = require('crypto');

const KEY_PREFIX = 'share:mc:';
const TTL_SECONDS = 3 * 365 * 86400; // 3 years
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I

function randomId(len = 8) {
  const bytes = crypto.randomBytes(len);
  let id = '';
  for (let i = 0; i < len; i++) {
    id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return id;
}

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'POST') {
    const equation = (req.body || {}).data;
    if (!equation || typeof equation !== 'object') {
      res.status(400).json({ error: 'missing data' });
      return;
    }
    const id = randomId();
    const payload = JSON.stringify(equation).slice(0, 2000);
    try {
      const r = await redis([['SET', KEY_PREFIX + id, payload, 'EX', String(TTL_SECONDS)]]);
      if (!r || !Array.isArray(r) || r[0]?.error) {
        res.status(502).json({ error: 'storage unavailable' });
        return;
      }
    } catch (e) {
      res.status(502).json({ error: 'storage unavailable' });
      return;
    }
    res.status(200).json({ id });
    return;
  }

  if (req.method === 'GET') {
    const id = String(req.query.id || '').trim();
    if (!/^[A-Za-z0-9]{1,32}$/.test(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    let result;
    try {
      result = await redis([['GET', KEY_PREFIX + id]]);
    } catch {
      res.status(502).json({ error: 'storage unavailable' });
      return;
    }
    const value = result && result[0] && result[0].result;
    if (!value) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(value);
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
