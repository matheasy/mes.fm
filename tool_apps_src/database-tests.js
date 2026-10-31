// node tool_apps_src/database-tests.js -- MES Video Database helpers (tool_apps_src/database/lib.js) + a check of mes.fm/database/data.json
var V = require('./database/lib.js'), fs = require('fs'), path = require('path'), n = 0, fails = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { fails++; console.log('FAIL ' + m + ': ' + A + ' vs ' + B); } }
function ok(c, m) { n++; if (!c) { fails++; console.log('FAIL ' + m); } }

var R = [
	{ y: 'aaaaaaaaaaa', t: 'Definition of Derivative Simple Explanation', d: '2011-12-16', u: 171, v: 50000, s: ['math', 'derivatives'], n: 1, x: 'A simple explanation', L: { h: '@mes/definition-of-derivative', b: 'abc123def' } },
	{ y: 'bbbbbbbbbbb', t: '✈️#911Truth Part 37: Energetic Dust and Fumes on 9/11', d: '2026-10-20', u: 456, v: 300, s: ['911'], n: 1300, L: { m: '911-cold-dust-fumes', r: 'v7fd0nc-x.html', sp: 'mes/abc', o: '@mes:8/Name:7', tg: 'meslinks/35489' } },
	{ y: '', t: 'Removed Video on Rumble', d: '2019-05-01', u: 0, v: -1, s: ['911'], L: { r: 'vabc-removed.html' } },
	{ y: 'ccccccccccc', t: 'MES Livestream 99: Hutchison Effect', d: '', u: 7200, v: 12, s: ['hutchison', 'livestreams'], k: 1, L: {} },
	{ y: 'ddddddddddd', t: 'Ételé Ünique Integrals', d: '2015-01-02', u: 600, v: 0, s: ['math', 'integrals'], n: 500, L: { pdf: 'mes.fm/some-pdf' } }
];
var labels = { math: 'Math tutorials', derivatives: 'Derivatives', '911': '9/11 Truth', hutchison: 'Hutchison Effect', livestreams: 'MES Livestreams', integrals: 'Integrals' };

// links
eq(V.links(R[1]).map(function (l) { return l.name; }), ['MES.fm', 'YouTube', '3Speak', 'Rumble', 'Odysee', 'Telegram'], 'links in platform order');
eq(V.linkUrl(R[0], 'h'), 'https://peakd.com/@mes/definition-of-derivative', 'Hive link');
eq(V.linkUrl(R[0], 'b'), 'https://www.bitchute.com/video/abc123def/', 'BitChute link');
eq(V.linkUrl(R[1], 'sp'), 'https://3speak.tv/watch?v=mes/abc', '3Speak link');
eq(V.linkUrl(R[1], 'o'), 'https://odysee.com/@mes:8/Name:7', 'Odysee link');
eq(V.linkUrl(R[1], 'tg'), 'https://t.me/meslinks/35489', 'Telegram link');
eq(V.linkUrl(R[4], 'pdf'), 'https://mes.fm/some-pdf', 'notes link gets https');
eq(V.mainUrl(R[1]), 'https://mes.fm/911-cold-dust-fumes', 'card opens the mes.fm page first');
eq(V.mainUrl(R[0]), 'https://youtu.be/aaaaaaaaaaa', 'else YouTube');
eq(V.mainUrl(R[2]), 'https://rumble.com/vabc-removed.html', 'else the first other link');
eq(V.thumb(R[2]), '', 'no thumbnail without a YouTube id');
ok(V.thumb(R[0]).indexOf('/vi/aaaaaaaaaaa/mqdefault.jpg') > 0, 'thumbnail url');
eq(V.copyText(R[0]).split('\n'), ['Definition of Derivative Simple Explanation', 'YouTube: https://youtu.be/aaaaaaaaaaa', 'Hive: https://peakd.com/@mes/definition-of-derivative', 'BitChute: https://www.bitchute.com/video/abc123def/'], 'copy text');

// search
function q(s, st) { return V.filter(R, Object.assign({ q: s, p: [] }, st || {}), labels).map(function (r) { return r.t; }); }
eq(q('derivative simple').length, 1, 'every word must match');
eq(q('9/11 dust').length, 1, '9/11 search');
eq(q('#1300').length, 1, 'search by number');
eq(q('unique etele').length, 1, 'accents ignored');
eq(q('hutchison').length, 1, 'series label searchable');
eq(q('tegral').length, 1, 'inner match for 4+ letter words');
eq(q('ex').length, 1, 'short words match word starts only (explanation)');
eq(q('', { s: '911' }).length, 2, 'series filter');
eq(q('', { p: ['r'] }).length, 2, 'platform filter');
eq(q('', { p: ['r', 'sp'] }).length, 1, 'platforms are ANDed');
eq(q('', { p: ['y'] }).length, 4, 'has YouTube');
eq(q('', { yr: '2011' }).length, 1, 'year filter');
eq(q('', { live: 'only' }).length, 1, 'livestreams only');
eq(q('', { live: 'hide' }).length, 4, 'livestreams hidden');

// counts ignore their own filter
var c = V.counts(R, { q: '', s: '911', p: [], yr: '' }, labels);
eq(c.s['911'], 2, 'series count'); eq(c.s.math, 2, 'other series still counted while one is picked');
eq(c.p.r, 2, 'platform counts follow the picked series'); eq(c.yr['2026'], 1, 'year counts');

// sorting
eq(V.sortRecs(R, 'date').map(function (r) { return r.d; }), ['2026-10-20', '2019-05-01', '2015-01-02', '2011-12-16', ''], 'newest first, no date last');
eq(V.sortRecs(R, 'date', 'asc')[0].d, '2011-12-16', 'oldest first');
eq(V.sortRecs(R, 'date', 'asc')[4].d, '', 'no date last either way');
eq(V.sortRecs(R, 'views')[0].v, 50000, 'most views first');
eq(V.sortRecs(R, 'views')[4].v, -1, 'unknown views last');
eq(V.sortRecs(R, 'length')[0].u, 7200, 'longest first');
eq(V.sortRecs(R, 'title').map(function (r) { return r.t.slice(0, 6); }), ['✈️#911', 'Defini', 'Ételé ', 'MES Li', 'Remove'], 'A-Z (emoji ignored, accents folded)');

// query state round trip
var st = V.parseQuery('?q=hutchison%20effect&s=911&p=r,sp,zz&yr=2020&live=only&sort=views&dir=asc&view=table&pg=3');
eq([st.q, st.s, st.p, st.yr, st.live, st.sort, st.dir, st.view, st.pg], ['hutchison effect', '911', ['r', 'sp'], '2020', 'only', 'views', 'asc', 'table', 3], 'parse query (unknown platform dropped)');
eq(V.parseQuery(V.toQuery(st)), st, 'round trip');
eq(V.toQuery(V.parseQuery('')), '', 'defaults give an empty query');
eq(V.toQuery({ q: '', s: '', p: [], sort: 'views', dir: 'desc', view: 'grid', pg: 1 }), '?sort=views', 'default direction left out');
eq(V.parseQuery('?s=<script>&sort=evil&view=x&pg=-4&yr=20x0').s, '', 'bad series key ignored');
eq(V.parseQuery('?sort=evil').sort, 'date', 'bad sort ignored');

// formatting
eq(V.fmtDur(171), '2:51', 'm:ss'); eq(V.fmtDur(7325), '2:02:05', 'h:mm:ss'); eq(V.fmtDur(0), '', 'unknown length');
eq(V.fmtViews(999), '999', 'views < 1000'); eq(V.fmtViews(1234), '1.2K', '1.2K'); eq(V.fmtViews(56789), '57K', '57K'); eq(V.fmtViews(1250000), '1.3M', '1.3M'); eq(V.fmtViews(-1), '', 'unknown views');
eq(V.fmtDate('2011-12-16'), 'Dec 16, 2011', 'date');
eq(V.page([1, 2, 3, 4, 5], 9, 2), { items: [5], pg: 3, pages: 3 }, 'page past the end clamps');
var csv = V.csv([R[1]], labels).split('\r\n');
eq(csv[0].split(',').slice(0, 7), ['Number', 'Title', 'Date', 'Length', 'Views', 'Series', 'MES.fm'], 'csv header');
ok(csv[1].indexOf('"✈️#911Truth Part 37: Energetic Dust and Fumes on 9/11"') < 0 && csv[1].indexOf('9/11 Truth') > 0, 'csv row (no needless quotes, series label)');

// the generated data file
var f = path.join(__dirname, '..', 'mes.fm', 'database', 'data.json');
if (fs.existsSync(f)) {
	var raw = fs.readFileSync(f, 'utf8'), d = JSON.parse(raw), keys = {};
	d.series.forEach(function (s) { keys[s[0]] = 1; });
	ok(d.videos.length === d.count && d.count > 1000, 'data.json count');
	ok(raw.length < 1200000, 'data.json under 1.2 MB (' + Math.round(raw.length / 1024) + ' KB)');
	var ids = {}, dup = 0, badS = 0, badL = 0, noLink = 0;
	d.videos.forEach(function (r) {
		if (r.y) { if (ids[r.y]) dup++; ids[r.y] = 1; }
		(r.s || []).forEach(function (s) { if (!keys[s]) badS++; });
		Object.keys(r.L || {}).forEach(function (k) { if (!V.PMAP[k]) badL++; });
		if (!V.links(r).length) noLink++;
	});
	eq(dup, 0, 'no YouTube id twice'); eq(badS, 0, 'every series key has a label'); eq(badL, 0, 'every link key is a platform'); eq(noLink, 0, 'every video has a link');
	ok(!/dropbox\.com|sdrv\.ms|vid\.me|liveleak|bit\.tube|d\.tube/i.test(raw), 'no private / dead-platform links in data.json');
	ok(!/update_video/.test(raw), 'no BitChute edit links');
}
console.log((fails ? fails + ' of ' : 'all ') + n + ' checks ' + (fails ? 'FAILED' : 'passed'));
process.exit(fails ? 1 : 0);
