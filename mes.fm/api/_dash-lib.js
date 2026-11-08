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
  /** Author name in a comparable form: "@MES:9" / "@mes" / "mes" -> "mes". */
  D.normName = function (n) { return String(n || '').trim().toLowerCase().replace(/^@/, '').replace(/[:#].*$/, ''); };
  /** Items written by any of our own accounts (a mention / reblog / reply by @mes on @mestruth...) are marked own. */
  D.inbox = function (sources, max) {
    var all = [], mine = {};
    (sources || []).forEach(function (s) { if (s.a) mine[D.normName(s.a)] = 1; });
    (sources || []).forEach(function (s) { (s.inbox || []).forEach(function (it) { var x = {}; for (var k in it) x[k] = it[k]; x.p = s.p; x.a = s.a; x.key = s.p + ':' + s.a + ':' + it.id; if (!x.own && mine[D.normName(x.author)]) x.own = true; all.push(x); }); });
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
