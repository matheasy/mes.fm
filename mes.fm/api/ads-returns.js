const { lastNDayKeys } = require('./_bucket-keys');

// Do Google Ads visitors come back? Reads the cohort sets written by api/track.js:
//   ads:arr:<day>      browsers whose first Google Ads click was on <day>, per landing page
//   ads:ret1:<day>     ... of those, how many came back (not via an ad) on at least 1 later day
//   ads:ret5:<day>     ... on at least 5 later days
//   ads:retdays:<day>  ... total later days they came back on
// ?range=7d|30d|90d picks the arrival days. 4 Redis commands per day, so it is CDN-cached.
const RANGES = { '7d': 7, '30d': 30, '90d': 90 };
const KINDS = ['arr', 'ret1', 'ret5', 'retdays'];

module.exports = async (req, res) => {
  const range = RANGES[req.query.range] ? req.query.range : '30d';
  const days = lastNDayKeys(RANGES[range], new Date());
  const commands = [];
  days.forEach((d) => KINDS.forEach((k) => commands.push(['ZRANGE', `ads:${k}:${d}`, '0', '-1', 'WITHSCORES'])));

  let results;
  try {
    const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    results = await r.json();
    if (!Array.isArray(results)) throw new Error('bad response');
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'stats unavailable' });
    return;
  }

  const pages = {};
  const youngArrivals = { arr: 0 }; // arrived in the last 7 days: too new to judge
  results.forEach((item, i) => {
    const kind = KINDS[i % KINDS.length];
    const age = Math.floor(i / KINDS.length); // 0 = today
    const flat = (item && item.result) || [];
    for (let j = 0; j + 1 < flat.length; j += 2) {
      const sep = flat[j].indexOf('|');
      const path = sep === -1 ? flat[j] : flat[j].slice(sep + 1);
      const p = pages[path] || (pages[path] = { path, arrivals: 0, returned: 0, loyal: 0, returnDays: 0 });
      const n = Number(flat[j + 1]) || 0;
      if (kind === 'arr') { p.arrivals += n; if (age < 7) youngArrivals.arr += n; }
      else if (kind === 'ret1') p.returned += n;
      else if (kind === 'ret5') p.loyal += n;
      else p.returnDays += n;
    }
  });

  const rows = Object.values(pages).filter((p) => p.arrivals > 0).sort((a, b) => b.arrivals - a.arrivals);
  const totals = rows.reduce((t, p) => {
    t.arrivals += p.arrivals; t.returned += p.returned; t.loyal += p.loyal; t.returnDays += p.returnDays; return t;
  }, { arrivals: 0, returned: 0, loyal: 0, returnDays: 0 });

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({ range, rows, totals, recentArrivals: youngArrivals.arr, updatedAt: new Date().toISOString() });
};
