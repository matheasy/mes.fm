// NBA conference standings for mes.fm/nba-picks (MES NBA Picks).
//
// GET /api/nba-standings[?season=2027]  -> { v:1, source:'ESPN', season, seasonName, seasonType, generated, gp:{E,W}, conf:{ E:[row], W:[row] } }
//   row = { id, w, l, pct, gb, seed, streak, l10 }, in ESPN's published order (its tie-breaks). id = our 3-letter team id (lib.js TEAMS).
// season (optional) = the year the season ends (2027 = 2026-27), 2003..next year; anything else is ignored. No other client input.
// Source: ESPN's public standings feed (keyless; verified 2026-10-26). Edge-cached 10 minutes (stale up to a day while it refreshes).
// Parsing lives in _nba-lib.js = a byte-identical copy of tool_apps_src/nba-picks/lib.js (the page uses the same code).
// node mes.fm/api/nba-standings.js --write  -> refreshes mes.fm/nba-picks/data/sample.json (local previews + fallback)
const L = require('./_nba-lib.js');

const URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const UA = 'mes.fm-nba/1.0';   // ESPN answers 403 to a user agent with a URL in it
let memo = {};   // per warm instance: season -> { t, data }

function seasonParam(q) {
  const y = Number(q);
  const max = new Date().getUTCFullYear() + 1;
  return Number.isInteger(y) && y >= 2003 && y <= max ? y : null;
}

async function fetchStandings(season, fetchImpl) {
  const key = season || 'cur', hit = memo[key];
  if (hit && Date.now() - hit.t < 300000) return hit.data;
  const f = fetchImpl || fetch, ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await f(URL + (season ? '?season=' + season : ''), { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = L.normEspn(await r.json());
    if (!L.okStandings(s)) throw new Error('unexpected standings shape');
    const data = { v: 1, source: 'ESPN', season: s.season, seasonName: s.seasonName || L.seasonLabel(s.season), seasonType: s.seasonType,
      generated: new Date().toISOString(), gp: { E: Math.round(L.gamesPlayed(s.conf.E) * 10) / 10, W: Math.round(L.gamesPlayed(s.conf.W) * 10) / 10 }, conf: s.conf };
    memo[key] = { t: Date.now(), data };
    return data;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 120));
  } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const season = seasonParam(req.query && req.query.season);
    const data = await fetchStandings(season);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'standings unavailable', detail: e.message });
  }
};
module.exports.fetchStandings = fetchStandings;
module.exports.seasonParam = seasonParam;
module.exports._reset = () => { memo = {}; };

if (require.main === module && process.argv.includes('--write')) {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'nba-picks', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fetchStandings(null).then((d) => {
    fs.writeFileSync(path.join(dir, 'sample.json'), JSON.stringify(d));
    console.log('wrote sample.json', d.seasonName, 'games played E', d.gp.E, 'W', d.gp.W);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
