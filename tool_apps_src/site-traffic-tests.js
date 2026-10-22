var T = require('./site-traffic/lib.js'), api = require('../mes.fm/api/site-traffic.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
eq(T.tier(1).label, 'Top 1,000', 'tier 1'); eq(T.tier(1000).label, 'Top 1,000', 'tier edge'); eq(T.tier(1001).label, 'Top 10,000', 'tier next'); eq(T.tier(2436887).label, 'Top 5 million', 'tier mes.fm'); eq(T.tier(9e9).label, 'Outside the list', 'tier outside');
eq(T.fmt(2436887), '2,436,887', 'fmt'); eq(T.compact(1500), '1.5k', 'compact k'); eq(T.compact(2436887), '2.4M', 'compact M'); eq(T.compact(12000), '12k', 'compact 12k');
var h = [{ date: 'a', rank: 4000000 }, { date: 'b', rank: 3000000 }, { date: 'c', rank: 2400000 }], t = T.trend(h);
eq(t.dir, 'rising', 'rising'); eq(t.change, 1600000, 'change'); eq(t.best.rank, 2400000, 'best'); eq(t.worst.rank, 4000000, 'worst'); eq(Math.round(t.pct), 40, 'pct');
eq(T.trend([{ date: 'a', rank: 100 }, { date: 'b', rank: 101 }]).dir, 'steady', 'steady'); eq(T.trend([{ date: 'a', rank: 100 }, { date: 'b', rank: 200 }]).dir, 'falling', 'falling'); eq(T.trend([{ date: 'a', rank: 1 }]), null, 'one point');
var s = T.spark(h, 100, 50, 5); eq(s.pts[0].y, 45, 'worst rank at the bottom'); eq(s.pts[2].y, 5, 'best rank at the top'); eq(s.pts[0].x, 5, 'x start'); eq(s.pts[2].x, 95, 'x end'); eq(T.spark([{ rank: 5 }, { rank: 5 }], 100, 50).pts.length, 2, 'flat series ok');
eq(T.yearsText([2003, 2004, 2007]), '2003 to 2007 (no capture in 2005, 2006)', 'years gaps'); eq(T.yearsText([2020]), '2020', 'one year');
var sg = T.signals({ apex: 'a.com', domain: 'a.com', rank: { ranked: true, rank: 500, date: '2026-10-21', history: h } }, null, 0); eq(sg[0].level, 'good', 'top site is good'); eq(/Top|popular|visited/.test(sg[0].text), true, 'signal text');
eq(T.signals({ apex: 'github.io', domain: 'me.github.io', shared: true, subdomain: true, rank: { ranked: true, rank: 131, history: [] } }, null, 0)[0].level, 'warn', 'shared platform warns');
eq(T.signals({ apex: 'a.com', domain: 'a.com', rank: { ranked: false } }, null, 0)[0].text.indexOf('Not in the Tranco list') === 0, true, 'unranked text');
eq(T.signals({ apex: 'a.com', domain: 'a.com', rank: { ranked: false } }, { rdap: { created: '2026-10-01T00:00:00Z' } }, Date.UTC(2026, 9, 22)).some(function (x) { return /21 days ago/.test(x.text); }), true, 'new domain note');
eq(T.links('x.com').length, 8, 'links'); eq(T.links('a b.com')[0][1].indexOf('a%20b.com') > 0, true, 'links encoded');
// no function may invent visits
eq(Object.keys(T).some(function (k) { return /visit/i.test(k); }), false, 'no visit estimator exists');
// api helpers
eq(api.registrable('www.example.com'), 'example.com', 'apex www'); eq(api.registrable('a.b.example.co.uk'), 'example.co.uk', 'apex co.uk'); eq(api.registrable('example.com'), 'example.com', 'apex plain'); eq(api.registrable('bbc.co.uk'), 'bbc.co.uk', 'apex bbc'); eq(api.registrable('foo.org.au'), 'foo.org.au', 'apex org.au'); eq(api.registrable('x.y.com.br'), 'y.com.br', 'apex com.br');
eq(api.isShared('github.io'), true, 'shared'); eq(api.isShared('example.com'), false, 'not shared');
eq(api.bucket(900), 'Top 1,000', 'bucket'); eq(api.bucket(6e6), null, 'bucket none');
['10.0.0.1', '127.0.0.1', '192.168.1.5', '172.16.0.1', '172.31.255.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1'].forEach(function (ip) { eq(api.ipv4Public(ip), false, 'private ' + ip); });
['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34'].forEach(function (ip) { eq(api.ipv4Public(ip), true, 'public ' + ip); });
['::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '2001:db8::1', 'ff02::1'].forEach(function (ip) { eq(api.ipv6Public(ip), false, 'private6 ' + ip); }); eq(api.ipv6Public('2606:4700::1111'), true, 'public6');
var d = api.detect({ server: 'nginx/1.2', 'cf-ray': 'abc', 'x-powered-by': 'PHP/8.2' }, '<html><meta name="generator" content="WordPress 6.5"><script src="/wp-content/x.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>');
var names = d.tech.map(function (x) { return x.name; }); ['nginx', 'Cloudflare', 'PHP', 'WordPress', 'Google Analytics'].forEach(function (x) { eq(names.indexOf(x) >= 0, true, 'detect ' + x); }); eq(names.filter(function (x) { return x === 'WordPress'; }).length, 1, 'no duplicate'); eq(d.generator, 'WordPress 6.5', 'generator');
eq(api.detect({}, '<html>plain</html>').tech.length, 0, 'nothing detected on plain page');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
