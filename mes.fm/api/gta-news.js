// GTA news headlines for the MES GTA 6 Hub (mes.fm/gta).
//
// GET /api/gta-news -> {"fetched":"<ISO>","items":[{title, link, source, date}], "feeds": {name: ok|error}}
//
// Reads a fixed list of gaming publishers' own RSS feeds (NEWS_FEEDS in _gta-lib.js, a byte-identical copy of tool_apps_src/gta/lib.js)
// and keeps the headlines about GTA / Rockstar: title + link to the original article only, newest first. Nothing from the client is
// used (the query string is ignored), so this is not a proxy. Google News RSS is deliberately not used (its feed terms allow personal,
// non-commercial use only). A good answer is edge-cached for 30 minutes (stale for a day while it revalidates); errors are never cached.
const G = require('./_gta-lib.js');
const UA = 'Mozilla/5.0 (compatible; mes.fm/1.0; +https://mes.fm/gta)';

async function one(f, name, url) {
	const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timer = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
	try {
		const res = await f(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined });
		if (!res.ok) throw new Error('HTTP ' + res.status);
		return G.parseRss(await res.text(), 200).map((x) => ({ title: x.title, link: x.link, source: name, date: x.date }));
	} finally { if (timer) clearTimeout(timer); }
}

async function build(fetchImpl) {
	const f = fetchImpl || fetch, feeds = {};
	const lists = await Promise.all(G.NEWS_FEEDS.map(([name, url]) => one(f, name, url).then((l) => { feeds[name] = 'ok'; return l; }, (e) => { feeds[name] = String(e && e.message || e).slice(0, 80); return []; })));
	let items = [].concat(...lists).filter((x) => G.aboutGta(x.title));
	items.sort((a, b) => b.date - a.date);
	const seen = {};
	items = items.filter((x) => { const k = x.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 40);
	if (!Object.values(feeds).some((v) => v === 'ok')) throw new Error('no feed answered');
	return { fetched: new Date().toISOString(), items, feeds };
}

module.exports = async (req, res) => {
	try {
		const data = await build();
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
		res.status(200).send(JSON.stringify(data));
	} catch (e) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(502).json({ error: 'news unavailable' });
	}
};
module.exports.build = build;

if (require.main === module) {
	build().then((d) => {
		if (process.argv.includes('--write')) { require('fs').writeFileSync(require('path').join(__dirname, '..', 'gta', 'data', 'news-sample.json'), JSON.stringify(d)); console.log('wrote gta/data/news-sample.json'); }
		console.log(JSON.stringify(d.feeds), d.items.length + ' items'); d.items.slice(0, 8).forEach((x) => console.log('-', x.source, '|', x.title));
	}, (e) => { console.error(e); process.exit(1); });
}
