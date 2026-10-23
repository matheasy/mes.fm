// node tool_apps_src/seo-tests.js : parser, robots.txt matcher, sitemap, pixel widths, checks and scoring of mes.fm/seo (tool_apps_src/seo/lib.js)
var fs = require('fs'), path = require('path'), L = require('./seo/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
function ok(c, m) { eq(!!c, true, m); }
function find(list, id) { return list.filter(function (c) { return c.id === id; })[0] || {}; }

// the API's copy must be the same file
eq(fs.readFileSync(path.join(__dirname, 'seo/lib.js'), 'utf8') === fs.readFileSync(path.join(__dirname, '../mes.fm/api/_seo-lib.js'), 'utf8'), true, 'mes.fm/api/_seo-lib.js is identical to tool_apps_src/seo/lib.js (run: cp tool_apps_src/seo/lib.js mes.fm/api/_seo-lib.js)');

// ---- input ----
eq(L.normalizeInput('example.com').url, 'https://example.com/', 'adds https');
eq(L.normalizeInput('http://Example.com/a?b=1#frag').url, 'http://example.com/a?b=1', 'keeps http, drops hash, lower host');
eq(L.normalizeInput('www.x.co.uk/p').host, 'www.x.co.uk', 'host');
['ftp://x.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'https://foo.localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/a', 'http://[::1]/', 'http://user:pw@x.com/', 'http://x.com:8080/', 'x.com:22', 'printer.local', 'http://intranet/', 'http://2130706433/', 'http://0x7f.0.0.1/', ''].forEach(function (s) { ok(L.normalizeInput(s).error, 'refuses ' + s); });
eq(L.normalizeInput('https://x.com:443/').url, 'https://x.com/', 'default https port is fine');

// ---- extract ----
var html = fs.readFileSync(path.join(__dirname, 'seo/fixtures/good.html'), 'utf8'), f = L.extract(html, 'https://shop.example.org/blue-widget?ref=x');
eq(f.title, 'Blue Widget – Strong & Light | Example Shop', 'title decoded');
eq(f.titleCount, 1, 'svg <title> is not the page title');
eq(f.description.length > 120, true, 'description read');
eq(f.canonical, 'https://shop.example.org/blue-widget', 'canonical absolute');
eq(f.canonicalRelative, false, 'canonical not relative');
eq(f.lang, 'en-CA', 'lang'); eq(f.charset, 'utf-8', 'charset'); eq(f.viewport, 'width=device-width, initial-scale=1', 'viewport');
eq(f.robotsMeta, 'index, follow, max-image-preview:large', 'robots meta');
eq(f.hreflang.length, 3, 'hreflang count'); eq(f.hreflang[1], { lang: 'fr-CA', href: 'https://shop.example.org/fr/widget-bleu' }, 'hreflang resolved');
eq(f.headingCounts[1], 1, 'one h1'); eq(f.headings[0], { level: 1, text: 'Blue Widget' }, 'h1 text'); eq(f.headingSkip, null, 'no skip');
eq(f.og.title, 'Blue Widget', 'og:title'); eq(f.ogImage, 'https://shop.example.org/img/widget-1200.jpg', 'og:image'); eq(f.twitter.card, 'summary_large_image', 'twitter card');
eq(f.jsonld.length, 2, 'two json-ld'); eq(f.jsonld[0].types, ['Product', 'Offer', 'Brand'], 'nested types'); eq(f.jsonld[1].types.indexOf('BreadcrumbList') >= 0, true, '@graph types');
eq(f.images.count, 3, 'images'); eq(f.images.missingAlt, 0, 'all have alt'); eq(f.images.emptyAlt, 1, 'decorative');
eq(f.links.internal, 3, 'internal links (www and bare host count as one site)'); eq(f.links.external, 2, 'external'); eq(f.links.nofollow, 1, 'nofollow'); eq(f.links.ugcSponsored, 1, 'sponsored');
eq(f.favicon, 'https://shop.example.org/favicon-48.png', 'favicon');
eq(f.words > 150, true, 'word count from body only (scripts / styles ignored)'); eq(/var x/.test(f.firstText), false, 'script text not counted');
eq(f.words < 400, true, 'word count sane');
// broken / weird markup
var g = L.extract('<html><head><title>A</title><title>B</title><meta name="description" content="one"><meta name="DESCRIPTION" content="two"><link rel="canonical" href="/x"><link rel="canonical" href="/y"><meta name=robots content=noindex>' +
	'<script>if (a < b) { document.write("<h1>fake</h1>") }</script><script type="application/ld+json">{bad json}</script></head><body><!-- <h1>commented</h1> --><h2>Only h2</h2><h4>Skip</h4><img src=a.png><img src="b.png" alt><a href="#top">top</a><a href="mailto:x@y.z">m</a><a href="https://other.com/"></a></body></html>', 'http://site.com/page');
eq([g.title, g.titleCount, g.descriptionCount, g.canonicalCount], ['A', 2, 2, 2], 'duplicates counted');
eq(g.canonicalRelative, true, 'relative canonical'); eq(g.robotsMeta, 'noindex', 'unquoted attribute'); eq(g.headingCounts[1], 0, 'h1 inside script / comment ignored');
eq(g.headingSkip, { from: 2, to: 4, text: 'Skip' }, 'heading skip'); eq(g.images.missingAlt, 1, 'missing alt'); eq(g.images.emptyAlt, 1, 'empty alt');
eq([g.links.total, g.links.external, g.links.emptyText], [1, 1, 1], 'links: anchors / mailto skipped, empty text');
eq(g.jsonld[0].ok, false, 'bad json-ld flagged');
eq(L.extract('<base href="https://cdn.x.com/b/"><link rel=canonical href="p.html">', 'https://x.com/a').canonical, 'https://cdn.x.com/b/p.html', 'base href');
eq(L.decode('&amp;&#8211;&#x2014;&nbsp;&bogus;'), '&–— &bogus;', 'entities');

// ---- robots.txt ----
var rb = L.parseRobots('# comment\nUser-agent: *\nDisallow: /private/\nDisallow: /*.pdf$\nAllow: /private/ok\nDisallow: /search\n\nUser-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /nogoogle\nAllow: /\n\nUser-agent: BadBot\nDisallow: /\nSitemap: https://x.com/sitemap.xml\nsitemap: https://x.com/s2.xml');
eq(rb.groups.length, 3, 'groups'); eq(rb.groups[1].agents, ['googlebot', 'bingbot'], 'agents grouped'); eq(rb.sitemaps, ['https://x.com/sitemap.xml', 'https://x.com/s2.xml'], 'sitemaps');
function al(u, a) { return L.robotsCheck(rb, 'https://x.com' + u, a).allowed; }
eq(al('/private/x', '*'), false, '* disallow'); eq(al('/private/ok', '*'), true, 'longer allow wins'); eq(al('/private/ok/deeper', '*'), true, 'allow prefix');
eq(al('/doc.pdf', '*'), false, '$ end + *'); eq(al('/doc.pdf?x=1', '*'), true, '$ end does not match with query'); eq(al('/searching', '*'), false, 'prefix match');
eq(al('/private/x', 'googlebot'), true, 'googlebot uses its own group, not *'); eq(al('/nogoogle/a', 'googlebot'), false, 'googlebot disallow'); eq(al('/nogoogle', 'bingbot'), false, 'bingbot in the same group');
eq(al('/anything', 'badbot'), false, 'disallow all'); eq(al('/robots.txt', 'badbot'), true, 'robots.txt itself');
eq(L.robotsCheck(rb, 'https://x.com/nogoogle', 'googlebot').rule, 'Disallow: /nogoogle', 'rule reported');
eq(L.robotsCheck(L.parseRobots('User-agent: *\nDisallow:'), 'https://x.com/a', '*').allowed, true, 'empty disallow = allow all');
eq(L.robotsCheck(L.parseRobots(''), 'https://x.com/a', 'googlebot').allowed, true, 'empty file');
eq(L.robotsCheck(L.parseRobots('User-agent: other\nDisallow: /'), 'https://x.com/a', 'googlebot').allowed, true, 'no matching group');
var tie = L.parseRobots('User-agent: *\nDisallow: /page\nAllow: /page');
eq(L.robotsCheck(tie, 'https://x.com/page', '*').allowed, true, 'tie goes to allow');
eq(L.robotsCheck(L.parseRobots('User-agent: *\nDisallow: /a%20b'), 'https://x.com/a%20b/c', '*').allowed, false, 'percent-encoded');
eq(L.robotsCheck(L.parseRobots('User-agent: *\nDisallow: /*?'), 'https://x.com/p?q=1', '*').allowed, false, 'query rule');

// ---- sitemaps ----
var si = L.parseSitemap('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x.com/s-pages.xml</loc></sitemap><sitemap><loc> https://x.com/s-posts.xml </loc></sitemap></sitemapindex>');
eq(si, { type: 'index', locs: ['https://x.com/s-pages.xml', 'https://x.com/s-posts.xml'] }, 'index');
eq(L.parseSitemap('<urlset><url><loc><![CDATA[https://x.com/a?b=1&c=2]]></loc></url><url><loc>https://x.com/a?b=1&amp;c=3</loc></url></urlset>').locs, ['https://x.com/a?b=1&c=2', 'https://x.com/a?b=1&c=3'], 'cdata + entities');
eq(L.parseSitemap('https://x.com/a\nhttps://x.com/b\n').type, 'text', 'text sitemap'); eq(L.parseSitemap('<html>nope</html>').type, 'unknown', 'not a sitemap');
eq(L.sameUrl('https://X.com/a/', 'https://x.com/a'), true, 'trailing slash'); eq(L.sameUrl('https://x.com/a/index.html', 'https://x.com/a/'), true, 'index.html');
eq(L.sameUrl('http://x.com/a', 'https://x.com/a'), false, 'scheme differs'); eq(L.sameUrl('http://www.x.com/a', 'https://x.com/a', true), true, 'loose match');
eq(L.sameUrl('https://x.com/a?b=1', 'https://x.com/a'), false, 'query matters');
eq(L.rankChildren(['https://x.com/post-sitemap.xml', 'https://x.com/product-sitemap.xml', 'https://x.com/page-sitemap.xml'], 'https://x.com/product/blue-widget')[0], 'https://x.com/product-sitemap.xml', 'child ranking');

// ---- pixel widths / preview ----
ok(L.pxWidth('WWWW', 20) > L.pxWidth('iiii', 20) * 3, 'wide vs narrow letters');
var t = L.truncatePx('A very long title that keeps going and going far beyond what any search engine would ever show in a result', 580, 20);
eq(t.cut, true, 'cut'); ok(L.pxWidth(t.text, 20) <= 580, 'cut text fits'); ok(/…$/.test(t.text), 'ellipsis');
eq(L.truncatePx('Short', 580, 20).cut, false, 'short not cut');
var sp = L.serp(f, 'https://shop.example.org/blue-widget'); eq(sp.url.crumbs, 'https://shop.example.org › blue-widget', 'breadcrumb'); eq(sp.descFromPage, false, 'own description');
eq(L.serp(L.extract('<h1>Heading only</h1><p>Some body text.</p>', 'https://a.com/'), 'https://a.com/').titleFromH1, true, 'falls back to h1');

// ---- checks / score ----
function rep(fx, over) { var p = L.extract(fx, 'https://shop.example.org/blue-widget'); p.finalUrl = 'https://shop.example.org/blue-widget'; return Object.assign({ input: 'https://shop.example.org/blue-widget', finalUrl: 'https://shop.example.org/blue-widget', status: 200, chain: [{ url: 'https://shop.example.org/blue-widget', status: 200 }], ms: 300, bytes: L.utf8Len(fx), https: true, contentType: 'text/html; charset=utf-8', headers: { 'content-encoding': 'gzip', 'strict-transport-security': 'max-age=1' }, robots: { found: true, status: 200, google: { allowed: true, rule: null }, any: { allowed: true, rule: null } }, sitemap: { found: true, inSitemap: true, where: 'https://shop.example.org/sitemap.xml', checked: [] }, page: p }, over || {}); }
var good = rep(html), gc = L.checks(good), gs = L.score(gc, good);
eq(gc.filter(function (c) { return c.level === 'fail'; }).map(function (c) { return c.id; }), [], 'good page has no fails');
ok(gs.score >= 90, 'good page scores 90+ (' + gs.score + ')'); eq(gs.grade, 'Excellent', 'grade');
gc.forEach(function (c) { ok(c.title && c.why !== undefined && ['pass', 'warn', 'fail', 'info'].indexOf(c.level) >= 0, 'check shape ' + c.id); ok(L.GROUPS.some(function (gr) { return gr[0] === c.group; }), 'group ' + c.id); if (c.level !== 'pass') ok(c.fix, 'fix text ' + c.id); });
var ni = rep(html.replace('index, follow', 'noindex')), nic = L.checks(ni), nis = L.score(nic, ni);
eq(find(nic, 'noindex').level, 'fail', 'noindex fails'); eq(nis.score, 30, 'noindex caps the score at 30'); ok(nis.cap, 'cap reason');
eq(find(L.checks(rep(html, { headers: { 'x-robots-tag': 'noindex' } })), 'noindex').level, 'fail', 'X-Robots-Tag noindex');
eq(find(L.checks(rep(html, { robots: { found: true, google: { allowed: false, rule: 'Disallow: /' }, any: { allowed: false, rule: 'Disallow: /' } } })), 'robots').level, 'fail', 'robots block fails');
eq(find(L.checks(rep(html, { robots: { found: false, status: 404 } })), 'robots').level, 'pass', 'no robots.txt is fine');
eq(find(L.checks(rep(html, { sitemap: { found: false, checked: [] } })), 'sitemap').level, 'warn', 'no sitemap warns');
eq(find(L.checks(rep(html, { status: 404 })), 'status').level, 'fail', '404 fails');
eq(L.score(L.checks(rep(html, { status: 500 })), {}).score <= 30, true, '500 capped');
eq(find(L.checks(rep(html, { chain: [{ url: 'a', status: 301 }, { url: 'b', status: 302 }, { url: 'c', status: 200 }] })), 'redirects').level, 'warn', 'redirect chain warns');
eq(find(L.checks(rep(html, { https: false })), 'https').level, 'fail', 'http fails');
eq(find(L.checks(rep(html, { ms: 2500 })), 'ttfb').level, 'fail', 'slow server');
eq(find(L.checks(rep(html.replace('<link rel="canonical" href="https://shop.example.org/blue-widget">', '<link rel="canonical" href="https://shop.example.org/other">'))), 'canonical').level, 'warn', 'canonical elsewhere');
eq(find(L.checks(rep(html.replace(/<meta name="viewport"[^>]*>/, ''))), 'viewport').level, 'fail', 'no viewport');
eq(find(L.checks(rep(html.replace('initial-scale=1', 'initial-scale=1, user-scalable=no'))), 'viewport').level, 'warn', 'zoom blocked');
eq(find(L.checks(rep(html, { page: null, contentType: 'application/pdf' })), 'html').level, 'fail', 'not html');
// demo report scores and produces text
var dp = L.extract(L.DEMO_HTML, L.DEMO_URL); dp.finalUrl = L.DEMO_URL; var dr = Object.assign({}, L.DEMO_REPORT, { page: dp }), dc = L.checks(dr), ds = L.score(dc, dr);
ok(ds.score > 40 && ds.score < 90, 'demo is a middling page (' + ds.score + ')'); eq(find(dc, 'jsonld').level, 'fail', 'demo bad json-ld'); eq(find(dc, 'canonical').level, 'warn', 'demo relative canonical');
var txt = L.reportText(dr, dc, ds); ok(/Score: \d+\/100/.test(txt) && /Fix: /.test(txt), 'report text');
var tl = L.toolLinks('https://shop.example.org/blue-widget'); eq(tl.length, 9, 'tool links'); ok(tl[0][1].indexOf('site%3Ashop.example.org%2Fblue-widget') > 0, 'site: query'); ok(tl.every(function (x) { return /^https:\/\//.test(x[1]); }), 'all https');

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
