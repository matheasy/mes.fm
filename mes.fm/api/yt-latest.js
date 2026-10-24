// Newest uploads of an MES YouTube channel, for the runtime top-up of list pages built from a snapshot (mes.fm/youtube; see
// main_js/list-topup.js and the "Runtime top-up" note in CLAUDE.md).
//
// GET /api/yt-latest?ch=mes -> {"channel":"mes","fetched":"<ISO>","items":[{"id","title","published","views","short"}, ...]}, newest first (up to 15).
//
// Source: the channel's public RSS feed (https://www.youtube.com/feeds/videos.xml?channel_id=...), no API key. The feed also lists Shorts,
// which the snapshot (the channel's Videos tab) does not: each entry is checked once with a HEAD-style request to /shorts/<id> (200 = a Short,
// 303 to /watch = a normal video), a failed check counts as "not a Short". Nothing from the client reaches a URL except `ch`, and only as a key
// into the fixed CHANNELS table below, so this cannot be used as a proxy. A good answer is edge-cached for an hour (stale for a day while it
// revalidates); errors are never cached.
const CHANNELS = {
  mes: 'UCUUBq1GPBvvGNz7dpgO14Ow',      // youtube.com/@mes (Math Easy Solutions)
  mestruth: 'UCmYl-9bhOOotXaNpS-liNiQ', // youtube.com/@mestruth
};
const MAX = 15;
const UA = 'Mozilla/5.0 (compatible; mes.fm/1.0; +https://mes.fm)';

function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Parse the Atom feed (plain regexes: the feed's shape is fixed and small). Entries without a valid 11-character id are dropped.
function parseFeed(xml) {
  const out = [];
  const entries = String(xml).match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const e of entries) {
    const id = (/<yt:videoId>([^<]*)<\/yt:videoId>/.exec(e) || [])[1];
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const title = decode(((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim());
    const published = ((/<published>([^<]*)<\/published>/.exec(e) || [])[1] || '').trim();
    const views = /<media:statistics[^>]*views="(\d+)"/.exec(e);
    out.push({ id, title, published, views: views ? +views[1] : null });
    if (out.length >= MAX) break;
  }
  return out;
}

async function isShort(id) {
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
    const r = await fetch('https://www.youtube.com/shorts/' + id, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA }, signal: ctl ? ctl.signal : undefined });
    if (t) clearTimeout(t);
    return r.status === 200;
  } catch (e) {
    return false;
  }
}

async function build(key) {
  const id = CHANNELS[key];
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('feed HTTP ' + res.status);
  const items = parseFeed(await res.text());
  const shorts = await Promise.all(items.map((v) => isShort(v.id)));
  items.forEach((v, i) => { v.short = shorts[i]; });
  return { channel: key, fetched: new Date().toISOString(), items };
}

module.exports = async (req, res) => {
  const fail = (code, body) => { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(body); };
  const q = (req && req.query) || {};
  const key = typeof q.ch === 'string' && q.ch ? q.ch : 'mes';
  if (!Object.prototype.hasOwnProperty.call(CHANNELS, key)) return fail(400, { error: 'unknown channel' });
  try {
    const data = await build(key);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    fail(502, { error: 'feed unavailable' });
  }
};
module.exports.parseFeed = parseFeed;
module.exports.CHANNELS = CHANNELS;
module.exports.build = build;
