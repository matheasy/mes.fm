// BitChute video file for mes.fm/watch, so a BitChute link plays in Watch's own <video> (speed buttons, time left, zoom)
// instead of BitChute's embed, whose speed a page can't reach.
//
// GET /api/bitchute-media?id=<BitChute video id> -> {"id","url","title","thumb","dur"}
//
// BitChute's public API (api.bitchute.com/api/beta, no key) only allows www.bitchute.com in CORS, so the page asks here.
// The id is pattern-checked and only ever goes into the JSON body of two fixed api.bitchute.com calls; the answer's media
// URL must be an https .mp4 on a *.bitchute.com host, so this can't be used as a proxy or to point the page elsewhere.
// The video itself is played straight from BitChute's server (a <video> needs no CORS). Good answers are edge-cached
// for an hour; errors are never cached (the page then falls back to BitChute's embed).
const API = 'https://api.bitchute.com/api/beta/';
const UA = 'Mozilla/5.0 (compatible; mes.fm/1.0; +https://mes.fm)';
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

function okMedia(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)bitchute\.com$/i.test(x.hostname) && /\.mp4$/i.test(x.pathname) && !x.username && !x.password;
  } catch (e) { return false; }
}
function okImg(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)bitchute\.com$/i.test(x.hostname); } catch (e) { return false; }
}

async function call(path, id, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Accept: 'application/json' },
      body: JSON.stringify({ video_id: id }), signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function lookup(id) {
  const [media, info] = await Promise.all([call('video/media', id, 7000), call('video', id, 5000).catch(() => null)]);
  const url = media && media.media_url;
  if (!url || !okMedia(url)) throw new Error('no file');
  const out = { id, url, title: '', thumb: '', dur: '' };
  if (info) {
    if (typeof info.video_name === 'string') out.title = info.video_name.slice(0, 300);
    if (typeof info.thumbnail_url === 'string' && okImg(info.thumbnail_url)) out.thumb = info.thumbnail_url;
    if (typeof info.duration === 'string' && /^[\d:]{1,10}$/.test(info.duration)) out.dur = info.duration;
  }
  return out;
}

module.exports = async (req, res) => {
  const fail = (code, body) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.status(code).send(JSON.stringify(body)); };
  const id = req.query && typeof req.query.id === 'string' ? req.query.id : '';
  if (!ID_RE.test(id)) return fail(400, { error: 'bad id' });
  try {
    const data = await lookup(id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    fail(502, { error: 'not available' });
  }
};
module.exports.lookup = lookup;
module.exports.okMedia = okMedia;
