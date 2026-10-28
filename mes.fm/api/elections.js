// Aggregator for mes.fm/elections (MES Elections). Neutral: market prices are passed through as the markets' own numbers.
//
// GET /api/elections -> { v:1, generated, ms, sources: { <name>: { ok, data | error, ms } } }
//
// Each source runs in parallel with its own timeout and try/catch, so one slow publisher only blanks its own card.
// Keyless public sources only. The client sends no input: the query string is ignored.
// Parsing / seat maths live in _elections-lib.js = a byte-identical copy of tool_apps_src/elections/lib.js (the page uses the same code).
// Edge-cached: s-maxage=300, stale-while-revalidate=3600. Endpoints checked 2026-10-27.
//
//   races    gamma-api.polymarket.com /events?tag_slug=midterms (every open event, 100 per page, ordered by id so pages never skip),
//            plus events that closed after 2 Nov 2026 (settled races) -> every House, Senate and governor race + the overview markets
//   kalshiH  api.elections.kalshi.com CONTROLH (which party wins the House)     kalshiS  CONTROLS (the Senate)
//   commons  ourcommons.ca party standings CSV (the House of Commons today)
//   bcenr    results.elections.bc.ca (Elections BC event-night reporting: initial / final count of the 24 Oct 2026 election)
const L = require('./_elections-lib.js');

const UA = 'mes.fm-elections/1.0 (+https://mes.fm/elections)';
async function get(url, ms, kind) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: kind === 'json' ? 'application/json' : '*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'json' ? await r.json() : await r.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 120));
  } finally { clearTimeout(t); }
}
const json = (u, ms) => get(u, ms, 'json'), text = (u, ms) => get(u, ms, 'text');
const PM = 'https://gamma-api.polymarket.com/events?tag_slug=midterms&order=id&ascending=true&limit=100';

// all open midterm events: fetch pages in parallel batches until a short page comes back (about 13 pages today)
async function pmOpen() {
  const all = [];
  for (let start = 0; start < 40; start += 8) {
    const offs = []; for (let i = start; i < start + 8; i++) offs.push(i * 100);
    const got = await Promise.all(offs.map((o) => json(PM + '&closed=false&offset=' + o, 9000)));
    let short = false;
    got.forEach((g) => { if (!Array.isArray(g)) throw new Error('not a list'); all.push.apply(all, g); if (g.length < 100) short = true; });
    if (short) break;
  }
  return all;
}
async function pmClosed() {
  const out = [];
  for (let o = 0; o < 1500; o += 100) {
    const g = await json(PM + '&closed=true&end_date_min=2026-11-02T00:00:00Z&offset=' + o, 9000);
    if (!Array.isArray(g)) break; out.push.apply(out, g); if (g.length < 100) break;
  }
  return out;
}

const JOBS = {
  races: async () => {
    const [open, closed] = await Promise.all([pmOpen(), pmClosed().catch(() => [])]);
    const ev = open.concat(closed), races = L.parseRaces(ev);
    if (!races.H.length && !races.S.length) throw new Error('no race markets');
    return { races, overview: L.parseOverview(ev), events: ev.length, settled: closed.length };
  },
  kalshiH: async () => L.parseKalshiControl(await json('https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=CONTROLH&status=open&with_nested_markets=true&limit=3', 8000)),
  kalshiS: async () => L.parseKalshiControl(await json('https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=CONTROLS&status=open&with_nested_markets=true&limit=3', 8000)),
  commons: async () => L.parseCommonsCsv(await text('https://www.ourcommons.ca/members/en/party-standings/csv', 8000)),
  bcenr: async () => L.parseBcEnr(await text('https://results.elections.bc.ca/', 9000)),
};

async function collect() {
  const t0 = Date.now(), names = Object.keys(JOBS), sources = {};
  await Promise.all(names.map(async (n) => {
    const t = Date.now();
    try { sources[n] = { ok: true, data: await JOBS[n](), ms: Date.now() - t }; }
    catch (e) { sources[n] = { ok: false, error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t }; }
  }));
  return { v: 1, generated: new Date().toISOString(), ms: Date.now() - t0, sources };
}

module.exports = async (req, res) => {
  try {
    const out = await collect(), okN = Object.values(out.sources).filter((s) => s.ok).length;
    res.setHeader('Cache-Control', okN ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'no-store');
    res.status(okN ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'elections failed' });
  }
};
module.exports.collect = collect;
module.exports.JOBS = JOBS;

// node mes.fm/api/elections.js --write  -> refreshes the page's sample data (mes.fm/elections/data/sample.json, used by ?mock=1 and local previews)
if (require.main === module && process.argv.includes('--write')) {
  collect().then((o) => {
    const fs = require('fs'), p = require('path'), dir = p.join(__dirname, '..', 'elections', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p.join(dir, 'sample.json'), JSON.stringify(o));
    Object.entries(o.sources).forEach(([k, s]) => console.log(k.padEnd(8), s.ok ? 'ok' : 'FAIL ' + s.error, s.ms + 'ms'));
  });
}
