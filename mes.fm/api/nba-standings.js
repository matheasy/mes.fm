// Standings (and playoff results) for the MES Picks pages: mes.fm/nba-picks, nfl-picks, mlb-picks, nhl-picks, la-liga-picks, premier-league-picks.
//
// GET /api/nba-standings[?lg=nba|nfl|mlb|nhl|laliga|epl][&season=2027]
//   -> { v:2, lg, source:'ESPN', season, seasonName, seasonType, generated, started, over, gp:{group:avg games}, teams:[{id, full, name, short, city, conf, div, c1, c2, logo}],
//        groups:{ <conference key> | <division key> | L : [row] }, po: null | { started, done, champ, games, series:[...], reached:{stage:[ids]}, out:[ids], checked } }
//   row = { id, w, l, t?, otl?, pts?, gd?, gf?, gp, pct, seed, gb, streak, l10 }, in ESPN's published order (its tie-breaks); L = the whole league
//   (win %, NHL points, or the published table for soccer). lg defaults to nba. season (optional) = ESPN's season year (2003..next year).
//   No other client input.
// Source: ESPN's public site API (keyless; verified 2026-10-27): /standings (conferences or the table), /standings?level=3 (divisions), /teams (colours),
// and for the playoffs the scoreboard by month (?dates=YYYYMM; a date range answers 400) filtered to season.type 3. ESPN answers 403 to a user
// agent with a URL in it. Edge-cached 10 minutes (stale up to a day while it refreshes).
// Parsing lives in _nba-lib.js = a byte-identical copy of tool_apps_src/nba-picks/lib.js (the pages use the same code).
// node mes.fm/api/nba-standings.js --write [lg|all]  -> refreshes mes.fm/<slug>/data/sample.json (local previews + fallback)
const L = require('./_nba-lib.js');

const BASE = 'https://site.api.espn.com/apis/';
const UA = 'mes.fm-picks/1.0';   // ESPN answers 403 to a user agent with a URL in it
let memo = {};   // per warm instance: lg|season -> { t, data }

function lgParam(q) { const x = String(q || 'nba').toLowerCase(); return L.LEAGUES[x] ? x : null; }
function seasonParam(q) {
  const y = Number(q);
  const max = new Date().getUTCFullYear() + 1;
  return Number.isInteger(y) && y >= 2003 && y <= max ? y : null;
}

async function getJson(f, url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 120));
  } finally { clearTimeout(timer); }
}
// the playoff months of a season that have already begun (ESPN rejects date ranges, so one request per month / day)
function poDates(lg, season, now) {
  if (!lg.po || !season) return [];
  const today = Number((now || new Date()).toISOString().slice(0, 10).replace(/-/g, ''));
  return lg.po.months(season).filter((d) => Number(d.length === 6 ? d + '01' : d) <= today);
}

async function fetchStandings(lgId, season, fetchImpl, now) {
  lgId = lgId || 'nba';
  const lg = L.LEAGUES[lgId];
  const key = lgId + '|' + (season || 'cur'), hit = memo[key];
  if (hit && Date.now() - hit.t < 300000) return hit.data;
  const f = fetchImpl || fetch, q = season ? '?season=' + season : '';
  const base = BASE + 'v2/sports/' + lg.sport + '/standings';
  const [jConf, jDiv, jTeams] = await Promise.all([
    getJson(f, base + q),
    lg.divs ? getJson(f, base + (q ? q + '&' : '?') + 'level=3').catch(() => null) : null,
    getJson(f, BASE + 'site/v2/sports/' + lg.sport + '/teams?limit=100').catch(() => null),
  ]);
  const s = L.normEspn(lgId, jConf, jDiv, jTeams);
  if (!L.okStandings(s, lgId)) throw new Error('unexpected standings shape');
  let po = null;
  const dates = poDates(lg, s.season, now);
  if (dates.length) {
    const ctx = L.makeCtx(lgId, s), events = [];
    const got = await Promise.all(dates.map((d) => getJson(f, BASE + 'site/v2/sports/' + lg.sport + '/scoreboard?dates=' + d + '&limit=1000').catch(() => null)));
    got.forEach((j) => { if (j && j.events) j.events.forEach((e) => { if (e.season && e.season.type === 3) events.push(e); }); });
    po = L.poResults(ctx, events);
    po.checked = got.every(Boolean);
  }
  const data = Object.assign({ v: 2, source: 'ESPN', generated: new Date().toISOString() }, s,
    { seasonName: L.seasonLabel(s.season, lgId), espnSeasonName: s.seasonName || '', po });
  memo[key] = { t: Date.now(), data };
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const q = req.query || {};
    const lgId = lgParam(q.lg);
    if (!lgId) { res.setHeader('Cache-Control', 'no-store'); res.status(400).json({ error: 'unknown league' }); return; }
    const data = await fetchStandings(lgId, seasonParam(q.season));
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'standings unavailable', detail: e.message });
  }
};
module.exports.fetchStandings = fetchStandings;
module.exports.seasonParam = seasonParam;
module.exports.lgParam = lgParam;
module.exports.poDates = poDates;
module.exports._reset = () => { memo = {}; };

if (require.main === module && process.argv.includes('--write')) {
  const fs = require('fs'), path = require('path');
  const arg = process.argv[process.argv.indexOf('--write') + 1];
  const list = !arg || arg === 'all' ? L.LEAGUE_ORDER : [arg];
  (async () => {
    for (const lgId of list) {
      const dir = path.join(__dirname, '..', L.LEAGUES[lgId].slug, 'data');
      try {
        const d = await fetchStandings(lgId, null);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'sample.json'), JSON.stringify(d));
        console.log(lgId, 'wrote sample.json', d.seasonName, 'over', d.over, 'playoffs', d.po ? (d.po.done ? 'done ' + d.po.champ : d.po.started ? 'on' : 'not yet') : '-');
      } catch (e) { console.error(lgId, e.message); process.exitCode = 1; }
    }
  })();
}
