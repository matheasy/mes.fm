// Shared serverless backend for the calculators' "Share Your Results" feature.
//
// Each calculator subdomain used to carry its own api/share.js (a near-copy
// differing only in a KEY_PREFIX). As the subdomains fold into mes.fm/<slug>
// they all point their client at this one endpoint and pass ?calc=<code>;
// the key is namespaced "share:<code>:<id>" so existing links keep resolving.
//
// Storage is the same Upstash Redis the pageview tracker (api/track.js) uses --
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, already set on this
// project. No database to provision, one string key per share.
//
// POST { calc, data:{...} } (or ?calc=)  -> { id }
// GET  ?calc=<code>&id=<id>               -> the original equation object
const crypto = require('crypto');

// calc code -> the KEY_PREFIX its per-site share.js used, so old shares resolve
const CALC_CODES = new Set(['vat', 'bmi', 'gpa', 'gc', 'ic', 'mc', 'pc', 'ymc']);
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

  const body = req.body || {};
  const calc = String((req.method === 'POST' ? body.calc : req.query.calc) || '').trim();
  if (!CALC_CODES.has(calc)) {
    res.status(400).json({ error: 'invalid calc' });
    return;
  }
  const keyPrefix = `share:${calc}:`;

  if (req.method === 'POST') {
    const equation = body.data;
    if (!equation || typeof equation !== 'object') {
      res.status(400).json({ error: 'missing data' });
      return;
    }
    const id = randomId();
    const payload = JSON.stringify(equation).slice(0, 2000);
    try {
      const r = await redis([['SET', keyPrefix + id, payload, 'EX', String(TTL_SECONDS)]]);
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
      result = await redis([['GET', keyPrefix + id]]);
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
