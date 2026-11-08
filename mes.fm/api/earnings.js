// Data for the private mes.fm/ads page (behind the middleware.js password, like /portfolio).
// Reads the daily blobs written by api/earnings-ingest.js and joins AdSense earnings with Google Ads spend
// by day, landing page, country, device and campaign. Spend is converted to CAD (AdSense's currency) with a
// daily rate from open.er-api.com, cached in Redis for 12 h, fallback 18,396.41 VND per CAD (Oct 21, 2026).
// ?range=today|yesterday|7d|30d|90d|365d (days end today; the scripts send each account's own Pacific dates).
// ?gsc=1&range=...: the Search Console columns (organic clicks / impressions per day, page and country; Bing day totals
//   from the Search Console page's 6-hour cache), read from the gscdash:* keys (see api/search-console.js, _gsc-join.js).
// ?vs=1&days=30|60|90|180&cc=<alpha-2>&page=<path>: "Ads vs SEO", one country and / or landing page per day: ad spend,
//   ad clicks, organic clicks and impressions, and a before / after comparison around the first day with ad spend.
// MES Premium income (people paying HBD on mes.fm/premium for no ads) is read from the public Hive blockchain: @mes's
//   account history, transfers and recurrent-transfer executions of HBD with the page's memo "mes.fm ad-free" (other
//   HBD sent to @mes, e.g. 3Speak shares, is not Premium and is left out). HBD is counted as 1 USD, converted to CAD with
//   the same daily rate as the rest. The payment list is cached in Redis for 10 min (adsdash:premium); if the Hive nodes
//   don't answer, the page still loads and says Premium could not be read.
const { lastNDayKeys } = require('./_bucket-keys');
const GJ = require('./_gsc-join');

const RANGES = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
// Both Google accounts report in Pacific time (America/Vancouver), so "today" is the Pacific date. AdSense has no
// hourly report, so 'today' (so far) is the shortest range there is.
const TZ = 'America/Vancouver';
function pacificDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
const FX_FALLBACK = { VND: 18396.41, USD: 0.72, CAD: 1 };
const UNLISTED = '(pages AdSense did not list)';
const PREM_SINCE = Date.parse('2026-10-30T00:00:00Z'); // MES Premium launched Oct 31, 2026: nothing older is read
const PREM_MEMO = /ad-?free/i;
const PREM_TO = 'mes';
// account history operation filter: transfer (2) | fill_recurrent_transfer (83 -> high bit 19)
const PREM_FILTER_LOW = 4, PREM_FILTER_HIGH = 524288;

// "https://mes.fm/bmicalculator/index.html?x=1" -> "/bmicalculator"; other sites keep their host in front.
function normPage(url) {
  let s = String(url || '').trim().replace(/^https?:\/\//i, '');
  const q = s.search(/[?#]/);
  if (q !== -1) s = s.slice(0, q);
  const slash = s.indexOf('/');
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase().replace(/^www\./, '');
  let path = slash === -1 ? '/' : s.slice(slash);
  path = path.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!path) path = '/';
  return host === 'mes.fm' || host === '' ? path : host + path;
}

// Shared poll pages (mes.fm/v/<id>, Hive polls /hp/<author>/<permlink>) are rows of their own in AdSense, while
// mes.fm/stats and the "came back" numbers count them as /polls (main_js/track.js). The ads page rolls them into one
// '/polls' row and keeps each poll as a sub-row (subs), so the two pages agree and you can still see which poll earned.
const POLL_PAGE = /^\/(v\/[a-z0-9]+|hp\/[^/]+\/[^/]+)$/i;
function groupPage(path) { return POLL_PAGE.test(path) ? '/polls' : path; }

function normDevice(d) {
  const s = String(d || '').toLowerCase();
  if (/desktop|computer/.test(s)) return 'desktop';
  if (/tablet/.test(s)) return 'tablet';
  if (/tv/.test(s)) return 'tv';
  if (/mobile|phone/.test(s)) return 'mobile';
  return 'other';
}

// Pure: blobs = { gads: {date: day}, adsense: {date: day} }, perCad = units of the Ads currency per 1 CAD.
// blobs.premium (optional) = { date: { hbd, n } }; usdPerCad turns HBD (= USD) into CAD.
function aggregate(dates, blobs, perCad, usdPerCad) {
  const daily = [];
  const pages = new Map();
  const countries = new Map();
  const devices = new Map();
  const campaigns = new Map();
  const domains = new Map();
  const totals = { rev: 0, pv: 0, adImp: 0, adClicks: 0, spend: 0, clicks: 0, imp: 0, prem: 0, premHbd: 0, premN: 0 };
  const prem = blobs.premium || {};
  const usd = usdPerCad || FX_FALLBACK.USD;
  const get = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };
  const cad = (micros) => micros / 1e6 / perCad;
  for (const d of dates.slice().sort()) {
    const g = blobs.gads[d];
    const a = blobs.adsense[d];
    const day = { d, rev: 0, pv: 0, spend: 0, clicks: 0, prem: 0, has: { gads: !!g, adsense: !!a } };
    if (prem[d]) {
      day.prem = prem[d].hbd / usd;
      totals.prem += day.prem; totals.premHbd += prem[d].hbd; totals.premN += prem[d].n;
    }
    if (a) {
      let pageRev = 0, pagePv = 0;
      for (const [url, earn, pv, imp, clk] of a.pages || []) {
        const np = normPage(url), gk = groupPage(np);
        const p = get(pages, gk, () => ({ rev: 0, pv: 0, adClicks: 0, spend: 0, clicks: 0 }));
        p.rev += earn; p.pv += pv; p.adClicks += clk;
        if (gk !== np) {
          if (!p.sub) p.sub = new Map();
          const sb = get(p.sub, np, () => ({ rev: 0, pv: 0, adClicks: 0 }));
          sb.rev += earn; sb.pv += pv; sb.adClicks += clk;
        }
        pageRev += earn; pagePv += pv;
        totals.adImp += imp; totals.adClicks += clk;
      }
      // AdSense's PAGE_URL report leaves part of the traffic unnamed; the platform report covers all of it, so the
      // day's totals come from there and the difference is one '(pages AdSense did not list)' row.
      const devRev = (a.dev || []).reduce((t, r) => t + r[1], 0);
      const devPv = (a.dev || []).reduce((t, r) => t + r[2], 0);
      day.rev = (a.dev || []).length ? devRev : pageRev;
      day.pv = (a.dev || []).length ? devPv : pagePv;
      if (day.rev - pageRev > 0.005 || day.pv - pagePv > 0) {
        const o = get(pages, UNLISTED, () => ({ rev: 0, pv: 0, adClicks: 0, spend: 0, clicks: 0 }));
        o.rev += Math.max(0, day.rev - pageRev); o.pv += Math.max(0, day.pv - pagePv);
      }
      for (const [cc, name, earn, pv] of a.geo || []) {
        const c = get(countries, cc || name, () => ({ name, rev: 0, pv: 0, spend: 0, clicks: 0, imp: 0 }));
        c.rev += earn; c.pv += pv; if (name) c.name = name;
      }
      for (const [dev, earn, pv] of a.dev || []) {
        const v = get(devices, normDevice(dev), () => ({ rev: 0, pv: 0, spend: 0, clicks: 0 }));
        v.rev += earn; v.pv += pv;
      }
      for (const [dom, earn, pv] of a.dom || []) {
        const v = get(domains, dom, () => ({ rev: 0, pv: 0 }));
        v.rev += earn; v.pv += pv;
      }
    }
    if (g) {
      for (const [name, dev, imp, clk, micros] of g.camps || []) {
        const c = get(campaigns, name, () => ({ spend: 0, clicks: 0, imp: 0, dev: {} }));
        const s = cad(micros);
        c.spend += s; c.clicks += clk; c.imp += imp;
        const dv = normDevice(dev);
        c.dev[dv] = (c.dev[dv] || 0) + clk;
        const v = get(devices, dv, () => ({ rev: 0, pv: 0, spend: 0, clicks: 0 }));
        v.spend += s; v.clicks += clk;
        day.spend += s; day.clicks += clk;
        totals.imp += imp;
      }
      for (const [cc, name, , imp, clk, micros] of g.geo || []) {
        const c = get(countries, cc || name, () => ({ name, rev: 0, pv: 0, spend: 0, clicks: 0, imp: 0 }));
        c.spend += cad(micros); c.clicks += clk; c.imp += imp; if (!c.name) c.name = name;
      }
      for (const [url, , clk, micros] of g.lp || []) {
        const p = get(pages, groupPage(normPage(url)), () => ({ rev: 0, pv: 0, adClicks: 0, spend: 0, clicks: 0 }));
        p.spend += cad(micros); p.clicks += clk;
      }
    }
    totals.rev += day.rev; totals.pv += day.pv; totals.spend += day.spend; totals.clicks += day.clicks;
    daily.push(day);
  }
  const r2 = (x) => Math.round(x * 10000) / 10000;
  const list = (m, keyName) => [...m.entries()].map(([k, v]) => Object.assign({ [keyName]: k }, v));
  const fixNums = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = r2(o[k]); return o; };
  return {
    totals: fixNums(totals),
    daily: daily.map(fixNums),
    pages: list(pages, 'path').map((p) => {
      if (p.sub) p.subs = list(p.sub, 'path').map(fixNums).sort((a, b) => b.rev - a.rev || b.pv - a.pv);
      delete p.sub;
      return fixNums(p);
    }).sort((a, b) => (b.rev + b.spend) - (a.rev + a.spend)).slice(0, 400),
    countries: list(countries, 'cc').map(fixNums).sort((a, b) => (b.rev + b.spend) - (a.rev + a.spend)),
    devices: list(devices, 'dev').map(fixNums),
    campaigns: list(campaigns, 'name').map(fixNums).sort((a, b) => b.spend - a.spend),
    domains: list(domains, 'dom').map(fixNums).sort((a, b) => b.rev - a.rev),
  };
}

// Pure: @mes history entries -> MES Premium payments [{t, d (Pacific date), user, hbd, kind}], oldest first.
function premiumPayments(history, sinceMs) {
  const P = require('./premium');
  const out = [];
  for (const h of history || []) {
    const e = Array.isArray(h) ? h[1] : h;
    if (!e || !Array.isArray(e.op)) continue;
    const [name, d] = e.op;
    if ((name !== 'transfer' && name !== 'fill_recurrent_transfer') || !d) continue;
    if (d.to !== PREM_TO || !d.from || d.from === PREM_TO || !PREM_MEMO.test(String(d.memo || ''))) continue;
    const a = P.parseAmount(d.amount);
    if (a.sym !== 'HBD' || !(a.n > 0)) continue;
    const t = Date.parse(/Z$/.test(e.timestamp) ? e.timestamp : e.timestamp + 'Z');
    if (!isFinite(t) || t < (sinceMs || 0)) continue;
    out.push({ t, d: pacificDay(new Date(t)), user: d.from, hbd: a.n, kind: name === 'transfer' ? 'payment' : 'subscription' });
  }
  return out.sort((x, y) => x.t - y.t);
}
// Pure: payments -> { date: { hbd, n } }
function premiumByDay(pays) {
  const m = {};
  for (const p of pays || []) { const x = m[p.d] || (m[p.d] = { hbd: 0, n: 0 }); x.hbd = Math.round((x.hbd + p.hbd) * 1000) / 1000; x.n++; }
  return m;
}
// Reads @mes's transfers back to PREM_SINCE (a few pages of 1,000 at most).
async function fetchPremium(fetchImpl) {
  const P = require('./premium');
  const hist = [];
  let start = -1;
  for (let page = 0; page < 6; page++) {
    const limit = start === -1 ? 1000 : Math.min(1000, start + 1);
    if (limit <= 0) break;
    const res = await P.rpc('condenser_api.get_account_history', [PREM_TO, start, limit, PREM_FILTER_LOW, PREM_FILTER_HIGH], fetchImpl);
    if (!Array.isArray(res) || !res.length) break;
    hist.push(...res);
    if (res.length < limit) break;
    const oldest = res[0];
    if (Date.parse(oldest[1].timestamp + 'Z') < PREM_SINCE) break;
    start = oldest[0] - 1;
    if (start < 0) break;
  }
  return premiumPayments(hist, PREM_SINCE);
}
async function premiumCached(cachedRaw) {
  const c = pj(cachedRaw);
  if (c && c.at && Date.now() - Date.parse(c.at) < 10 * 60e3) return c;
  try {
    const pays = await fetchPremium();
    const v = { at: new Date().toISOString(), pays };
    await redis([['SET', 'adsdash:premium', JSON.stringify(v), 'EX', String(30 * 86400)]]).catch(() => {});
    return v;
  } catch (e) {
    return c ? Object.assign({}, c, { stale: true }) : { at: null, pays: [], error: 'Hive nodes did not answer' };
  }
}

async function redis(commands) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}

// Rates per 1 CAD (the page's currency switch shows CAD, VND or USD): live from open.er-api.com, cached in Redis for 12 h,
// else the last cached copy, else FX_FALLBACK. perCad = the Ads account currency's rate (1 when the script already sent CAD).
const SHOWN = ['VND', 'USD'];
async function fxRate(currency, cached) {
  const pick = (rates, at, live) => {
    const out = { CAD: 1 };
    for (const c of SHOWN) out[c] = (rates && rates[c]) || FX_FALLBACK[c];
    const perCad = !currency || currency === 'CAD' ? 1 : (rates && rates[currency]) || FX_FALLBACK[currency] || 1;
    return { perCad, rates: out, at, live };
  };
  if (cached && cached.rates && Date.now() - Date.parse(cached.at) < 12 * 3600e3) return Object.assign(pick(cached.rates, cached.at, true), { cached: true });
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/CAD');
    const j = await r.json();
    if (j && j.rates && j.rates.VND) {
      const at = new Date().toISOString();
      await redis([['SET', 'adsdash:fx', JSON.stringify({ at, rates: j.rates }), 'EX', String(7 * 86400)]]).catch(() => {});
      return pick(j.rates, at, true);
    }
  } catch (e) { /* fall through */ }
  if (cached && cached.rates) return pick(cached.rates, cached.at, false);
  return pick(null, null, false);
}

// Pacific dates, oldest first: the last n days ending today.
function pacificDays(n, now) {
  const today = pacificDay(now || new Date());
  const out = [];
  for (let k = n - 1; k >= 0; k--) out.push(new Date(Date.parse(today + 'T12:00:00Z') - k * 864e5).toISOString().slice(0, 10));
  return out;
}
const pj = (v) => { if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };
async function mget(keys) {
  const parts = [];
  for (let k = 0; k < keys.length; k += 30) parts.push(keys.slice(k, k + 30));
  const got = await Promise.all(parts.map((part) => redis([['MGET', ...part]])));
  const out = [];
  got.forEach((g, j) => { const vals = (g[0] && g[0].result) || []; parts[j].forEach((_, x) => out.push(vals[x] == null ? null : vals[x])); });
  return out;
}
// Reads day blobs + the wanted breakdowns for dates -> { days, sets }. kinds: 'a', 'p', 'b'; 'p' also reads b for the days
// stored before p existed.
async function readGsc(dates, kinds) {
  const keys = dates.map((d) => 'gscdash:day:' + d);
  kinds.forEach((k) => dates.forEach((d) => keys.push('gscdash:d' + k + ':' + d)));
  const vals = await mget(keys);
  const days = {}, sets = {};
  dates.forEach((d, j) => { const b = pj(vals[j]); if (b) days[d] = b; });
  kinds.forEach((k, ki) => dates.forEach((d, j) => { const v = pj(vals[dates.length * (ki + 1) + j]); if (v) (sets[d] || (sets[d] = {}))[k] = v; }));
  if (kinds.includes('p') && !kinds.includes('b')) {
    const miss = dates.filter((d) => !(sets[d] && sets[d].p));
    if (miss.length) {
      const bv = await mget(miss.map((d) => 'gscdash:db:' + d));
      miss.forEach((d, j) => { const v = pj(bv[j]); if (v) (sets[d] || (sets[d] = {})).b = v; });
    }
  }
  return { days, sets };
}

async function gscHandler(req, res) {
  const range = RANGES[req.query.range] ? req.query.range : '30d';
  const now = new Date();
  const today = pacificDay(now);
  const dates = range === 'today' ? [today] : range === 'yesterday' ? pacificDays(2, now).slice(0, 1) : pacificDays(RANGES[range], now);
  try {
    const big = dates.length > 90; // breakdowns are kept ~180 days: a year uses Search Console's own 365-day summary
    const { days, sets } = await readGsc(dates, big ? [] : ['a', 'p']);
    const extra = await redis([['GET', 'gscdash:bing:GetRankAndTrafficStats'], ['GET', 'gscdash:meta']].concat(big ? [['GET', 'gscdash:sum:365:cur']] : []));
    const bingBlob = pj(extra[0] && extra[0].result), meta = pj(extra[1] && extra[1].result);
    const sum = big ? pj(extra[2] && extra[2].result) : null;
    if (!meta && !Object.keys(days).length) return res.status(200).json({ setup: false });
    const out = GJ.joinGsc(dates, days, sets, bingBlob && bingBlob.rows, normPage, sum);
    return res.status(200).json(Object.assign({ setup: true, range, today, lastDay: meta && meta.lastDay, bingAt: bingBlob && bingBlob.at }, out));
  } catch (e) { return res.status(502).json({ error: 'data unavailable' }); }
}

// Pure: ad spend / clicks / impressions per day for one country (alpha-2) and / or landing page, in CAD.
// gads = { date: blob }. A page picks the campaigns whose ads point at it (Google Ads' landing-page report);
// with a country too, those campaigns' spend in that country (the geo report).
function adSeries(dates, gads, perCad, page, cc) {
  const cad = (m) => m / 1e6 / perCad;
  const camps = new Set();
  if (page) for (const d of dates) for (const [url, name] of (gads[d] && gads[d].lp) || []) if (groupPage(normPage(url)) === page) camps.add(name);
  const rows = dates.map((d) => {
    const g = gads[d], o = { d, spend: 0, adClicks: 0, adImp: 0 };
    if (!g) return o;
    if (cc) {
      for (const [code, , camp, imp, clk, mic] of g.geo || []) {
        if (String(code).toUpperCase() !== cc || (page && !camps.has(camp))) continue;
        o.spend += cad(mic); o.adClicks += clk; o.adImp += imp;
      }
    } else if (page) {
      for (const [url, , clk, mic] of g.lp || []) if (groupPage(normPage(url)) === page) { o.spend += cad(mic); o.adClicks += clk; }
      for (const [camp, , imp] of g.camps || []) if (camps.has(camp)) o.adImp += imp;
    } else {
      for (const [, , imp, clk, mic] of g.camps || []) { o.spend += cad(mic); o.adClicks += clk; o.adImp += imp; }
    }
    o.spend = Math.round(o.spend * 10000) / 10000;
    return o;
  });
  return { rows, campaigns: [...camps] };
}

async function vsHandler(req, res) {
  const q = req.query || {};
  const n = [30, 60, 90, 180].includes(Number(q.days)) ? Number(q.days) : 90;
  const cc = /^[A-Za-z]{2}$/.test(String(q.cc || '')) ? String(q.cc).toUpperCase() : '';
  const page = q.page ? normPage(String(q.page).slice(0, 300)) : '';
  const dates = pacificDays(n);
  try {
    const kinds = page && cc ? ['b'] : page ? ['p'] : cc ? ['a'] : [];
    const [{ days, sets }, gv, extra] = await Promise.all([
      readGsc(dates, kinds),
      mget(dates.map((d) => 'adsdash:gads:' + d)),
      redis([['GET', 'adsdash:meta:gads'], ['GET', 'adsdash:fx']]),
    ]);
    const gads = {};
    dates.forEach((d, j) => { const v = pj(gv[j]); if (v) gads[d] = v; });
    const metaG = pj(extra[0] && extra[0].result);
    const fx = await fxRate((metaG && metaG.currency) || 'VND', pj(extra[1] && extra[1].result));
    const ads = adSeries(dates, gads, fx.perCad, page, cc);
    const org = GJ.organicSeries(dates, days, sets, normPage, page, cc);
    const rows = ads.rows.map((r, j) => Object.assign(r, org.rows[j]));
    return res.status(200).json({ days: n, cc, page, basis: org.basis, campaigns: ads.campaigns, rows, ba: GJ.beforeAfter(rows), fx: { rates: fx.rates } });
  } catch (e) { return res.status(502).json({ error: 'data unavailable' }); }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.query && req.query.gsc) return gscHandler(req, res);
  if (req.query && req.query.vs) return vsHandler(req, res);
  const range = RANGES[req.query.range] ? req.query.range : '30d';
  const today = pacificDay(new Date());
  const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  const dates = range === 'today' ? [today] : range === 'yesterday' ? [yesterday] : lastNDayKeys(RANGES[range] + 1, new Date(Date.now() + 86400000)); // one extra (tomorrow UTC) so the accounts' own "today" is never missed
  try {
    const keys = [];
    for (const d of dates) keys.push(`adsdash:gads:${d}`, `adsdash:adsense:${d}`);
    const out = await redis([['MGET', ...keys], ['GET', 'adsdash:meta:gads'], ['GET', 'adsdash:meta:adsense'], ['GET', 'adsdash:fx'], ['GET', 'adsdash:premium']]);
    const vals = (out[0] && out[0].result) || [];
    const blobs = { gads: {}, adsense: {} };
    const have = [];
    dates.forEach((d, i) => {
      const g = vals[i * 2]; const a = vals[i * 2 + 1];
      if (g) blobs.gads[d] = JSON.parse(g);
      if (a) blobs.adsense[d] = JSON.parse(a);
      if (g || a) have.push(d);
    });
    const parse = (x) => { try { return x && x.result ? JSON.parse(x.result) : null; } catch { return null; } };
    const meta = { gads: parse(out[1]), adsense: parse(out[2]) };
    const fx = await fxRate((meta.gads && meta.gads.currency) || 'VND', parse(out[3]));
    // Ignore Google Ads days before the first day with AdSense earnings (old campaigns from before the site earned
    // anything would only make the comparison meaningless).
    const earned = have.filter((d) => blobs.adsense[d] && (blobs.adsense[d].dev || []).concat(blobs.adsense[d].pages || []).some((r) => r[1] > 0)).sort();
    const from = earned[0];
    const shown = from ? have.filter((d) => d >= from) : have;
    const pr = await premiumCached(out[4] && out[4].result);
    const pdays = premiumByDay(pr.pays);
    // Premium days count even before the first AdSense day / without Ads data, so they are added to the shown dates.
    const shownSet = new Set(shown);
    for (const d of dates) if (pdays[d] && !shownSet.has(d)) shownSet.add(d);
    blobs.premium = pdays;
    const agg = aggregate([...shownSet], blobs, fx.perCad, fx.rates && fx.rates.USD);
    const inRange = new Set(dates);
    const premium = { at: pr.at, stale: !!pr.stale, error: pr.error || null, account: PREM_TO,
      payments: pr.pays.filter((p) => inRange.has(p.d)).slice(-50).reverse().map((p) => ({ t: new Date(p.t).toISOString(), d: p.d, user: p.user, hbd: p.hbd, kind: p.kind })) };
    res.status(200).json(Object.assign({ range, today, tz: TZ, from: from || null, currency: 'CAD', adsCurrency: (meta.gads && meta.gads.currency) || 'VND', fx, meta, premium }, agg));
  } catch (e) {
    res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
module.exports.aggregate = aggregate;
module.exports.normPage = normPage;
module.exports.groupPage = groupPage;
module.exports.normDevice = normDevice;
module.exports.pacificDay = pacificDay;
module.exports.adSeries = adSeries;
module.exports.pacificDays = pacificDays;
module.exports.premiumPayments = premiumPayments;
module.exports.premiumByDay = premiumByDay;
module.exports.fetchPremium = fetchPremium;
