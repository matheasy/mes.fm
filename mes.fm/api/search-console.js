// Data for the private mes.fm/search-console page (behind the middleware.js password, like /ads and /api/earnings).
//
// Google: reads what google-ads/search-console-gsc-script.js pushed through api/search-console-ingest.js:
//   gscdash:day:<date>   totals + devices per day (+ f = fresh / incomplete day, h = hourly rows for the last few days)
//   gscdash:sum:<range>:<cur|prev>   top lists worked out by Search Console over 7 / 28 / 90 / 365 days (unfiltered views)
//   gscdash:da|db|dq:<date>   day-by-day breakdowns for the last ~180 days (filters, Today / Yesterday):
//       a = [country, device] (complete), p = [page] (complete, script v3+), b = [page, country, device],
//       q = [query, page, country, device] (Google hides rare queries)
//   Why p: Search Console drops more of a page's numbers the more dimensions a request has (rows for page x country x
//   device leave out what Google treats as anonymised / rare, like the query rows do), so a page filter computed from b
//   came out like the query table (Oct 2026: /percentagecalculator 705 impressions in 28 days against 23K in Search
//   Console). Page-only filters therefore use p; b is only used when the page filter is combined with country / device
//   (approximate, said on the page), and as a stand-in for days stored before p existed (flagged: g.pFallback).
// Bing: calls the Bing Webmaster API server-side with the key in Vercel env BING_WEBMASTER_KEY (plain project-level
//   variable; never sent to the browser or echoed in errors). GetRankAndTrafficStats = clicks / impressions per day,
//   GetQueryStats / GetPageStats = weekly buckets (one row per query or page per week) with AvgImpressionPosition,
//   GetPageQueryStats = the queries of one page (drill-down). Bing has no country or device split.
//   Answers are cached in Redis for 6 h (gscdash:bing:*) and in memory, so a page load costs Bing nothing most of the time.
// ?range=today|yesterday|7|28|90|365 (default 28). Each source's range ends on its own newest day (Today / Yesterday = that
//   Pacific-time day), the previous period is the same length before it.
// ?f=<JSON [{dim: query|page|country|device, op: contains|exact|not, v}]> filters (ANDed). Filters use the day-by-day
//   breakdowns, so they cover at most 90 days (+ 90 before for the comparison): a 365-day request with filters is answered
//   for 90 days (google.clamped, rangeUsed: "90").
// ?page=<full page URL>&src=google|bing -> the queries of that page (cur + prev), kept for older page versions.
const RANGES = ['today', 'yesterday', '7', '28', '90', '365'];
const SUM_RANGES = ['7', '28', '90', '365'];
const FDIMS = ['query', 'page', 'country', 'device'];
const FOPS = ['contains', 'exact', 'not'];
const SETDIMS = { a: ['country', 'device'], p: ['page'], b: ['page', 'country', 'device'], q: ['query', 'page', 'country', 'device'] };
const MAX_LINES = 8;
const MAX_FILTER_DAYS = 90;
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
const pj = (v) => { if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };

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

// Join current and previous rows by key: { k, c, i, p, pc, pi, pp }. noPrev: the previous period is not (fully) covered by
// the data, so no previous numbers are attached at all (the page then shows no change instead of an absurd +11,618%).
function joinPrev(cur, prev, noPrev) {
  if (noPrev) return cur.map((r) => Object.assign({}, r));
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
  for (const d of days) { c += d.c; i += d.i; pw += (d.p || 0) * d.i; }
  return { c, i, p: i ? Math.round(pw / i * 100) / 100 : 0, days: days.length };
}
// A previous period counts only when the data covers (almost) all of it: Search Console keeps 16 months, so the period
// before a 365-day range has ~120 days at most, and a change against that would be meaningless.
const covered = (have, want) => want > 0 && have >= Math.ceil(want * 0.9);

// Pure: a day Google still calls fresh that has no impressions yet (today, minutes after midnight Pacific, or the
// breakdowns not in yet) is not a real drop to 0: leave such days off the end of a series.
function dropEmptyFresh(rows) {
  let n = rows.length;
  while (n > 0 && rows[n - 1].f && !rows[n - 1].i && !rows[n - 1].c) n--;
  return n === rows.length ? rows : rows.slice(0, n);
}

function dayRow(d, b) {
  const o = { d, c: b.t[0], i: b.t[1], p: b.t[2] };
  if (b.f) o.f = 1;
  return o;
}

// Pure: build the Google part from stored blobs (unfiltered 7 / 28 / 90 / 365 days).
function googlePart(meta, sumCur, sumPrev, dayBlobs, curDates, prevDates) {
  if (!meta && !sumCur && !Object.keys(dayBlobs).length) return { setup: false };
  const daily = dropEmptyFresh(curDates.filter((d) => dayBlobs[d]).map((d) => dayRow(d, dayBlobs[d])));
  const prevDaily = prevDates.filter((d) => dayBlobs[d]).map((d) => dayRow(d, dayBlobs[d]));
  const prevPartial = !covered(prevDaily.length, prevDates.length) || !sumPrev;
  const out = {
    setup: true, meta: meta || null,
    cur: sumCur ? { start: sumCur.start, end: sumCur.end } : curDates.length ? { start: curDates[0], end: curDates[curDates.length - 1] } : null,
    prev: prevDates.length ? { start: prevDates[0], end: prevDates[prevDates.length - 1] } : null,
    daily, prevDaily, totals: totalsOf(daily), prevTotals: totalsOf(prevDaily), prevPartial,
    fresh: daily.some((x) => x.f),
  };
  for (const t of ['pages', 'queries', 'countries', 'devices']) {
    out[t] = joinPrev(gscRows(sumCur && sumCur[t], t), gscRows(sumPrev && sumPrev[t], t), prevPartial).slice(0, t === 'queries' ? 1000 : 500);
  }
  return out;
}

// ---- filters
// Pure: validate ?f=. Returns { filters } or { error }.
function parseFilters(raw) {
  if (raw == null || raw === '') return { filters: [] };
  let arr;
  try { arr = JSON.parse(String(raw).slice(0, 3000)); } catch (e) { return { error: 'bad filters' }; }
  if (!Array.isArray(arr) || arr.length > 8) return { error: 'bad filters' };
  const filters = [];
  for (const f of arr) {
    if (!f || !FDIMS.includes(f.dim) || !FOPS.includes(f.op) || typeof f.v !== 'string') return { error: 'bad filter' };
    const v = f.v.trim().slice(0, 200);
    if (v) filters.push({ dim: f.dim, op: f.op, v });
  }
  return { filters };
}

// Pure: does one decoded row pass every filter? Case-insensitive; pages compare as normalised paths and as full URLs.
function passes(row, filters) {
  for (const f of filters) {
    const raw = row[f.dim];
    if (raw == null) return false;
    const want = f.v.toLowerCase();
    let hit;
    if (f.dim === 'page') {
      const a = String(raw).toLowerCase(), n = normPage(raw).toLowerCase();
      hit = f.op === 'exact' ? n === normPage(f.v).toLowerCase() : a.includes(want) || n.includes(want);
    } else {
      const a = String(raw).toLowerCase();
      hit = f.op === 'exact' ? a === want : a.includes(want);
    }
    if (f.op === 'not' ? hit : !hit) return false;
  }
  return true;
}

// Pure: dictionary-encoded day set -> row objects { query?, page?, country, device, c, i, p }.
function decodeSet(set, kind) {
  const dims = SETDIMS[kind], n = dims.length, out = [];
  if (!set || !Array.isArray(set.r) || !Array.isArray(set.s)) return out;
  for (const r of set.r) {
    const o = { c: r[n], i: r[n + 1], p: r[n + 2] };
    for (let k = 0; k < n; k++) o[dims[k]] = set.s[r[k]];
    out.push(o);
  }
  return out;
}

// Which breakdown answers a filter set: the one with the FEWEST dimensions that still has every filtered dimension,
// because Search Console leaves more out the more dimensions a request has. Query filter -> q; page only -> p (complete
// page totals, falls back to b on days stored before p existed); page + country / device -> b; country / device only ->
// a (complete: the same totals Search Console shows).
function basisOf(filters) {
  if (filters.some((f) => f.dim === 'query')) return 'q';
  if (filters.some((f) => f.dim === 'page')) return filters.some((f) => f.dim === 'country' || f.dim === 'device') ? 'b' : 'p';
  return 'a';
}
const kindsFor = (filters) => { const b = basisOf(filters); return b === 'q' ? ['q'] : b === 'b' ? ['b', 'q'] : b === 'p' ? ['p', 'b', 'q'] : ['a', 'p', 'b', 'q']; };

// Pure: the Google part from day-by-day breakdowns (filters, or Today / Yesterday).
// sets = { date: { a, b, q } } (parsed), dayBlobs = { date: day blob } (unfiltered day totals + hours).
function filteredPart(meta, dayBlobs, sets, curDates, prevDates, filters, opts) {
  opts = opts || {};
  const basis = basisOf(filters);
  const unfiltered = !filters.length;
  const cache = {};
  const rowsOf = (d, kind) => {
    const key = d + kind;
    if (!(key in cache)) {
      let k = kind;
      if (k === 'p' && !(sets[d] && sets[d].p)) k = 'b'; // days stored before the page breakdown existed
      cache[key] = sets[d] && sets[d][k] ? decodeSet(sets[d][k], k).filter((r) => passes(r, filters)) : null;
    }
    return cache[key];
  };
  const series = (dates) => {
    const out = [];
    for (const d of dates) {
      if (unfiltered && dayBlobs[d]) { out.push(dayRow(d, dayBlobs[d])); continue; }
      const rows = rowsOf(d, basis);
      if (!rows) continue;
      let c = 0, i = 0, pw = 0;
      for (const r of rows) { c += r.c; i += r.i; pw += r.p * r.i; }
      const o = { d, c, i, p: i ? Math.round(pw / i * 100) / 100 : 0 };
      if (dayBlobs[d] && dayBlobs[d].f) o.f = 1;
      if (basis === 'p' && !(sets[d] && sets[d].p)) o.pb = 1;
      out.push(o);
    }
    return out;
  };
  const daily = dropEmptyFresh(series(curDates)), prevDaily = series(prevDates);
  const have = (dates, kind) => dates.filter((d) => sets[d] && (sets[d][kind] || (kind === 'p' && sets[d].b))).length;
  const prevPartial = !covered(prevDaily.length, prevDates.length) || !covered(have(prevDates, 'q'), prevDates.length);
  const table = (dates, kind, dim) => {
    const m = new Map();
    for (const d of dates) {
      const rows = rowsOf(d, kind);
      if (!rows) continue;
      for (const r of rows) {
        if (dim === 'page') acc(m, normPage(r.page), r.c, r.i, r.p, { u: r.page });
        else acc(m, dim === 'query' ? r.query : String(r[dim]).toLowerCase(), r.c, r.i, r.p);
      }
    }
    return [...m.values()].map(fin).sort((a, b) => b.c - a.c || b.i - a.i);
  };
  const tkind = { queries: 'q', pages: basis === 'q' ? 'q' : basis === 'b' ? 'b' : 'p', countries: basis === 'p' ? 'b' : basis, devices: basis === 'p' ? 'b' : basis };
  const tdim = { queries: 'query', pages: 'page', countries: 'country', devices: 'device' };
  const out = {
    setup: true, meta: meta || null, filtered: !unfiltered, basis,
    cur: curDates.length ? { start: curDates[0], end: curDates[curDates.length - 1] } : null,
    prev: prevDates.length ? { start: prevDates[0], end: prevDates[prevDates.length - 1] } : null,
    daily, prevDaily, totals: totalsOf(daily), prevTotals: totalsOf(prevDaily), prevPartial,
    fresh: daily.some((x) => x.f),
    dimDays: { have: have(curDates, unfiltered ? 'q' : basis), want: curDates.length },
  };
  if (basis === 'p') {
    const pDays = curDates.filter((d) => sets[d] && sets[d].p).length;
    if (pDays < curDates.length) out.pFallback = { have: pDays, want: curDates.length };
  }
  for (const t of Object.keys(tkind)) {
    out[t] = joinPrev(table(curDates, tkind[t], tdim[t]), table(prevDates, tkind[t], tdim[t]), prevPartial).slice(0, t === 'queries' ? 1000 : 500);
  }
  if (opts.hourly && unfiltered) {
    const hrs = (d) => ((dayBlobs[d] && dayBlobs[d].h) || []).map((h) => ({ h: h[0], c: h[1], i: h[2], p: h[3] }));
    out.hourly = hrs(curDates[0]);
    out.prevHourly = hrs(prevDates[0]);
  }
  return out;
}

// ---- per-item lines (the ticked rows of a table, one chart line each)
// Pure: validate ?lines=[{dim, v}] (at most 8).
function parseLines(raw) {
  let arr;
  try { arr = JSON.parse(String(raw).slice(0, 4000)); } catch (e) { return { error: 'bad lines' }; }
  if (!Array.isArray(arr) || !arr.length || arr.length > MAX_LINES) return { error: 'bad lines' };
  const lines = [];
  for (const l of arr) {
    if (!l || !FDIMS.includes(l.dim) || typeof l.v !== 'string' || !l.v.trim()) return { error: 'bad line' };
    lines.push({ dim: l.dim, v: l.v.trim().slice(0, 200) });
  }
  return { lines };
}
// Pure: one day-by-day series per line = the page's filters AND "<dim> is exactly <v>", each from the breakdown that
// answers that combination (basisOf), so a page line uses the complete page totals like a page filter does.
function linesPart(sets, dayBlobs, dates, filters, lines) {
  return lines.map((l) => {
    const fs = filters.concat([{ dim: l.dim, op: 'exact', v: l.v }]);
    const part = filteredPart(null, dayBlobs, sets, dates, [], fs);
    return { dim: l.dim, v: l.v, basis: part.basis, daily: part.daily };
  });
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
  return ptDate(ms);
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

const minDate = (rows) => { let m = null; for (const r of rows || []) if (r[0] && (!m || r[0] < m)) m = r[0]; return m; };
const maxDate = (rows) => { let m = null; for (const r of rows || []) if (r[0] && (!m || r[0] > m)) m = r[0]; return m; };

// Pure: apply page filters to Bing's page table and query filters to its query table. Bing has no cross dimensions,
// so a table whose filters it cannot honour comes back empty and "blocked".
function bingFilter(rows, kind, filters) {
  const own = kind === 'queries' ? 'query' : 'page';
  if (filters.some((f) => f.dim !== own)) return { rows: [], blocked: true };
  return { rows: rows.filter((r) => passes(kind === 'queries' ? { query: r.k } : { page: r.u || r.k }, filters)), blocked: false };
}

// Pure: the Bing part from slim rows. range = days ('7'...) or 'today' / 'yesterday' (today = Pacific date).
// Coverage guard: Bing keeps a limited history (query / page buckets ~6 months), so the previous period (and, for long
// ranges, the current one) can lie partly outside it. prevPartial then means "show no changes", since a change against a
// period that only has its last week or two of data reads as +11,618%.
function bingPart(traffic, queries, pages, range, today, filters) {
  filters = filters || [];
  const empty = (extra) => Object.assign({ setup: true, empty: true, daily: [], prevDaily: [], totals: totalsOf([]), prevTotals: totalsOf([]), pages: [], queries: [], newest: maxDate(traffic) }, extra || {});
  if (!traffic.length && !queries.length) return empty();
  const day = (r) => ({ d: r[0], c: r[1], i: r[2] });
  const tot = (ds, pos) => { const t = { c: 0, i: 0, days: ds.length }; ds.forEach((x) => { t.c += x.c; t.i += x.i; }); t.p = pos; return t; };
  if (range === 'today' || range === 'yesterday') {
    const D = range === 'today' ? today : addDays(today, -1), P = addDays(D, -1);
    const daily = traffic.filter((r) => r[0] === D).map(day), prevDaily = traffic.filter((r) => r[0] === P).map(day);
    const base = { cur: { start: D, end: D }, prev: { start: P, end: P }, newest: maxDate(traffic), weeklyOnly: true, filtered: filters.length > 0 };
    if (!daily.length) return empty(Object.assign(base, { lag: true }));
    return Object.assign({ setup: true, daily: filters.length ? [] : daily, prevDaily: filters.length ? [] : prevDaily,
      totals: tot(daily, 0), prevTotals: tot(prevDaily, 0), prevPartial: !prevDaily.length, queries: [], pages: [] }, base);
  }
  const n = Number(range);
  const end = traffic.length ? traffic[traffic.length - 1][0] : maxDate(queries);
  const start = addDays(end, -(n - 1));
  const pEnd = addDays(start, -1), pStart = addDays(start, -n);
  // weekly buckets: a bucket dated inside the range counts for it (Bing's buckets are a week each), and a first bucket
  // dated up to 6 days after a period's start still covers that start
  const qMin = minDate(queries.concat(pages)), tMin = minDate(traffic);
  const tablesPrevOk = !!qMin && qMin <= addDays(pStart, 6);
  const qCur = bingAgg(queries, start, end), qPrev = bingAgg(queries, pStart, pEnd);
  const pgCur = bingAgg(pages, start, end, true), pgPrev = bingAgg(pages, pStart, pEnd, true);
  const posOf = (rows) => { let i = 0, pw = 0; for (const r of rows) { i += r.i; pw += r.p * r.i; } return i ? Math.round(pw / i * 100) / 100 : 0; };
  const daily = traffic.filter((r) => r[0] >= start && r[0] <= end).map(day);
  const prevDaily = traffic.filter((r) => r[0] >= pStart && r[0] <= pEnd).map(day);
  const prevDaysOk = covered(prevDaily.length, n);
  let qs = joinPrev(qCur, qPrev, !tablesPrevOk), ps = joinPrev(pgCur, pgPrev, !tablesPrevOk);
  const out = {
    setup: true, cur: { start, end }, prev: { start: pStart, end: pEnd },
    daily, prevDaily, totals: tot(daily, posOf(qCur)), prevTotals: tot(prevDaily, posOf(qPrev)),
    prevPartial: !prevDaysOk || !tablesPrevOk, prevDaysOk, tablesPrevOk,
    since: { traffic: tMin, tables: qMin }, curPartial: !!(qMin && qMin > addDays(start, 6)) || !!(tMin && tMin > start),
    weekly: true, newest: end,
  };
  if (filters.length) {
    const fq = bingFilter(qs, 'queries', filters), fp = bingFilter(ps, 'pages', filters);
    qs = fq.rows; ps = fp.rows;
    out.filtered = true; out.blocked = { queries: fq.blocked, pages: fp.blocked };
    out.daily = []; out.prevDaily = []; // Bing's day totals cannot be split by query / page / country / device
  }
  out.queries = qs.slice(0, 1000); out.pages = ps.slice(0, 500);
  return out;
}

// Pacific date (Search Console's day) of a time.
function ptDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Reads Redis keys in chunks of 30 (each Upstash answer stays well under its size limit).
async function mgetChunked(keys) {
  const parts = [];
  for (let k = 0; k < keys.length; k += 30) parts.push(keys.slice(k, k + 30));
  const got = await Promise.all(parts.map((part) => redis([['MGET', ...part]])));
  const out = [];
  got.forEach((g, j) => { const vals = (g[0] && g[0].result) || []; parts[j].forEach((_, x) => out.push(vals[x] == null ? null : vals[x])); });
  return out;
}

// The Google answer. deps.mget(keys) -> values (strings or null); split out so the browser mock (sc-mock.js) runs this same code.
async function googleAnswer(range, filters, today, deps, lines) {
  const [metaS, atS] = await deps.mget(['gscdash:meta', 'gscdash:at']);
  const meta = pj(metaS);
  if (meta && atS) meta.at = atS;
  const readDays = async (dates, kinds) => {
    const keys = dates.map((d) => 'gscdash:day:' + d);
    kinds.forEach((k) => dates.forEach((d) => keys.push('gscdash:d' + k + ':' + d)));
    const vals = await deps.mget(keys);
    const blobs = {}, sets = {};
    dates.forEach((d, j) => { const b = pj(vals[j]); if (b) blobs[d] = b; });
    kinds.forEach((k, ki) => dates.forEach((d, j) => {
      const v = pj(vals[dates.length * (ki + 1) + j]);
      if (v) (sets[d] || (sets[d] = {}))[k] = v;
    }));
    return { blobs, sets };
  };
  if (lines) {
    // lines cover the day-by-day breakdowns only: at most the last 90 days of the range
    const end = (meta && meta.lastDay) || today;
    const dates = range === 'today' ? [today] : range === 'yesterday' ? [addDays(today, -1)]
      : datesBetween(addDays(end, -(Math.min(Number(range), MAX_FILTER_DAYS) - 1)), end);
    const kinds = new Set();
    lines.forEach((l) => { const b = basisOf(filters.concat([{ dim: l.dim, op: 'exact', v: l.v }])); kinds.add(b); if (b === 'p') kinds.add('b'); });
    const { blobs, sets } = await readDays(dates, [...kinds]);
    return { lines: linesPart(sets, blobs, dates, filters, lines), clamped: !/^(today|yesterday)$/.test(range) && Number(range) > MAX_FILTER_DAYS };
  }
  if (range === 'today' || range === 'yesterday') {
    const D = range === 'today' ? today : addDays(today, -1), P = addDays(D, -1);
    const { blobs, sets } = await readDays([P, D], kindsFor(filters));
    if (!meta && !Object.keys(blobs).length) return { setup: false };
    const g = filteredPart(meta, blobs, sets, [D], [P], filters, { hourly: true });
    g.day = true;
    if (!blobs[D] && !sets[D]) g.noDay = true;
    return g;
  }
  let n = Number(range);
  if (!filters.length) {
    const [cS, pS] = await deps.mget([`gscdash:sum:${range}:cur`, `gscdash:sum:${range}:prev`]);
    const sumCur = pj(cS), sumPrev = pj(pS);
    const end = (sumCur && sumCur.end) || (meta && meta.lastDay) || null;
    let curDates = [], prevDates = [], blobs = {};
    if (end) {
      const start = (sumCur && sumCur.start) || addDays(end, -(n - 1));
      curDates = datesBetween(start, end);
      prevDates = datesBetween(addDays(start, -n), addDays(start, -1));
      blobs = (await readDays(prevDates.concat(curDates), [])).blobs;
    }
    return googlePart(meta, sumCur, sumPrev, blobs, curDates, prevDates);
  }
  let clamped = false;
  if (n > MAX_FILTER_DAYS) { n = MAX_FILTER_DAYS; clamped = true; }
  const end = (meta && meta.lastDay) || today;
  const curDates = datesBetween(addDays(end, -(n - 1)), end);
  const prevDates = datesBetween(addDays(end, -(2 * n - 1)), addDays(end, -n));
  const { blobs, sets } = await readDays(prevDates.concat(curDates), kindsFor(filters));
  if (!meta && !Object.keys(blobs).length) return { setup: false };
  const g = filteredPart(meta, blobs, sets, curDates, prevDates, filters);
  if (clamped) g.clamped = true;
  return g;
}

// The whole answer. deps = { mget, bing(method, extra) -> slim rows (throws on error), or null when Bing is not set up, now }.
async function respond(q, deps) {
  q = q || {};
  const range = RANGES.includes(String(q.range)) ? String(q.range) : '28';
  const pf = parseFilters(q.f);
  if (pf.error) return { status: 400, body: { error: pf.error } };
  const filters = pf.filters;
  const today = ptDate(deps.now || Date.now());
  if (q.lines != null && q.lines !== '') {
    const pl = parseLines(q.lines);
    if (pl.error) return { status: 400, body: { error: pl.error } };
    try {
      const g = await googleAnswer(range, filters, today, deps, pl.lines);
      return { status: 200, body: { range, today, filters, lines: g.lines, clamped: g.clamped } };
    } catch (e) { return { status: 200, body: { range, today, filters, lines: [], error: 'Stored data could not be read.' } }; }
  }
  const result = { range, today, filters };
  try {
    result.google = await googleAnswer(range, filters, today, deps);
    if (result.google.clamped) result.rangeUsed = '90';
  } catch (e) {
    result.google = { setup: true, error: 'Stored data could not be read.' };
  }
  if (!deps.bing) result.bing = { setup: false };
  else {
    try {
      const [traffic, queries, pages] = await Promise.all([
        deps.bing('GetRankAndTrafficStats', ''), deps.bing('GetQueryStats', ''), deps.bing('GetPageStats', ''),
      ]);
      result.bing = bingPart(traffic, queries, pages, result.rangeUsed || range, today, filters);
    } catch (e) {
      result.bing = { setup: true, error: String(e.message || e) };
    }
  }
  return { status: 200, body: result };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const q = req.query || {};
  const key = process.env.BING_WEBMASTER_KEY || '';
  const siteUrl = process.env.BING_SITE_URL || 'https://mes.fm/';

  // drill-down: the queries of one page (older page versions)
  if (q.page) {
    const range = SUM_RANGES.includes(String(q.range)) ? String(q.range) : '28';
    const n = Number(range);
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

  const out = await respond(q, {
    mget: mgetChunked,
    bing: key ? (method, extra) => bingCall(method, extra, key, siteUrl).catch((e) => { throw new Error(scrub(e.message, key)); }) : null,
  });
  return res.status(out.status).json(out.body);
}

module.exports = handler;
Object.assign(module.exports, { parseLines, linesPart, dropEmptyFresh, normPage, gscRows, googlePart, filteredPart, parseFilters, passes, decodeSet, basisOf, pageQueries, bingDate, slimBing, bingAgg, bingPart, bingFilter, joinPrev, scrub, respond, ptDate, _mem: MEM });
