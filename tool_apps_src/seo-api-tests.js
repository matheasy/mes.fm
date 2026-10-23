// node tool_apps_src/seo-api-tests.js : mes.fm/api/seo.js with a fake network (global fetch mocked: DNS-over-HTTPS answers + web servers).
// Covers input refusal, private / reserved addresses, redirects re-checked hop by hop, size cap, robots.txt and sitemap (index) lookup.
var api = require('../mes.fm/api/seo.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
function ok(c, m) { eq(!!c, true, m); }

var DNS = {}, SITES = {}, LOG = [];
function dns(host, a, aaaa) { DNS[host] = { A: a || [], AAAA: aaaa || [] }; }
function site(url, status, body, headers) { SITES[url] = { status: status, body: body == null ? '' : body, headers: headers || {} }; }
global.fetch = async function (url, opts) {
	url = String(url); LOG.push(url);
	if (url.indexOf('https://cloudflare-dns.com/dns-query') === 0) {
		var u = new URL(url), h = u.searchParams.get('name'), t = u.searchParams.get('type'), rec = DNS[h];
		var ans = rec ? rec[t].map(function (ip) { return { type: t === 'A' ? 1 : 28, data: ip }; }) : [];
		return new Response(JSON.stringify({ Status: rec ? 0 : 3, Answer: ans }), { status: 200, headers: { 'content-type': 'application/dns-json' } });
	}
	ok(opts && opts.redirect === 'manual', 'redirects are always manual: ' + url);
	ok(!(opts && opts.headers && (opts.headers.cookie || opts.headers.Cookie)), 'no cookies sent');
	var s = SITES[url];
	if (!s) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
	return new Response(s.status >= 300 && s.status < 400 ? null : s.body, { status: s.status, headers: Object.assign({ 'content-type': 'text/html; charset=utf-8' }, s.headers) });
};
function call(q) {
	return new Promise(function (resolve) {
		var res = { code: 0, h: {}, setHeader: function (k, v) { this.h[k.toLowerCase()] = v; }, status: function (c) { this.code = c; return this; }, json: function (o) { resolve({ code: this.code, h: this.h, j: o }); } };
		api({ query: q }, res);
	});
}
function fetched(prefix) { return LOG.filter(function (u) { return u.indexOf(prefix) === 0; }).length; }

var PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Good page title for testing the checker</title><meta name="description" content="A page used by the tests."><link rel="canonical" href="https://good.com/page"></head><body><h1>Hello</h1><p>Text.</p><a href="/x">x</a></body></html>';
dns('good.com', ['93.184.216.34']); dns('www.good.com', ['93.184.216.34']); dns('hop2.com', ['8.8.8.8'], ['2606:4700::1111']);
dns('evil.com', ['10.0.0.5']); dns('mixed.com', ['8.8.4.4', '127.0.0.1']); dns('v6evil.com', [], ['fd00::1']); dns('meta.com', ['169.254.169.254']); dns('internal.com', ['192.168.1.1']);
site('https://good.com/page', 200, PAGE, { 'content-encoding': 'gzip', 'strict-transport-security': 'max-age=63072000', 'set-cookie': 'sid=secret' });
site('https://good.com/robots.txt', 200, 'User-agent: *\nDisallow: /private\nSitemap: https://good.com/sitemap_index.xml', { 'content-type': 'text/plain' });
site('https://good.com/sitemap_index.xml', 200, '<sitemapindex><sitemap><loc>https://good.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://good.com/page-sitemap.xml</loc></sitemap></sitemapindex>', { 'content-type': 'application/xml' });
site('https://good.com/page-sitemap.xml', 200, '<urlset><url><loc>https://good.com/page</loc></url></urlset>', { 'content-type': 'application/xml' });
site('https://good.com/post-sitemap.xml', 200, '<urlset><url><loc>https://good.com/a-post</loc></url></urlset>', { 'content-type': 'application/xml' });
site('https://good.com/private', 200, PAGE.replace('<link rel="canonical" href="https://good.com/page">', ''));
// redirect chains
site('http://good.com/r1', 301, null, { location: 'https://www.good.com/r2' });
site('https://www.good.com/r2', 302, null, { location: 'https://hop2.com/r3' });
site('https://hop2.com/r3', 308, null, { location: '/final' });
site('https://hop2.com/final', 200, PAGE);
site('https://good.com/to-private', 302, null, { location: 'https://internal.com/admin' });
site('https://good.com/to-ip', 302, null, { location: 'http://169.254.169.254/latest/meta-data/' });
site('https://good.com/to-port', 302, null, { location: 'https://good.com:8443/x' });
site('https://good.com/to-file', 302, null, { location: 'file:///etc/passwd' });
site('https://good.com/to-local', 301, null, { location: 'http://localhost/' });
site('https://good.com/to-userinfo', 301, null, { location: 'https://a:b@good.com/' });
for (var i = 0; i < 6; i++) site('https://good.com/loop' + i, 302, null, { location: '/loop' + (i + 1) });
site('https://good.com/big', 200, '<html><head><title>Big</title></head><body>' + 'x'.repeat(2000000) + '</body></html>');
site('https://good.com/pdf', 200, '%PDF-1.4', { 'content-type': 'application/pdf' });

(async function () {
	// --- refused inputs never touch the network ---
	var bad = ['ftp://good.com/', 'http://localhost/', 'https://127.0.0.1/', 'http://[::1]/', 'http://10.1.2.3/', 'http://user:pw@good.com/', 'http://good.com:8080/', 'javascript:alert(1)', '', 'http://printer.local/', 'https://2130706433/'];
	for (var b of bad) { LOG = []; var r = await call({ u: b }); eq(r.code, 400, 'refused: ' + b); eq(LOG.length, 0, 'no fetch for ' + b); eq(r.h['cache-control'], 'no-store', 'errors not cached: ' + b); }
	// --- names that resolve to private / reserved addresses ---
	for (var h of ['evil.com', 'mixed.com', 'v6evil.com', 'meta.com', 'nowhere-xyz.com']) {
		LOG = []; var r2 = await call({ u: 'https://' + h + '/' });
		ok(r2.j.error, 'error for ' + h); eq(fetched('https://' + h), 0, 'page never fetched for ' + h);
	}
	// --- happy path ---
	LOG = []; var g = await call({ u: 'good.com/page' });
	eq(g.code, 200, 'ok status'); eq(g.j.finalUrl, 'https://good.com/page', 'final url'); eq(g.j.status, 200, 'page status'); eq(g.j.chain.length, 1, 'no redirect');
	eq(g.j.page.title, 'Good page title for testing the checker', 'title parsed'); eq(g.j.https, true, 'https');
	eq(g.j.headers['content-encoding'], 'gzip', 'header kept'); eq(g.j.headers['set-cookie'], undefined, 'cookies dropped'); ok(g.j.headers['strict-transport-security'], 'hsts kept');
	eq(g.j.robots.found, true, 'robots found'); eq(g.j.robots.google.allowed, true, 'robots allows'); eq(g.j.robots.sitemaps, ['https://good.com/sitemap_index.xml'], 'robots sitemaps');
	eq(g.j.sitemap.found, true, 'sitemap found'); eq(g.j.sitemap.inSitemap, true, 'in sitemap via child'); eq(g.j.sitemap.where, 'https://good.com/page-sitemap.xml', 'ranked child checked'); eq(g.j.sitemap.matched, 'https://good.com/page', 'matched address');
	eq(fetched('https://good.com/post-sitemap.xml'), 0, 'better child first, stops when found');
	eq(g.h['cache-control'].indexOf('s-maxage=600') >= 0, true, 'edge cached 10 min');
	ok(!('text' in g.j) && JSON.stringify(g.j).indexOf('<body>') < 0, 'raw HTML not returned');
	var gp = await call({ u: 'https://good.com/private' }); eq(gp.j.robots.any.allowed, false, 'robots disallow found'); eq(gp.j.robots.google.agent, '*', 'googlebot falls back to *'); eq(gp.j.sitemap.inSitemap, false, 'not in sitemap');
	// --- redirects: followed, every hop re-checked ---
	LOG = []; var rr = await call({ u: 'http://good.com/r1' });
	eq(rr.j.finalUrl, 'https://hop2.com/final', 'followed 3 redirects'); eq(rr.j.chain.map(function (c) { return c.status; }), [301, 302, 308, 200], 'chain statuses');
	ok(LOG.some(function (u) { return u.indexOf('dns-query?name=www.good.com') > 0; }) && LOG.some(function (u) { return u.indexOf('dns-query?name=hop2.com') > 0; }), 'each new host resolved');
	var cases = [['to-private', 'internal.com'], ['to-ip', '169.254.169.254'], ['to-port', 'good.com:8443'], ['to-file', 'file:'], ['to-local', 'localhost'], ['to-userinfo', 'https://a:b@']];
	for (var c of cases) { LOG = []; var x = await call({ u: 'https://good.com/' + c[0] }); ok(x.j.error, 'refused redirect ' + c[0]); eq(LOG.filter(function (u) { return u.indexOf('dns-query') < 0 && u.indexOf(c[1]) >= 0; }).length, 0, 'never fetched target of ' + c[0]); eq(x.j.page, undefined, 'no page for ' + c[0]); }
	LOG = []; var lp = await call({ u: 'https://good.com/loop0' }); ok(/More than 4 redirects/.test(lp.j.error), 'redirect limit'); eq(fetched('https://good.com/loop'), 5, '4 hops followed, then stop');
	// --- size cap, non-HTML ---
	var big = await call({ u: 'https://good.com/big' }); eq(big.j.truncated, true, 'big page truncated'); ok(big.j.bytes <= 1500000 + 70000, 'read stops near 1.5 MB (' + big.j.bytes + ')'); eq(big.j.page.title, 'Big', 'still parsed');
	var pdf = await call({ u: 'https://good.com/pdf' }); eq(pdf.j.page, null, 'pdf has no page facts'); eq(pdf.j.contentType, 'application/pdf', 'content type');
	var nf = await call({ u: 'https://good.com/missing' }); eq(nf.j.status, 404, '404 reported, not an error'); ok(nf.j.page, '404 page still parsed');
	// helpers
	eq(api.hopHost('https://Good.com/x'), 'good.com', 'hopHost ok'); eq(api.hopHost('https://good.com:443/'), 'good.com', 'default port ok'); eq(api.hopHost('http://good.com:81/'), null, 'other port'); eq(api.hopHost('gopher://good.com/'), null, 'gopher');
	console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('CRASH', e); process.exit(1); });
