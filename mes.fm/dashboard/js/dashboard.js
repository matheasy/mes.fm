/* MESDash: pure parsing / merging for mes.fm/dashboard (private creator dashboard for @mes and @mestruth).
 * Runs in the browser (window.MESDash) and in node (module.exports). A byte-identical copy lives at mes.fm/api/_dash-lib.js:
 * after editing run  cp tool_apps_src/dashboard/lib.js mes.fm/api/_dash-lib.js  (the tests check).
 * Nothing here fetches: every function takes the raw text / JSON a source returned and gives back plain objects. */
(function (root) {
  'use strict';
  var D = {};

  D.PLATFORMS = [
    { id: 'yt', name: 'YouTube', color: '#e62117' },
    { id: 'rumble', name: 'Rumble', color: '#5aa323' },
    { id: 'odysee', name: 'Odysee', color: '#e50054' },
    { id: 'bitchute', name: 'BitChute', color: '#ef4136' },
    { id: '3speak', name: '3Speak', color: '#3b5bdb' },
    { id: 'hive', name: 'Hive', color: '#e31337' },
  ];
  D.platform = function (id) { for (var i = 0; i < D.PLATFORMS.length; i++) if (D.PLATFORMS[i].id === id) return D.PLATFORMS[i]; return { id: id, name: id, color: '#64748b' }; };

  // ---------------------------------------------------------------- small helpers
  /** "60.1K", "13,660,614 views", "1.9K videos", " 170 ", "1.2M" -> number (null when there is no number). */
  D.num = function (s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var m = /(-?[\d][\d,]*(?:\.\d+)?)\s*([KMB])?/i.exec(String(s).replace(/ /g, ' '));
    if (!m) return null;
    var n = parseFloat(m[1].replace(/,/g, ''));
    var k = (m[2] || '').toUpperCase();
    if (k === 'K') n *= 1e3; else if (k === 'M') n *= 1e6; else if (k === 'B') n *= 1e9;
    return Math.round(n);
  };
  D.decode = function (s) {
    return String(s == null ? '' : s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
      .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  };
  /** "3 days ago (edited)", "1 hour ago", "Streamed 2 weeks ago" -> approximate ms timestamp (null if unreadable). */
  D.relTime = function (s, now) {
    var m = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(String(s || ''));
    if (!m) return /just now/i.test(String(s || '')) ? now : null;
    var mult = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[m[2].toLowerCase()];
    return now - (+m[1]) * mult;
  };
  /** Hive / ISO date without a zone ("2026-11-02T21:39:24") is UTC. */
  D.utc = function (s) {
    if (!s) return null;
    var t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(' ', 'T') + 'Z');
    return isNaN(t) ? null : t;
  };
  D.clip = function (s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  /** Plain text of a Hive markdown body: images / links / html stripped. */
  D.plain = function (md) {
    return String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/\S+/g, function (u) { return u.length > 40 ? u.slice(0, 38) + '…' : u; }).replace(/[#*_>`~]+/g, ' ');
  };

  // ---------------------------------------------------------------- YouTube (keyless: about page, RSS feed, watch page + youtubei/next)
  /** /@handle/about HTML -> {subs, views, videos, joined}. */
  D.ytAbout = function (html) {
    html = String(html || '');
    var i = html.indexOf('"aboutChannelViewModel":{');
    var s = i >= 0 ? html.slice(i, i + 6000) : html;
    var g = function (re) { var m = re.exec(s); return m ? m[1] : null; };
    var subsT = g(/"subscriberCountText":"([^"]+)"/) || (/"content":"([0-9.,KMB]+ subscribers)"/.exec(html) || [])[1] || null;
    return {
      subs: D.num(subsT), subsText: subsT,
      views: D.num(g(/"viewCountText":"([^"]+)"/)),
      videos: D.num(g(/"videoCountText":"([^"]+)"/) || (/"content":"([0-9.,KMB]+ videos)"/.exec(html) || [])[1]),
      joined: g(/"joinedDateText":\{"content":"(?:Joined )?([^"]+)"/),
    };
  };
  /** Channel RSS feed -> newest uploads [{id, title, url, published, views, likes, thumb}]. */
  D.ytFeed = function (xml, max) {
    var out = [], entries = String(xml || '').match(/<entry>[\s\S]*?<\/entry>/g) || [];
    for (var k = 0; k < entries.length && out.length < (max || 15); k++) {
      var e = entries[k], id = (/<yt:videoId>([^<]*)<\/yt:videoId>/.exec(e) || [])[1];
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
      var views = /<media:statistics[^>]*views="(\d+)"/.exec(e), likes = /<media:starRating[^>]*count="(\d+)"/.exec(e);
      out.push({
        id: id, title: D.decode(((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim()),
        url: 'https://www.youtube.com/watch?v=' + id, published: D.utc(((/<published>([^<]*)<\/published>/.exec(e) || [])[1] || '').trim()),
        views: views ? +views[1] : null, likes: likes ? +likes[1] : null, comments: null,
        thumb: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      });
    }
    return out;
  };
  /** The ytInitialData object of a YouTube page (or null). */
  D.ytData = function (html) {
    if (html && typeof html === 'object') return html;
    var m = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(String(html || ''));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  };
  /** Channel /videos or /streams tab -> uploads [{id, title, url, published (approximate), views, thumb, live}]. */
  D.ytVideosPage = function (html, now, max) {
    var j = D.ytData(html), out = [], seen = {};
    (function walk(o) {
      if (!o || typeof o !== 'object' || out.length >= (max || 30)) return;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) walk(o[i]); return; }
      var l = o.lockupViewModel;
      if (l && l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && /^[A-Za-z0-9_-]{11}$/.test(l.contentId || '') && !seen[l.contentId]) {
        seen[l.contentId] = 1;
        var md = ((l.metadata || {}).lockupMetadataViewModel) || {}, parts = [];
        (((((md.metadata || {}).contentMetadataViewModel) || {}).metadataRows) || []).forEach(function (r) { (r.metadataParts || []).forEach(function (p) { parts.push(p.accessibilityLabel || ((p.text || {}).content) || ''); }); });
        var views = null, ts = null, live = false;
        parts.forEach(function (t) { if (/views?|watching/i.test(t) && views == null) { views = /no views/i.test(t) ? 0 : D.num(t); live = live || /watching/i.test(t); } else if (/ago/i.test(t) && ts == null) ts = D.relTime(t, now); else if (/scheduled|premieres/i.test(t)) live = live || false; });
        out.push({ id: l.contentId, title: D.decode(((md.title || {}).content) || ''), url: 'https://www.youtube.com/watch?v=' + l.contentId, published: ts, approx: true, views: views, likes: null, comments: null, thumb: 'https://i.ytimg.com/vi/' + l.contentId + '/mqdefault.jpg', live: live, upcoming: parts.some(function (t) { return /scheduled|premieres|waiting/i.test(t); }) });
        return;
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) walk(o[k]);
    })(j);
    return out;
  };
  /** Watch page HTML -> what is needed to read its comments: {ver, key, token}. */
  D.ytWatch = function (html) {
    html = String(html || '');
    var ver = (/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html) || [])[1] || null;
    var key = (/"INNERTUBE_API_KEY":"([^"]+)"/.exec(html) || [])[1] || null;
    var i = html.indexOf('"sectionIdentifier":"comment-item-section"'), token = null;
    if (i > 0) { var toks = html.slice(Math.max(0, i - 4000), i).match(/"token":"[^"]+"/g); if (toks) token = toks[toks.length - 1].slice(9, -1); }
    var likes = (/like this video along with ([\d,]+) other/.exec(html) || [])[1];
    return { ver: ver, key: key, token: token, likes: likes != null ? D.num(likes) + 1 : null, commentsOff: /"Comments are turned off/.test(html) };
  };
  /** youtubei/v1/next comments answer -> {count, items:[{id, text, author, authorId, creator, ts, likes, replies}]}. */
  D.ytComments = function (j, now) {
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { return { count: null, items: [] }; } }
    var muts = (((j || {}).frameworkUpdates || {}).entityBatchUpdate || {}).mutations || [];
    var items = [];
    muts.forEach(function (x) {
      var p = x && x.payload && x.payload.commentEntityPayload;
      if (!p || !p.properties) return;
      var pr = p.properties, a = p.author || {}, tb = p.toolbar || {};
      items.push({
        id: pr.commentId, text: ((pr.content || {}).content || ''), author: a.displayName || '', authorId: a.channelId || '',
        creator: !!a.isCreator, ts: D.relTime(pr.publishedTime, now), when: pr.publishedTime || '', reply: (pr.replyLevel || 0) > 0,
        likes: D.num(tb.likeCountNotliked) || D.num((/^(\d[\d,.KM]*)/.exec(tb.likeCountA11y || '') || [])[1]) || 0,
        replies: D.num(tb.replyCount) || 0,
      });
    });
    var s = JSON.stringify(j || {});
    var c = /"commentsHeaderRenderer":\{"countText":\{"runs":\[\{"text":"([\d,.KM]+)"/.exec(s);
    return { count: c ? D.num(c[1]) : (items.length ? items.length : null), items: items };
  };
  // With a YouTube Data API key (env YOUTUBE_API_KEY).
  D.ytApiChannel = function (j) {
    var it = ((j || {}).items || [])[0]; if (!it) return null;
    var s = it.statistics || {};
    return { subs: s.hiddenSubscriberCount ? null : +s.subscriberCount, views: +s.viewCount, videos: +s.videoCount, uploads: ((it.contentDetails || {}).relatedPlaylists || {}).uploads || null };
  };
  D.ytApiVideos = function (j) {
    var m = {};
    ((j || {}).items || []).forEach(function (v) { var s = v.statistics || {}; m[v.id] = { views: s.viewCount != null ? +s.viewCount : null, likes: s.likeCount != null ? +s.likeCount : null, comments: s.commentCount != null ? +s.commentCount : null }; });
    return m;
  };
  D.ytApiComments = function (j) {
    return ((j || {}).items || []).map(function (t) {
      var c = ((t.snippet || {}).topLevelComment || {}).snippet || {};
      return { id: t.id, videoId: (t.snippet || {}).videoId, text: D.decode(String(c.textOriginal || c.textDisplay || '')), author: c.authorDisplayName || '', authorId: ((c.authorChannelId || {}).value) || '', ts: Date.parse(c.publishedAt) || null, likes: c.likeCount || 0, replies: (t.snippet || {}).totalReplyCount || 0 };
    });
  };

  // ---------------------------------------------------------------- Rumble (public channel page)
  /** The JSON list Rumble embeds for its client-side video grid ({items:[{object_type:'video', ...}]}), or null. */
  D.rumbleJson = function (html) {
    var re = /<script type="application\/json">\s*(\{"items":\[[\s\S]*?)<\/script>/g, m;
    while ((m = re.exec(String(html || '')))) { try { var j = JSON.parse(m[1]); if (j.items && j.items.length && j.items[0].object_type) return j; } catch (e) {} }
    return null;
  };
  D.rumbleChannel = function (html) {
    html = String(html || '');
    var rj = D.rumbleJson(html);
    if (rj) {
      var vids = rj.items.filter(function (v) { return v.object_type === 'video'; }), by = (vids[0] || {}).by || {};
      return { name: by.name || null, followers: by.followers != null ? +by.followers : D.num((/([\d.,KMB]+)\s+Followers/i.exec(html) || [])[1]), videos: vids.map(function (v) {
        return { id: String(v.id), title: v.title, url: v.url || ('https://rumble.com' + v.relative_url), published: Date.parse(v.upload_date) || null, views: v.views != null ? +v.views : null, likes: ((v.rumble_votes || {}).num_votes_up), dislikes: ((v.rumble_votes || {}).num_votes_down), comments: ((v.comments || {}).count), thumb: v.thumb || null, live: !!v.live, short: !!v.is_short };
      }).sort(function (a, b) { return (b.published || 0) - (a.published || 0); }) };
    }
    var f = /<span>([\d.,KMB]+)\s+Followers<\/span>/i.exec(html) || /([\d.,KMB]+)\s+Followers/i.exec(html);
    var name = (/<h1>([^<]+)<\/h1>/.exec(html) || [])[1] || null;
    var parts = html.split(/<div\s+class="videostream thumbnail__grid--item/).slice(1), seen = {}, videos = [];
    parts.forEach(function (p) {
      var id = (/data-video-id="(\d+)"/.exec(p) || [])[1], href = (/class="title__link link" href="([^"?]+)/.exec(p) || [])[1];
      if (!id || !href || seen[id]) return; seen[id] = 1;
      var cm = /videostream__comments--count">\s*([\d,.KM]+)/.exec(p);
      videos.push({
        id: id, title: D.decode(((/<h3[^>]*title="([^"]*)"/.exec(p) || [])[1] || '').trim()), url: 'https://rumble.com' + href,
        published: Date.parse((/<time[^>]*datetime="([^"]+)"/.exec(p) || [])[1] || '') || null,
        views: D.num((/data-views="(\d+)"/.exec(p) || [])[1]), comments: cm ? D.num(cm[1]) : 0, likes: null,
        thumb: (/<img\s+class="thumbnail__image[^"]*"[^>]*?src="([^"]+)"/.exec(p) || [])[1] || null,
        live: /videostream__status--live/.test(p),
      });
    });
    videos.sort(function (a, b) { return (b.published || 0) - (a.published || 0); });
    return { name: name ? D.decode(name.trim()) : null, followers: f ? D.num(f[1]) : null, videos: videos };
  };

  // ---------------------------------------------------------------- BitChute (api.bitchute.com/api/beta, POST JSON, keyless)
  D.bitchuteChannel = function (j) { j = j || {}; if (!j.channel_id) return null; return { name: j.channel_name, followers: j.subscriber_count != null ? +j.subscriber_count : null, views: j.view_count != null ? +j.view_count : null, videos: j.video_count != null ? +j.video_count : null, last: Date.parse(j.last_video_published) || null }; };
  D.bitchuteVideos = function (j) {
    return ((j || {}).videos || []).map(function (v) { return { id: v.video_id, title: v.video_name, url: 'https://www.bitchute.com' + (v.video_url || '/video/' + v.video_id + '/'), published: Date.parse(v.date_published) || null, views: v.view_count != null ? +v.view_count : null, likes: null, comments: null, thumb: v.thumbnail_url || null }; });
  };
  D.bitchuteCounts = function (j) { j = j || {}; return { views: j.view_count != null ? +j.view_count : null, likes: j.like_count != null ? +j.like_count : null, dislikes: j.dislike_count != null ? +j.dislike_count : null }; };

  // ---------------------------------------------------------------- Odysee (SDK proxy, comments.odysee.tv, api.odysee.com)
  D.odyResolve = function (j, url) {
    var r = ((j || {}).result || {})[url]; if (!r || !r.claim_id) return null;
    return { claimId: r.claim_id, name: r.name, title: (r.value || {}).title || r.name, claims: (r.meta || {}).claims_in_channel != null ? +r.meta.claims_in_channel : null };
  };
  D.odyClaims = function (j) {
    var items = (((j || {}).result || {}).items) || [];
    return items.map(function (c) {
      var v = c.value || {}, rt = +(v.release_time || c.timestamp || 0);
      var cu = String(c.canonical_url || c.permanent_url || '').replace(/^lbry:\/\//, '').replace(/#/g, ':');
      return { id: c.claim_id, title: v.title || c.name, url: 'https://odysee.com/' + (cu || c.name + ':' + String(c.claim_id).slice(0, 1)), published: rt ? rt * 1000 : null, views: null, likes: null, comments: null, thumb: ((v.thumbnail || {}).url) || null, release: rt ? rt * 1000 : null };
    });
  };
  D.odyReactions = function (j) {
    var o = (((j || {}).data || {}).others_reactions) || {}, out = {};
    Object.keys(o).forEach(function (k) { out[k] = { likes: o[k].like || 0, dislikes: o[k].dislike || 0 }; });
    return out;
  };
  D.odyComments = function (j) {
    var r = (j || {}).result || {};
    return { total: r.total_items != null ? +r.total_items : null, items: (r.items || []).map(function (c) { return { id: c.comment_id, text: c.comment || '', author: c.channel_name || 'Anonymous', creator: !!c.is_creator, ts: c.timestamp ? c.timestamp * 1000 : null, claimId: c.claim_id, reply: !!c.parent_id, tip: c.support_amount || 0 }; }) };
  };
  /** api.odysee.com/subscription/sub_count and file/view_count -> array of numbers (needs an auth_token). */
  D.odyCounts = function (j) { return j && j.success && Array.isArray(j.data) ? j.data.map(Number) : null; };

  // ---------------------------------------------------------------- Hive (api.hive.blog: bridge + condenser)
  D.hiveProfile = function (j) {
    var r = (j || {}).result; if (!r || !r.name) return null;
    var st = r.stats || {};
    return { name: r.name, followers: st.followers != null ? +st.followers : null, following: st.following != null ? +st.following : null, posts: r.post_count != null ? +r.post_count : null, rep: r.reputation != null ? +r.reputation : null, title: (((r.metadata || {}).profile) || {}).name || r.name };
  };
  D.amount = function (s) { var m = /([\d.]+)/.exec(String(s || '')); return m ? +m[1] : 0; };
  D.hiveAccount = function (a, hivePerVest) {
    if (!a) return null;
    var vests = D.amount(a.vesting_shares) - D.amount(a.delegated_vesting_shares) + D.amount(a.received_vesting_shares);
    return { hive: D.amount(a.balance), hbd: D.amount(a.hbd_balance), savingsHbd: D.amount(a.savings_hbd_balance), hp: hivePerVest ? Math.round(D.amount(a.vesting_shares) * hivePerVest * 1000) / 1000 : null, effHp: hivePerVest ? Math.round(vests * hivePerVest) : null,
      unclaimed: { hive: D.amount(a.reward_hive_balance), hbd: D.amount(a.reward_hbd_balance), hp: D.amount(a.reward_vesting_hive) }, postCount: a.post_count != null ? +a.post_count : null };
  };
  D.hivePerVest = function (g) { g = (g || {}).result || g || {}; var v = D.amount(g.total_vesting_shares); return v ? D.amount(g.total_vesting_fund_hive) / v : null; };
  D.hivePosts = function (j) {
    return (((j || {}).result) || []).map(function (p) {
      var m = p.json_metadata || {};
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
      var pending = D.amount(p.pending_payout_value), paid = D.amount(p.author_payout_value) + D.amount(p.curator_payout_value);
      return { id: p.author + '/' + p.permlink, title: p.title, url: 'https://peakd.com/@' + p.author + '/' + p.permlink, published: D.utc(p.created), votes: (p.stats || {}).total_votes != null ? +p.stats.total_votes : (p.active_votes || []).length,
        comments: p.children || 0, payout: D.amount(p.payout) || pending || paid, pending: !p.is_paidout, reblogs: p.reblogs || 0, app: String(m.app || ''), video: /^3speak/i.test(String(m.app || '')) || String(m.type || '').indexOf('3speak') === 0,
        thumb: ((m.image || [])[0]) || null, views: null, likes: (p.stats || {}).total_votes != null ? +p.stats.total_votes : null };
    });
  };
  D.hiveReplies = function (j) {
    return (((j || {}).result) || []).map(function (p) {
      return { id: p.author + '/' + p.permlink, author: p.author, text: D.plain(p.body), ts: D.utc(p.created), url: 'https://peakd.com' + (p.url || ('/@' + p.author + '/' + p.permlink)), parent: p.parent_author + '/' + p.parent_permlink, votes: (p.stats || {}).total_votes || 0, payout: D.amount(p.payout) };
    });
  };
  D.hiveNotifs = function (j) {
    return (((j || {}).result) || []).map(function (n) {
      return { id: n.id, kind: n.type, text: n.msg || '', ts: D.utc(n.date), url: n.url ? 'https://peakd.com/' + String(n.url).replace(/^\//, '') : null, author: ((/^@([a-z0-9.-]+)/.exec(n.msg || '') || [])[1]) || '', score: n.score };
    });
  };

  // ---------------------------------------------------------------- page side: totals, inbox, snapshots
  /** Totals per platform and for everything: sums of followers / views / videos over the accounts that answered. */
  D.totals = function (sources) {
    var per = {}, all = { followers: 0, views: 0, videos: 0, accounts: 0, failed: 0 };
    (sources || []).forEach(function (s) {
      var p = per[s.p] || (per[s.p] = { followers: 0, views: 0, videos: 0, accounts: 0, failed: 0, has: {} });
      if (!s.ok) { p.failed++; all.failed++; return; }
      p.accounts++; all.accounts++;
      ['followers', 'views', 'videos'].forEach(function (k) { var v = (s.stats || {})[k]; if (typeof v === 'number' && isFinite(v)) { p[k] += v; all[k] += v; p.has[k] = 1; } });
    });
    return { per: per, all: all };
  };
  /** Snapshot of the numbers that trends are drawn from: {"yt:mes": {f, v, n}}. */
  D.snapshot = function (sources) {
    var o = {};
    (sources || []).forEach(function (s) { if (!s.ok || !s.stats) return; var x = {}; if (s.stats.followers != null) x.f = s.stats.followers; if (s.stats.views != null) x.v = s.stats.views; if (s.stats.videos != null) x.n = s.stats.videos; if (Object.keys(x).length) o[s.p + ':' + s.a] = x; });
    return o;
  };
  /** Change between two snapshots (null where either side is missing). */
  D.diff = function (prev, cur) {
    var out = {};
    Object.keys(cur || {}).forEach(function (k) { var a = (prev || {})[k], b = cur[k], d = {}; ['f', 'v', 'n'].forEach(function (f) { d[f] = a && a[f] != null && b[f] != null ? b[f] - a[f] : null; }); out[k] = d; });
    return out;
  };
  /** One newest-first inbox over every source; ids are "<platform>:<account>:<item id>". */
  D.inbox = function (sources, max) {
    var all = [];
    (sources || []).forEach(function (s) { (s.inbox || []).forEach(function (it) { var x = {}; for (var k in it) x[k] = it[k]; x.p = s.p; x.a = s.a; x.key = s.p + ':' + s.a + ':' + it.id; all.push(x); }); });
    all.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return all.slice(0, max || 400);
  };
  /** History rows [{d, a: snapshot}] -> per series key a list of [dayIndex, value] for one field. */
  D.series = function (rows, key, field) {
    var out = [];
    (rows || []).forEach(function (r) { var x = (r.a || {})[key]; if (x && x[field] != null) out.push({ d: r.d, y: x[field] }); });
    return out;
  };
  D.sumSeries = function (rows, field, filter) {
    return (rows || []).map(function (r) { var s = 0, n = 0; Object.keys(r.a || {}).forEach(function (k) { if (filter && !filter(k)) return; var x = r.a[k]; if (x && x[field] != null) { s += x[field]; n++; } }); return n ? { d: r.d, y: s } : null; }).filter(Boolean);
  };
  D.fmt = function (n) {
    if (n == null || !isFinite(n)) return '–';
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.0+$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  D.ago = function (ts, now) {
    if (!ts) return '';
    var s = Math.round(((now || Date.now()) - ts) / 1000);
    if (s < -60) { var f = -s; return 'in ' + (f < 3600 ? Math.round(f / 60) + ' min' : f < 86400 ? Math.round(f / 3600) + ' h' : Math.round(f / 86400) + ' d'); }
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 45) return Math.round(s / 86400) + ' d ago';
    return new Date(ts).toISOString().slice(0, 10);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.MESDash = D;
})(typeof window !== 'undefined' ? window : this);

/* MES Dashboard page (mes.fm/dashboard): renders /api/dashboard. Pure parsing / totals live in lib.js (MESDash).
 * On 127.0.0.1 / localhost (no /api there) or with ?mock=1 the page shows the made-up /dashboard/data/sample.json.
 * Browser state (localStorage mes-dash:v1): the last two snapshots of the numbers ("since your last visit"), what was read in the inbox,
 * the inbox and history filters. Nothing is sent anywhere. */
(function () {
  'use strict';
  var D = window.MESDash;
  var $ = function (id) { return document.getElementById(id); };
  var root = $('db');
  if (!root || !D) return;
  var MOCK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
  var LS = 'mes-dash:v1';
  var NAMES = { mes: '@mes', mestruth: '@mestruth' };
  var st = load();
  var DATA = null, busy = false, shown = 60;

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {}
    s = s || {};
    s.read = s.read || {};
    s.f = s.f || { p: '', a: '', k: 'novote', unread: false, own: true, q: '' };
    s.h = s.h || { m: 'f', s: 'plat', r: 90, chg: false };
    if (!s.readT) s.readT = Date.now() - 7 * 864e5;   // first visit: anything older than a week counts as read
    return s;
  }
  function save() {
    var keys = Object.keys(st.read);   // keep the read list small: drop entries older than the "read up to" time
    if (keys.length > 3000) keys.slice(0, keys.length - 2000).forEach(function (k) { delete st.read[k]; });
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {}
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https:\/\//.test(String(u || '')) ? String(u) : ''; }
  function pname(p) { return D.platform(p).name; }
  function pcol(p) { return D.platform(p).color; }
  function signed(n) { if (n == null || !n) return ''; return '<em class="' + (n > 0 ? 'db-up' : 'db-dn') + '">' + (n > 0 ? '+' : '−') + D.fmt(Math.abs(n)) + '</em>'; }

  // ---------------------------------------------------------------- data
  function fetchData(force) {
    if (busy) return;
    busy = true;
    var btn = $('db-refresh'); btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    $('db-refresh').querySelector('.db-rlab').textContent = force ? 'Collecting…' : 'Loading…';
    if (force) $('db-meta').textContent = 'Collecting every source again (about 10 seconds)…';
    var url = MOCK ? '/dashboard/data/sample.json' : '/api/dashboard' + (force ? '?refresh=1' : '');
    fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      DATA = d; snapshotVisit(); render();
    }).catch(function (e) {
      $('db-meta').innerHTML = '<b class="db-bad">Could not load the dashboard data</b> (' + esc(e.message) + ').' + (MOCK ? '' : ' <a href="?mock=1">See the page with made-up sample data</a>');
    }).then(function () {
      busy = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
      btn.querySelector('.db-rlab').textContent = '↻ Refresh';
    });
  }

  // "since your last visit": the stored snapshot becomes the comparison point once it is 30 minutes old
  var DIFF = {}, PREV_T = null;
  function snapshotVisit() {
    var cur = D.snapshot(DATA.sources.filter(function (s) { return !s.stale; }));
    var now = Date.now();
    if (!st.snap) st.snap = { prev: null, prevT: null, cur: cur, t: now };
    else if (now - st.snap.t > 30 * 6e4) { st.snap.prev = st.snap.cur; st.snap.prevT = st.snap.t; st.snap.cur = cur; st.snap.t = now; }
    else { st.snap.cur = cur; }
    DIFF = st.snap.prev ? D.diff(st.snap.prev, cur) : {};
    PREV_T = st.snap.prevT;
    save();
  }

  // ---------------------------------------------------------------- render
  function render() {
    var d = DATA, now = Date.now();
    var ok = d.sources.filter(function (s) { return s.ok && !s.stale; }).length, bad = d.sources.filter(function (s) { return !s.ok; }), stale = d.sources.filter(function (s) { return s.stale; });
    var gen = Date.parse(d.generated);
    $('db-meta').innerHTML = (d.sample ? '<span class="db-sample">Sample data</span> (made up, for the local preview). ' : '') +
      'Collected <b>' + esc(D.ago(gen, now)) + '</b> (' + esc(new Date(gen).toLocaleString()) + '). ' + ok + ' of ' + d.sources.length + ' sources answered' +
      (stale.length ? ', ' + stale.length + ' showing their last good numbers' : '') + (bad.length ? ', <b class="db-bad">' + bad.length + ' failed</b>' : '') + '. The server collects again when the data is over 15 minutes old.';
    renderSetup(); renderChanges(); renderTiles(); renderInbox(); renderHistory(); renderCards();
  }

  function renderSetup() {
    var d = DATA, needs = {};
    d.sources.forEach(function (s) { (s.needs || []).forEach(function (n) { needs[n] = 1; }); });
    var h = '';
    if (needs.YOUTUBE_API_KEY || needs.ODYSEE_AUTH_TOKEN || (d.keys && !d.keys.storage)) {
      h += '<details class="tu-card db-setup"><summary><b>Optional keys</b>: ' + Object.keys(needs).concat(d.keys && !d.keys.storage ? ['Upstash storage'] : []).map(function (k) { return '<code>' + esc(k) + '</code>'; }).join(', ') + ' not set (everything else works without them)</summary><ul>';
      if (needs.YOUTUBE_API_KEY) h += '<li><b>YouTube</b> (exact subscriber counts, likes and comment counts on every upload, and the newest comments of the whole channel instead of the 3 newest videos): Google Cloud Console → enable <i>YouTube Data API v3</i> → Credentials → Create API key, restrict it to that API → Vercel → mes.fm project → Settings → Environment Variables → <code>YOUTUBE_API_KEY</code> (plain project variable, Production) → redeploy. The same key also switches on the live refresh of /how-much-do-youtubers-make. Uses about 3 of the 10,000 free quota units per collection.</li>';
      if (needs.ODYSEE_AUTH_TOKEN) h += '<li><b>Odysee</b> (followers and views): api.odysee.com only gives them to a signed-in session. Sign in at odysee.com, open the browser console and run <code>document.cookie.match(/auth_token=([^;]+)/)[1]</code>, and save the value as <code>ODYSEE_AUTH_TOKEN</code> in Vercel the same way. It only reads counts; signing out of Odysee ends it.</li>';
      if (d.keys && !d.keys.storage) h += '<li><b>Storage</b>: <code>UPSTASH_REDIS_REST_URL</code> / <code>_TOKEN</code> are missing, so nothing is cached and no history builds up.</li>';
      h += '</ul></details>';
    }
    $('db-setup').innerHTML = h;
  }

  function renderChanges() {
    var box = $('db-changes'), rows = [];
    DATA.sources.forEach(function (s) {
      var x = DIFF[s.p + ':' + s.a]; if (!x) return;
      var bits = [];
      if (x.f) bits.push(signed(x.f) + ' followers');
      if (x.v) bits.push(signed(x.v) + ' views');
      if (x.n) bits.push(signed(x.n) + ' uploads');
      if (bits.length) rows.push('<b>' + esc(pname(s.p)) + ' ' + esc(s.label) + '</b>: ' + bits.join(', '));
    });
    var unread = inboxItems().filter(isNew).length;
    if (!rows.length && !unread) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = (PREV_T ? '<b>Since your last visit</b> (' + esc(D.ago(PREV_T)) + '): ' : '<b>Changes</b>: ') + (rows.length ? rows.join(' · ') : 'no change in the numbers') + (unread ? ' · <a href="#db-inboxsec">' + unread + ' new in the inbox</a>' : '');
  }

  function renderTiles() {
    var T = D.totals(DATA.sources), all = T.all, sum = { f: 0, v: 0, n: 0 }, has = {};
    Object.keys(DIFF).forEach(function (k) { ['f', 'v', 'n'].forEach(function (f) { if (DIFF[k][f] != null) { sum[f] += DIFF[k][f]; has[f] = 1; } }); });
    var inb = inboxItems(), unread = inb.filter(isNew).length;
    function tile(label, val, d, sub) { return '<div class="tu-stat"><span class="tu-stat__label">' + label + '</span><span class="tu-stat__value">' + val + '</span><small>' + (d ? signed(d) + ' since last visit' : (sub || '&nbsp;')) + '</small></div>'; }
    $('db-tiles').innerHTML = tile('Followers, all platforms', D.fmt(all.followers), has.f && sum.f, 'where the platform shows them') +
      tile('Views, all platforms', D.fmt(all.views), has.v && sum.v, 'channel totals (YouTube, BitChute)') +
      tile('Uploads', D.fmt(all.videos), has.n && sum.n, 'videos and streams') +
      tile('New in the inbox', String(unread), 0, inb.length + ' items in all');
    var h = '';
    D.PLATFORMS.forEach(function (p) {
      var ss = DATA.sources.filter(function (s) { return s.p === p.id; });
      if (!ss.length) return;
      var x = T.per[p.id] || {}, fails = ss.filter(function (s) { return !s.ok; }).length;
      var big = x.has && x.has.followers ? D.fmt(x.followers) + ' <small>followers</small>' : x.has && x.has.videos ? D.fmt(x.videos) + ' <small>uploads</small>' : '–';
      var hiveExtra = p.id === 'hive' || p.id === '3speak' ? ss.reduce(function (a, s) { var e = s.extra || {}; return a + (e.pendingPayout || e.payout || 0); }, 0) : 0;
      h += '<button type="button" class="db-pt" style="--pc:' + p.color + '" data-goto="' + p.id + '"><b>' + esc(p.name) + '</b><span class="db-big">' + big + '</span><small>' +
        (fails ? '<span class="db-bad">' + fails + ' failed</span> · ' : '') + ss.length + ' account' + (ss.length > 1 ? 's' : '') +
        (x.has && x.has.views ? ' · ' + D.fmt(x.views) + ' views' : '') + (hiveExtra ? ' · $' + hiveExtra.toFixed(2) + ' pending' : '') + '</small></button>';
    });
    $('db-ptiles').innerHTML = h;
  }

  // ---------------------------------------------------------------- inbox
  function kindGroup(k) { return k === 'comment' || k === 'tip' ? 'comment' : k === 'vote' ? 'vote' : 'note'; }
  function inboxItems() { return DATA ? D.inbox(DATA.sources, 600) : []; }
  function isNew(it) { return !st.read[it.key] && (it.ts || 0) > st.readT && !it.own; }
  function filtered() {
    var f = st.f, q = (f.q || '').toLowerCase().trim();
    return inboxItems().filter(function (it) {
      if (f.p && it.p !== f.p) return false;
      if (f.a && it.a !== f.a) return false;
      if (f.k === 'novote' ? kindGroup(it.kind) === 'vote' : (f.k && kindGroup(it.kind) !== f.k)) return false;
      if (f.own && it.own) return false;
      if (f.unread && !isNew(it)) return false;
      if (q && (it.author + ' ' + it.text + ' ' + (it.on || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderInbox() {
    var all = inboxItems();
    var plats = {}; all.forEach(function (it) { plats[it.p] = (plats[it.p] || 0) + 1; });
    var ph = '<button type="button" class="tu-chip" data-p="" aria-pressed="' + (!st.f.p) + '">All platforms</button>';
    D.PLATFORMS.forEach(function (p) { if (plats[p.id]) ph += '<button type="button" class="tu-chip" data-p="' + p.id + '" aria-pressed="' + (st.f.p === p.id) + '"><span class="db-dot" style="--pc:' + p.color + '"></span>' + esc(p.name) + ' <small>' + plats[p.id] + '</small></button>'; });
    $('db-fplat').innerHTML = ph;
    [['db-facct', 'a'], ['db-fkind', 'k']].forEach(function (g) { Array.prototype.forEach.call($(g[0]).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-' + g[1]) || '') === (st.f[g[1]] || ''))); }); });
    $('db-unread').checked = !!st.f.unread; $('db-own').checked = !!st.f.own;
    if ($('db-q').value !== (st.f.q || '')) $('db-q').value = st.f.q || '';
    var list = filtered(), now = Date.now(), unread = all.filter(isNew).length;
    $('db-icount').textContent = unread ? '(' + unread + ' new)' : '';
    if (!list.length) { $('db-inbox').innerHTML = '<li class="db-empty">' + (all.length ? 'Nothing matches these filters.' : 'No comments or notifications from the sources that answered.') + '</li>'; $('db-morewrap').hidden = true; return; }
    $('db-inbox').innerHTML = list.slice(0, shown).map(function (it) {
      var u = safeUrl(it.url), ini = (it.author || '?').replace(/^@/, '').slice(0, 2).toUpperCase();
      return '<li class="db-it' + (isNew(it) ? ' is-new' : '') + (it.own ? ' is-own' : '') + '" data-key="' + esc(it.key) + '" style="--pc:' + pcol(it.p) + '">' +
        '<span class="db-ic" title="' + esc(pname(it.p)) + '" aria-hidden="true">' + esc(ini) + '</span>' +
        '<div><div class="db-ih"><b>' + esc(it.author || 'someone') + '</b><span class="db-kind">' + esc(it.kind) + '</span>' + (it.tip ? '<span class="db-tipamt">' + esc(it.tip) + ' LBC tip</span>' : '') +
        '<span><span class="db-dot" style="--pc:' + pcol(it.p) + '"></span>' + esc(pname(it.p)) + ' ' + esc(NAMES[it.a] || it.a) + '</span><time title="' + esc(it.ts ? new Date(it.ts).toLocaleString() : '') + '">' + (it.approx ? '≈ ' : '') + esc(D.ago(it.ts, now)) + '</time></div>' +
        '<div class="db-ib">' + esc(it.text) + '</div></div>' +
        '<div class="db-io">' + (it.on ? '<span>on “' + esc(D.clip(it.on, 80)) + '”</span>' : '') + (it.likes ? '<span>♥ ' + it.likes + '</span>' : '') + (it.replies ? '<span>' + it.replies + ' replies</span>' : '') + (it.votes ? '<span>' + it.votes + ' votes</span>' : '') +
        (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" data-open="1">Open ↗</a>' : '') + (isNew(it) ? '<a href="#" data-read="1">Mark read</a>' : '') + '</div></li>';
    }).join('');
    $('db-morewrap').hidden = list.length <= shown;
    $('db-more').textContent = 'Show more (' + (list.length - shown) + ' left)';
  }
  function markRead(key) { st.read[key] = 1; save(); renderInbox(); renderChanges(); renderTiles(); }

  // ---------------------------------------------------------------- history chart
  var PAL = ['#e62117', '#5aa323', '#e50054', '#ef4136', '#3b5bdb', '#e31337', '#7c3aed', '#0e7490', '#b45309', '#64748b', '#db2777'];
  var CH = null;
  function lines() {
    var rows = (DATA.history || []).slice(-st.h.r), m = st.h.m, out = [];
    if (st.h.s === 'all') out.push({ name: 'All platforms', color: '#4f46e5', pts: D.sumSeries(rows, m) });
    else if (st.h.s === 'plat') D.PLATFORMS.forEach(function (p) { var pts = D.sumSeries(rows, m, function (k) { return k.indexOf(p.id + ':') === 0; }); if (pts.length) out.push({ name: p.name, color: p.color, pts: pts }); });
    else {
      var keys = {}; rows.forEach(function (r) { Object.keys(r.a || {}).forEach(function (k) { keys[k] = 1; }); });
      Object.keys(keys).sort().forEach(function (k, i) { var pts = D.series(rows, k, m); if (pts.length) { var p = k.split(':'); out.push({ name: pname(p[0]) + ' ' + (NAMES[p[1]] || p[1]), color: p[1] === 'mestruth' ? shade(pcol(p[0])) : pcol(p[0]), dash: p[1] === 'mestruth', pts: pts }); } });
    }
    if (st.h.chg) out.forEach(function (l) { var b = l.pts[0].y; l.pts = l.pts.map(function (q) { return { d: q.d, y: q.y - b }; }); });
    return { rows: rows, lines: out };
  }
  function shade(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, f = function (c) { return Math.round(c * 0.6); }; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  function renderHistory() {
    ['db-hmet', 'db-hsplit', 'db-hrange'].forEach(function (id, i) { var a = ['m', 's', 'r'][i]; Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-' + a) === String(st.h[a]))); }); });
    $('db-hchg').checked = !!st.h.chg;
    var L = lines(), svg = $('db-svg'), box = $('db-chart');
    var W = Math.max(280, box.clientWidth), H = Math.max(180, box.clientHeight);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var days = L.rows.map(function (r) { return r.d; });
    if (!days.length || !L.lines.length) {
      svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle">No history yet: one point is stored per day from today on.</text>';
      $('db-legend').innerHTML = ''; CH = null; return;
    }
    var ys = []; L.lines.forEach(function (l) { l.pts.forEach(function (q) { ys.push(q.y); }); });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (!st.h.chg && lo > 0 && st.h.s !== 'acct') lo = Math.max(0, lo - (hi - lo) * 0.15);
    if (hi === lo) { hi += 1; lo -= 1; }
    var padL = 54, padR = 12, padT = 10, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
    var X = function (i) { return padL + (days.length < 2 ? iw / 2 : i * iw / (days.length - 1)); }, Y = function (v) { return padT + ih - (v - lo) / (hi - lo) * ih; };
    var g = '';
    for (var t = 0; t <= 4; t++) { var v = lo + (hi - lo) * t / 4; g += '<line class="db-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (padL - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + D.fmt(v) + '</text>'; }
    var step = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 70))));
    for (var i = 0; i < days.length; i += step) g += '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + days[i].slice(5) + '</text>';
    var idx = {}; days.forEach(function (d, i) { idx[d] = i; });
    L.lines.forEach(function (l) {
      var path = l.pts.map(function (q, j) { return (j ? 'L' : 'M') + X(idx[q.d]).toFixed(1) + ',' + Y(q.y).toFixed(1); }).join('');
      g += '<path d="' + path + '" fill="none" stroke="' + l.color + '" stroke-width="2" stroke-linejoin="round"' + (l.dash ? ' stroke-dasharray="6 3"' : '') + '/>';
      if (l.pts.length === 1) g += '<circle cx="' + X(idx[l.pts[0].d]) + '" cy="' + Y(l.pts[0].y) + '" r="3.5" fill="' + l.color + '"/>';
    });
    g += '<line id="db-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="currentColor" stroke-opacity="0.35" style="display:none"/>';
    svg.innerHTML = g;
    $('db-legend').innerHTML = L.lines.map(function (l) { var last = l.pts[l.pts.length - 1]; return '<span><span class="db-key" style="background:' + l.color + '"></span>' + esc(l.name) + ' <b>' + (st.h.chg ? (last.y >= 0 ? '+' : '') : '') + D.fmt(last.y) + '</b></span>'; }).join('');
    CH = { days: days, X: X, lines: L.lines, padL: padL, iw: iw, W: W };
    $('db-hnote').textContent = 'One point per day (' + days.length + ' so far): the numbers of the last collection that day. Platforms that hide a number (Rumble views, Odysee without its token, Hive views) have no line for it.';
  }
  function chartHover(e) {
    if (!CH) return;
    var r = $('db-svg').getBoundingClientRect(), x = (e.clientX - r.left) * CH.W / r.width;
    var i = Math.round((x - CH.padL) / (CH.days.length < 2 ? 1 : CH.iw / (CH.days.length - 1)));
    i = Math.max(0, Math.min(CH.days.length - 1, i));
    var d = CH.days[i], tip = $('db-tip'), cross = $('db-cross');
    var rows = CH.lines.map(function (l) { var q = l.pts.filter(function (p) { return p.d === d; })[0]; return q ? '<span style="color:' + l.color + '">■</span> ' + esc(l.name) + ': <b>' + D.fmt(q.y) + '</b>' : ''; }).filter(Boolean);
    if (!rows.length) { tip.style.display = 'none'; return; }
    tip.innerHTML = '<b>' + d + '</b><br>' + rows.join('<br>');
    tip.style.display = 'block';
    var px = CH.X(i) * r.width / CH.W;
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, px + 12 > r.width - tip.offsetWidth ? px - tip.offsetWidth - 12 : px + 12)) + 'px';
    cross.setAttribute('x1', CH.X(i)); cross.setAttribute('x2', CH.X(i)); cross.style.display = '';
  }

  // ---------------------------------------------------------------- platform cards
  function renderCards() {
    var now = Date.now();
    $('db-cards').innerHTML = DATA.sources.map(function (s) {
      var k = s.p + ':' + s.a, x = DIFF[k] || {}, stt = s.stats || {}, e = s.extra || {};
      var cells = [];
      if (stt.followers != null) cells.push(['Followers', D.fmt(stt.followers), x.f]);
      if (stt.views != null) cells.push(['Views', D.fmt(stt.views), x.v]);
      if (stt.videos != null) cells.push(['Uploads', D.fmt(stt.videos), x.n]);
      if (stt.posts != null) cells.push(['Posts + comments', D.fmt(stt.posts)]);
      if (e.recentViews != null) cells.push(['Views, newest ' + (s.uploads || []).length, D.fmt(e.recentViews)]);
      if (e.pendingPayout != null) cells.push(['Pending payout', '$' + e.pendingPayout.toFixed(2)]);
      if (e.payout != null) cells.push(['Payout, recent videos', '$' + e.payout.toFixed(2)]);
      if (e.recentVideos != null) cells.push(['Videos in the last 20 posts', String(e.recentVideos)]);
      if (e.unread != null) cells.push(['Unread on Hive', String(e.unread)]);
      if (e.wallet) { var w = e.wallet; if (w.hp != null) cells.push(['Hive Power', D.fmt(w.hp)]); cells.push(['Wallet', D.fmt(w.hive) + ' HIVE · ' + D.fmt(w.hbd) + ' HBD']); if (w.unclaimed && (w.unclaimed.hive || w.unclaimed.hbd || w.unclaimed.hp)) cells.push(['To claim', [w.unclaimed.hive ? w.unclaimed.hive + ' HIVE' : '', w.unclaimed.hbd ? w.unclaimed.hbd + ' HBD' : '', w.unclaimed.hp ? w.unclaimed.hp + ' HP' : ''].filter(Boolean).join(' · ')]); }
      var badge = !s.ok ? '<span class="db-badge db-badge--bad">failed</span>' : s.stale ? '<span class="db-badge db-badge--warn" title="This source failed now (' + esc(s.error || '') + '); these are its numbers from ' + esc(D.ago(Date.parse(s.staleFrom))) + '">last good: ' + esc(D.ago(Date.parse(s.staleFrom))) + '</span>' : (s.needs && s.needs.length ? '<span class="db-badge db-badge--warn">partial: needs ' + esc(s.needs.join(', ')) + '</span>' : '<span class="db-badge">' + (s.ms != null ? (s.ms / 1000).toFixed(1) + ' s' : 'ok') + '</span>');
      var ups = (s.uploads || []).slice(0, 6).map(function (v) {
        var u = safeUrl(v.url), th = safeUrl(v.thumb);
        var bits = [];
        if (v.views != null) bits.push(D.fmt(v.views) + ' views');
        if (v.likes != null) bits.push('♥ ' + D.fmt(v.likes));
        if (v.votes != null && s.p !== 'yt') bits.push(D.fmt(v.votes) + ' votes');
        if (v.comments != null) bits.push(D.fmt(v.comments) + ' comments');
        if (v.payout) bits.push('$' + (+v.payout).toFixed(2));
        if (v.published) bits.push((v.published > now ? 'in ' : '') + (v.approx ? '≈ ' : '') + D.ago(v.published, now));
        return '<li>' + (th ? '<img src="' + esc(th) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '<span class="db-up-l">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(v.title || v.id) + '</a>' : '<span class="db-ut">' + esc(v.title || v.id) + '</span>') + '<small>' + esc(bits.join(' · ')) + '</small></span></li>';
      }).join('');
      return '<article class="db-card' + (s.ok ? '' : ' is-failed') + '" id="db-c-' + esc(s.p) + '-' + esc(s.a) + '" data-p="' + esc(s.p) + '" style="--pc:' + pcol(s.p) + '">' +
        '<div class="db-ch"><h3><span class="db-dot"></span>' + esc(pname(s.p)) + ' · ' + esc(s.label) + '</h3>' + badge +
        '<span class="db-cl">' + (safeUrl(s.url) ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">Channel ↗</a>' : '') + (safeUrl(s.studio) ? '<a href="' + esc(s.studio) + '" target="_blank" rel="noopener">' + (s.p === 'yt' ? 'Studio comments' : 'Notifications') + ' ↗</a>' : '') + '</span></div>' +
        (s.ok ? '' : '<p class="db-err">Could not read it: ' + esc(s.error || 'unknown error') + '</p>') +
        (cells.length ? '<div class="db-st">' + cells.map(function (c) { return '<div><small>' + esc(c[0]) + '</small><b>' + esc(c[1]) + '</b>' + (c[2] ? signed(c[2]) : '') + '</div>'; }).join('') + '</div>' : '') +
        (ups ? '<ul class="db-ups">' + ups + '</ul>' : '') +
        ((s.notes || []).length ? '<ul class="db-notes">' + s.notes.map(function (n) { return '<li>' + esc(n).replace(/\b([A-Z_]{8,})\b/g, '<code>$1</code>') + '</li>'; }).join('') + '</ul>' : '') +
        '</article>';
    }).join('');
  }

  // ---------------------------------------------------------------- events
  $('db-refresh').addEventListener('click', function () { fetchData(true); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) fetchData(true); });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button, a');
    if (!b || !root.contains(b)) return;
    var g = b.parentNode && b.parentNode.id;
    if (g === 'db-fplat') { st.f.p = b.getAttribute('data-p') || ''; shown = 60; save(); renderInbox(); return; }
    if (g === 'db-facct') { st.f.a = b.getAttribute('data-a') || ''; shown = 60; save(); renderInbox(); return; }
    if (g === 'db-fkind') { st.f.k = b.getAttribute('data-k') || ''; shown = 60; save(); renderInbox(); return; }
    if (g === 'db-hmet') { st.h.m = b.getAttribute('data-m'); save(); renderHistory(); return; }
    if (g === 'db-hsplit') { st.h.s = b.getAttribute('data-s'); save(); renderHistory(); return; }
    if (g === 'db-hrange') { st.h.r = +b.getAttribute('data-r'); save(); renderHistory(); return; }
    if (b.id === 'db-markall') { st.readT = Date.now(); st.read = {}; save(); renderInbox(); renderChanges(); renderTiles(); return; }
    if (b.id === 'db-more') { shown += 60; renderInbox(); return; }
    if (b.hasAttribute('data-goto')) { var c = root.querySelector('.db-card[data-p="' + b.getAttribute('data-goto') + '"]'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var li = b.closest('.db-it');
    if (li && b.hasAttribute('data-read')) { e.preventDefault(); markRead(li.getAttribute('data-key')); return; }
    if (li && b.hasAttribute('data-open')) { st.read[li.getAttribute('data-key')] = 1; save(); setTimeout(function () { renderInbox(); renderChanges(); renderTiles(); }, 50); }
  });
  $('db-inbox').addEventListener('click', function (e) { if (e.target.closest('a')) return; var li = e.target.closest('.db-it'); if (li) li.classList.toggle('is-open'); });
  $('db-unread').addEventListener('change', function () { st.f.unread = this.checked; save(); renderInbox(); });
  $('db-own').addEventListener('change', function () { st.f.own = this.checked; save(); renderInbox(); });
  $('db-q').addEventListener('input', function () { st.f.q = this.value; shown = 60; save(); renderInbox(); });
  $('db-hchg').addEventListener('change', function () { st.h.chg = this.checked; save(); renderHistory(); });
  var chart = $('db-chart');
  chart.addEventListener('pointermove', chartHover);
  chart.addEventListener('pointerdown', chartHover);
  chart.addEventListener('pointerleave', function () { $('db-tip').style.display = 'none'; var c = $('db-cross'); if (c) c.style.display = 'none'; });
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (DATA) renderHistory(); }, 120); });
  (function panels() {
    if (!window.MESPanel) { setTimeout(panels, 60); return; }
    window.MESPanel.add($('db-histsec'), { bar: $('db-hbtns'), onChange: function () { if (DATA) renderHistory(); } });
    window.MESPanel.add($('db-inboxsec'), { bar: $('db-ibtns') });
  })();
  fetchData(false);
})();
