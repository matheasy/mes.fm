/* node tool_apps_src/how-much-do-youtubers-make-tests.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Y = require("./how-much-do-youtubers-make/lib.js");
const near = (a, b, e) => assert(Math.abs(a - b) <= (e == null ? 1e-9 : e), a + " vs " + b);

// the RPM tables are a copy of the calculator's: compare with youtubemoney/app.js so they cannot drift
const src = fs.readFileSync(path.join(__dirname, "youtubemoney", "app.js"), "utf8");
const m = /var NICHES = (\[[\s\S]*?\n\t\]);/.exec(src);
assert(m, "NICHES found in youtubemoney/app.js");
assert.deepStrictEqual(Y.NICHES, eval(m[1]), "NICHES identical to the calculator's");
assert.deepStrictEqual(Y.SHORTS, eval(/var SHORTS = (\[[^\]]*\])/.exec(src)[1]), "SHORTS identical");
assert.deepStrictEqual(Object.keys(Y.GEO_NAMES), ["1", "0.7", "0.35"]);

// RPM / estimate maths
const r = Y.rpmRange("education", "1", 0);
near(r.lo, 3); near(r.mid, 4.5); near(r.hi, 8);
const g = Y.rpmRange("education", "0.35", 0);
near(g.mid, 4.5 * 0.35);
const b = Y.rpmRange("kids", "1", 0.5);   // 50 % Shorts
near(b.mid, 0.5 * 1.2 + 0.5 * 0.035); near(b.lo, 0.5 * 0.5 + 0.5 * 0.01); near(b.hi, 0.5 * 2.5 + 0.5 * 0.07);
near(Y.rpmRange("kids", "1", 5).mid, 0.035, 1e-12);   // shorts share clamped to 1
near(Y.rpmRange("nope", "1", 0).mid, 2.5);            // unknown topic -> "mix"
const ch = { id: "UCaaaaaaaaaaaaaaaaaaaaaa", handle: "x", name: "X", topic: "tech", geo: "1", subscribers: 1e6, recent: { medianViews: 1e6, uploadsPerMonth: 4 } };
const e = Y.estimate(ch);
near(e.views, 4e6); near(e.month.lo, 4e6 * 4 / 1000); near(e.month.mid, 4e6 * 6 / 1000); near(e.month.hi, 4e6 * 12 / 1000); near(e.year.mid, e.month.mid * 12);
assert.strictEqual(e.lifetime, undefined, "no lifetime cross-check without totalViews");
near(Y.estimate(ch, { geo: "0.35" }).month.mid, e.month.mid * 0.35);
near(Y.estimate(ch, { shorts: 0.25 }).month.mid, 4e6 * (0.75 * 6 + 0.25 * 0.035) / 1000);
assert.strictEqual(Y.estimate({ topic: "tech", geo: "1", recent: { medianViews: null, uploadsPerMonth: 3 } }), null, "no data -> no estimate");
const lt = Y.estimate(Object.assign({}, ch, { totalViews: 1e9, publishedAt: "2016-10-03" }));
near(lt.lifetime.total, 1e9 * 6 / 1000); assert(lt.lifetime.years > 9 && lt.lifetime.years < 12);

// recent summary: median of the newest 15 uploads older than 7 days, rate from the last 90 days
const NOW = 1_800_000_000, D = 86400;
const vids = [];
for (let i = 0; i < 30; i++) vids.push({ ts: NOW - (i * 5 + 1) * D, views: 1000 * (i + 1) });   // every 5 days, newest first
let s = Y.recentSummary(vids, NOW);
assert.strictEqual(s.videosSampled, 15);
// the first one (1 day old) and the second (6 days) are too young; the sample is uploads #3..#17 (views 3000..17000) -> median 10000
assert.strictEqual(s.medianViews, 10000);
near(s.uploadsPerMonth, 18 / (90 / 30.4375), 0.06);   // 18 uploads fall inside the last 90 days
assert.strictEqual(Y.recentSummary([], NOW).medianViews, null);
assert.strictEqual(Y.recentSummary([{ ts: NOW - D, views: 5 }], NOW).uploadsPerMonth, null, "one upload: no rate");
const rare = Y.recentSummary([{ ts: NOW - 400 * D, views: 10 }, { ts: NOW - 200 * D, views: 20 }, { ts: NOW - 20 * D, views: 30 }], NOW);
near(rare.uploadsPerMonth, 2 / 380 * 30.4375, 0.06);   // fewer than 3 uploads in 90 days: the sample's own span
assert.strictEqual(rare.medianViews, 20);

// JS (lib), the Vercel function and the Python collector agree
const API = require("../mes.fm/api/youtuber-stats.js");
assert.deepStrictEqual(API.recentSummary(vids, NOW), s);
assert.deepStrictEqual(API.recentSummary([], NOW), Y.recentSummary([], NOW));
assert.deepStrictEqual(API.recentSummary(vids.slice(0, 9), NOW), Y.recentSummary(vids.slice(0, 9), NOW));

// formatting
assert.strictEqual(Y.money(812), "$812"); assert.strictEqual(Y.money(12345), "$12.3K"); assert.strictEqual(Y.money(1234567), "$1.2M"); assert.strictEqual(Y.money(123456), "$123K"); assert.strictEqual(Y.money(null), "n/a");
assert.strictEqual(Y.compact(519000000), "519M"); assert.strictEqual(Y.compact(21300000), "21.3M"); assert.strictEqual(Y.compact(950), "950");

// sort / filter / csv / query
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mes.fm", "how-much-do-youtubers-make", "data", "channels.json"), "utf8"));
assert.deepStrictEqual(Y.validate(snap), [], "committed snapshot is valid");
const rows = Y.decorate(snap.channels, {});
assert.strictEqual(rows.length, snap.channels.length);
const ranks = rows.map((x) => x.rank).sort((a, b) => a - b);
assert.deepStrictEqual(ranks, rows.map((_, i) => i + 1), "ranks are 1..n");
const bySubs = Y.sortRows(rows, "subs", "desc");
for (let i = 1; i < bySubs.length; i++) assert(bySubs[i - 1].ch.subscribers >= bySubs[i].ch.subscribers);
const byMonth = Y.sortRows(rows, "month", "desc").filter((x) => x.est);
for (let i = 1; i < byMonth.length; i++) assert(byMonth[i - 1].est.month.mid >= byMonth[i].est.month.mid);
const asc = Y.sortRows(rows, "name", "asc");
for (let i = 1; i < asc.length; i++) assert(asc[i - 1].ch.name.toLowerCase() <= asc[i].ch.name.toLowerCase());
const fake = [{ ch: { name: "A", handle: "a", topic: "tech", subscribers: 1 }, rank: 1, est: null }, { ch: { name: "B", handle: "b", topic: "tech", subscribers: 2 }, rank: 2, est: { views: 5, month: { mid: 5 }, year: { mid: 60 } } }];
assert.strictEqual(Y.sortRows(fake, "month", "asc")[1].ch.name, "A", "no estimate sorts last ascending");
assert.strictEqual(Y.sortRows(fake, "month", "desc")[1].ch.name, "A", "...and descending");
assert(Y.filterRows(rows, "tech", "").every((x) => x.ch.topic === "tech") && Y.filterRows(rows, "tech", "").length > 0);
assert.strictEqual(Y.filterRows(rows, "", "mkbhd").length, 1);
assert.strictEqual(Y.filterRows(rows, "", "marques  brownlee").length, 1, "words in any order, extra spaces ok");
assert.strictEqual(Y.filterRows(rows, "kids", "mkbhd").length, 0);
const csv = Y.toCsv(rows.slice(0, 3), snap.generated).trim().split("\n");
assert.strictEqual(csv.length, 4); assert(csv[0].startsWith("rank,channel,handle"));
assert.strictEqual(Y.toCsv([{ rank: 1, ch: { name: 'He said "hi", ok', handle: "h", topic: "tech", subscribers: 1, recent: {} }, est: null }], "d").split("\n")[1].split(",")[1], '"He said ""hi""');
assert.strictEqual(Y.calcLink(ch, e), "/youtubemoney?mode=earn&f=long&v=4000000&per=month&n=tech&geo=1");
assert.strictEqual(Y.calcLink(ch, null), "/youtubemoney");
assert.deepStrictEqual(Y.parseQuery("?q=a&t=tech&sort=month&dir=desc&geo=0.7&sh=25"), { q: "a", t: "tech", sort: "month", dir: "desc", geo: "0.7", sh: "25" });
assert.deepStrictEqual(Y.parseQuery("?t=bogus&sort=bogus&geo=9&sh=3&dir=x"), { q: "", t: "", sort: "subs", dir: "desc", geo: "", sh: "0" });
assert.strictEqual(Y.buildQuery({ q: "", t: "tech", sort: "subs", dir: "desc", geo: "", sh: "0" }), "?t=tech");
assert.strictEqual(Y.buildQuery(Y.parseQuery("")), "");

// schema validation catches problems
const clone = () => JSON.parse(JSON.stringify(snap));
let bad = clone(); bad.channels[1].id = bad.channels[0].id; assert(Y.validate(bad).some((x) => /duplicate id/.test(x)));
bad = clone(); bad.channels[0].topic = "nope"; assert(Y.validate(bad).some((x) => /unknown topic/.test(x)));
bad = clone(); bad.channels[0].geo = "2"; assert(Y.validate(bad).some((x) => /bad geo/.test(x)));
bad = clone(); delete bad.channels[0].recent; assert(Y.validate(bad).some((x) => /no recent/.test(x)));
bad = clone(); bad.channels[0].id = "abc"; assert(Y.validate(bad).some((x) => /bad id/.test(x)));
assert(Y.validate({}).length && Y.validate(null).length);
snap.channels.forEach((c) => assert(c.recent.medianViews != null && c.recent.uploadsPerMonth != null, c.handle + " has an estimate"));

// the Vercel function: 503 without a key; mocked success with one; errors are no-store and never leak the key
(async () => {
	const mk = () => { const o = { headers: {}, code: null, body: null, setHeader(k, v) { o.headers[k] = v; }, status(c) { o.code = c; return o; }, json(b) { o.body = b; return o; }, send(b) { o.body = b; return o; } }; return o; };
	delete process.env.YOUTUBE_API_KEY;
	let res = mk(); await API({}, res);
	assert.strictEqual(res.code, 503); assert.deepStrictEqual(res.body, { error: "no key" }); assert.strictEqual(res.headers["Cache-Control"], "no-store");

	const small = Object.assign({}, snap, { channels: snap.channels.slice(0, 2) });
	const now = Date.now() / 1000, iso = (d) => new Date((now - d * 86400) * 1000).toISOString();
	const calls = [];
	const fakeFetch = async (url) => {
		calls.push(url);
		const u = new URL(url); const ep = u.pathname.split("/").pop();
		assert.strictEqual(u.searchParams.get("key"), "SECRET");
		const ok = (o) => ({ ok: true, status: 200, json: async () => o });
		if (ep === "channels") return ok({ items: small.channels.map((c, i) => ({ id: c.id, snippet: { title: c.name + " Live", publishedAt: "2010-05-01T00:00:00Z" }, statistics: { subscriberCount: String(1000000 * (i + 1)), viewCount: "5000000000", videoCount: "800" }, contentDetails: { relatedPlaylists: { uploads: "UU" + c.id.slice(2) } } })) });
		if (ep === "playlistItems") return ok({ items: [3, 10, 17, 24].map((d, i) => ({ contentDetails: { videoId: "v" + i, videoPublishedAt: iso(d) } })) });
		if (ep === "videos") return ok({ items: [0, 1, 2, 3].map((i) => ({ id: "v" + i, statistics: { viewCount: String(1000 * (i + 1)) }, contentDetails: { duration: i === 0 ? "PT45S" : "PT12M30S" } })) });
		throw new Error("unexpected " + ep);
	};
	const out = await API.build("SECRET", small, fakeFetch);
	assert.strictEqual(out.source, "youtube-data-api"); assert.strictEqual(out.channels.length, 2);
	assert.strictEqual(out.channels[0].subscribers, 2000000, "sorted by subscribers, live number used");
	assert.strictEqual(out.channels[0].totalViews, 5e9);
	assert.strictEqual(out.channels[0].recent.medianViews, 3000, "the 45 s upload (a Short) is dropped; median of 2000, 3000, 4000");
	assert.deepStrictEqual(Y.validate(out), [], "live answer passes the same schema check");
	assert.strictEqual(calls.length, 1 + 2 * 2, "1 channels.list + playlistItems + videos per channel");
	// the handler end to end with the global fetch mocked
	process.env.YOUTUBE_API_KEY = "SECRET";
	const realFetch = global.fetch; global.fetch = fakeFetch;
	res = mk(); await API({}, res);
	global.fetch = realFetch;
	assert.strictEqual(res.code, 200); assert(/s-maxage=86400/.test(res.headers["Cache-Control"]) && /stale-while-revalidate=604800/.test(res.headers["Cache-Control"]));
	assert.deepStrictEqual(Y.validate(JSON.parse(res.body)), []);
	assert(!res.body.includes("SECRET"));
	// API failure -> 502, no-store, no key in the body
	global.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
	res = mk(); await API({}, res);
	global.fetch = realFetch;
	assert.strictEqual(res.code, 502); assert.strictEqual(res.headers["Cache-Control"], "no-store"); assert(!JSON.stringify(res.body).includes("SECRET"));
	delete process.env.YOUTUBE_API_KEY;
	console.log("all tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
