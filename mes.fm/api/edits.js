// MES Edits (mes.fm/edits): the private list of fixes and new-app ideas that used to live in two Telegram groups.
// Behind the middleware.js password like /ads. Claude reads and updates it with the same password (curl -u).
//   GET                                       -> { items: [...] } (newest first)
//   POST { op: "add", k, t, star? }           -> { item }
//   POST { op: "update", id, ...fields }      -> { item }   fields: k, t, st, star, note
//   POST { op: "reply", id, t, by? }          -> { item }
//   POST { op: "delete", id }                 -> { ok: true }
//   POST { op: "import", items: [...] }       -> { added, skipped }   (Telegram import / JSON restore: same id or same text = skipped,
//                                                                       unless the incoming copy of a same-id item is newer, then it replaces it)
// Item = { id, k: "fix"|"app", t, st: "todo"|"doing"|"done"|"wont", star, note, rs: [{ t, at, by }], c, u, d, src? }
// (c / u / d = created / updated / done, ms). The rules are in _edits-lib.js (copy of tool_apps_src/edits/lib.js). Stored as one Redis hash (edits:items, field = id, value = item JSON), no expiry.
// POST must be JSON from https://mes.fm itself (Origin checked: the password the browser remembers would otherwise let
// another site's form write here); requests without an Origin header (curl, Claude) are allowed: they still need the password.
const E = require('./_edits-lib.js');

const KEY = 'edits:items';
const ORIGINS = ['https://mes.fm', 'https://www.mes.fm'];

async function redis(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}

// req = { method, body, origin, contentType }; deps = { all() -> {id: json}, put(items), del(ids) }
async function respond(req, deps) {
  const read = async () => {
    const raw = (await deps.all()) || {}, out = {};
    for (const id of Object.keys(raw)) { try { const it = JSON.parse(raw[id]); if (it && it.id === id) out[id] = it; } catch (e) { /* skip */ } }
    return out;
  };
  if (req.method === 'GET') return { status: 200, body: { items: E.sortNewest(Object.values(await read())) } };
  if (req.method !== 'POST') return { status: 405, body: { error: 'GET or POST' } };
  if (req.origin && !req.local && !ORIGINS.includes(String(req.origin))) return { status: 403, body: { error: 'wrong origin' } };
  if (!/^application\/json/i.test(String(req.contentType || ''))) return { status: 415, body: { error: 'JSON only' } };
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 3e6) return { status: 413, body: { error: 'too large' } }; try { body = JSON.parse(body); } catch (e) { return { status: 400, body: { error: 'bad json' } }; } }
  const out = E.apply(await read(), body);
  if (out.put && out.put.length) await deps.put(out.put);
  if (out.del && out.del.length) await deps.del(out.del);
  return { status: out.status, body: out.body };
}

// Redis hash flatten: HGETALL answers [field, value, field, value...].
function pairs(arr) { const o = {}; if (Array.isArray(arr)) for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1]; else if (arr && typeof arr === 'object') Object.assign(o, arr); return o; }

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const out = await respond({ method: req.method, body: req.body, origin: req.headers.origin, contentType: req.headers['content-type'] }, {
      all: async () => { const r = await redis([['HGETALL', KEY]]); return pairs(r[0] && r[0].result); },
      put: async (items) => {
        const cmds = [];
        for (let i = 0; i < items.length; i += 200) cmds.push(['HSET', KEY].concat(...items.slice(i, i + 200).map((it) => [it.id, JSON.stringify(it)])));
        await redis(cmds);
      },
      del: async (ids) => { await redis([['HDEL', KEY].concat(ids)]); },
    });
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
Object.assign(module.exports, { respond, pairs });
