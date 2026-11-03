// Newest posts of the MES Links Telegram channel (t.me/meslinks), for the runtime top-up of mes.fm/telegram (the archive is a snapshot
// written by update_telegram_archive.py; this fills the gap until the next snapshot).
//
// GET /api/tg-latest -> {"channel":"meslinks","fetched":"<ISO>","posts":[...]} (the ~20 newest posts, oldest first, same shape as the
// archive's posts plus `img` = the live picture address on Telegram's CDN, which stops working after a while and is never stored).
//
// It fetches exactly one fixed address, https://t.me/s/meslinks (the channel's public web preview, no login / key). Nothing from the
// client is used (the query string is ignored), so this is not a proxy. Parsing is _tg-lib.js, a byte-identical copy of
// tool_apps_src/telegram/lib.js. A good answer is edge-cached for 10 minutes (stale for an hour while it revalidates); errors are never cached.
const T = require('./_tg-lib.js');
const URL = 'https://t.me/s/meslinks';
const UA = 'Mozilla/5.0 (compatible; mes.fm/1.0; +https://mes.fm/telegram)';

async function build(fetchImpl) {
	const f = fetchImpl || fetch;
	const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
	try {
		const res = await f(URL, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl ? ctl.signal : undefined });
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const page = T.parsePage(await res.text());
		if (!page.posts.length) throw new Error('no posts');
		const posts = page.posts.map((p) => {
			const o = T.clean(p);
			if (p.img && /^https:\/\/cdn\d*\.(telesco\.pe|telegram-cdn\.org)\//.test(p.img)) o.img = p.img;
			return o;
		});
		return { channel: T.CHANNEL, fetched: new Date().toISOString(), posts };
	} finally {
		if (timer) clearTimeout(timer);
	}
}

module.exports = async (req, res) => {
	try {
		const data = await build();
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600');
		res.status(200).send(JSON.stringify(data));
	} catch (e) {
		res.setHeader('Cache-Control', 'no-store');
		res.status(502).json({ error: 'Telegram unavailable' });
	}
};
module.exports.build = build;
module.exports.URL = URL;

if (require.main === module) build().then((d) => console.log(JSON.stringify(d, null, 1).slice(0, 3000)), (e) => { console.error(e); process.exit(1); });
