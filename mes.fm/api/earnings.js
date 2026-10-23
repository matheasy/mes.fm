// Data for the private mes.fm/ads page (behind the middleware.js password, like /portfolio).
// Reads the daily blobs written by api/earnings-ingest.js and joins AdSense earnings with Google Ads spend
// by day, landing page, country, device and campaign. Spend is converted to CAD (AdSense's currency) with a
// daily rate from open.er-api.com, cached in Redis for 12 h, fallback 18,396.41 VND per CAD (Oct 21, 2026).
// ?range=today|yesterday|7d|30d|90d|365d (days end today; the scripts send each account's own Pacific dates).
const { lastNDayKeys } = require('./_bucket-keys');

const RANGES = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
// Both Google accounts report in Pacific time (America/Vancouver), so "today" is the Pacific date. AdSense has no
// hourly report, so 'today' (so far) is the shortest range there is.
const TZ = 'America/Vancouver';
function pacificDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
const FX_FALLBACK = { VND: 18396.41, USD: 0.72, CAD: 1 };
const UNLISTED = '(pages AdSense did not list)';

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

function normDevice(d) {
  const s = String(d || '').toLowerCase();
  if (/desktop|computer/.test(s)) return 'desktop';
  if (/tablet/.test(s)) return 'tablet';
  if (/tv/.test(s)) return 'tv';
  if (/mobile|phone/.test(s)) return 'mobile';
  return 'other';
}

// Pure: blobs = { gads: {date: day}, adsense: {date: day} }, perCad = units of the Ads currency per 1 CAD.
function aggregate(dates, blobs, perCad) {
  const daily = [];
  const pages = new Map();
  const countries = new Map();
  const devices = new Map();
  const campaigns = new Map();
  const domains = new Map();
  const totals = { rev: 0, pv: 0, adImp: 0, adClicks: 0, spend: 0, clicks: 0, imp: 0 };
  const get = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };
  const cad = (micros) => micros / 1e6 / perCad;
  for (const d of dates.slice().sort()) {
    const g = blobs.gads[d];
    const a = blobs.adsense[d];
    const day = { d, rev: 0, pv: 0, spend: 0, clicks: 0, has: { gads: !!g, adsense: !!a } };
    if (a) {
      let pageRev = 0, pagePv = 0;
      for (const [url, earn, pv, imp, clk] of a.pages || []) {
        const p = get(pages, normPage(url), () => ({ rev: 0, pv: 0, adClicks: 0, spend: 0, clicks: 0 }));
        p.rev += earn; p.pv += pv; p.adClicks += clk;
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
        const p = get(pages, normPage(url), () => ({ rev: 0, pv: 0, adClicks: 0, spend: 0, clicks: 0 }));
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
    pages: list(pages, 'path').map(fixNums).sort((a, b) => (b.rev + b.spend) - (a.rev + a.spend)).slice(0, 400),
    countries: list(countries, 'cc').map(fixNums).sort((a, b) => (b.rev + b.spend) - (a.rev + a.spend)),
    devices: list(devices, 'dev').map(fixNums),
    campaigns: list(campaigns, 'name').map(fixNums).sort((a, b) => b.spend - a.spend),
    domains: list(domains, 'dom').map(fixNums).sort((a, b) => b.rev - a.rev),
  };
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

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const range = RANGES[req.query.range] ? req.query.range : '30d';
  const today = pacificDay(new Date());
  const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  const dates = range === 'today' ? [today] : range === 'yesterday' ? [yesterday] : lastNDayKeys(RANGES[range] + 1, new Date(Date.now() + 86400000)); // one extra (tomorrow UTC) so the accounts' own "today" is never missed
  try {
    const keys = [];
    for (const d of dates) keys.push(`adsdash:gads:${d}`, `adsdash:adsense:${d}`);
    const out = await redis([['MGET', ...keys], ['GET', 'adsdash:meta:gads'], ['GET', 'adsdash:meta:adsense'], ['GET', 'adsdash:fx']]);
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
    const agg = aggregate(shown, blobs, fx.perCad);
    res.status(200).json(Object.assign({ range, today, tz: TZ, from: from || null, currency: 'CAD', adsCurrency: (meta.gads && meta.gads.currency) || 'VND', fx, meta }, agg));
  } catch (e) {
    res.status(502).json({ error: 'data unavailable' });
  }
}

module.exports = handler;
module.exports.aggregate = aggregate;
module.exports.normPage = normPage;
module.exports.normDevice = normDevice;
module.exports.pacificDay = pacificDay;
