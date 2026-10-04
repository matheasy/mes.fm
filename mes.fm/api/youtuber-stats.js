// Live channel numbers for mes.fm/how-much-do-youtubers-make ("Refresh live numbers").
//
// GET /api/youtuber-stats -> the same JSON shape as how-much-do-youtubers-make/data/channels.json, with subscribers, total views, video
// count, channel age and the "recent uploads" summary re-read from the YouTube Data API v3 (source: "youtube-data-api").
//
// Needs the env var YOUTUBE_API_KEY as a plain *project-level* Vercel variable (Shared Environment Variables do not reach functions on this
// account). Without it: HTTP 503 {"error":"no key"} and the page keeps its committed snapshot. Nothing comes from the client (no channel ids,
// no params): the list of channels is the committed snapshot's. The key is never echoed. Quota per cache miss: channels.list 1 unit per 50
// ids + playlistItems.list 1 per channel + videos.list 1 per channel (~110 units for 55 channels, free quota 10,000/day); the edge caches a
// good answer for 24 h, so a day costs ~110 units however many visitors press the button. Errors are never cached (no-store).
//
// recentSummary() is the same rule as update_youtuber_snapshot.py and tool_apps_src/how-much-do-youtubers-make/lib.js (tested to agree).
const fs = require('fs');
const path = require('path');

const SNAPSHOT = path.join(__dirname, '..', 'how-much-do-youtubers-make', 'data', 'channels.json');
const SAMPLE = 15, MIN_AGE_DAYS = 7, RATE_WINDOW_DAYS = 90, DAY = 86400, LONG_MIN_SECONDS = 181;

function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function recentSummary(vids, now) {
  now = now == null ? Date.now() / 1000 : now;
  const sorted = vids.slice().sort((a, b) => b.ts - a.ts);
  const old = sorted.filter((v) => v.views != null && now - v.ts >= MIN_AGE_DAYS * DAY).slice(0, SAMPLE);
  const med = old.length ? Math.round(median(old.map((v) => v.views))) : null;
  const ts = sorted.map((v) => v.ts).reverse();
  let rate = null;
  if (ts.length >= 2) {
    const cutoff = now - RATE_WINDOW_DAYS * DAY, n90 = ts.filter((t) => t >= cutoff).length;
    if (n90 >= 3 && ts[0] < cutoff) rate = n90 / (RATE_WINDOW_DAYS / 30.4375);
    else rate = (ts.length - 1) / Math.max((ts[ts.length - 1] - ts[0]) / DAY, 1) * 30.4375;
  }
  return { videosSampled: old.length, medianViews: med, uploadsPerMonth: rate == null ? null : Math.round(rate * 10) / 10, shortsShare: null, windowDays: RATE_WINDOW_DAYS };
}
function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// `fetchImpl` is injectable so the tests can run without a key or a network
async function build(key, snap, fetchImpl) {
  const f = fetchImpl || fetch;
  const call = async (endpoint, params) => {
    const url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + new URLSearchParams(Object.assign({}, params, { key })).toString();
    const res = await f(url);
    if (!res.ok) throw new Error(endpoint + ' HTTP ' + res.status);   // the message never contains the url (it holds the key)
    return res.json();
  };
  const ids = snap.channels.map((c) => c.id), stats = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call('channels', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    for (const c of r.items || []) stats[c.id] = c;
  }
  const out = [];
  for (const old of snap.channels) {
    const c = stats[old.id];
    if (!c) { out.push(old); continue; }   // not returned: keep the snapshot row
    const s = c.statistics || {};
    let recent = old.recent;
    try {
      const pl = await call('playlistItems', { part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: 25 });
      const items = pl.items || [], when = {};
      for (const p of items) when[p.contentDetails.videoId] = p.contentDetails.videoPublishedAt;
      const ids2 = items.map((p) => p.contentDetails.videoId);
      const vids = [];
      if (ids2.length) {
        const v = await call('videos', { part: 'statistics,contentDetails', id: ids2.join(','), maxResults: 50 });
        for (const x of v.items || []) {
          if (isoSeconds(x.contentDetails && x.contentDetails.duration) >= LONG_MIN_SECONDS && when[x.id] && x.statistics && x.statistics.viewCount != null) {
            vids.push({ ts: Date.parse(when[x.id]) / 1000, views: +x.statistics.viewCount });
          }
        }
      }
      recent = recentSummary(vids);
    } catch (e) { /* keep this channel's snapshot `recent` */ }
    out.push(Object.assign({}, old, {
      name: c.snippet.title,
      subscribers: s.hiddenSubscriberCount ? old.subscribers : +s.subscriberCount,
      totalViews: s.viewCount != null ? +s.viewCount : old.totalViews,
      videoCount: s.videoCount != null ? +s.videoCount : old.videoCount,
      publishedAt: c.snippet.publishedAt ? c.snippet.publishedAt.slice(0, 10) : old.publishedAt,
      recent, missing: [],
    }));
  }
  out.sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));
  return Object.assign({}, snap, {
    generated: new Date().toISOString().slice(0, 10), source: 'youtube-data-api', live: true,
    method: 'YouTube Data API v3 (read live, cached for 24 hours): channels.list statistics (subscribers rounded to 3 significant figures by YouTube), the 25 newest uploads of each channel with exact view counts and durations.',
    channels: out,
  });
}

module.exports = async (req, res) => {
  const key = (process.env.YOUTUBE_API_KEY || '').trim();
  const fail = (code, body) => { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(body); };
  if (!key) return fail(503, { error: 'no key' });
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const data = await build(key, snap);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    fail(502, { error: 'YouTube data is temporarily unavailable.' });   // quota exceeded, API down, key restricted...: never cached, never detailed
  }
};
module.exports.build = build;
module.exports.recentSummary = recentSummary;
