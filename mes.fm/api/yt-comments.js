// Comments of one YouTube video, for mes.fm/watch's optional "Comments" box (off by default; the page is distraction-free).
//
// GET /api/yt-comments?v=<11-char video id>             -> {count, off, items: [{id, text, author, creator, when, likes, replies}], next, ver}
// GET /api/yt-comments?v=<id>&c=<next token>&ver=<ver>   -> the next page (same shape)
// Each top-level item carries rt = the token of its replies (when it has some).
// GET /api/yt-comments?v=<id>&c=<rt>&ver=<ver>&r=1        -> that comment's replies (same shape; next = "more replies")
//
// Keyless, the same public calls youtube.com's own page makes (watch page -> comment section token -> youtubei/v1/next), parsed by
// the Dashboard's lib (api/_dash-lib.js ytWatch / ytComments). Every input is pattern-checked and only lands in fixed youtube.com
// addresses, so this is not a proxy. Answers are edge-cached 10 minutes; errors are not cached.
const L = require('./_dash-lib.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HDR = { 'User-Agent': UA, 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1; SOCS=CAI' };
const RE_V = /^[A-Za-z0-9_-]{11}$/, RE_C = /^[A-Za-z0-9_%=-]{20,1200}$/, RE_VER = /^[0-9.]{5,30}$/;

async function get(url, opt, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
  try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt)); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
// the token for the next page: the last continuationCommand in the answer
function nextToken(txt) {
  const m = String(txt).match(/"continuationCommand":\{"token":"([^"]+)"/g);
  return m ? m[m.length - 1].replace(/^.*"token":"/, '').replace(/"$/, '') : null;
}
// comment id -> token of its replies, from the commentThreadRenderers of an answer
function replyTokens(j) {
  const out = {};
  (function walk(o, d) {
    if (!o || typeof o !== 'object' || d > 12) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
    const t = o.commentThreadRenderer;
    if (t) {
      const id = ((t.commentViewModel || {}).commentViewModel || {}).commentId;
      const m = id && /"continuationCommand":\{"token":"([^"]+)"/.exec(JSON.stringify(t.replies || ''));
      if (m) out[id] = m[1];
      return;
    }
    for (const k in o) walk(o[k], d + 1);
  })(j, 0);
  return out;
}
async function page(v, c, ver, rep) {
  let off = false;
  if (!c) {
    const w = L.ytWatch(await get('https://www.youtube.com/watch?v=' + v, { headers: HDR }, 8000));
    off = !!w.commentsOff; c = w.token; ver = w.ver;
    if (!c || !ver) return { count: off ? 0 : null, off, items: [], next: null, ver: ver || null };
  }
  const txt = await get('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, HDR),
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'en' } }, continuation: c }) }, 8000);
  const r = L.ytComments(txt, Date.now());
  let rt = {}; if (!rep) { try { rt = replyTokens(JSON.parse(txt)); } catch (e) {} }
  const items = r.items.filter((x) => !!x.reply === !!rep).map((x) => {
    const o = { id: x.id, text: x.text, author: x.author, creator: x.creator, when: x.when, likes: x.likes, replies: rep ? 0 : x.replies };
    if (!rep && rt[x.id]) o.rt = rt[x.id];
    return o;
  });
  const next = nextToken(txt), nx = next && next !== c && !Object.values(rt).includes(next) ? next : null;
  return { count: rep ? null : r.count, off: off && !items.length, items, next: nx, ver };
}

module.exports = async (req, res) => {
  const q = (req && req.query) || {}, s = (x) => (typeof x === 'string' ? x : '');
  const v = s(q.v), c = s(q.c), ver = s(q.ver), rep = q.r === '1';
  const fail = (code, body) => { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(body); };
  if (!RE_V.test(v) || (c && !RE_C.test(c)) || (c && !RE_VER.test(ver)) || (rep && !c)) return fail(400, { error: 'bad request' });
  try {
    const out = await page(v, c, ver, rep);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600');
    res.status(200).send(JSON.stringify(out));
  } catch (e) { fail(502, { error: 'YouTube did not answer' }); }
};
module.exports.page = page;
module.exports.nextToken = nextToken;
module.exports.replyTokens = replyTokens;
