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
  try { localStorage.setItem('mes-owner', '1'); } catch (e) {} // behind the password: the homepage then shows its owner-only Dashboard tile
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
