// Chart notes for the private dashboards (mes.fm/search-console and mes.fm/ads), like Search Console's own annotations:
// a short note on a day ("Started the Argentina campaigns", "Site moved to mes.fm/<slug>"), drawn as a marker on the
// x axis of the day-by-day charts. Shared by both pages; behind the middleware.js password like them.
//   GET                                   -> { notes: [{ id, d: "YYYY-MM-DD", t, at }] } (oldest day first)
//   POST { op: "add", d, t }              -> { note }
//   POST { op: "update", id, d?, t? }     -> { note }
//   POST { op: "delete", id }             -> { ok: true }
// POST must be JSON from https://mes.fm itself (Origin checked: the password the browser remembers would otherwise let
// another site's form write here). Stored as one Redis key (chartnotes:v1, a JSON list, at most 500 notes, no expiry).
// The page falls back to localStorage on 127.0.0.1 / localhost (no /api there): main_js/chart-notes.js.
const crypto = require('crypto');

const KEY = 'chartnotes:v1';
const MAX = 500;
const MAX_T = 200;
const ORIGINS = ['https://mes.fm', 'https://www.mes.fm'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function redis(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}

// Pure: tidy a note's text (one line, no control characters, at most 200 characters) and check a date.
function cleanText(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_T); }
function okDate(d) { return DATE.test(String(d)) && !isNaN(Date.parse(d + 'T12:00:00Z')) && d >= '2010-01-01' && d <= '2100-12-31'; }
const sortNotes = (list) => list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.at < b.at ? -1 : 1)));

// Pure: apply one change to the list. Returns { status, body, list? (the new list to store) }.
function apply(list, body, now) {
  list = Array.isArray(list) ? list.slice() : [];
  const at = new Date(now || Date.now()).toISOString();
  const op = body && body.op;
  if (op === 'add') {
    const t = cleanText(body.t);
    if (!t) return { status: 400, body: { error: 'empty note' } };
    if (!okDate(body.d)) return { status: 400, body: { error: 'bad date' } };
    if (list.length >= MAX) return { status: 400, body: { error: 'at most ' + MAX + ' notes' } };
    const note = { id: crypto.randomBytes(6).toString('hex'), d: body.d, t, at };
    list.push(note);
    return { status: 200, body: { note }, list: sortNotes(list) };
  }
  if (op === 'update' || op === 'delete') {
    const i = list.findIndex((n) => n && n.id === body.id);
    if (typeof body.id !== 'string' || i === -1) return { status: 404, body: { error: 'no such note' } };
    if (op === 'delete') { list.splice(i, 1); return { status: 200, body: { ok: true }, list }; }
    const note = Object.assign({}, list[i]);
    if (body.t != null) { note.t = cleanText(body.t); if (!note.t) return { status: 400, body: { error: 'empty note' } }; }
    if (body.d != null) { if (!okDate(body.d)) return { status: 400, body: { error: 'bad date' } }; note.d = body.d; }
    note.at = at;
    list[i] = note;
    return { status: 200, body: { note }, list: sortNotes(list) };
  }
  return { status: 400, body: { error: 'unknown op' } };
}

// req = { method, body, origin, contentType, local }; deps = { get(), set(json) }
async function respond(req, deps) {
  const read = async () => { try { const v = await deps.get(); const l = v ? JSON.parse(v) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  if (req.method === 'GET') return { status: 200, body: { notes: await read() } };
  if (req.method !== 'POST') return { status: 405, body: { error: 'GET or POST' } };
  if (!req.local && !ORIGINS.includes(String(req.origin || ''))) return { status: 403, body: { error: 'wrong origin' } };
  if (!/^application\/json/i.test(String(req.contentType || ''))) return { status: 415, body: { error: 'JSON only' } };
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 4000) return { status: 413, body: { error: 'too large' } }; try { body = JSON.parse(body); } catch (e) { return { status: 400, body: { error: 'bad json' } }; } }
  const out = apply(await read(), body);
  if (out.list) await deps.set(JSON.stringify(out.list));
  return { status: out.status, body: out.body };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const out = await respond({ method: req.method, body: req.body, origin: req.headers.origin, contentType: req.headers['content-type'] }, {
      get: async () => { const r = await redis([['GET', KEY]]); return r[0] && r[0].result; },
      set: async (v) => { await redis([['SET', KEY, v]]); },
    });
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
Object.assign(module.exports, { apply, respond, cleanText, okDate });
