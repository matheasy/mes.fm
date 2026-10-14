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
