// Aggregator for mes.fm/signals (MES Market Signals). Informational only, never advice.
//
// GET /api/signals -> { v:1, generated, ms, sources: { <name>: { ok, data | error, ms } } }
//
// Fetches every source in parallel, each with its own timeout and try/catch, so one slow or broken publisher only blanks its own card.
// Keyless public sources only (nothing secret to leak). The client sends no input: the query string is ignored.
// Parsing / scoring lives in _signals-lib.js = a byte-identical copy of tool_apps_src/signals/lib.js (the page uses the same code).
// Edge-cached: s-maxage=300, stale-while-revalidate=3600. Endpoints verified 2026-10-24 (see CLAUDE.md, "MES Market Signals").
//
//   fng      api.alternative.me/fng            Crypto Fear & Greed, 400 days
//   coins    api.coingecko.com coins/markets   BTC ETH HIVE XRP SOL + 7-day sparkline
//   global   api.coingecko.com global          total crypto market cap, BTC / ETH dominance
//   stables  api.coingecko.com (stablecoins)   top 20 stablecoins' market cap
//   halving  mempool.space                     tip height + recent average block time
//   markets  Yahoo Finance v8 chart (keyless, unofficial), FRED fallback (S&P 500, Nasdaq, Dow, oil, dollar; gold has no FRED fallback)
//   stockfg  FRED SP500 + VIXCLS + BAMLH0A0HYM2  MES's own stock fear & greed composite (method in the lib)
//   rates    FRED DFF DFEDTARU DFEDTARL DGS2 DGS10
//   curve    FRED T10Y2Y (monthly average since 1976) + USREC
//   cpi      FRED CPIAUCSL -> year-over-year
//   boc      Bank of Canada Valet V39079       ecb  data-api.ecb.europa.eu DFR      boe  Bank of England IADB IUDBEDR
//   fed      federalreserve.gov press_monetary.xml
//   poly     gamma-api.polymarket.com /events (economy, fed, crypto, politics)
//   kalshi   api.elections.kalshi.com /trade-api/v2/events (KXFED, KXCPIYOY, KXRECSSNBER)
//   news     CoinDesk + Cointelegraph   mnews  CNBC Markets, MarketWatch, BBC Business   wnews  BBC World, Al Jazeera, NPR, Guardian, DW
//            (all RSS, list in lib NEWS_FEEDS: titles, links, the feed's one-line summary and a thumbnail from the publisher's own image host)
//   geo      gamma-api.polymarket.com /events (geopolitics, middle-east, ukraine, china tags), conflict questions only
//   geok     Kalshi KXHORMUZNORM (Strait of Hormuz)
const L = require('./_signals-lib.js');

const UA = 'mes.fm-signals/1.0 (+https://mes.fm/signals)';
async function get(url, ms, kind, headers) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 7000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: Object.assign({ 'user-agent': UA, accept: kind === 'json' ? 'application/json' : '*/*' }, headers || {}) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'json' ? await r.json() : await r.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 120));
  } finally { clearTimeout(t); }
}
const json = (u, ms, h) => get(u, ms, 'json', h), text = (u, ms) => get(u, ms, 'text');
const daysAgo = (n) => L.ymd(Date.now() - n * 864e5);
// FRED fredgraph.csv is keyless; one series per request (several ids at once come back as a zip)
const fredCache = {};
function fred(id, since, extra) { const k = id + since + (extra || ''); return fredCache[k] || (fredCache[k] = text('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + since + (extra || ''), 9000).then(L.parseFredCsv)); }
const YAHOO = { spx: ['^GSPC', 'S&P 500', 'SP500'], nasdaq: ['^IXIC', 'Nasdaq Composite', 'NASDAQCOM'], dow: ['^DJI', 'Dow Jones', 'DJIA'], gold: ['GC=F', 'Gold (oz)', null], oil: ['CL=F', 'Oil (WTI barrel)', 'DCOILWTICO'], dxy: ['DX-Y.NYB', 'US Dollar Index', null] };
// Yahoo first (same-day prices), FRED when Yahoo refuses (it is unofficial and sometimes blocks cloud addresses)
// one News-tab section: every feed of L.NEWS_FEEDS with that sec, in parallel; titles, links, one-line summaries and thumbnails only
async function feeds(sec) {
  const list = L.NEWS_FEEDS.filter((f) => f.sec === sec);
  const got = await Promise.allSettled(list.map((f) => text(f.url, 7000).then((x) => L.parseRss(x, 12, { sum: true, imgHosts: f.img }).map((i) => Object.assign({ src: f.name, sid: f.id }, i)))));
  const errs = []; got.forEach((g, i) => { if (g.status !== 'fulfilled') errs.push(list[i].name + ': ' + g.reason.message); });
  const items = L.mergeNews(got.map((g) => (g.status === 'fulfilled' ? g.value : [])), 12);
  if (!items.length) throw new Error(errs.join('; ') || 'no feed answered');
  return errs.length ? { items, missing: errs } : { items };
}
async function quote(k) {
  const y = YAHOO[k];
  try { const q = L.parseYahoo(await json('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(y[0]) + '?range=3mo&interval=1d', 6000, { 'user-agent': 'Mozilla/5.0 (compatible; mes.fm-signals/1.0)' })); q.name = y[1]; return q; }
  catch (e) { if (!y[2]) throw e; const q = L.quoteFromFred(await fred(y[2], daysAgo(120))); q.name = y[1]; q.note = 'Yahoo did not answer; FRED closing price (about a day behind)'; return q; }
}

const JOBS = {
  fng: async () => L.parseFng(await json('https://api.alternative.me/fng/?limit=400&format=json')),
  coins: async () => L.parseCoins(await json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,hive,ripple,solana&sparkline=true&price_change_percentage=24h,7d')),
  global: async () => L.parseGlobal(await json('https://api.coingecko.com/api/v3/global')),
  stables: async () => L.parseStables(await json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=20')),
  halving: async () => {
    const [h, d] = await Promise.all([text('https://mempool.space/api/blocks/tip/height'), json('https://mempool.space/api/v1/difficulty-adjustment').catch(() => null)]);
    return L.halving(+h, d && d.timeAvg, Date.now());
  },
  markets: async () => {
    const keys = Object.keys(YAHOO), got = await Promise.allSettled(keys.map(quote)), out = {}, errs = [];
    got.forEach((g, i) => { if (g.status === 'fulfilled') out[keys[i]] = g.value; else errs.push(keys[i] + ': ' + g.reason.message); });
    if (!Object.keys(out).length) throw new Error(errs.join('; '));
    if (errs.length) out._missing = errs;
    return out;
  },
  stockfg: async () => {
    const since = daysAgo(1000), [sp, vix, hy] = await Promise.all([fred('SP500', since), fred('VIXCLS', since), fred('BAMLH0A0HYM2', since)]);
    return L.stockFearGreed(sp, vix, hy, 260);
  },
  rates: async () => {
    const since = daysAgo(3 * 366), ids = ['DFF', 'DFEDTARU', 'DFEDTARL', 'DGS2', 'DGS10'], got = await Promise.all(ids.map((id) => fred(id, since).then(L.dropNull)));
    const s = {}; ids.forEach((id, i) => { s[id.toLowerCase()] = got[i]; });
    const two = {}; s.dgs2.forEach((p) => { two[p[0]] = p[1]; });
    s.spread = s.dgs10.filter((p) => two[p[0]] != null).map((p) => [p[0], L.round(p[1] - two[p[0]], 2)]);
    const latest = {}; Object.keys(s).forEach((k) => { latest[k] = L.last(s[k]); });
    const yearAgo = (k) => { const d = L.addDays(latest[k][0], -365), a = s[k].filter((p) => p[0] <= d); return a.length ? a[a.length - 1] : null; };
    return { latest, yearAgo: { dgs2: yearAgo('dgs2'), dgs10: yearAgo('dgs10'), dff: yearAgo('dff') }, target: L.policy(s.dfedtaru), lower: L.last(s.dfedtarl),
      dff: L.thin(s.dff, 400), dgs2: L.thin(s.dgs2, 400), dgs10: L.thin(s.dgs10, 400), spread: L.thin(s.spread, 400) };
  },
  curve: async () => {
    const [m, rec] = await Promise.all([fred('T10Y2Y', '1976-06-01', '&fq=Monthly&fam=avg'), fred('USREC', '1976-06-01')]);
    const mm = L.dropNull(m).map((p) => [p[0].slice(0, 7), p[1]]);
    return { m: mm, rec: L.recessions(rec), inv: L.belowZero(mm) };
  },
  cpi: async () => { const y = L.yoy(await fred('CPIAUCSL', daysAgo(6 * 366))); if (!y.length) throw new Error('no CPI'); return { yoy: y, latest: y[y.length - 1] }; },
  boc: async () => { const a = L.parseValet(await json('https://www.bankofcanada.ca/valet/observations/V39079/json?recent=400'), 'V39079'); const p = L.policy(a); p.hist = L.thin(a, 120); return p; },
  ecb: async () => L.policy(L.parseEcbCsv(await text('https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=12'))),
  boe: async () => L.policy(L.parseBoeCsv(await text('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&SeriesCodes=IUDBEDR&Datefrom=01/Jan/' + (new Date().getUTCFullYear() - 2) + '&Dateto=now&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N'))),
  fed: async () => { const it = L.parseRss(await text('https://www.federalreserve.gov/feeds/press_monetary.xml'), 12, { sum: true }); if (!it.length) throw new Error('empty feed'); return it; },
  poly: async () => {
    const cats = [['economy', 'Economy'], ['fed', 'Fed'], ['crypto', 'Crypto'], ['politics', 'Politics']];
    const got = await Promise.allSettled(cats.map((c) => json('https://gamma-api.polymarket.com/events?closed=false&active=true&tag_slug=' + c[0] + '&order=volume24hr&ascending=false&limit=8', 8000).then((j) => L.parsePolymarket(j, c[1]))));
    const seen = {}, out = [];
    got.forEach((g) => { if (g.status === 'fulfilled') g.value.forEach((e) => { if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } }); });
    if (!out.length) throw new Error(got.map((g) => g.reason && g.reason.message).filter(Boolean).join('; ') || 'no markets');
    return out;
  },
  kalshi: async () => {
    const ser = [['KXFED', 'Fed'], ['KXCPIYOY', 'Economy'], ['KXRECSSNBER', 'Economy']];
    const got = await Promise.allSettled(ser.map((s) => json('https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=' + s[0] + '&status=open&with_nested_markets=true&limit=3', 8000).then((j) => L.parseKalshi(j, s[1]))));
    const out = []; got.forEach((g) => { if (g.status === 'fulfilled') out.push.apply(out, g.value); });
    if (!out.length) throw new Error(got.map((g) => g.reason && g.reason.message).filter(Boolean).join('; ') || 'no markets');
    return out;
  },
  news: () => feeds('crypto'),
  mnews: () => feeds('markets'),
  wnews: () => feeds('world'),
  // Geopolitics: Polymarket conflict markets (war, ceasefire, invasion, blockade ...) from four tags, filtered by L.isConflict, biggest first
  geo: async () => {
    const tags = ['geopolitics', 'middle-east', 'ukraine', 'china'];
    const got = await Promise.allSettled(tags.map((t) => json('https://gamma-api.polymarket.com/events?closed=false&active=true&tag_slug=' + t + '&order=volume24hr&ascending=false&limit=12', 8000).then((j) => L.parsePolymarket(j, 'Geopolitics', { dated: true }))));
    const out = L.geoMarkets(got.filter((g) => g.status === 'fulfilled').map((g) => g.value)).slice(0, 24);
    if (!out.length) throw new Error(got.map((g) => g.reason && g.reason.message).filter(Boolean).join('; ') || 'no markets');
    return out;
  },
  // Kalshi's geopolitics series that had open markets on 2026-10-25 (Strait of Hormuz back to normal)
  geok: async () => {
    const got = await Promise.allSettled(['KXHORMUZNORM'].map((s) => json('https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=' + s + '&status=open&with_nested_markets=true&limit=3', 8000).then((j) => L.parseKalshi(j, 'Geopolitics'))));
    const out = L.geoMarkets(got.filter((g) => g.status === 'fulfilled').map((g) => g.value));
    if (!out.length) throw new Error(got.map((g) => g.reason && g.reason.message).filter(Boolean).join('; ') || 'no markets');
    return out;
  },
};

async function collect() {
  const t0 = Date.now(), names = Object.keys(JOBS), sources = {};
  await Promise.all(names.map(async (n) => {
    const t = Date.now();
    try { sources[n] = { ok: true, data: await JOBS[n](), ms: Date.now() - t }; }
    catch (e) { sources[n] = { ok: false, error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t }; }
  }));
  for (const k in fredCache) delete fredCache[k];
  return { v: 1, generated: new Date().toISOString(), ms: Date.now() - t0, sources };
}

module.exports = async (req, res) => {
  try {
    const out = await collect(), okN = Object.values(out.sources).filter((s) => s.ok).length;
    res.setHeader('Cache-Control', okN ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'no-store');
    res.status(okN ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'signals failed' });
  }
};
module.exports.collect = collect;
module.exports.JOBS = JOBS;

// node mes.fm/api/signals.js --write  -> refreshes the page's sample data (mes.fm/signals/data/sample.json, used by ?mock=1 and local previews)
if (require.main === module && process.argv.includes('--write')) {
  collect().then((o) => {
    require('fs').writeFileSync(require('path').join(__dirname, '..', 'signals', 'data', 'sample.json'), JSON.stringify(o));
    Object.entries(o.sources).forEach(([k, s]) => console.log(k.padEnd(8), s.ok ? 'ok' : 'FAIL ' + s.error, s.ms + 'ms'));
  });
}
