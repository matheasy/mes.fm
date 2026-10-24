// Data for the private mes.fm/search-console page (behind the middleware.js password, like /ads and /api/earnings).
//
// Google: reads what google-ads/search-console-gsc-script.js pushed through api/search-console-ingest.js
//   (gscdash:day:<date> totals + devices per day, gscdash:sum:<range>:<cur|prev> top lists worked out by Search Console).
// Bing: calls the Bing Webmaster API server-side with the key in Vercel env BING_WEBMASTER_KEY (plain project-level
//   variable; never sent to the browser or echoed in errors). GetRankAndTrafficStats = clicks / impressions per day,
//   GetQueryStats / GetPageStats = weekly buckets (one row per query or page per week) with AvgImpressionPosition,
//   GetPageQueryStats = the queries of one page (drill-down). Bing has no country or device split.
//   Answers are cached in Redis for 6 h (gscdash:bing:*) and in memory, so a page load costs Bing nothing most of the time.
// ?range=7|28|90|365 (default 28). Each source's range ends on its own newest day, the previous period is the same length before it.
// ?page=<full page URL>&src=google|bing -> the queries of that page (cur + prev).
const RANGES = ['7', '28', '90', '365'];
const BING_BASE = 'https://ssl.bing.com/webmaster/api.svc/json/';
const BING_TTL = 6 * 3600;
const MEM = new Map(); // method+arg -> { at, data }

async function redis(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}
const jparse = (x) => { try { return x && x.result ? JSON.parse(x.result) : null; } catch { return null; } };

function addDays(s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function datesBetween(a, b) { const out = []; for (let d = a; d <= b && out.length < 800; d = addDays(d, 1)) out.push(d); return out; }

// "https://mes.fm/bmicalculator/?x" -> "/bmicalculator"; other hosts keep their host.
function normPage(url) {
  let s = String(url || '').trim().replace(/^https?:\/\//i, '');
  const q = s.search(/[?#]/);
  if (q !== -1) s = s.slice(0, q);
  const slash = s.indexOf('/');
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase().replace(/^www\./, '');
  let path = slash === -1 ? '/' : s.slice(slash);
  path = path.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return host === 'mes.fm' || host === '' ? path || '/' : host + path;
}

// Sum clicks / impressions and an impressions-weighted position.
function acc(m, k, c, i, p, extra) {
  let o = m.get(k);
  if (!o) { o = Object.assign({ k, c: 0, i: 0, pw: 0 }, extra || {}); m.set(k, o); }
  o.c += c; o.i += i; o.pw += p * i;
  return o;
}
function fin(o) {
  const out = Object.assign({}, o, { p: o.i ? Math.round(o.pw / o.i * 100) / 100 : 0 });
  delete out.pw;
  return out;
}

// Join current and previous rows by key: { k, c, i, p, pc, pi, pp }.
function joinPrev(cur, prev) {
  const pm = new Map(prev.map((r) => [r.k, r]));
  return cur.map((r) => {
    const x = pm.get(r.k);
    return Object.assign({}, r, x ? { pc: x.c, pi: x.i, pp: x.p } : { pc: 0, pi: 0, pp: null });
  });
}

// Pure: Search Console summary rows [key, c, i, pos] -> objects (pages merged by normalised path).
function gscRows(rows, kind) {
  const m = new Map();
  for (const r of rows || []) {
    const [key, c, i, p] = r;
    if (kind === 'pages') acc(m, normPage(key), c, i, p, { u: key });
    else acc(m, kind === 'countries' || kind === 'devices' ? String(key).toLowerCase() : key, c, i, p);
  }
  return [...m.values()].map(fin).sort((a, b) => b.c - a.c || b.i - a.i);
}

function totalsOf(days) {
  let c = 0, i = 0, pw = 0;
  for (const d of days) { c += d.c; i += d.i; pw += d.p * d.i; }
  return { c, i, p: i ? Math.round(pw / i * 100) / 100 : 0, days: days.length };
}

// Pure: build the Google part from stored blobs.
function googlePart(meta, sumCur, sumPrev, dayBlobs, curDates, prevDates) {
  if (!meta && !sumCur && !Object.keys(dayBlobs).length) return { setup: false };
  const day = (d) => {
    const b = dayBlobs[d];
    return b ? { d, c: b.t[0], i: b.t[1], p: b.t[2], dev: b.dev || [] } : null;
  };
  const daily = curDates.map(day).filter(Boolean);
  const prevDaily = prevDates.map(day).filter(Boolean);
  const out = {
    setup: true, meta: meta || null,
    cur: sumCur ? { start: sumCur.start, end: sumCur.end } : curDates.length ? { start: curDates[0], end: curDates[curDates.length - 1] } : null,
    prev: sumPrev ? { start: sumPrev.start, end: sumPrev.end } : null,
    daily: daily.map((x) => ({ d: x.d, c: x.c, i: x.i, p: x.p })),
    prevDaily: prevDaily.map((x) => ({ d: x.d, c: x.c, i: x.i, p: x.p })),
    totals: totalsOf(daily), prevTotals: totalsOf(prevDaily),
  };
  for (const t of ['pages', 'queries', 'countries', 'devices']) {
    out[t] = joinPrev(gscRows(sumCur && sumCur[t], t), gscRows(sumPrev && sumPrev[t], t)).slice(0, t === 'queries' ? 1000 : 500);
  }
  return out;
}

// Pure: the queries of one page from a summary's [page, query, c, i, pos] rows.
function pageQueries(sum, url) {
  const want = normPage(url);
  const m = new Map();
  for (const [page, q, c, i, p] of (sum && sum.pq) || []) if (normPage(page) === want) acc(m, q, c, i, p);
  return [...m.values()].map(fin).sort((a, b) => b.c - a.c || b.i - a.i);
}

// ---- Bing
// "/Date(1399014000000-0700)/" -> "2014-05-02" (the date in the zone the value carries, else Pacific)
function bingDate(v) {
  const m = /Date\((-?\d+)([+-]\d{4})?\)/.exec(String(v || ''));
  if (!m) return null;
  const ms = Number(m[1]);
  if (m[2]) {
    const sign = m[2][0] === '-' ? -1 : 1;
    const off = sign * (Number(m[2].slice(1, 3)) * 60 + Number(m[2].slice(3, 5))) * 60000;
    return new Date(ms + off).toISOString().slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Pure: slim a Bing answer: traffic -> [[date, c, i]]; queries / pages / page queries -> [[date, key, c, i, pos]].
function slimBing(method, json) {
  const rows = (json && Array.isArray(json.d)) ? json.d : [];
  if (method === 'GetRankAndTrafficStats') {
    return rows.map((r) => [bingDate(r.Date), Number(r.Clicks) || 0, Number(r.Impressions) || 0]).filter((r) => r[0]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return rows.map((r) => [bingDate(r.Date), String(r.Query || '').slice(0, 400), Number(r.Clicks) || 0, Number(r.Impressions) || 0, Number(r.AvgImpressionPosition) || 0])
    .filter((r) => r[0] && r[1]);
}

// Never let the key into a message: strip it, and anything that looks like a URL with apikey=.
function scrub(s, key) {
  let t = String(s || '');
  if (key) t = t.split(key).join('***');
  return t.replace(/apikey=[^&\s"]*/gi, 'apikey=***').slice(0, 200);
}

async function bingCall(method, extra, key, siteUrl) {
  const memKey = method + '|' + (extra || '');
  const mem = MEM.get(memKey);
  if (mem && Date.now() - mem.at < BING_TTL * 1000) return mem.data;
  const rkey = 'gscdash:bing:' + method + (extra ? ':' + Buffer.from(extra).toString('base64url').slice(0, 200) : '');
  try {
    const out = await redis([['GET', rkey]]);
    const hit = jparse(out[0]);
    if (hit && Date.now() - Date.parse(hit.at) < BING_TTL * 1000) { MEM.set(memKey, { at: Date.parse(hit.at), data: hit.rows }); return hit.rows; }
  } catch (e) { /* no cache: go to Bing */ }
  let url = BING_BASE + method + '?siteUrl=' + encodeURIComponent(siteUrl);
  if (extra) url += '&page=' + encodeURIComponent(extra);
  let r;
  try { r = await fetch(url + '&apikey=' + encodeURIComponent(key), { headers: { Accept: 'application/json' } }); }
  catch (e) { throw new Error('Bing could not be reached'); }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!r.ok || !json || (json.ErrorCode !== undefined && json.ErrorCode !== 0)) {
    const msg = json && (json.Message || json.message) ? json.Message || json.message : 'HTTP ' + r.status;
    throw new Error('Bing said: ' + scrub(msg, key));
  }
  const rows = slimBing(method, json);
  MEM.set(memKey, { at: Date.now(), data: rows });
  const blob = JSON.stringify({ at: new Date().toISOString(), rows });
  if (blob.length < 900000) await redis([['SET', rkey, blob, 'EX', String(BING_TTL)]]).catch(() => {});
  return rows;
}

// Pure: weekly [date, key, c, i, pos] rows within [start, end] -> objects.
function bingAgg(rows, start, end, isPage) {
  const m = new Map();
  for (const [d, k, c, i, p] of rows || []) {
    if (d < start || d > end) continue;
    if (isPage) acc(m, normPage(k), c, i, p, { u: k });
    else acc(m, k, c, i, p);
  }
  return [...m.values()].map(fin).sort((a, b) => b.c - a.c || b.i - a.i);
}

// Pure: the Bing part from slim rows.
function bingPart(traffic, queries, pages, n) {
  if (!traffic.length && !queries.length) return { setup: true, empty: true, daily: [], prevDaily: [], totals: totalsOf([]), prevTotals: totalsOf([]), pages: [], queries: [] };
  const end = traffic.length ? traffic[traffic.length - 1][0] : queries.map((r) => r[0]).sort().pop();
  const start = addDays(end, -(n - 1));
  const pEnd = addDays(start, -1), pStart = addDays(start, -n);
  // weekly buckets: a bucket dated inside the range counts for it (Bing's buckets are a week each)
  const qCur = bingAgg(queries, start, end), qPrev = bingAgg(queries, pStart, pEnd);
  const pgCur = bingAgg(pages, start, end, true), pgPrev = bingAgg(pages, pStart, pEnd, true);
  const posOf = (rows) => { let i = 0, pw = 0; for (const r of rows) { i += r.i; pw += r.p * r.i; } return i ? Math.round(pw / i * 100) / 100 : 0; };
  const day = (r) => ({ d: r[0], c: r[1], i: r[2] });
  const daily = traffic.filter((r) => r[0] >= start && r[0] <= end).map(day);
  const prevDaily = traffic.filter((r) => r[0] >= pStart && r[0] <= pEnd).map(day);
  const tot = (ds, pos) => { const t = { c: 0, i: 0, days: ds.length }; ds.forEach((x) => { t.c += x.c; t.i += x.i; }); t.p = pos; return t; };
  return {
    setup: true, cur: { start, end }, prev: { start: pStart, end: pEnd },
    daily, prevDaily, totals: tot(daily, posOf(qCur)), prevTotals: tot(prevDaily, posOf(qPrev)),
    queries: joinPrev(qCur, qPrev).slice(0, 1000), pages: joinPrev(pgCur, pgPrev).slice(0, 500),
    weekly: true,
  };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const q = req.query || {};
  const range = RANGES.includes(String(q.range)) ? String(q.range) : '28';
  const n = Number(range);
  const key = process.env.BING_WEBMASTER_KEY || '';
  const siteUrl = process.env.BING_SITE_URL || 'https://mes.fm/';

  // drill-down: the queries of one page
  if (q.page) {
    const page = String(q.page).slice(0, 500);
    if (q.src === 'bing') {
      if (!key) return res.status(200).json({ rows: [], setup: false });
      try {
        const rows = await bingCall('GetPageQueryStats', page, key, siteUrl);
        const end = rows.map((r) => r[0]).sort().pop() || '';
        const start = end ? addDays(end, -(n - 1)) : '';
        const cur = bingAgg(rows, start, end), prev = bingAgg(rows, addDays(start, -n), addDays(start, -1));
        return res.status(200).json({ rows: joinPrev(cur, prev) });
      } catch (e) { return res.status(200).json({ rows: [], error: scrub(e.message, key) }); }
    }
    try {
      const out = await redis([['GET', `gscdash:sum:${range}:cur`], ['GET', `gscdash:sum:${range}:prev`]]);
      return res.status(200).json({ rows: joinPrev(pageQueries(jparse(out[0]), page), pageQueries(jparse(out[1]), page)) });
    } catch (e) { return res.status(502).json({ error: 'data unavailable' }); }
  }

  const result = { range };
  // Google
  try {
    const out = await redis([['GET', 'gscdash:meta'], ['GET', `gscdash:sum:${range}:cur`], ['GET', `gscdash:sum:${range}:prev`]]);
    const meta = jparse(out[0]), sumCur = jparse(out[1]), sumPrev = jparse(out[2]);
    const end = (sumCur && sumCur.end) || (meta && meta.lastDay) || null;
    let curDates = [], prevDates = [], blobs = {};
    if (end) {
      const start = (sumCur && sumCur.start) || addDays(end, -(n - 1));
      curDates = datesBetween(start, end);
      prevDates = datesBetween(addDays(start, -n), addDays(start, -1));
      const all = prevDates.concat(curDates);
      const got = await redis([['MGET', ...all.map((d) => `gscdash:day:${d}`)]]);
      const vals = (got[0] && got[0].result) || [];
      all.forEach((d, i) => { if (vals[i]) { try { blobs[d] = JSON.parse(vals[i]); } catch (e) { /* skip */ } } });
    }
    result.google = googlePart(meta, sumCur, sumPrev, blobs, curDates, prevDates);
  } catch (e) {
    result.google = { setup: true, error: 'Stored data could not be read.' };
  }
  // Bing
  if (!key) result.bing = { setup: false };
  else {
    try {
      const [traffic, queries, pages] = await Promise.all([
        bingCall('GetRankAndTrafficStats', '', key, siteUrl),
        bingCall('GetQueryStats', '', key, siteUrl),
        bingCall('GetPageStats', '', key, siteUrl),
      ]);
      result.bing = bingPart(traffic, queries, pages, n);
    } catch (e) {
      result.bing = { setup: true, error: scrub(e.message, key) };
    }
  }
  return res.status(200).json(result);
}

module.exports = handler;
Object.assign(module.exports, { normPage, gscRows, googlePart, pageQueries, bingDate, slimBing, bingAgg, bingPart, joinPrev, scrub, _mem: MEM });
