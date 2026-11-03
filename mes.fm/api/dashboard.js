// MES Dashboard data (mes.fm/dashboard, private: behind the middleware.js password like /ads).
//
// GET /api/dashboard            -> the last collected data (Upstash `dash:data`, rebuilt when older than 15 minutes) + daily history
// GET /api/dashboard?refresh=1  -> collect again now (ignored when the stored data is under 60 s old)
// No other client input: every account, URL and limit is in the ADAPTERS table below.
//
// One adapter per platform. An adapter has a list of accounts and run(account, ctx) -> {stats, uploads, inbox, notes, needs}.
// Each account runs in parallel with its own time limit; a failure only marks that one source as failed. To add a platform:
// add an entry to ADAPTERS (+ its parsers in tool_apps_src/dashboard/lib.js and a colour in MESDash.PLATFORMS).
//
// Keyless sources: YouTube (about page, RSS feed, watch page + youtubei/next comments, like api/yt-chat.js), Rumble (channel page),
// BitChute (api.bitchute.com/api/beta), Odysee (SDK proxy claim_search / resolve, comments.odysee.tv, api.odysee.com reactions),
// Hive (api.hive.blog bridge + condenser), 3Speak (its videos are Hive posts: read from the same Hive answers).
// Optional env: YOUTUBE_API_KEY (exact counts + newest comments across the whole channel), ODYSEE_AUTH_TOKEN (Odysee followers + views:
// api.odysee.com answers "authentication required" without one). Storage: UPSTASH_REDIS_REST_URL / _TOKEN (without them nothing is
// cached and no history builds up).
//
// Daily history: every build writes `dash:day:<UTC date>` (the numbers of every account, overwritten through the day, kept 800 days).
// CLI:  node mes.fm/api/dashboard.js --sample     writes the made-up mes.fm/dashboard/data/sample.json for the local preview
//       node mes.fm/api/dashboard.js --fixtures   records live answers into tool_apps_src/dashboard/fixtures/ (trimmed) for the tests
//       node mes.fm/api/dashboard.js --live       prints one live build (ok / FAIL per source)
const L = require('./_dash-lib.js');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const YT_HDR = { 'User-Agent': UA, 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1; SOCS=CAI' };
const HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];
const OD_API = 'https://api.na-backend.odysee.com/api/v1/proxy';
const SOURCE_MS = 11000;
const FRESH_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------- fetch helpers (ctx.rec records raw answers for --fixtures)
function mkctx(env, rec) {
  const ctx = { env: env || {}, memo: {}, rec: rec || null, now: Date.now() };
  ctx.fetch = async (url, opt, ms, tag) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 7000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt || {}, { headers: Object.assign({ 'User-Agent': UA }, (opt || {}).headers || {}) }));
      const text = await r.text();
      if (ctx.rec && tag) ctx.rec[tag] = text;
      if (!r.ok) { const e = new Error(new URL(url).hostname + ' HTTP ' + r.status); e.status = r.status; e.body = text.slice(0, 300); throw e; }
      return text;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(new URL(url).hostname + ' timed out');
      throw e;
    } finally { clearTimeout(t); }
  };
  ctx.json = async (url, opt, ms, tag) => JSON.parse(await ctx.fetch(url, opt, ms, tag));
  ctx.post = (url, body, ms, tag, type) => ctx.json(url, { method: 'POST', headers: { 'Content-Type': type || 'application/json' }, body: JSON.stringify(body) }, ms, tag);
  // Hive: try the nodes in turn; same call within one build is memoised (3Speak reuses the Hive answers).
  ctx.hive = (method, params, tag) => {
    const k = method + JSON.stringify(params);
    if (!ctx.memo[k]) ctx.memo[k] = (async () => {
      let last;
      for (const n of HIVE_NODES) {
        try {
          const j = await ctx.post(n, { jsonrpc: '2.0', method, params, id: 1 }, 6000, tag);
          if (j.error) throw new Error(method + ': ' + (j.error.message || 'error'));
          return j;
        } catch (e) { last = e; }
      }
      throw last;
    })();
    return ctx.memo[k];
  };
  return ctx;
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } }));
  return out;
}

// ---------------------------------------------------------------- adapters
async function youtube(acct, ctx) {
  const key = ctx.env.YOUTUBE_API_KEY, notes = [];
  // Uploads: the channel's Videos + Live tabs (exact views, approximate dates); the RSS feed (exact dates, but it has answered 404 for
  // days at a time in 2026) only when both tabs fail.
  const tabs = await Promise.all(['videos', 'streams'].map((t) => ctx.fetch('https://www.youtube.com/' + acct.handle + '/' + t, { headers: YT_HDR }, 8000, 'yt-' + t + '-' + acct.key).then((h) => L.ytVideosPage(h, ctx.now, 15)).catch(() => null)));
  let feed = [].concat(tabs[0] || [], tabs[1] || []).sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 15);
  if (!tabs[0] && !tabs[1]) feed = L.ytFeed(await ctx.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + acct.ch, { headers: YT_HDR }, 7000, 'yt-feed-' + acct.key), 15);
  let stats = { followers: null, views: null, videos: null }, inbox = [];
  if (key) {
    const q = (p) => 'https://www.googleapis.com/youtube/v3/' + p + '&key=' + encodeURIComponent(key);
    const [ch, vids, com] = await Promise.all([
      ctx.json(q('channels?part=statistics,contentDetails&id=' + acct.ch), null, 7000).catch((e) => ({ err: e })),
      ctx.json(q('videos?part=statistics&id=' + feed.map((v) => v.id).join(',')), null, 7000).catch((e) => ({ err: e })),
      ctx.json(q('commentThreads?part=snippet&order=time&maxResults=40&allThreadsRelatedToChannelId=' + acct.ch), null, 7000).catch((e) => ({ err: e })),
    ]);
    const c = L.ytApiChannel(ch);
    if (c) stats = { followers: c.subs, views: c.views, videos: c.videos };
    const vm = L.ytApiVideos(vids);
    feed.forEach((v) => { const s = vm[v.id]; if (s) Object.assign(v, s); });
    const titles = {}; feed.forEach((v) => { titles[v.id] = v.title; });
    inbox = L.ytApiComments(com).map((x) => ({ id: x.id, kind: 'comment', author: x.author, own: x.authorId === acct.ch, text: x.text, ts: x.ts, likes: x.likes, replies: x.replies, on: titles[x.videoId] || '', url: 'https://www.youtube.com/watch?v=' + x.videoId + '&lc=' + x.id }));
    if (ch.err || !c) notes.push('YouTube API: ' + ((ch.err && ch.err.message) || 'no channel') + ' (keyless numbers used)');
    if (c) return { stats, uploads: feed, inbox, notes, via: 'YouTube Data API' };
  }
  // keyless: about page for the channel totals (rounded subscriber count, exact views), watch pages for comments
  const about = L.ytAbout(await ctx.fetch('https://www.youtube.com/' + acct.handle + '/about', { headers: YT_HDR }, 8000, 'yt-about-' + acct.key));
  stats = { followers: about.subs, views: about.views, videos: about.videos };
  if (stats.followers == null && stats.views == null) throw new Error('YouTube page had no channel numbers');
  const recent = feed.filter((v) => !v.upcoming && (!v.published || ctx.now - v.published < 60 * 864e5)).slice(0, 3);
  const got = await pool(recent, 3, async (v) => {
    const w = L.ytWatch(await ctx.fetch('https://www.youtube.com/watch?v=' + v.id, { headers: YT_HDR }, 7000, ctx.rec ? 'yt-watch-' + acct.key : null));
    if (w.likes != null) v.likes = w.likes;
    if (!w.token || !w.ver) return null;
    const txt = await ctx.fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, YT_HDR), body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: w.ver, hl: 'en' } }, continuation: w.token }) }, 7000, ctx.rec ? 'yt-next-' + acct.key : null);
    const c = L.ytComments(txt, ctx.now);
    v.comments = c.count;
    return c.items.filter((x) => !x.reply).map((x) => ({ id: x.id, kind: 'comment', author: x.author, own: x.creator || x.authorId === acct.ch, text: x.text, ts: x.ts, approx: true, likes: x.likes, replies: x.replies, on: v.title, url: 'https://www.youtube.com/watch?v=' + v.id + '&lc=' + x.id }));
  });
  got.forEach((g) => { if (g) inbox = inbox.concat(g); });
  if (got.some((g) => g === null)) notes.push('Comments of some videos could not be read');
  notes.push('Without YOUTUBE_API_KEY: subscribers are rounded and comments come from the 3 newest videos only');
  return { stats, uploads: feed, inbox, notes, needs: key ? [] : ['YOUTUBE_API_KEY'], via: 'public pages' };
}

async function rumble(acct, ctx) {
  const r = L.rumbleChannel(await ctx.fetch('https://rumble.com/c/' + acct.slug + '/videos', { headers: { 'Accept-Language': 'en' } }, 8000, 'rumble-' + acct.key));
  if (r.followers == null && !r.videos.length) throw new Error('Rumble page had no channel numbers');
  return { stats: { followers: r.followers, views: null, videos: null }, extra: { recentViews: r.videos.reduce((s, v) => s + (v.views || 0), 0) }, uploads: r.videos.slice(0, 15), inbox: [], notes: ['Rumble shows no channel view total; comment text is only on each video page (counts are on the uploads)'] };
}

async function bitchute(acct, ctx) {
  const B = 'https://api.bitchute.com/api/beta/';
  const [ch, vids] = await Promise.all([
    ctx.post(B + 'channel', { channel_id: acct.ch }, 7000, 'bitchute-channel-' + acct.key),
    ctx.post(B + 'channel/videos', { channel_id: acct.ch, offset: 0, limit: 12 }, 7000, 'bitchute-videos-' + acct.key),
  ]);
  const c = L.bitchuteChannel(ch);
  if (!c) throw new Error('BitChute channel not found');
  const up = L.bitchuteVideos(vids);
  await pool(up.slice(0, 5), 5, async (v) => { const k = L.bitchuteCounts(await ctx.post(B + 'video/counts', { video_id: v.id }, 5000, ctx.rec ? 'bitchute-counts' : null)); if (k.likes != null) v.likes = k.likes; if (k.views != null) v.views = k.views; });
  return { stats: { followers: c.followers, views: c.views, videos: c.videos }, uploads: up, inbox: [], notes: ['BitChute comments need a signed-in session; open the video to read them'] };
}

async function odysee(acct, ctx) {
  const url = 'lbry://' + acct.url;
  let res, err;
  for (let i = 0; i < 3 && !res; i++) {   // one of the proxy's backends sometimes answers "wallet not started": retry
    try { const j = await ctx.post(OD_API + '?m=resolve', { jsonrpc: '2.0', method: 'resolve', params: { urls: [url] }, id: 1 }, 4000, 'odysee-resolve-' + acct.key, 'text/plain'); res = L.odyResolve(j, url); if (!res) err = new Error((j.error && j.error.message) || 'channel not found'); } catch (e) { err = e; }
  }
  if (!res) throw err;
  let cs;
  for (let i = 0; i < 3 && !cs; i++) {
    try { const j = await ctx.post(OD_API + '?m=claim_search', { jsonrpc: '2.0', method: 'claim_search', params: { channel_ids: [res.claimId], order_by: ['release_time'], page_size: 12, claim_type: ['stream'], no_totals: true }, id: 1 }, 5000, 'odysee-claims-' + acct.key, 'text/plain'); if (j.result) cs = j; } catch (e) { err = e; }
  }
  const up = cs ? L.odyClaims(cs) : [];
  const ids = up.map((v) => v.id);
  const notes = [], needs = [];
  // api.odysee.com/reaction/list can take 6+ s: run it beside the comments, give up after 4 s (the likes then stay blank)
  const rxP = ids.length ? ctx.json('https://api.odysee.com/reaction/list', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'claim_ids=' + ids.join(',') }, 4000, 'odysee-reactions-' + acct.key).catch(() => null) : Promise.resolve(null);
  let followers = null;
  const tok = ctx.env.ODYSEE_AUTH_TOKEN;
  if (tok) {
    const q = 'auth_token=' + encodeURIComponent(tok);
    const [sc, vc] = await Promise.all([
      ctx.json('https://api.odysee.com/subscription/sub_count?' + q + '&claim_id=' + res.claimId, null, 6000).catch(() => null),
      ids.length ? ctx.json('https://api.odysee.com/file/view_count?' + q + '&claim_id=' + ids.join(','), null, 6000).catch(() => null) : null,
    ]);
    const s = L.odyCounts(sc), v = L.odyCounts(vc);
    if (s) followers = s[0]; else notes.push('ODYSEE_AUTH_TOKEN was refused');
    if (v) up.forEach((x, i) => { x.views = v[i] != null ? v[i] : null; });
  } else { needs.push('ODYSEE_AUTH_TOKEN'); notes.push('Followers and views need ODYSEE_AUTH_TOKEN (api.odysee.com answers "authentication required" without one)'); }
  let inbox = [];
  const live = up.filter((v) => !v.release || v.release < ctx.now + 864e5).slice(0, 5);
  const coms = await pool(live, 5, async (v) => {
    const j = await ctx.post('https://comments.odysee.tv/api/v2?m=comment.List', { jsonrpc: '2.0', id: 1, method: 'comment.List', params: { claim_id: v.id, page: 1, page_size: 20, sort_by: 0, top_level: false } }, 6000, ctx.rec ? 'odysee-comments-' + acct.key : null);
    const c = L.odyComments(j);
    v.comments = c.total;
    return c.items.map((x) => ({ id: x.id, kind: x.tip ? 'tip' : 'comment', author: x.author, own: x.creator, text: x.text, ts: x.ts, tip: x.tip || undefined, on: v.title, url: v.url + '?lc=' + x.id }));
  });
  coms.forEach((c) => { if (c) inbox = inbox.concat(c); });
  const rxj = await rxP;
  if (rxj) { const rx = L.odyReactions(rxj); up.forEach((v) => { if (rx[v.id]) v.likes = rx[v.id].likes; }); } else if (ids.length) notes.push('Odysee likes did not answer in time');
  return { stats: { followers, views: null, videos: res.claims }, uploads: up, inbox, notes, needs };
}

async function hiveCommon(acct, ctx) {
  const [prof, posts] = await Promise.all([
    ctx.hive('bridge.get_profile', { account: acct.name }, 'hive-profile-' + acct.key),
    ctx.hive('bridge.get_account_posts', { account: acct.name, sort: 'posts', limit: 20 }, 'hive-posts-' + acct.key),
  ]);
  return { prof: L.hiveProfile(prof), posts: L.hivePosts(posts) };
}

async function hive(acct, ctx) {
  const [base, acc, dgp, rep, notif, unread] = await Promise.all([
    hiveCommon(acct, ctx),
    ctx.hive('condenser_api.get_accounts', [[acct.name]], 'hive-accounts-' + acct.key),
    ctx.hive('condenser_api.get_dynamic_global_properties', [], 'hive-dgp').catch(() => null),
    ctx.hive('bridge.get_account_posts', { account: acct.name, sort: 'replies', limit: 20 }, 'hive-replies-' + acct.key).catch(() => null),
    ctx.hive('bridge.account_notifications', { account: acct.name, limit: 60 }, 'hive-notifs-' + acct.key).catch(() => null),
    ctx.hive('bridge.unread_notifications', { account: acct.name }, 'hive-unread-' + acct.key).catch(() => null),
  ]);
  if (!base.prof) throw new Error('Hive account not found');
  const wallet = L.hiveAccount(((acc || {}).result || [])[0], L.hivePerVest(dgp));
  const titles = {}; base.posts.forEach((p) => { titles[p.id] = p.title; });
  let inbox = [];
  if (rep) inbox = L.hiveReplies(rep).map((r) => ({ id: r.id, kind: 'comment', author: r.author, own: r.author === acct.name, text: r.text, ts: r.ts, on: titles[r.parent] || r.parent, url: r.url, votes: r.votes }));
  if (notif) inbox = inbox.concat(L.hiveNotifs(notif).filter((n) => n.kind !== 'reply').map((n) => ({ id: 'n' + n.id, kind: n.kind, author: n.author, text: n.text, ts: n.ts, url: n.url })));
  const pending = base.posts.filter((p) => p.pending).reduce((s, p) => s + p.payout, 0);
  return {
    stats: { followers: base.prof.followers, views: null, videos: null, posts: base.prof.posts },
    extra: { following: base.prof.following, rep: base.prof.rep, pendingPayout: Math.round(pending * 1000) / 1000, wallet, unread: unread && unread.result ? unread.result.unread : null },
    uploads: base.posts, inbox, notes: [],
  };
}

async function threespeak(acct, ctx) {
  const base = await hiveCommon(acct, ctx);
  const vids = base.posts.filter((p) => p.video);
  return { stats: { followers: null, views: null, videos: null }, extra: { recentVideos: vids.length, votes: vids.reduce((s, v) => s + v.votes, 0), payout: Math.round(vids.reduce((s, v) => s + v.payout, 0) * 1000) / 1000 },
    uploads: vids.map((v) => Object.assign({}, v, { url: 'https://3speak.tv/watch?v=' + v.id })), inbox: [],
    notes: ['3Speak videos are Hive posts: votes, comments and payouts come from Hive (comments are in the Hive inbox). 3Speak view counts have no public API right now'] };
}

const ADAPTERS = [
  { id: 'yt', name: 'YouTube', run: youtube, accounts: [
    { key: 'mes', label: '@mes', handle: '@mes', ch: 'UCUUBq1GPBvvGNz7dpgO14Ow', url: 'https://www.youtube.com/@mes', studio: 'https://studio.youtube.com/channel/UCUUBq1GPBvvGNz7dpgO14Ow/comments/inbox' },
    { key: 'mestruth', label: '@mestruth', handle: '@mestruth', ch: 'UCmYl-9bhOOotXaNpS-liNiQ', url: 'https://www.youtube.com/@mestruth', studio: 'https://studio.youtube.com/channel/UCmYl-9bhOOotXaNpS-liNiQ/comments/inbox' },
  ] },
  { id: 'rumble', name: 'Rumble', run: rumble, accounts: [
    { key: 'mes', label: 'MathEasySolutions', slug: 'MathEasySolutions', url: 'https://rumble.com/c/MathEasySolutions' },
    { key: 'mestruth', label: 'MESTruth', slug: 'MESTruth', url: 'https://rumble.com/c/MESTruth' },
  ] },
  { id: 'odysee', name: 'Odysee', run: odysee, accounts: [
    { key: 'mes', label: '@mes', url: '@mes#8', link: 'https://odysee.com/@mes:8' },
    { key: 'mestruth', label: '@mestruth', url: '@mestruth#9', link: 'https://odysee.com/@mestruth:9' },
  ] },
  { id: 'bitchute', name: 'BitChute', run: bitchute, accounts: [
    // @mestruth has no BitChute channel (checked 2026-11-02); add it here when one exists
    { key: 'mes', label: 'Math Easy Solutions', ch: '1B8tfwAKfSbU', url: 'https://www.bitchute.com/channel/1B8tfwAKfSbU/' },
  ] },
  { id: '3speak', name: '3Speak', run: threespeak, accounts: [
    { key: 'mes', label: 'mes', name: 'mes', url: 'https://3speak.tv/user/mes' },
    { key: 'mestruth', label: 'mestruth', name: 'mestruth', url: 'https://3speak.tv/user/mestruth' },
  ] },
  { id: 'hive', name: 'Hive', run: hive, accounts: [
    { key: 'mes', label: '@mes', name: 'mes', url: 'https://peakd.com/@mes', studio: 'https://peakd.com/@mes/notifications' },
    { key: 'mestruth', label: '@mestruth', name: 'mestruth', url: 'https://peakd.com/@mestruth', studio: 'https://peakd.com/@mestruth/notifications' },
  ] },
];

async function runOne(ad, acct, ctx) {
  const t0 = Date.now();
  const base = { p: ad.id, a: acct.key, label: acct.label, url: acct.url || acct.link, studio: acct.studio || null };
  try {
    const r = await Promise.race([ad.run(acct, ctx), new Promise((_, rej) => setTimeout(() => rej(new Error('took longer than ' + SOURCE_MS / 1000 + ' s')), SOURCE_MS))]);
    return Object.assign(base, { ok: true, ms: Date.now() - t0, stats: r.stats, extra: r.extra || null, uploads: (r.uploads || []).slice(0, 15), inbox: (r.inbox || []).map((x) => Object.assign({}, x, { text: L.clip(x.text, 600) })), notes: r.notes || [], needs: r.needs || [], via: r.via || null });
  } catch (e) {
    return Object.assign(base, { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 160) });
  }
}

async function build(env, rec) {
  const ctx = mkctx(env, rec);
  const jobs = [];
  ADAPTERS.forEach((ad) => ad.accounts.forEach((a) => jobs.push(runOne(ad, a, ctx))));
  const sources = await Promise.all(jobs);
  return { v: 1, generated: new Date().toISOString(), keys: { youtube: !!env.YOUTUBE_API_KEY, odysee: !!env.ODYSEE_AUTH_TOKEN, storage: !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) }, sources };
}

// ---------------------------------------------------------------- Upstash
async function redis(commands) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return r.json();
  } catch (e) { return null; }
}
const dayKey = (t) => 'dash:day:' + new Date(t).toISOString().slice(0, 10);
async function history(now, days) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * 864e5));
  const r = await redis([['MGET', ...keys]]);
  const vals = (r && r[0] && r[0].result) || [];
  const out = [];
  keys.forEach((k, i) => { try { if (vals[i]) out.push({ d: k.slice(9), a: JSON.parse(vals[i]) }); } catch (e) {} });
  return out;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const now = Date.now();
  const q = (req && req.query) || {};
  const force = q.refresh === '1';
  let data = null;
  const got = await redis([['GET', 'dash:data']]);
  let cached = null;
  try { cached = got && got[0] && got[0].result ? JSON.parse(got[0].result) : null; } catch (e) {}
  const age = cached ? now - Date.parse(cached.generated) : Infinity;
  if (cached && (age < 60000 || (!force && age < FRESH_MS))) data = cached;
  if (!data) {
    try {
      data = await build(process.env);
      // keep the last good answer of a source that failed this time (marked stale) so the page still shows its numbers
      if (cached) data.sources = data.sources.map((s) => { if (s.ok) return s; const o = cached.sources.find((c) => c.p === s.p && c.a === s.a && (c.ok || c.staleFrom)); return o ? Object.assign({}, o, { ok: true, stale: true, staleFrom: o.staleFrom || cached.generated, error: s.error }) : s; });
      const snap = L.snapshot(data.sources.filter((s) => !s.stale));
      await redis([['SET', 'dash:data', JSON.stringify(data), 'EX', String(30 * 86400)], ['SET', dayKey(now), JSON.stringify(snap), 'EX', String(800 * 86400)]]);
    } catch (e) {
      if (cached) data = cached; else return res.status(502).json({ error: 'data unavailable' });
    }
  }
  data = Object.assign({}, data, { history: await history(now, 365) });
  return res.status(200).json(data);
}

// ---------------------------------------------------------------- made-up sample for the local preview (clearly marked sample: true)
function sample(now) {
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const words = ['Great explanation, thanks!', 'Can you do one on integrals by parts?', 'This helped me pass my exam', 'Where can I find the notes?', 'Interesting, never thought of it that way', 'What software do you use?', 'More of these please', 'Is there a part 2?'];
  const people = ['alice', 'bob_math', 'carla', 'dmitri', 'eyesiswatchin', 'fran', 'gus', 'hiveuser'];
  const sources = [];
  const base = { 'yt:mes': [60100, 13660614, 1900], 'yt:mestruth': [3400, 410000, 160], 'rumble:mes': [1340, null, null], 'rumble:mestruth': [268, null, null], 'odysee:mes': [null, null, 2020], 'odysee:mestruth': [null, null, 33], 'bitchute:mes': [178, 803556, 1767], '3speak:mes': [null, null, null], '3speak:mestruth': [null, null, null], 'hive:mes': [1707, null, null], 'hive:mestruth': [24, null, null] };
  ADAPTERS.forEach((ad) => ad.accounts.forEach((a) => {
    const k = ad.id + ':' + a.key, b = base[k] || [null, null, null];
    const uploads = Array.from({ length: 8 }, (_, i) => ({ id: k + i, title: (ad.id === 'hive' ? 'Post ' : 'Video ') + (40 - i) + ': sample upload', url: a.url, published: now - (i * 2.5 + rnd()) * 864e5, views: ad.id === 'hive' ? null : Math.round(rnd() * 900 + 20), likes: Math.round(rnd() * 60), comments: Math.round(rnd() * 12), payout: ad.id === 'hive' || ad.id === '3speak' ? Math.round(rnd() * 400) / 100 : undefined, votes: ad.id === 'hive' || ad.id === '3speak' ? Math.round(rnd() * 200) : undefined }));
    const inbox = ad.id === 'rumble' || ad.id === 'bitchute' || ad.id === '3speak' ? [] : Array.from({ length: 6 }, (_, i) => ({ id: 's' + i, kind: ad.id === 'hive' ? ['comment', 'vote', 'follow', 'mention', 'reblog'][i % 5] : 'comment', author: people[Math.floor(rnd() * people.length)], text: words[Math.floor(rnd() * words.length)], ts: now - rnd() * 6 * 864e5, on: uploads[i % 3].title, url: a.url }));
    const fail = k === 'bitchute:mes' && false;
    sources.push({ p: ad.id, a: a.key, label: a.label, url: a.url || a.link, studio: a.studio || null, ok: !fail, ms: Math.round(rnd() * 3000), stats: { followers: b[0], views: b[1], videos: b[2] }, extra: ad.id === 'hive' ? { pendingPayout: 12.3, unread: 4, wallet: { hive: 100, hbd: 50, hp: 3000 } } : null, uploads, inbox, notes: ad.id === 'odysee' ? ['Followers and views need ODYSEE_AUTH_TOKEN'] : [], needs: ad.id === 'odysee' ? ['ODYSEE_AUTH_TOKEN'] : ad.id === 'yt' ? ['YOUTUBE_API_KEY'] : [] });
  }));
  const history = [];
  for (let i = 59; i >= 0; i--) {
    const a = {};
    Object.keys(base).forEach((k) => { const b = base[k], g = 1 - i * 0.0015; const x = {}; if (b[0] != null) x.f = Math.round(b[0] * g); if (b[1] != null) x.v = Math.round(b[1] * (1 - i * 0.002)); if (b[2] != null) x.n = Math.round(b[2] - i / 6); if (Object.keys(x).length) a[k] = x; });
    history.push({ d: new Date(now - i * 864e5).toISOString().slice(0, 10), a });
  }
  return { v: 1, sample: true, generated: new Date(now).toISOString(), keys: { youtube: false, odysee: false, storage: true }, sources, history };
}

module.exports = handler;
module.exports.build = build;
module.exports.ADAPTERS = ADAPTERS;
module.exports.mkctx = mkctx;
module.exports.sample = sample;

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const arg = process.argv[2];
  if (arg === '--sample') {
    const out = path.join(__dirname, '..', 'dashboard', 'data', 'sample.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(sample(Date.now())));
    console.log('wrote', out);
  } else if (arg === '--live' || arg === '--fixtures') {
    const rec = arg === '--fixtures' ? {} : null;
    build(process.env, rec).then((d) => {
      d.sources.forEach((s) => console.log((s.ok ? 'ok   ' : 'FAIL ') + s.p + ':' + s.a, s.ms + 'ms', s.ok ? JSON.stringify(s.stats) + ' uploads=' + s.uploads.length + ' inbox=' + s.inbox.length : s.error));
      if (!rec) return;
      const dir = path.join(__dirname, '..', '..', 'tool_apps_src', 'dashboard', 'fixtures');
      fs.mkdirSync(dir, { recursive: true });
      Object.keys(rec).forEach((k) => {
        let t = rec[k];
        // trim the big pages to the parts the parsers read, so the fixtures stay small
        if (/^yt-about/.test(k)) { const i = t.indexOf('"aboutChannelViewModel":{'); t = i >= 0 ? t.slice(i, i + 4000) : t.slice(0, 4000); }
        else if (/^yt-watch/.test(k)) { const v = (/"INNERTUBE_CLIENT_VERSION":"[^"]+"/.exec(t) || [''])[0], ky = (/"INNERTUBE_API_KEY":"[^"]+"/.exec(t) || [''])[0], lk = (/like this video along with [\d,]+ other people/.exec(t) || [''])[0], i = t.indexOf('"sectionIdentifier":"comment-item-section"'); t = '{' + v + ',' + ky + '} ' + lk + ' ' + (i > 0 ? t.slice(i - 4000, i + 60) : ''); }
        else if (/^rumble/.test(k)) { const j = L.rumbleJson(t), f = (/<span>[\d.,KMB]+ Followers<\/span>/.exec(t) || [''])[0]; if (j) { j.items = j.items.slice(0, 12); j.items.forEach((v) => { delete v.videos; delete v.tags; delete v.log; }); delete j.analytics; } t = f + '\n<script type="application/json">' + JSON.stringify(j) + '</script>'; }
        else if (/^yt-(videos|streams)/.test(k)) { const lk = []; (function w(o) { if (!o || typeof o !== 'object' || lk.length >= 12) return; if (Array.isArray(o)) return o.forEach(w); if (o.lockupViewModel) { const l = o.lockupViewModel; const md = (l.metadata || {}).lockupMetadataViewModel || {}; lk.push({ lockupViewModel: { contentId: l.contentId, contentType: l.contentType, metadata: { lockupMetadataViewModel: { title: md.title, metadata: { contentMetadataViewModel: { metadataRows: ((((md.metadata || {}).contentMetadataViewModel) || {}).metadataRows || []).map((r) => ({ metadataParts: (r.metadataParts || []).map((q) => ({ text: q.text, accessibilityLabel: q.accessibilityLabel })) })) } } } } } }); return; } Object.values(o).forEach(w); })(L.ytData(t)); t = '<script>var ytInitialData = ' + JSON.stringify({ contents: lk }) + ';</script>'; }
        else if (/^yt-next/.test(k)) { try { const j = JSON.parse(t), cnt = (/"commentsHeaderRenderer":\{"countText":\{"runs":\[\{"text":"[^"]*"\}\]/.exec(t) || [''])[0]; const muts = (((j.frameworkUpdates || {}).entityBatchUpdate || {}).mutations || []).filter((x) => x.payload && x.payload.commentEntityPayload).slice(0, 12).map((x) => { const p = x.payload.commentEntityPayload; return { payload: { commentEntityPayload: { properties: { commentId: p.properties.commentId, publishedTime: p.properties.publishedTime, replyLevel: p.properties.replyLevel, content: { content: p.properties.content.content } }, author: { displayName: p.author.displayName, channelId: p.author.channelId, isCreator: p.author.isCreator }, toolbar: { likeCountNotliked: p.toolbar.likeCountNotliked, likeCountA11y: p.toolbar.likeCountA11y, replyCount: p.toolbar.replyCount } } } }; }); t = JSON.stringify({ header: cnt ? JSON.parse('{' + cnt + '}]}}}') : null, frameworkUpdates: { entityBatchUpdate: { mutations: muts } } }); } catch (e) {} }
        else if (/^odysee-claims/.test(k)) { try { const j = JSON.parse(t); j.result.items = j.result.items.map((c) => ({ claim_id: c.claim_id, name: c.name, canonical_url: c.canonical_url, timestamp: c.timestamp, value: { title: (c.value || {}).title, release_time: (c.value || {}).release_time, thumbnail: (c.value || {}).thumbnail } })); t = JSON.stringify(j); } catch (e) {} }
        else if (/^hive-posts|^hive-replies/.test(k)) { try { const j = JSON.parse(t); (j.result || []).forEach((p) => { p.body = String(p.body).slice(0, 300); p.active_votes = (p.active_votes || []).slice(0, 2); const m = p.json_metadata || {}; p.json_metadata = { app: m.app, type: m.type, image: (m.image || []).slice(0, 1) }; delete p.beneficiaries; delete p.blacklists; }); t = JSON.stringify(j); } catch (e) {} }
        else if (/^hive-accounts/.test(k)) { try { const j = JSON.parse(t); (j.result || []).forEach((a) => { delete a.posting_json_metadata; delete a.json_metadata; delete a.owner; delete a.active; delete a.posting; }); t = JSON.stringify(j); } catch (e) {} }
        else if (/^bitchute-(videos|channel)/.test(k)) { try { const j = JSON.parse(t); (j.videos || []).forEach((v) => { v.description = String(v.description || '').slice(0, 120); }); if (j.description) j.description = j.description.slice(0, 120); t = JSON.stringify(j); } catch (e) {} }
        const ext = /^(yt-about|yt-watch|yt-videos|yt-streams|rumble)/.test(k) ? '.html' : /^yt-feed/.test(k) ? '.xml' : '.json';
        fs.writeFileSync(path.join(dir, k + ext), t);
      });
      console.log('fixtures:', Object.keys(rec).length, 'files in', dir);
    });
  }
}
