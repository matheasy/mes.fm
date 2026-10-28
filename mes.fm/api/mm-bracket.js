// NCAA tournament bracket + results for mes.fm/march-madness (MES March Madness).
//
// GET /api/mm-bracket?g=m|w[&y=2027]
//   -> the tournament of that year as { v, g, year, regions[4], teams{}, leaves[64], ff[], games{}, lock, status, pairing, generated, live }
//      (see _mm-lib.js normEspn), with ESPN's live win probability on games in progress (games[g].wp = chance of team a).
//   -> { pending:true, g, year, opens:'2027-03-14', last:2026 } when that year's field is not out yet (the page then plays the last one).
// y defaults to the tournament "now": this year from March 1, else the coming one. Only g and y are read (y 2010..next year); no other input.
// Source: ESPN's public men's / women's college basketball scoreboard (keyless; one request per day of the tournament window, Selection
// Sunday + 1 to + 24 days; verified 2026-10-27), and its game summary for the live win probability of games in progress.
// Cache: 30 s while a game is on, 5 min during the tournament, 1 day once it is over or before the field is known.
// Parsing lives in _mm-lib.js = a byte-identical copy of tool_apps_src/march-madness/lib.js (the page uses the same code).
// Semifinal pairing: taken from ESPN's Final Four games once they have teams; before that from PAIRING below (set it after Selection
// Sunday from the official bracket, e.g. 'm-2027': ['East', 'South']), else the order the regions first appear (the page says "assumed").
//
// node mes.fm/api/mm-bracket.js --write [year]  -> writes mes.fm/march-madness/data/m-<year>.json and w-<year>.json (snapshots the page
//   loads for past tournaments and for local previews). Run it once the tournament is over (and any time during it for the local sample).
const L = require('./_mm-lib.js');

const UA = 'mes.fm-mm/1.0';   // ESPN answers 403 to a user agent with a URL in it
const BASE = { m: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/', w: 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/' };
const PAIRING = {
  // 'm-2027': ['East', 'South'],   // the two regions that meet in the first semifinal (fill in after Selection Sunday if ESPN's Final Four games have no teams yet)
};
let memo = {};

// the tournament the page should show "now": this year's until the end of April, then the coming one
function currentYear(now) { const d = now || new Date(); return d.getUTCMonth() >= 4 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); }
function yearParam(q, now) { const y = Number(q); const max = (now || new Date()).getUTCFullYear() + 1; return Number.isInteger(y) && y >= 2010 && y <= max ? y : null; }

async function getJson(f, url, ms) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function fetchTournament(g, year, fetchImpl, opts) {
  const f = fetchImpl || fetch, key = g + '-' + year, hit = memo[key];
  if (hit && Date.now() - hit.t < (hit.data.status === 'live' ? 20000 : 120000)) return hit.data;
  const days = L.windowDays(year);
  const res = await Promise.all(days.map((d) => getJson(f, BASE[g] + 'scoreboard?dates=' + d + '&groups=100&limit=200').then((j) => j.events || [], () => null)));
  const failed = res.filter((x) => x === null).length;
  if (failed > days.length / 2) throw new Error('ESPN scoreboard unavailable');
  const events = [].concat.apply([], res.filter(Boolean));
  const T = L.normEspn(events, g, year, PAIRING[key]);
  T.partial = failed > 0;
  if (L.okTournament(T) && !(opts && opts.noLive)) {
    const live = Object.keys(T.games).filter((k) => T.games[k].st === 'in').slice(0, 16);
    await Promise.all(live.map((k) => getJson(f, BASE[g] + 'summary?event=' + T.games[k].id, 6000).then((j) => {
      const wp = j && j.winprobability; if (wp && wp.length) L.setLive(T, +k, wp[wp.length - 1].homeWinPercentage);
    }, () => {})));
  }
  T.source = 'ESPN';
  memo[key] = { t: Date.now(), data: T };
  return T;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = req.query || {}, g = q.g === 'w' ? 'w' : 'm', now = new Date();
  const asked = yearParam(q.y, now), year = asked || currentYear(now);
  const opens = L.selectionSunday(year);
  try {
    // before Selection Sunday nothing can be fetched for that year
    if (now.toISOString().slice(0, 10) < opens) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.status(200).json({ pending: true, g, year, opens, last: year - 1 });
      return;
    }
    const T = await fetchTournament(g, year, null);
    if (!L.okTournament(T)) {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      res.status(200).json({ pending: true, g, year, opens, last: year - 1, note: 'The field is not on ESPN yet.' });
      return;
    }
    const anyLive = Object.keys(T.games).some((k) => T.games[k].st === 'in');
    res.setHeader('Cache-Control', anyLive ? 'public, s-maxage=30, stale-while-revalidate=120' : T.status === 'final' ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).json(T);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'bracket unavailable', detail: String(e.message || e).slice(0, 120) });
  }
};
module.exports.fetchTournament = fetchTournament;
module.exports.currentYear = currentYear;
module.exports.yearParam = yearParam;
module.exports.PAIRING = PAIRING;
module.exports._reset = () => { memo = {}; };

if (require.main === module && process.argv.includes('--write')) {
  const fs = require('fs'), path = require('path');
  const y = Number(process.argv.find((a) => /^\d{4}$/.test(a))) || currentYear(new Date()) - 1;
  const dir = path.join(__dirname, '..', 'march-madness', 'data');
  fs.mkdirSync(dir, { recursive: true });
  (async () => {
    for (const g of ['m', 'w']) {
      try {
        const T = await fetchTournament(g, y, null, { noLive: true });
        if (!L.okTournament(T)) { console.log(g, y, 'no complete field yet'); continue; }
        delete T.partial;
        fs.writeFileSync(path.join(dir, g + '-' + y + '.json'), JSON.stringify(T));
        console.log('wrote', g + '-' + y + '.json', T.status, 'games', Object.keys(T.games).length, 'pairing', T.pairing, T.regions.join(' / '));
        // data/index.json = the years the page can load from the snapshots
        const ix = path.join(dir, 'index.json');
        let idx = { m: [], w: [] }; try { idx = JSON.parse(fs.readFileSync(ix, 'utf8')); } catch (e) {}
        idx[g] = Array.from(new Set((idx[g] || []).concat(y))).sort();
        idx[g + 'status'] = Object.assign({}, idx[g + 'status'] || {}, { [y]: T.status });
        fs.writeFileSync(ix, JSON.stringify(idx));
      } catch (e) { console.error(g, y, e.message); process.exitCode = 1; }
    }
  })();
}
