// Newest uploads of an MES YouTube channel, for the runtime top-up of list pages built from a snapshot (mes.fm/youtube; see
// main_js/list-topup.js and the "Runtime top-up" note in CLAUDE.md).
//
// GET /api/yt-latest?ch=mes -> {"channel":"mes","fetched":"<ISO>","items":[{"id","title","published","views","short"}, ...]}, newest first (up to 15).
//
// Source: the channel's public RSS feed (https://www.youtube.com/feeds/videos.xml?channel_id=...), no API key. The feed also lists Shorts,
// which the snapshot (the channel's Videos tab) does not: each entry is checked once with a HEAD-style request to /shorts/<id> (200 = a Short,
// 303 to /watch = a normal video), a failed check counts as "not a Short".
// `ch` is a key of the fixed CHANNELS table, a channel id (UC + 22 characters) or a handle (@name, 3-30 letters / digits / . _ -), used by
// mes.fm/watch's "Latest from" chips for any channel. Each is pattern-checked and only ever lands in a youtube.com address on a fixed path
// (the feed, or the handle's channel page to look up its id), so this still cannot be used as a proxy. A good answer is edge-cached for an hour (stale for a day while it
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

// ?pl=<playlist id>: the playlist's own page (YouTube's RSS feeds answered 404 / 500 in Nov 2026), first ~100 entries in playlist order, with each
// entry's position (1-based) and duration. Only PL / UU / OL ids pass the pattern check, and the id only lands in youtube.com/playlist?list=.
const RE_PL = /^(?:PL|UU|OL|FL)[A-Za-z0-9_-]{10,40}$/;
function durSec(t) {
  const p = String(t || '').trim().split(':').map(Number);
  if (!p.length || p.some((n) => !Number.isFinite(n))) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
function walk(o, key, out) {
  if (Array.isArray(o)) { for (const v of o) walk(v, key, out); }
  else if (o && typeof o === 'object') { for (const k in o) { if (k === key) out.push(o[k]); walk(o[k], key, out); } }
  return out;
}
// ytInitialData of a playlist page -> [{id, title, dur, pos}] (old playlistVideoRenderer and the newer lockupViewModel shapes).
function parsePlaylist(html) {
  const m = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(String(html));
  if (!m) return [];
  let d; try { d = JSON.parse(m[1]); } catch (e) { return []; }
  const out = [], seen = {};
  const add = (id, title, dur) => {
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id) || seen[id]) return;
    seen[id] = 1; out.push({ id, title: title || id, dur: dur || 0, pos: out.length + 1 });
  };
  walk(d, 'playlistVideoRenderer', []).forEach((r) => {
    const t = r.title && (r.title.simpleText || (r.title.runs || []).map((x) => x.text).join(''));
    add(r.videoId, t, +r.lengthSeconds || 0);
  });
  walk(d, 'lockupViewModel', []).forEach((l) => {
    if (l.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return;
    const md = l.metadata && l.metadata.lockupMetadataViewModel;
    const badge = walk(l.contentImage, 'thumbnailBadgeViewModel', [])[0];
    add(l.contentId, md && md.title && md.title.content, badge ? durSec(badge.text) : 0);
  });
  return out;
}
async function buildPlaylist(pl) {
  const res = await fetch('https://www.youtube.com/playlist?list=' + pl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('playlist HTTP ' + res.status);
  const items = parsePlaylist(await res.text());
  if (!items.length) throw new Error('empty playlist');
  return { playlist: pl, fetched: new Date().toISOString(), items };
}

const RE_ID = /^UC[A-Za-z0-9_-]{22}$/, RE_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
function validKey(k) { return Object.prototype.hasOwnProperty.call(CHANNELS, k) || RE_ID.test(k) || RE_HANDLE.test(k); }

// @handle -> UC id, from the handle's channel page (its canonical link / externalId)
async function handleId(h) {
  const res = await fetch('https://www.youtube.com/' + h, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('handle HTTP ' + res.status);
  const html = await res.text();
  const m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html) || /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html) || /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html);
  if (!m) throw new Error('no channel id');
  return m[1];
}

async function build(key) {
  const id = CHANNELS[key] || (RE_ID.test(key) ? key : await handleId(key));
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('feed HTTP ' + res.status);
  const xml = await res.text();
  const items = parseFeed(xml);
  const head = String(xml).split('<entry>')[0];
  const title = decode(((/<title>([\s\S]*?)<\/title>/.exec(head) || [])[1] || '').trim());
  const shorts = await Promise.all(items.map((v) => isShort(v.id)));
  items.forEach((v, i) => { v.short = shorts[i]; });
  return { channel: key, id, title, fetched: new Date().toISOString(), items };
}

module.exports = async (req, res) => {
  const fail = (code, body) => { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(body); };
  const q = (req && req.query) || {};
  if (typeof q.pl === 'string' && q.pl) {
    if (!RE_PL.test(q.pl)) return fail(400, { error: 'bad playlist' });
    try {
      const data = await buildPlaylist(q.pl);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
      return res.status(200).send(JSON.stringify(data));
    } catch (e) {
      return fail(502, { error: 'playlist unavailable' });
    }
  }
  const key = typeof q.ch === 'string' && q.ch ? q.ch : 'mes';
  if (!validKey(key)) return fail(400, { error: 'unknown channel' });
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
module.exports.parsePlaylist = parsePlaylist;
module.exports.buildPlaylist = buildPlaylist;
module.exports.CHANNELS = CHANNELS;
module.exports.validKey = validKey;
module.exports.build = build;
