// MES Edits (mes.fm/edits): the private list of fixes and new-app ideas that used to live in two Telegram groups.
// Behind the middleware.js password like /ads. Claude reads and updates it with the same password (curl -u).
//   GET                                       -> { items: [...] } (newest first)
//   POST { op: "add", k, t, star? }           -> { item }
//   POST { op: "update", id, ...fields }      -> { item }   fields: k, t, st, star, note
//   POST { op: "reply", id, t, by? }          -> { item }
//   POST { op: "delete", id }                 -> { ok: true }
//   POST { op: "img", data: "<base64 JPEG>" } -> { id, url }   (a picture pasted or picked on the page, phones too; kept as edits:img:<id>)
//   GET ?img=<id>.jpg                         -> the picture (same password)
//   POST { op: "meta", meta: { names, pins, mode } } -> { meta }   (list names with the user's capitals, pinned lists, A-Z or own tab order;
//                                                                    kept as edits:meta; GET returns it next to items)
//   POST { op: "import", items: [...] }       -> { added, skipped }   (Telegram import / JSON restore: same id or same text = skipped,
//                                                                       unless the incoming copy of a same-id item is newer, then it replaces it)
// Item = { id, k: "fix"|"app", t, st: "todo"|"doing"|"done"|"wont", star, note, rs: [{ t, at, by }], c, u, d, src? }
// (c / u / d = created / updated / done, ms). The rules are in _edits-lib.js (copy of tool_apps_src/edits/lib.js). Stored as one Redis hash (edits:items, field = id, value = item JSON), no expiry.
// POST must be JSON from https://mes.fm itself (Origin checked: the password the browser remembers would otherwise let
// another site's form write here); requests without an Origin header (curl, Claude) are allowed: they still need the password.
const E = require('./_edits-lib.js');

const KEY = 'edits:items';
const IMG = 'edits:img:';
const META = 'edits:meta';
const IMG_MAX = 700000; // base64 characters (~520 KB JPEG); the page shrinks pictures well under this
const IMG_ID = /^[a-f0-9]{16}$/;
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
  if (req.method === 'GET' && req.img != null) {
    const id = String(req.img).replace(/\.jpg$/i, '');
    if (!IMG_ID.test(id) || !deps.getImg) return { status: 404, body: { error: 'no such picture' } };
    const b64 = await deps.getImg(id);
    return b64 ? { status: 200, image: Buffer.from(b64, 'base64') } : { status: 404, body: { error: 'no such picture' } };
  }
  const read = async () => {
    const raw = (await deps.all()) || {}, out = {};
    for (const id of Object.keys(raw)) { try { const it = JSON.parse(raw[id]); if (it && it.id === id) out[id] = it; } catch (e) { /* skip */ } }
    return out;
  };
  const meta = async () => { let m = null; try { m = deps.getMeta ? JSON.parse((await deps.getMeta()) || 'null') : null; } catch (e) { m = null; } return E.cleanMeta(m); };
  if (req.method === 'GET') return { status: 200, body: { items: E.sortNewest(Object.values(await read())), meta: await meta() } };
  if (req.method !== 'POST') return { status: 405, body: { error: 'GET or POST' } };
  if (req.origin && !req.local && !ORIGINS.includes(String(req.origin))) return { status: 403, body: { error: 'wrong origin' } };
  if (!/^application\/json/i.test(String(req.contentType || ''))) return { status: 415, body: { error: 'JSON only' } };
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 3e6) return { status: 413, body: { error: 'too large' } }; try { body = JSON.parse(body); } catch (e) { return { status: 400, body: { error: 'bad json' } }; } }
  if (body && body.op === 'img') {
    const d = String(body.data || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!d || d.length > IMG_MAX || !/^[A-Za-z0-9+/]+=*$/.test(d)) return { status: 400, body: { error: 'picture too big or not a JPEG' } };
    const head = Buffer.from(d.slice(0, 8), 'base64');
    if (!(head[0] === 0xff && head[1] === 0xd8)) return { status: 400, body: { error: 'not a JPEG' } };
    const id = require('crypto').randomBytes(8).toString('hex');
    await deps.putImg(id, d);
    return { status: 200, body: { id, url: 'https://mes.fm/api/edits?img=' + id + '.jpg' } };
  }
  if (body && body.op === 'meta') {
    const m = E.cleanMeta(body.meta);
    if (deps.putMeta) await deps.putMeta(JSON.stringify(m));
    return { status: 200, body: { meta: m } };
  }
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
    const out = await respond({ method: req.method, body: req.body, origin: req.headers.origin, contentType: req.headers['content-type'], img: req.query && req.query.img }, {
      getMeta: async () => { const r = await redis([['GET', META]]); return r[0] && r[0].result; },
      putMeta: async (v) => { await redis([['SET', META, v]]); },
      getImg: async (id) => { const r = await redis([['GET', IMG + id]]); return r[0] && r[0].result; },
      putImg: async (id, b64) => { await redis([['SET', IMG + id, b64]]); },
      all: async () => { const r = await redis([['HGETALL', KEY]]); return pairs(r[0] && r[0].result); },
      put: async (items) => {
        const cmds = [];
        for (let i = 0; i < items.length; i += 200) cmds.push(['HSET', KEY].concat(...items.slice(i, i + 200).map((it) => [it.id, JSON.stringify(it)])));
        await redis(cmds);
      },
      del: async (ids) => { await redis([['HDEL', KEY].concat(ids)]); },
    });
    if (out.image) { res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); return res.status(200).send(out.image); }
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
Object.assign(module.exports, { respond, pairs });
