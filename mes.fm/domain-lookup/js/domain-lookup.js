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

/* MES Domain Lookup UI. Data = /api/domain-lookup (RDAP + DNS over HTTPS + RDAP for IPs + Internet Archive); findings = MESDomain in lib.js (prepended above). */
(function () {
	'use strict';
	var D = MESDomain, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-domain-lookup:v1', last = null, recent = [];
	try { recent = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) {}
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('dl-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function copy(t, m) { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(m); }, function () { toast('Copy failed'); }); else toast('Copy needs a secure page'); }
	function dateOnly(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
	function status(msg, err) { var s = $('dl-status'); s.hidden = !msg; s.className = 'dl-status' + (err ? ' err' : ''); s.innerHTML = msg || ''; }
	function saveRecent(d) { recent = [d].concat(recent.filter(function (x) { return x !== d; })).slice(0, 8); try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch (e) {} drawRecent(); }
	function drawRecent() { $('dl-recent').innerHTML = recent.map(function (d) { return '<button type="button" class="tu-chip" data-d="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + (recent.length ? '<button type="button" class="tu-chip" data-clear="1">Clear history</button>' : ''); }
	$('dl-recent').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-clear')) { recent = []; try { localStorage.removeItem(KEY); } catch (x) {} drawRecent(); return; } $('dl-q').value = b.getAttribute('data-d'); go(); });
	$('dl-go').onclick = go; $('dl-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
	var busy = false;
	function go() {
		var q = $('dl-q').value.trim(); if (!q) return status('Type a website or domain name first.', true); if (busy) return;
		busy = true; $('dl-go').disabled = true; $('dl-out').hidden = true; status('Looking up <b>' + esc(q) + '</b>… this takes a few seconds.');
		fetch('/api/domain-lookup?d=' + encodeURIComponent(q)).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
			busy = false; $('dl-go').disabled = false;
			if (!x.ok) return status(esc(x.j && x.j.error || 'The lookup failed. Try again.'), true);
			status(''); last = x.j; delete last.wayback; render(x.j); saveRecent(x.j.domain); archive(x.j);
			try { history.replaceState(null, '', '?d=' + encodeURIComponent(x.j.domain)); } catch (e) {}
		}).catch(function () { busy = false; $('dl-go').disabled = false; status('Could not reach the lookup service. Check your connection and try again.', true); });
	}
	/* the Internet Archive is slow: ask for it after the main answer is already on screen, then redraw */
	function archive(d) {
		fetch('/api/domain-lookup?d=' + encodeURIComponent(d.domain) + '&only=wayback').then(function (r) { return r.json(); }).then(function (j) { if (last === d) { d.wayback = j.wayback || null; d.archiveDown = !!(j.wayback && j.wayback.unavailable); if (d.archiveDown) d.wayback = null; render(d); } }).catch(function () { if (last === d) render(d); });
	}
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.2em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function render(d) {
		var a = D.analyze(d), r = d.rdap, now = Date.now(); $('dl-out').hidden = false; d.__a = a;
		$('dl-host').textContent = d.domain + (d.host !== d.domain ? ' (looked up from ' + d.host + ')' : '');
		$('dl-age').textContent = a.age ? a.age + ' old' : 'Age unknown';
		$('dl-since').innerHTML = r && r.created ? 'Registered ' + esc(dateOnly(r.created)) + (r.expires ? ' · expires ' + esc(dateOnly(r.expires)) : '') : 'No registration date was published for this domain.';
		$('dl-sig').innerHTML = a.signals.map(function (s) { return '<li class="' + s.level + '">' + (s.level === 'warn' ? '&#9888;&#65039; ' : s.level === 'good' ? '&#10003; ' : '&#8505;&#65039; ') + esc(s.text) + '</li>'; }).join('');
		var h = a.hosting.length ? a.hosting.map(function (x) { return esc(x.name); }).join(', ') : '—';
		$('dl-cards').innerHTML = card('Registrar', esc(r && r.registrar || '—'), r && r.registrarIana ? 'IANA ID ' + esc(r.registrarIana) : '', true) + card('Hosted by', h, a.hosting.length ? esc((a.hosting[0].country || '') + (a.hosting[0].ptr ? ' · ' + a.hosting[0].ptr : '')) : '') + card('DNS by', esc(a.dnsProviders.join(', ') || '—'), 'who answers for the domain') + card('Email by', esc(a.mail.join(', ') || 'No email'), a.mail.length ? 'from the MX records' : 'no MX records') + card('First archived', esc(d.wayback === undefined ? 'Checking…' : d.wayback ? dateOnly(d.wayback.first) : d.archiveDown ? 'Archive not responding' : 'Not found'), d.wayback ? '<a href="' + esc(d.wayback.url) + '" target="_blank" rel="noopener">Open in the Internet Archive</a>' : 'Internet Archive');
		var reg = [];
		function kv(k, v) { if (v) reg.push('<dt>' + k + '</dt><dd>' + v + '</dd>'); }
		if (r) {
			kv('Domain', esc(r.domain)); kv('Registered', esc(dateOnly(r.created))); kv('Last changed', esc(dateOnly(r.updated))); kv('Expires', esc(dateOnly(r.expires)) + (a.expiresDays != null ? ' (' + (a.expiresDays < 0 ? 'expired' : 'in ' + a.expiresDays + ' days') + ')' : '')); kv('Transferred', r.transferred ? esc(dateOnly(r.transferred)) : '');
			kv('Registrar', esc(r.registrar || '—')); kv('Owner', r.registrant ? esc([r.registrant.name, r.registrant.org].filter(Boolean).join(' · ') + (r.registrant.country ? ' (' + r.registrant.country + ')' : '')) : 'Hidden by privacy (normal)');
			if (r.registrant) { kv('Owner address', esc(r.registrant.address || '')); kv('Owner email', esc(r.registrant.email || '')); }
			if (r.abuse) kv('Abuse contact', esc([r.abuse.email, r.abuse.phone && r.abuse.phone.replace(/^tel:/, '')].filter(Boolean).join(' · ')));
			kv('Name servers', esc((r.nameservers || []).join(', '))); kv('DNSSEC', r.dnssec == null ? '' : (r.dnssec ? 'On' : 'Off'));
			kv('Status', (r.status || []).map(function (s) { var e = D.explainStatus(s); return '<div>' + esc(s) + (e ? ' <span class="tu-note">' + esc(e) + '</span>' : '') + '</div>'; }).join('')); kv('Record source', '<span class="tu-note">' + esc(r.source) + '</span>');
		} else reg.push('<dt>Record</dt><dd>No public registration record found.</dd>');
		$('dl-reg').innerHTML = reg.join('');
		var ips = '<tr><th>IP address</th><th>Network</th><th>Owner</th><th>Country</th><th>Reverse DNS</th></tr>';
		(d.ips || []).forEach(function (x) { ips += '<tr><td class="k">' + esc(x.ip) + '</td><td>' + esc(x.net || '—') + (x.cidr ? '<br><span class="tu-note">' + esc(x.cidr) + '</span>' : '') + '</td><td>' + esc(x.org || '—') + '</td><td>' + esc(x.country || '—') + '</td><td>' + esc(x.ptr || '—') + '</td></tr>'; });
		$('dl-ips').innerHTML = (d.ips || []).length ? ips : '<tr><td>No IPv4 address found for this name.</td></tr>';
		$('dl-iptip').textContent = a.hosting.some(function (x) { return x.kind === 'cdn'; }) ? 'This address belongs to a CDN or proxy, not the original server.' : 'The network owner is usually the hosting company (or the company running its own servers).';
		var dns = d.dns || {}, t = '<tr><th>Type</th><th>Value</th><th>TTL</th></tr>';
		['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'CAA', 'SOA', 'DMARC'].forEach(function (k) { (dns[k] || []).forEach(function (x) { t += '<tr><td class="k">' + (k === 'DMARC' ? 'TXT (_dmarc)' : k) + '</td><td>' + esc(x.data) + '</td><td>' + esc(x.ttl) + '</td></tr>'; }); });
		$('dl-dns').innerHTML = t;
		var dom = encodeURIComponent(d.domain);
		$('dl-links').innerHTML = [['ICANN Lookup', 'https://lookup.icann.org/en/lookup?name=' + dom], ['Internet Archive', 'https://web.archive.org/web/*/' + dom], ['Google Transparency Report', 'https://transparencyreport.google.com/safe-browsing/search?url=' + dom], ['VirusTotal', 'https://www.virustotal.com/gui/domain/' + dom], ['crt.sh certificates', 'https://crt.sh/?q=' + dom], ['URLScan', 'https://urlscan.io/search/#' + dom], ['DNSChecker', 'https://dnschecker.org/all-dns-records-of-domain.php?query=' + dom], ['SecurityTrails', 'https://securitytrails.com/domain/' + dom + '/dns']].map(function (l) { return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + '</a>'; }).join('');
	}
	$('dl-copy').onclick = function () { if (!last) return; var a = last.__a, r = last.rdap; copy([last.domain, a.age ? 'Age: ' + a.age : '', r && r.created ? 'Registered: ' + dateOnly(r.created) : '', r && r.expires ? 'Expires: ' + dateOnly(r.expires) : '', r && r.registrar ? 'Registrar: ' + r.registrar : '', a.hosting.length ? 'Hosted by: ' + a.hosting.map(function (x) { return x.name; }).join(', ') : '', a.dnsProviders.length ? 'DNS: ' + a.dnsProviders.join(', ') : '', a.mail.length ? 'Email: ' + a.mail.join(', ') : '', '(mes.fm/domain-lookup)'].filter(Boolean).join('\n'), 'Summary copied'); };
	$('dl-link').onclick = function () { if (last) copy(location.origin + location.pathname + '?d=' + encodeURIComponent(last.domain), 'Link copied'); };
	$('dl-json').onclick = function () { if (!last) return; var c = JSON.parse(JSON.stringify(last)); delete c.__a; copy(JSON.stringify(c, null, 2), 'Raw data copied'); };
	drawRecent();
	var q0 = new URLSearchParams(location.search).get('d'); if (q0) { $('dl-q').value = q0; go(); }
})();
