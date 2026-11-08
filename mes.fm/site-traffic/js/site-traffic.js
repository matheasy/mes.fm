/* MES Domain Lookup: turns the /api/domain-lookup answer into plain-language findings (pure; node-testable). Exposed as MESDomain. */
var MESDomain = (function () {
	'use strict';
	var HOSTS = [[/cloudflare/i, 'Cloudflare', 'cdn'], [/amazon|aws|ec2/i, 'Amazon Web Services', 'host'], [/google|gcp|googleusercontent/i, 'Google Cloud', 'host'], [/microsoft|azure/i, 'Microsoft Azure', 'host'], [/vercel/i, 'Vercel', 'host'], [/netlify/i, 'Netlify', 'host'],
		[/github/i, 'GitHub Pages', 'host'], [/fastly/i, 'Fastly', 'cdn'], [/akamai/i, 'Akamai', 'cdn'], [/digitalocean/i, 'DigitalOcean', 'host'], [/ovh/i, 'OVHcloud', 'host'], [/hetzner/i, 'Hetzner', 'host'], [/linode/i, 'Linode (Akamai)', 'host'], [/vultr|choopa/i, 'Vultr', 'host'],
		[/go-?daddy|godaddy|secureserver/i, 'GoDaddy', 'host'], [/namecheap/i, 'Namecheap', 'host'], [/squarespace/i, 'Squarespace', 'host'], [/wix\b|wixsite/i, 'Wix', 'host'], [/shopify/i, 'Shopify', 'host'], [/wpengine|wp engine/i, 'WP Engine', 'host'], [/kinsta/i, 'Kinsta', 'host'],
		[/siteground/i, 'SiteGround', 'host'], [/endurance|bluehost|hostgator/i, 'Bluehost / HostGator (Newfold)', 'host'], [/hostinger/i, 'Hostinger', 'host'], [/ionos|1&1|1and1/i, 'IONOS', 'host'], [/heroku/i, 'Heroku', 'host'], [/render\b|onrender/i, 'Render', 'host'], [/fly\.io|flyio/i, 'Fly.io', 'host'],
		[/automattic|wordpress\.com/i, 'WordPress.com', 'host'], [/hostgator/i, 'HostGator', 'host'], [/dreamhost/i, 'DreamHost', 'host'], [/leaseweb/i, 'Leaseweb', 'host'], [/scaleway|online\.net/i, 'Scaleway', 'host'], [/oracle/i, 'Oracle Cloud', 'host'], [/alibaba|aliyun/i, 'Alibaba Cloud', 'host'], [/tencent/i, 'Tencent Cloud', 'host'], [/sucuri/i, 'Sucuri', 'cdn'], [/imperva|incapsula/i, 'Imperva', 'cdn']];
	var DNSP = [[/\.ns\.cloudflare\.com$/, 'Cloudflare'], [/awsdns/, 'Amazon Route 53'], [/domaincontrol\.com$/, 'GoDaddy'], [/googledomains\.com$|ns-cloud-[a-z]\d/, 'Google Cloud DNS / Domains'], [/nsone\.net$/, 'NS1'], [/azure-dns/, 'Azure DNS'], [/registrar-servers\.com$/, 'Namecheap'], [/dnsimple\.com$/, 'DNSimple'], [/ultradns/, 'UltraDNS'],
		[/dnsmadeeasy/, 'DNS Made Easy'], [/squarespacedns|squarespace/, 'Squarespace'], [/wixdns\.net$/, 'Wix'], [/vercel-dns\.com$/, 'Vercel'], [/digitalocean\.com$/, 'DigitalOcean'], [/hostinger/, 'Hostinger'], [/ionos|1and1|ui-dns/, 'IONOS'], [/porkbun\.com$/, 'Porkbun'], [/gandi\.net$/, 'Gandi'], [/hover\.com$/, 'Hover'], [/dreamhost/, 'DreamHost']];
	var MAIL = [[/google\.com\.?$|googlemail\.com\.?$/, 'Google Workspace / Gmail'], [/outlook\.com\.?$|protection\.outlook|office365/, 'Microsoft 365'], [/zoho\./, 'Zoho Mail'], [/protonmail|proton\.ch/, 'Proton Mail'], [/mimecast/, 'Mimecast'], [/fastmail|messagingengine/, 'Fastmail'], [/secureserver\.net|mailstore1/, 'GoDaddy email'],
		[/mailgun/, 'Mailgun'], [/sendgrid/, 'SendGrid'], [/improvmx/, 'ImprovMX (forwarding)'], [/forwardemail/, 'Forward Email'], [/icloud\.com/, 'iCloud Mail'], [/yandex/, 'Yandex Mail'], [/ovh\./, 'OVH Mail'], [/ionos|kundenserver|1and1/, 'IONOS Mail'], [/titan\.email/, 'Titan Email'], [/privateemail\.com/, 'Namecheap Private Email'], [/mail\.protection/, 'Microsoft 365']];
	var STATUS = { 'client transfer prohibited': 'Transfer lock is on (normal and good: protects against hijacking).', 'client delete prohibited': 'Delete lock is on.', 'client update prohibited': 'Update lock is on.', 'server transfer prohibited': 'Registry transfer lock.', 'server delete prohibited': 'Registry delete lock.', 'server update prohibited': 'Registry update lock.',
		'client hold': 'On hold: the domain does not resolve (often unpaid or disputed).', 'server hold': 'On hold by the registry: the domain does not resolve.', 'pending delete': 'Pending deletion: about to be dropped.', 'redemption period': 'In the redemption period after expiry: the owner can still recover it for a fee.', 'auto renew period': 'In the automatic renewal grace period.', 'active': 'Active.', 'ok': 'Active.', 'pending transfer': 'A transfer to another registrar is in progress.', 'inactive': 'Inactive: no name servers set.' };
	function match(list, s) { for (var i = 0; i < list.length; i++) if (list[i][0].test(s)) return list[i]; return null; }
	function dayDiff(a, b) { return Math.floor((b - a) / 86400000); }
	function ageText(from, now) {
		var d = new Date(from), n = new Date(now), y = n.getUTCFullYear() - d.getUTCFullYear(), m = n.getUTCMonth() - d.getUTCMonth(), dd = n.getUTCDate() - d.getUTCDate();
		if (dd < 0) m--; if (m < 0) { y--; m += 12; }
		if (y > 0) return y + ' year' + (y === 1 ? '' : 's') + (m ? ', ' + m + ' month' + (m === 1 ? '' : 's') : '');
		if (m > 0) return m + ' month' + (m === 1 ? '' : 's'); var days = dayDiff(+d, +n); return days + ' day' + (days === 1 ? '' : 's');
	}
	function hosting(data) {
		var out = [], seen = {};
		(data.ips || []).forEach(function (ip) { var s = [ip.org, ip.net, ip.ptr].filter(Boolean).join(' '), m = match(HOSTS, s); var key = (m ? m[1] : (ip.org || ip.net || ip.ip)); if (seen[key]) return; seen[key] = 1; out.push({ ip: ip.ip, name: m ? m[1] : (ip.org || ip.net || 'Unknown network'), kind: m ? m[2] : 'host', network: ip.net, org: ip.org, country: ip.country, ptr: ip.ptr }); });
		return out;
	}
	function dnsProvider(ns) { var seen = {}, out = []; (ns || []).forEach(function (n) { var h = String(n).toLowerCase().replace(/\.$/, ''), m = match(DNSP, h); var name = m ? m[1] : h.split('.').slice(-2).join('.'); if (!seen[name]) { seen[name] = 1; out.push(name); } }); return out; }
	function mailProvider(mx) { var seen = {}, out = []; (mx || []).forEach(function (r) { var h = String(r.data || r).toLowerCase().replace(/^\d+\s+/, '').replace(/\.$/, ''), m = match(MAIL, h); var name = m ? m[1] : h.split('.').slice(-2).join('.'); if (h && !seen[name]) { seen[name] = 1; out.push(name); } }); return out; }
	function txt(data, re) { return ((data.dns && data.dns.TXT) || []).map(function (t) { return t.data; }).filter(function (t) { return re.test(t); }); }
	function analyze(data, now) {
		now = now || Date.now();
		var r = data.rdap, sig = [], dns = data.dns || {}, host = hosting(data), a = { signals: sig, hosting: host, dnsProviders: dnsProvider((r && r.nameservers && r.nameservers.length ? r.nameservers : (dns.NS || []).map(function (x) { return x.data; }))), mail: mailProvider(dns.MX), age: null, ageDays: null, expiresDays: null };
		function add(level, text) { sig.push({ level: level, text: text }); }
		if (r && r.created) {
			a.ageDays = dayDiff(Date.parse(r.created), now); a.age = ageText(r.created, now);
			if (a.ageDays < 30) add('warn', 'Registered only ' + a.ageDays + ' day' + (a.ageDays === 1 ? '' : 's') + ' ago. Very new domains are common in scams and spam, though most are legitimate.');
			else if (a.ageDays < 365) add('info', 'Registered ' + a.age + ' ago: a young domain.');
			else if (a.ageDays > 3650) add('good', 'Registered ' + a.age + ' ago: an established domain.');
			else add('good', 'Registered ' + a.age + ' ago.');
		}
		if (r && r.expires) { a.expiresDays = dayDiff(now, Date.parse(r.expires)); if (a.expiresDays < 0) add('warn', 'The registration expired ' + (-a.expiresDays) + ' days ago.'); else if (a.expiresDays < 30) add('warn', 'Expires in ' + a.expiresDays + ' days.'); else if (a.expiresDays > 365 * 2) add('good', 'Paid up for another ' + Math.floor(a.expiresDays / 365) + ' years.'); }
		if (r) {
			(r.status || []).forEach(function (s) { var k = String(s).toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2'); if (/hold|pending delete|redemption/.test(k)) add('warn', (STATUS[k] || 'Status: ' + s)); });
			if (r.registrantRedacted) add('info', 'The owner\'s name and contact details are hidden. That is normal: since 2018 most registrars hide them (privacy law and privacy services). Use the abuse contact to reach the registrar.');
			else add('info', 'The owner details are public in the registry record (shown below).');
			if (r.dnssec) add('good', 'DNSSEC is on (protects DNS answers from tampering).');
		}
		if (data.wayback && r && r.created) { var gap = dayDiff(Date.parse(r.created), Date.parse(data.wayback.first)); if (gap < -180) add('info', 'The Internet Archive saw this site on ' + data.wayback.first + ', ' + Math.round(-gap / 30) + ' months before the current registration date. The domain may have changed owners or been re-registered, or the registry date is a re-registration.'); }
		if (data.wayback) add('good', 'First saved by the Internet Archive on ' + data.wayback.first + '.'); else if (data.wayback === null && !data.archiveDown && r && a.ageDays > 365) add('info', 'No snapshot found in the Internet Archive.');
		if (host.some(function (h) { return h.kind === 'cdn'; })) add('info', 'It sits behind a CDN / proxy (' + host.filter(function (h) { return h.kind === 'cdn'; })[0].name + '), so the real host is hidden.');
		if (dns.MX && dns.MX.length) {
			var spf = txt(data, /^v=spf1/i), dm = (dns.DMARC || []).filter(function (t) { return /^v=DMARC1/i.test(t.data); });
			a.spf = spf[0] || null; a.dmarc = dm[0] ? dm[0].data : null;
			if (!spf.length) add('info', 'Email is set up (MX) but there is no SPF record, so anyone can more easily fake mail from this domain.'); if (!dm.length) add('info', 'No DMARC policy: receivers get no instruction about forged mail from this domain.'); else if (/p=(quarantine|reject)/i.test(dm[0].data)) add('good', 'DMARC is set to ' + /p=(quarantine|reject)/i.exec(dm[0].data)[1].toLowerCase() + ' forged mail.');
		} else if (r && !(dns.MX || []).length) add('info', 'No email (MX) records: the domain does not receive email.');
		if (!r) add('warn', 'No registration record was found. The domain may be unregistered, or its registry does not publish RDAP data.');
		return a;
	}
	function explainStatus(s) { var k = String(s).toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2'); return STATUS[k] || ''; }
	return { analyze: analyze, hosting: hosting, dnsProvider: dnsProvider, mailProvider: mailProvider, ageText: ageText, explainStatus: explainStatus };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESDomain;

/* MES Site Traffic & Rank: helpers that turn the /api/site-traffic answer into plain-language findings (pure; node-testable). Exposed as MESTraffic.
   The only visit numbers here are ESTIMATES worked out from the Tranco rank (estimate()): a curve fitted to sites whose rough monthly visits are public,
   always shown as a wide range. Real visit counts are only known to a site's owner or to paid panels such as Similarweb. */
var MESTraffic = (function () {
	'use strict';
	var TIERS = [
		[1000, 'Top 1,000', 'one of the most visited sites on the whole Internet'],
		[10000, 'Top 10,000', 'a very popular site, known to a large share of Internet users'],
		[100000, 'Top 100,000', 'a popular site with a large regular audience'],
		[1000000, 'Top 1 million', 'a well-established site with a real audience'],
		[5000000, 'Top 5 million', 'a smaller site that still ranks above most of the web'],
		[Infinity, 'Outside the list', 'too small to appear in public popularity lists']
	];
	/* Rank -> estimated monthly visits. [Tranco rank, visits a month] points on a log-log line, fitted (2026-11-07) to ~30 sites with well-known
	   rough monthly visits (google, youtube, wikipedia, reddit, nytimes, imdb, quizlet, timeanddate, khanacademy, desmos, wolframalpha, calculatorsoup,
	   mathsisfun, symbolab, purplemath ...). Real sites sit up to ~3x either side of the line, so the range is x/÷ 3 (x/÷ 4 past rank 100,000).
	   Same table in mes.fm/site-traffic/extension/shared.js: change both (the tests compare them). */
	var CURVE = [[1, 5e10], [10, 1e10], [30, 1.6e9], [250, 4e8], [2500, 6e7], [22000, 1.5e7], [175000, 1.5e6], [1e6, 1.5e5], [5e6, 1e4]];
	function round2(n) { if (!(n > 0)) return 0; var p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
	function estimate(rank) {
		if (!(rank >= 1)) return null;
		var lr = Math.log10(rank), c = CURVE, lv;
		if (rank >= c[c.length - 1][0]) lv = Math.log10(c[c.length - 1][1]);
		else for (var i = 1; i < c.length; i++) if (rank <= c[i][0]) { var a = c[i - 1], b = c[i], t = (lr - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0])); lv = Math.log10(a[1]) + t * (Math.log10(b[1]) - Math.log10(a[1])); break; }
		var mid = Math.pow(10, lv), f = rank > 100000 ? 4 : 3;
		return { raw: mid, mid: round2(mid), low: round2(mid / f), high: round2(mid * f), factor: f, perDay: round2(mid / 30.4) };
	}
	/* 1.2B, 340M, 56k */
	function big(n) { return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B' : compact(n); }
	function estText(e) { return e ? big(e.low) + ' to ' + big(e.high) : ''; }
	function tier(rank) { for (var i = 0; i < TIERS.length; i++) if (rank <= TIERS[i][0]) return { max: TIERS[i][0], label: TIERS[i][1], text: TIERS[i][2], i: i }; }
	function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
	function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }
	/* history = [{date, rank}] oldest first. change > 0 means the site climbed (a smaller rank number is better). */
	function trend(history) {
		if (!history || history.length < 2) return null;
		var first = history[0], last = history[history.length - 1], best = history[0], worst = history[0];
		history.forEach(function (h) { if (h.rank < best.rank) best = h; if (h.rank > worst.rank) worst = h; });
		var change = first.rank - last.rank, pct = first.rank ? change / first.rank * 100 : 0;
		var dir = Math.abs(pct) < 3 ? 'steady' : pct > 0 ? 'rising' : 'falling';
		return { first: first, last: last, best: best, worst: worst, change: change, pct: pct, dir: dir, days: history.length };
	}
	function trendText(t) {
		if (!t) return 'Not enough history to show a trend.';
		var span = t.days + ' days';
		if (t.dir === 'steady') return 'Steady over the last ' + span + ' (rank moved by less than 3%).';
		return (t.dir === 'rising' ? 'Climbing' : 'Dropping') + ': from #' + fmt(t.first.rank) + ' to #' + fmt(t.last.rank) + ' over ' + span + ' (' + (t.pct > 0 ? '+' : '') + t.pct.toFixed(0) + '% in rank terms).';
	}
	/* the chart puts rank 1 at the top: y grows with the rank number */
	function spark(history, w, h, pad) {
		pad = pad == null ? 6 : pad; if (!history || history.length < 2) return null;
		var lo = Infinity, hi = -Infinity; history.forEach(function (p) { lo = Math.min(lo, p.rank); hi = Math.max(hi, p.rank); });
		if (hi === lo) { hi = lo + 1; }
		var pts = history.map(function (p, i) { return { x: pad + (w - 2 * pad) * i / (history.length - 1), y: pad + (h - 2 * pad) * (p.rank - lo) / (hi - lo), rank: p.rank, date: p.date }; });
		return { pts: pts, path: pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '), lo: lo, hi: hi };
	}
	/* "2003 to 2026" with the years that have no capture listed */
	function yearsText(years) {
		if (!years || !years.length) return '';
		var a = years[0], b = years[years.length - 1], miss = [];
		for (var y = a; y <= b; y++) if (years.indexOf(y) < 0) miss.push(y);
		return a + (b > a ? ' to ' + b : '') + (miss.length ? ' (no capture in ' + (miss.length > 4 ? miss.length + ' of those years' : miss.join(', ')) + ')' : '');
	}
	/* Signals shown at the top. level: good | info | warn. d = {api answer, domain: lookup answer or null} */
	function signals(api, domainLookup, now) {
		var s = [], r = api && api.rank;
		if (api && api.shared) s.push({ level: 'warn', text: api.apex + ' is a shared platform: its rank is the whole platform, not this page or account. A site under it is usually far smaller.' });
		else if (api && api.subdomain) s.push({ level: 'info', text: 'Public rank lists work on whole domains, so the rank below is for ' + api.apex + ', not for the subdomain ' + api.domain + '.' });
		if (r && r.ranked) { var t = tier(r.rank); s.push({ level: t.i <= 3 ? 'good' : 'info', text: 'Ranked #' + fmt(r.rank) + ' on the ' + r.date + ' Tranco list: ' + t.text + '.' }); }
		else if (r && r.unavailable) s.push({ level: 'warn', text: 'The rank service did not answer. Try again in a minute.' });
		else s.push({ level: 'info', text: 'Not in the Tranco list (it ranks roughly the few million most visited domains). That means a small or new site, not necessarily a bad one.' });
		var tr = r && r.ranked ? trend(r.history) : null;
		if (tr && tr.dir !== 'steady') s.push({ level: tr.dir === 'rising' ? 'good' : 'info', text: trendText(tr) });
		if (domainLookup && domainLookup.rdap && domainLookup.rdap.created) {
			var days = Math.floor(((now || Date.now()) - new Date(domainLookup.rdap.created)) / 86400000);
			if (days < 90) s.push({ level: 'warn', text: 'The domain was registered only ' + days + ' days ago, so a high rank for it would be unusual.' });
		}
		return s;
	}
	function links(domain) {
		var d = encodeURIComponent(domain);
		return [
			['Similarweb', 'https://www.similarweb.com/website/' + d + '/', 'Visit estimates from its own panel (free tier limited, sign-in for more)'],
			['Cloudflare Radar', 'https://radar.cloudflare.com/domains/domain/' + d, 'Cloudflare\'s own popularity ranking and DNS traffic data'],
			['Tranco', 'https://tranco-list.eu/query_rank?domain=' + d, 'The list this page uses, with its full 30-day history'],
			['Majestic', 'https://majestic.com/reports/site-explorer?q=' + d, 'Backlinks: how many other sites link here'],
			['Chrome UX Report', 'https://developer.chrome.com/docs/crux/', 'Real Chrome speed data and popularity buckets (needs the API)'],
			['Google PageSpeed', 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2F' + d, 'Speed and real-user Core Web Vitals'],
			['Internet Archive', 'https://web.archive.org/web/*/' + d, 'Every saved copy of the site'],
			['Domain Lookup', '/domain-lookup?d=' + d, 'Owner records, DNS and hosting in more depth']
		];
	}
	return { CURVE: CURVE, estimate: estimate, big: big, estText: estText, tier: tier, fmt: fmt, compact: compact, trend: trend, trendText: trendText, spark: spark, yearsText: yearsText, signals: signals, links: links, TIERS: TIERS };
})();
if (typeof module !== 'undefined') module.exports = MESTraffic;

/* MES Site Traffic & Rank UI. Data = /api/site-traffic (Tranco rank, Wayback history, opt-in tech) + /api/domain-lookup (RDAP age, DNS, hosting); findings = MESTraffic (lib.js) and MESDomain (domain-lookup lib). Visits are a rough range estimated from the rank (MESTraffic.estimate); Chrome UX Report + Cloudflare Radar sections appear once their free keys are set. */
(function () {
	'use strict';
	var T = MESTraffic, D = MESDomain, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-site-traffic:v1', cur = null, recent = [];
	try { recent = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) {}
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('st-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function copy(t, m) { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(m); }, function () { toast('Copy failed'); }); else toast('Copy needs a secure page'); }
	function dateOnly(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
	function status(msg, err) { var s = $('st-status'); s.hidden = !msg; s.className = 'st-status' + (err ? ' err' : ''); s.innerHTML = msg || ''; }
	function saveRecent(d) { recent = [d].concat(recent.filter(function (x) { return x !== d; })).slice(0, 8); try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch (e) {} drawRecent(); }
	function drawRecent() { $('st-recent').innerHTML = recent.map(function (d) { return '<button type="button" class="tu-chip" data-d="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + (recent.length ? '<button type="button" class="tu-chip" data-clear="1">Clear history</button>' : ''); }
	$('st-recent').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-clear')) { recent = []; try { localStorage.removeItem(KEY); } catch (x) {} drawRecent(); return; } $('st-q').value = b.getAttribute('data-d'); go(); });
	$('st-go').onclick = go; $('st-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
	function jget(u) { return fetch(u).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
	var busy = false;
	function go() {
		var q = $('st-q').value.trim(); if (!q) return status('Type a website or domain name first.', true); if (busy) return;
		busy = true; $('st-go').disabled = true; $('st-out').hidden = true; status('Checking <b>' + esc(q) + '</b>&hellip;');
		jget('/api/site-traffic?d=' + encodeURIComponent(q)).then(function (x) {
			busy = false; $('st-go').disabled = false;
			if (!x.ok) return status(esc(x.j && x.j.error || 'The check failed. Try again.'), true);
			status(''); cur = { api: x.j, lookup: undefined, wayback: undefined, tech: undefined, crux: undefined, radar: undefined }; var me = cur;
			saveRecent(x.j.domain); try { history.replaceState(null, '', '?d=' + encodeURIComponent(x.j.domain)); } catch (e) {}
			render(me);
			jget('/api/domain-lookup?d=' + encodeURIComponent(x.j.domain)).then(function (l) { if (cur === me) { me.lookup = l.ok ? l.j : null; render(me); } }).catch(function () { if (cur === me) { me.lookup = null; render(me); } });
			['crux', 'radar'].forEach(function (k) { jget('/api/site-traffic?d=' + encodeURIComponent(x.j.domain) + '&only=' + k).then(function (y) { if (cur === me) { me[k] = y.ok ? y.j[k] : { unavailable: true }; render(me); } }).catch(function () { if (cur === me) { me[k] = { unavailable: true }; render(me); } }); });
			jget('/api/site-traffic?d=' + encodeURIComponent(x.j.domain) + '&only=wayback').then(function (w) { if (cur === me) { me.wayback = w.ok ? w.j.wayback : { unavailable: true }; render(me); } }).catch(function () { if (cur === me) { me.wayback = { unavailable: true }; render(me); } });
		}).catch(function () { busy = false; $('st-go').disabled = false; status('Could not reach the service. Check your connection and try again.', true); });
	}
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.2em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var chartMode = 'visits'; try { chartMode = localStorage.getItem(KEY + ':chart') || 'visits'; } catch (e) {}
	/* x by date (the kept history can have gaps), y = rank (1 at the top) or log10 of the estimated visits (more at the top) */
	function chart(r) {
		var hist = r && r.ranked ? (r.longHistory || r.history) : null, svg = $('st-chart'), box = $('st-chartcard');
		if (!hist || hist.length < 2) { box.hidden = true; return; }
		box.hidden = false;
		var d0 = Date.parse(hist[0].date), d1 = Date.parse(hist[hist.length - 1].date), days = Math.round((d1 - d0) / 86400000) + 1;
		$('st-days').textContent = days >= 120 ? Math.round(days / 30.4) + ' months' : days + ' days';
		Array.prototype.forEach.call(document.querySelectorAll('#st-cmode button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === chartMode ? 'true' : 'false'); });
		var vis = chartMode === 'visits', W = 640, H = 200, P = 14;
		var ys = hist.map(function (h) { return vis ? Math.log10(T.estimate(h.rank).raw) : h.rank; });
		var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); if (hi - lo < (vis ? 0.02 : 1)) { var m = (hi + lo) / 2, g = vis ? 0.05 : Math.max(1, m * 0.05); lo = m - g; hi = m + g; }
		var pts = hist.map(function (h, i) { var f = (ys[i] - lo) / (hi - lo); return { x: P + (W - 2 * P) * (d1 > d0 ? (Date.parse(h.date) - d0) / (d1 - d0) : i / (hist.length - 1)), y: vis ? H - P - (H - 2 * P) * f : P + (H - 2 * P) * f, h: h }; });
		var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '), area = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + H + ' L' + pts[0].x.toFixed(1) + ' ' + H + ' Z';
		svg.innerHTML = '<line class="st-grid" x1="0" x2="' + W + '" y1="' + P + '" y2="' + P + '"></line><line class="st-grid" x1="0" x2="' + W + '" y1="' + (H - P) + '" y2="' + (H - P) + '"></line><path class="st-area" d="' + area + '"></path><path class="st-line" d="' + path + '"></path><line class="st-cur" id="st-cur" x1="-20" x2="-20" y1="0" y2="' + H + '"></line>';
		var top = vis ? T.big(T.estimate(Math.round(hist.reduce(function (m, h) { return Math.min(m, h.rank); }, Infinity))).mid) + ' / month' : '#' + T.fmt(Math.ceil(lo));
		var bot = vis ? T.big(T.estimate(Math.round(hist.reduce(function (m, h) { return Math.max(m, h.rank); }, 0))).mid) + ' / month' : '#' + T.fmt(Math.floor(hi));
		$('st-ytop').textContent = top; $('st-ybot').textContent = bot; $('st-x0').textContent = hist[0].date; $('st-x1').textContent = hist[hist.length - 1].date;
		$('st-cnote').textContent = vis ? 'Estimated from the rank (middle of the range). Real sites can be up to ~3x either side.' : 'Higher on the chart = better rank (closer to #1).';
		var tip = $('st-tip'), cur = $('st-cur');
		function at(ev) {
			var b = svg.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * W, p = pts[0];
			pts.forEach(function (q) { if (Math.abs(q.x - x) < Math.abs(p.x - x)) p = q; });
			cur.setAttribute('x1', p.x); cur.setAttribute('x2', p.x); tip.hidden = false;
			var e = T.estimate(p.h.rank); tip.textContent = p.h.date + ': #' + T.fmt(p.h.rank) + ' · ~' + T.big(e.mid) + ' visits/mo (' + T.estText(e) + ')';
			tip.style.left = Math.min(Math.max(p.x / W * b.width, 110), b.width - 110) + 'px'; tip.style.top = Math.max(0, p.y / H * b.height - 34) + 'px';
		}
		svg.onpointermove = at; svg.onpointerdown = at; svg.onpointerleave = function () { tip.hidden = true; cur.setAttribute('x1', -20); cur.setAttribute('x2', -20); };
	}
	$('st-cmode').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; chartMode = b.getAttribute('data-m'); try { localStorage.setItem(KEY + ':chart', chartMode); } catch (x) {} if (cur) chart(cur.api.rank); });
	function pct(x) { return x == null || isNaN(x) ? '—' : Math.round(x * 100) + '%'; }
	function ms(x) { return x == null ? '—' : x >= 1000 ? (x / 1000).toFixed(1) + ' s' : Math.round(x) + ' ms'; }
	function cwvRate(k, v) { if (v == null) return ''; var t = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], ttfb: [800, 1800] }[k]; return v <= t[0] ? 'good' : v <= t[1] ? 'ok' : 'poor'; }
	function drawCrux(c) {
		var el = $('st-crux'), x = c.crux; if (!el) return;
		if (x === undefined) { el.innerHTML = '<span class="tu-note">Asking Google&rsquo;s Chrome UX Report&hellip;</span>'; return; }
		if (x.setup) { el.closest('section').hidden = true; return; }
		el.closest('section').hidden = false;
		if (x.unavailable) { el.innerHTML = '<span class="tu-note">' + (x.keyProblem ? 'The Chrome UX Report key is not working yet.' : 'Google did not answer. Try again in a minute.') + '</span>'; return; }
		if (!x.found) { el.innerHTML = '<span class="tu-note">Google has no Chrome data for ' + esc(c.api.domain) + '. Chrome only publishes sites with enough real visitors, so this usually means a small site (or one that most people reach through an app).</span>'; return; }
		var ff = x.ff || {}, h = x.history, bar = ['phone', 'desktop', 'tablet'].filter(function (k) { return ff[k] > 0; }).map(function (k) { return '<span class="st-ff st-ff--' + k + '" style="flex:' + ff[k] + '">' + k.charAt(0).toUpperCase() + k.slice(1) + ' ' + pct(ff[k]) + '</span>'; }).join('');
		var cw = x.cwv || {}, names = { lcp: ['Loading (LCP)', ms], inp: ['Response to taps (INP)', ms], cls: ['Layout shift (CLS)', function (v) { return v == null ? '—' : (+v).toFixed(2); }], ttfb: ['Server reply (TTFB)', ms] };
		var vit = Object.keys(names).filter(function (k) { return cw[k]; }).map(function (k) { var v = cw[k].p75, r = cwvRate(k, v); return '<div class="tu-stat"><div class="tu-stat__label">' + names[k][0] + '</div><div class="tu-stat__value st-cw st-cw--' + r + '" style="font-size:1.2em">' + names[k][1](v) + '</div><div class="tu-stat__sub">' + (cw[k].good != null ? pct(cw[k].good) + ' of visits fast' : '') + '</div></div>'; }).join('');
		var nav = x.nav ? Object.keys(x.nav).filter(function (k) { return x.nav[k] > 0.005; }).sort(function (a, b) { return x.nav[b] - x.nav[a]; }).map(function (k) { return esc(({ navigate: 'typed or clicked', reload: 'reloads', back_forward: 'back / forward', back_forward_cache: 'back / forward (instant)', prerender: 'pre-loaded', restore: 'restored tabs', navigate_cache: 'from cache' })[k] || k) + ' ' + pct(x.nav[k]); }).join(' · ') : '';
		var spark = '';
		if (h && h.ff && h.ff.phone && h.dates.length > 2) {
			var W = 640, H = 120, n = h.dates.length, lines = ['phone', 'desktop', 'tablet'].map(function (k) { var a = h.ff[k]; if (!a) return ''; return '<path class="st-ffl st-ffl--' + k + '" d="' + a.map(function (v, i) { return v == null ? '' : ((i && a[i - 1] != null ? 'L' : 'M') + (8 + (W - 16) * i / (n - 1)).toFixed(1) + ' ' + (H - 8 - (H - 16) * v).toFixed(1)); }).join(' ') + '"></path>'; }).join('');
			spark = '<div class="st-charthead"><b>Device share, week by week (' + esc(h.dates[0]) + ' to ' + esc(h.dates[n - 1]) + ')</b><span class="st-leg"><i class="st-ff--phone"></i>Phone <i class="st-ff--desktop"></i>Desktop <i class="st-ff--tablet"></i>Tablet</span></div><svg class="st-ffchart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Device share over time">' + lines + '</svg>';
		}
		el.innerHTML = '<p class="tu-note" style="margin-top:0">Real Chrome visitors to <b>' + esc(x.origin) + '</b>' + (x.period ? ', ' + esc(x.period.first) + ' to ' + esc(x.period.last) : '') + '. Being in this report at all means the site has a steady stream of real visitors.</p><div class="st-ffbar">' + bar + '</div>' + (nav ? '<p class="tu-note">How visits start: ' + nav + '</p>' : '') + spark + (vit ? '<div class="tu-stats" style="margin-top:0.8em">' + vit + '</div><p class="tu-note">Speed numbers are what 3 out of 4 visits get or better (Google&rsquo;s Core Web Vitals: green = good, amber = needs work, red = poor).</p>' : '');
	}
	function drawRadar(c) {
		var el = $('st-radar'), x = c.radar; if (!el) return;
		if (x === undefined) { el.innerHTML = '<span class="tu-note">Asking Cloudflare Radar&hellip;</span>'; return; }
		if (x.setup) { el.closest('section').hidden = true; return; }
		el.closest('section').hidden = false;
		if (x.unavailable) { el.innerHTML = '<span class="tu-note">' + (x.keyProblem ? 'The Cloudflare Radar token is not working yet.' : 'Cloudflare did not answer. Try again in a minute.') + '</span>'; return; }
		if (!x.found) { el.innerHTML = '<span class="tu-note">' + esc(c.api.apex) + ' is not in Cloudflare&rsquo;s ranking (its list covers about the top million domains seen by its 1.1.1.1 DNS service).</span>'; return; }
		var head = x.rank ? '#' + T.fmt(x.rank) : x.bucket ? 'Top ' + T.fmt(x.bucket) : '—';
		var loc = (x.locations || []).map(function (l) { return '<span>' + esc(l.name || l.code) + (l.rank ? ' <small>#' + T.fmt(l.rank) + '</small>' : '') + '</span>'; }).join('');
		el.innerHTML = '<div class="tu-stats"><div class="tu-stat tu-stat--hero"><div class="tu-stat__label">Cloudflare rank</div><div class="tu-stat__value" style="font-size:1.3em">' + head + '</div><div class="tu-stat__sub">' + (x.rank ? 'exact (top 100 only)' : 'Cloudflare gives exact ranks only for the top 100') + '</div></div>' + (x.categories.length ? '<div class="tu-stat"><div class="tu-stat__label">Category</div><div class="tu-stat__value" style="font-size:1em">' + esc(x.categories.join(', ')) + '</div></div>' : '') + '</div>' + (loc ? '<p class="tu-note">Countries where it ranks highest:</p><div class="st-techlist">' + loc + '</div>' : '');
	}
	function render(c) {
		var a = c.api, r = a.rank, lk = c.lookup, now = Date.now(); $('st-out').hidden = false;
		$('st-host').textContent = a.domain + (a.apex !== a.domain ? ' (ranked as ' + a.apex + ')' : '');
		if (r.ranked) { var t = T.tier(r.rank); $('st-rank').textContent = '#' + T.fmt(r.rank); $('st-tier').innerHTML = '<b>' + esc(t.label) + '</b> of the Internet &middot; Tranco list of ' + esc(r.date); var e = T.estimate(r.rank); $('st-est').hidden = false; $('st-estv').textContent = T.estText(e); $('st-ests').textContent = 'about ' + T.big(e.mid) + ' a month (' + T.big(e.perDay) + ' a day)' + (a.apex !== a.domain ? ', for all of ' + a.apex : ''); }
		else if (r.unavailable) { $('st-rank').textContent = '?'; $('st-tier').textContent = 'The rank service is busy. Try again in a minute.'; }
		else { $('st-rank').textContent = 'Unranked'; $('st-tier').textContent = 'Not in the Tranco list of the few million most visited domains.'; }
		if (!r.ranked) $('st-est').hidden = true;
		$('st-sig').innerHTML = T.signals(a, lk, now).map(function (s) { return '<li class="' + s.level + '">' + (s.level === 'warn' ? '&#9888;&#65039; ' : s.level === 'good' ? '&#10003; ' : '&#8505;&#65039; ') + esc(s.text) + '</li>'; }).join('');
		chart(r);
		var tr = r.ranked ? T.trend(r.history) : null, cards = '';
		if (r.ranked) { var es = T.estimate(r.rank); cards += card('Estimated visits a month', T.estText(es), 'rough range worked out from the rank', true); }
		if (r.ranked) cards += card('Best rank (' + (tr ? tr.days : 1) + ' days)', '#' + T.fmt(tr ? tr.best.rank : r.rank), tr ? esc(tr.best.date) : '', true) + card('Lowest rank', '#' + T.fmt(tr ? tr.worst.rank : r.rank), tr ? esc(tr.worst.date) : '') + card('Trend', tr ? (tr.dir === 'rising' ? 'Rising &#9650;' : tr.dir === 'falling' ? 'Falling &#9660;' : 'Steady') : '—', tr ? (tr.pct > 0 ? '+' : '') + tr.pct.toFixed(0) + '% rank change' : '');
		if (lk === undefined) cards += card('Domain age', 'Checking…', '');
		else if (lk) {
			var an = D.analyze(lk, now), h = an.hosting.length ? an.hosting.map(function (x) { return esc(x.name); }).join(', ') : '—', rd = lk.rdap;
			cards += card('Domain age', esc(an.age || 'Unknown'), rd && rd.created ? 'Registered ' + esc(dateOnly(rd.created)) : 'No registration date published') + card('Registrar', esc(rd && rd.registrar || '—'), rd && rd.expires ? 'Expires ' + esc(dateOnly(rd.expires)) : '') + card('Hosted by', h, an.hosting.length ? esc(an.hosting[0].country || '') : '') + card('DNS by', esc(an.dnsProviders.join(', ') || '—'), 'who answers for the domain') + card('Email by', esc(an.mail.join(', ') || 'No email'), '');
		} else cards += card('Domain age', 'Unavailable', 'The registry did not answer');
		$('st-cards').innerHTML = cards;
		var w = c.wayback, ar = $('st-arch');
		if (w === undefined) ar.innerHTML = '<span class="tu-note">Checking the Internet Archive&hellip;</span>';
		else if (w.unavailable) ar.innerHTML = '<span class="tu-note">The Internet Archive did not answer. <a href="https://web.archive.org/web/*/' + esc(a.domain) + '" target="_blank" rel="noopener">Open it directly</a>.</span>';
		else if (!w.captured) ar.innerHTML = '<span class="tu-note">The Internet Archive has no saved copy of ' + esc(a.domain) + '. It may be new, blocked from archiving, or very small.</span>';
		else ar.innerHTML = '<p>First saved <b>' + esc(w.first ? dateOnly(w.first) : '—') + '</b>' + (w.firstUrl ? ' &middot; <a href="' + esc(w.firstUrl) + '" target="_blank" rel="noopener">see that copy</a>' : '') + '. Latest saved <b>' + esc(w.last ? dateOnly(w.last) : '—') + '</b>' + (w.lastUrl ? ' &middot; <a href="' + esc(w.lastUrl) + '" target="_blank" rel="noopener">see it</a>' : '') + '.</p><div class="tu-note">Years with at least one saved copy (' + esc(T.yearsText(w.years)) + '):</div><div class="st-years">' + (w.years || []).map(function (y) { return '<span>' + y + '</span>'; }).join('') + '</div>';
		$('st-links').innerHTML = T.links(a.domain).map(function (l) { var ext = l[1].charAt(0) !== '/'; return '<li><a href="' + esc(l[1]) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '<small>' + esc(l[2]) + '</small></a></li>'; }).join('');
		drawTech(c); drawCrux(c); drawRadar(c);
	}
	function drawTech(c) {
		var el = $('st-tech'), t = c.tech;
		if (t === undefined) { if (!el.querySelector('#st-techgo')) el.innerHTML = el.getAttribute('data-orig'); bindTech(); return; }
		if (t === 'loading') { $('st-techgo').disabled = true; $('st-techgo').textContent = 'Checking the home page…'; return; }
		if (t.error) { el.innerHTML = '<p class="tu-note">' + esc(t.error) + '</p>'; return; }
		var by = {}; t.tech.forEach(function (x) { (by[x.category] = by[x.category] || []).push(x.name); });
		var list = t.tech.map(function (x) { return '<span>' + esc(x.name) + '<small>' + esc(x.category) + '</small></span>'; }).join('');
		el.innerHTML = '<p>' + (t.title ? '<b>' + esc(t.title) + '</b><br>' : '') + (t.description ? '<span class="tu-note">' + esc(t.description) + '</span><br>' : '') + '<span class="tu-note">Answered ' + t.status + (t.https ? ' over HTTPS' : ' <b>without HTTPS</b>') + (t.finalHost ? ' at ' + esc(t.finalHost) : '') + (t.lang ? ' &middot; language ' + esc(t.lang) : '') + (t.generator ? ' &middot; built with ' + esc(t.generator) : '') + '</span></p>' + (list ? '<div class="st-techlist">' + list + '</div>' : '<p class="tu-note">No known technology was recognised. Many modern sites hide it, or load everything from scripts.</p>');
	}
	function bindTech() { var b = $('st-techgo'); if (b) b.onclick = function () { if (!cur) return; var me = cur; me.tech = 'loading'; drawTech(me); jget('/api/site-traffic?d=' + encodeURIComponent(me.api.domain) + '&only=tech').then(function (x) { if (cur === me) { me.tech = x.ok ? x.j.tech : { error: x.j && x.j.error || 'The check failed.' }; drawTech(me); } }).catch(function () { if (cur === me) { me.tech = { error: 'Could not reach the service.' }; drawTech(me); } }); }; }
	$('st-tech').setAttribute('data-orig', $('st-tech').innerHTML); bindTech();
	$('st-copy').onclick = function () { if (!cur) return; var a = cur.api, r = a.rank, lk = cur.lookup, an = lk ? D.analyze(lk, Date.now()) : null; copy([a.domain, r.ranked ? 'Rank: #' + T.fmt(r.rank) + ' (' + T.tier(r.rank).label + ', Tranco ' + r.date + ')' : 'Rank: not in the Tranco list', r.ranked ? 'Estimated visits a month: ' + T.estText(T.estimate(r.rank)) + ' (rough, from the rank)' : '', an && an.age ? 'Domain age: ' + an.age : '', an && an.hosting.length ? 'Hosted by: ' + an.hosting.map(function (x) { return x.name; }).join(', ') : '', cur.wayback && cur.wayback.first ? 'First archived: ' + cur.wayback.first : '', '(mes.fm/site-traffic)'].filter(Boolean).join('\n'), 'Summary copied'); };
	$('st-link').onclick = function () { if (cur) copy(location.origin + location.pathname + '?d=' + encodeURIComponent(cur.api.domain), 'Link copied'); };
	if (window.fetch) fetch('/site-traffic/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { if (m && m.version && $('st-ver')) $('st-ver').textContent = 'v' + m.version; }).catch(function () {});
	drawRecent();
	var q0 = new URLSearchParams(location.search).get('d'); if (q0) { $('st-q').value = q0; go(); }
})();
