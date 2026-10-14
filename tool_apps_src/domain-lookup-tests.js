var D = require('./domain-lookup/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
var NOW = Date.UTC(2026, 9, 14);
eq(D.ageText('2014-09-13T00:00:00Z', NOW), '12 years, 1 month', 'age years+months'); eq(D.ageText('2026-10-10T00:00:00Z', NOW), '4 days', 'age days'); eq(D.ageText('2026-07-01T00:00:00Z', NOW), '3 months', 'age months');
eq(D.ageText('2025-10-15T00:00:00Z', NOW), '11 months', 'just under a year');
eq(D.dnsProvider(['ns71.domaincontrol.com', 'ns72.domaincontrol.com']).join(), 'GoDaddy', 'dns provider dedup'); eq(D.dnsProvider(['kate.ns.cloudflare.com']).join(), 'Cloudflare', 'cloudflare dns'); eq(D.dnsProvider(['ns1.unknownhost.net']).join(), 'unknownhost.net', 'unknown dns');
eq(D.mailProvider([{ data: '1 aspmx.l.google.com.' }, { data: '5 alt1.aspmx.l.google.com.' }]).join(), 'Google Workspace / Gmail', 'google mail'); eq(D.mailProvider([{ data: '0 x.mail.protection.outlook.com.' }]).join(), 'Microsoft 365', 'm365');
var h = D.hosting({ ips: [{ ip: '1.1.1.1', org: 'Cloudflare, Inc.', net: 'CLOUDFLARENET' }, { ip: '2.2.2.2', net: 'VERCEL-05' }, { ip: '3.3.3.3', org: 'Cloudflare, Inc.', net: 'CLOUDFLARENET' }] });
eq(h.length, 2, 'hosting deduplicated'); eq(h[0].kind, 'cdn', 'cloudflare is a cdn'); eq(h[1].name, 'Vercel', 'vercel');
var base = { rdap: { created: '2026-10-01T00:00:00Z', expires: '2026-10-30T00:00:00Z', status: ['clientHold'], registrantRedacted: true, nameservers: ['a.ns.cloudflare.com'] }, dns: { MX: [{ data: '1 aspmx.l.google.com.' }], TXT: [], DMARC: [] }, ips: [{ ip: '1.1.1.1', org: 'Cloudflare, Inc.' }], wayback: null };
var a = D.analyze(base, NOW); var lv = a.signals.map(function (s) { return s.level + ':' + s.text.slice(0, 30); });
eq(a.ageDays, 13, 'age days'); eq(a.signals[0].level, 'warn', 'new domain warns'); eq(a.signals.some(function (s) { return /Expires in 16 days/.test(s.text); }), true, 'expiry soon');
eq(a.signals.some(function (s) { return /hold/i.test(s.text); }), true, 'hold status'); eq(a.signals.some(function (s) { return /no SPF/.test(s.text); }), true, 'no spf'); eq(a.signals.some(function (s) { return /CDN/.test(s.text); }), true, 'cdn note');
var old = D.analyze({ rdap: { created: '2005-01-01T00:00:00Z', expires: '2030-01-01T00:00:00Z', status: ['clientTransferProhibited'], registrantRedacted: false, dnssec: true, nameservers: [] }, dns: { MX: [{ data: '1 mx.example.com.' }], TXT: [{ data: 'v=spf1 -all' }], DMARC: [{ data: 'v=DMARC1; p=reject' }] }, ips: [], wayback: { first: '2005-03-02' } }, NOW);
eq(old.signals.some(function (s) { return /established/.test(s.text); }), true, 'established'); eq(old.signals.some(function (s) { return /DMARC is set to reject/.test(s.text); }), true, 'dmarc reject'); eq(old.signals.some(function (s) { return /no SPF|No DMARC/.test(s.text); }), false, 'no false email warnings');
eq(old.signals.some(function (s) { return /hidden/.test(s.text); }), false, 'public registrant not called hidden');
var re = D.analyze({ rdap: { created: '2020-01-01T00:00:00Z', expires: '2027-01-01T00:00:00Z', status: [], registrantRedacted: true }, dns: {}, ips: [], wayback: { first: '2010-05-05' } }, NOW);
eq(re.signals.some(function (s) { return /changed owners/.test(s.text); }), true, 're-registration hint');
eq(D.analyze({ rdap: null, dns: {}, ips: [] }, NOW).signals[0].level, 'warn', 'no record warns');
// api helper
var api = require('../mes.fm/api/domain-lookup.js');
eq(api.cleanHost('https://WWW.Example.com:8080/a?b#c'), 'www.example.com', 'clean url'); eq(api.cleanHost('user@host.org'), 'host.org', 'strips userinfo'); eq(api.cleanHost('bücher.de'), 'xn--bcher-kva.de', 'punycode');
eq(api.cleanHost('127.0.0.1'), null, 'ip rejected'); eq(api.cleanHost('localhost'), null, 'no dot rejected'); eq(api.cleanHost('a.local'), null, '.local rejected'); eq(api.cleanHost('exa mple.com'), null, 'space rejected'); eq(api.cleanHost('[::1]'), null, 'ipv6 rejected'); eq(api.cleanHost('x'.repeat(300) + '.com'), null, 'too long');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
