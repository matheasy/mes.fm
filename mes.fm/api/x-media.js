// X (Twitter) video file for mes.fm/watch, so an X post's video plays in Watch's own <video> (speed buttons, time left,
// resume, zoom) instead of X's white tweet card, whose speed a page can't reach.
//
// GET /api/x-media?id=<numeric post id> -> {"id","url","variants":[{"url","br","w","h"}],"title","thumb","dur","gif"}
//   url is '' when the post has no video (the title is still useful: the page then shows X's own embed with that title).
//
// Source: X's public syndication endpoint (cdn.syndication.twimg.com/tweet-result, the one X's own embeds and react-tweet
// use; no key). It only allows platform.twitter.com in CORS, so the page asks here. The id must be digits only and goes
// into one fixed URL; every returned media link must be an https .mp4 on video.twimg.com and every picture https on
// pbs.twimg.com, so this can't be used as a proxy. The video itself is played straight from video.twimg.com (the page
// requests it without a Referer: video.twimg.com answers 403 to any other site's Referer). Good answers are edge-cached
// for an hour; errors are never cached (the page then falls back to X's embed).
const ID_RE = /^\d{5,25}$/;
const UA = 'Mozilla/5.0 (compatible; mes.fm/1.0; +https://mes.fm)';

function token(id) {   // same formula as X's own embed script (react-tweet getToken)
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}
function okMedia(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'video.twimg.com' && /\.mp4$/i.test(x.pathname) && !x.username && !x.password; } catch (e) { return false; }
}
function okImg(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'pbs.twimg.com'; } catch (e) { return false; }
}
function cleanText(j) {
  let t = typeof j.text === 'string' ? j.text : '';
  const r = Array.isArray(j.display_text_range) ? j.display_text_range : null;
  if (r && r.length === 2) t = Array.from(t).slice(r[0], r[1]).join('');
  t = t.replace(/https:\/\/t\.co\/\w+/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return t;
}

// pure: syndication JSON -> our answer (exported for tests)
function parse(j, id) {
  if (!j || typeof j !== 'object' || j.__typename === 'TweetTombstone') throw new Error('not available');
  const pick = (o) => (o && Array.isArray(o.mediaDetails) ? o.mediaDetails.find((m) => m && (m.type === 'video' || m.type === 'animated_gif') && m.video_info) : null);
  let src = j, m = pick(j);
  if (!m && j.quoted_tweet) { m = pick(j.quoted_tweet); if (m) src = j.quoted_tweet; }
  const name = j.user && typeof j.user.name === 'string' ? j.user.name : '';
  let text = cleanText(j) || (src !== j ? cleanText(src) : '');
  let title = text ? (text.length > 200 ? text.slice(0, 197).replace(/\s+\S*$/, '') + '…' : text) : '';
  if (name) title = title ? title + ' (' + name + ')' : name + ' on X';
  const out = { id, url: '', variants: [], title: title.slice(0, 300), thumb: '', dur: 0, gif: false };
  if (!m) return out;
  if (typeof m.media_url_https === 'string' && okImg(m.media_url_https)) out.thumb = m.media_url_https;
  const vi = m.video_info || {};
  out.variants = (Array.isArray(vi.variants) ? vi.variants : [])
    .filter((v) => v && v.content_type === 'video/mp4' && okMedia(v.url))
    .map((v) => { const s = String(v.url).match(/\/(\d{2,5})x(\d{2,5})\//); return { url: v.url, br: Number(v.bitrate) || 0, w: s ? +s[1] : 0, h: s ? +s[2] : 0 }; })
    .sort((a, b) => a.br - b.br);
  if (!out.variants.length) return out;
  const best = out.variants.filter((v) => v.br <= 2600000);
  out.url = (best.length ? best[best.length - 1] : out.variants[0]).url;
  out.dur = Number(vi.duration_millis) > 0 ? Math.round(vi.duration_millis / 1000) : 0;
  out.gif = m.type === 'animated_gif';
  return out;
}

async function lookup(id) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 7000);
  try {
    const r = await fetch('https://cdn.syndication.twimg.com/tweet-result?id=' + id + '&lang=en&token=' + token(id),
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    if (!txt) throw new Error('empty');
    return parse(JSON.parse(txt), id);
  } finally { clearTimeout(t); }
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
module.exports.parse = parse;
module.exports.okMedia = okMedia;
module.exports.token = token;
