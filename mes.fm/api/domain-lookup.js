// Domain lookup for mes.fm/domain-lookup (a "whois" for the web): registration (RDAP), DNS records (DNS over HTTPS), where the site is hosted (IP -> network owner
// via RDAP, reverse DNS) and when the site first appeared in the Internet Archive.
//
// GET /api/domain-lookup?d=example.com  ->  { domain, host, rdap, dns, ips, wayback, ms }  (see normalise* below). Nothing from the client is ever used as a URL:
// the only fetches go to fixed services (IANA bootstrap, the registry's RDAP server named there, Cloudflare DNS over HTTPS, the Internet Archive, RDAP.org for IPs)
// and, for thin registries such as .com, the registrar RDAP URL the registry itself returns (https only, never an IP literal or localhost). The name is validated first.
// Edge cache 30 min (stale-while-revalidate 1 h); errors are no-store. No keys, no storage.
const BOOT_TTL = 6 * 3600 * 1000;
let bootCache = null;

function bad(res, code, msg) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json({ error: msg }); }
function timeoutFetch(url, opts, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 4500);
  return fetch(url, Object.assign({ signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'mes.fm-domain-lookup/1.0 (+https://mes.fm/domain-lookup)' } }, opts || {})).finally(() => clearTimeout(t));
}
async function getJson(url, opts, ms) { try { const r = await timeoutFetch(url, opts, ms); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } }

// accepts "https://www.Example.com/path?x", "example.com", "exämple.de"; returns an ASCII (punycode) host or null
function cleanHost(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s || s.length > 300) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!s || s.length > 253 || !s.includes('.')) return null;
  try { s = new URL('http://' + s).hostname; } catch (e) { return null; }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s) || s.includes(':') || s.startsWith('[')) return null;           // IP literals: not a domain
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  if (/(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(s)) return null;
  return s;
}

async function bootstrap() {
  if (bootCache && Date.now() - bootCache.t < BOOT_TTL) return bootCache.map;
  const j = await getJson('https://data.iana.org/rdap/dns.json', null, 4000), map = {};
  if (j && Array.isArray(j.services)) j.services.forEach((s) => { (s[0] || []).forEach((tld) => { map[tld] = (s[1] || []).find((u) => u.startsWith('https://')) || s[1][0]; }); });
  if (Object.keys(map).length) bootCache = { t: Date.now(), map };
  return map;
}

function vcardField(card, name) { const e = card && card[1] && card[1].find((x) => x[0] === name); return e ? e[3] : null; }
function entityInfo(ent) {
  const card = ent.vcardArray, adr = card && card[1] && card[1].find((x) => x[0] === 'adr');
  let addr = null; if (adr && Array.isArray(adr[3])) addr = adr[3].filter(Boolean).join(', ');
  const f = (n) => { const v = vcardField(card, n); return typeof v === 'string' ? v : null; };
  return { name: f('fn'), org: f('org'), email: f('email'), phone: f('tel'), country: adr && Array.isArray(adr[3]) ? adr[3][6] || null : null, address: addr };
}
function isRedacted(s) { return !s || /redact|privacy|withheld|not disclosed|data protected|gdpr|select request|contact the registrar|proxy/i.test(s); }

function normaliseRdap(j, source) {
  if (!j || !j.ldhName) return null;
  const ev = {}; (j.events || []).forEach((e) => { ev[e.eventAction] = e.eventDate; });
  const roles = {}; const walk = (list) => (list || []).forEach((e) => { (e.roles || []).forEach((r) => { if (!roles[r]) roles[r] = entityInfo(e); if (r === 'registrar' && !roles.registrarIana) { const id = (e.publicIds || []).find((p) => /iana/i.test(p.type)); if (id) roles.registrarIana = id.identifier; } }); walk(e.entities); }); walk(j.entities);
  const reg = roles.registrant || null, abuse = roles.abuse || null;
  const hasReg = reg && (reg.name || reg.org || reg.email) && !(isRedacted(reg.name) && isRedacted(reg.org));
  return {
    source, domain: j.ldhName.toLowerCase(), handle: j.handle || null, status: j.status || [],
    created: ev.registration || null, updated: ev['last changed'] || null, expires: ev.expiration || null, transferred: ev.transfer || null,
    registrar: roles.registrar ? roles.registrar.name || roles.registrar.org : null, registrarIana: roles.registrarIana || null,
    registrant: hasReg ? { name: reg.name, org: reg.org, country: reg.country, address: reg.address, email: reg.email } : null,
    registrantRedacted: !hasReg, abuse: abuse ? { email: abuse.email, phone: abuse.phone } : null,
    nameservers: (j.nameservers || []).map((n) => (n.ldhName || '').toLowerCase().replace(/\.$/, '')).filter(Boolean), dnssec: j.secureDNS ? !!j.secureDNS.delegationSigned : null,
    registrarRdap: ((j.links || []).find((l) => l.rel === 'related' && l.type === 'application/rdap+json') || {}).href || null
  };
}
function safeHttps(u) { try { const x = new URL(u); return x.protocol === 'https:' && !/^(\d+\.\d+\.\d+\.\d+|\[.*\]|localhost)$/.test(x.hostname) && !x.hostname.endsWith('.local'); } catch (e) { return false; } }

async function rdapDomain(host) {
  const map = await bootstrap(), labels = host.split('.');
  for (let i = 0; i <= Math.min(2, labels.length - 2); i++) {
    const cand = labels.slice(i).join('.'), tld = labels[labels.length - 1], base = map[tld];
    let j = null, src = null;
    if (base) { src = base.replace(/\/?$/, '/') + 'domain/' + cand; j = await getJson(src, null, 5000); }
    if (!j) { src = 'https://rdap.org/domain/' + cand; j = await getJson(src, null, 5000); }
    const n = normaliseRdap(j, src);
    if (n) {
      if (n.registrarRdap && safeHttps(n.registrarRdap) && (!n.registrant || !n.abuse)) {      // thin registry (.com, .net): the registrar record has the detail
        const r2 = normaliseRdap(await getJson(n.registrarRdap, null, 3500), n.registrarRdap);
        if (r2) { n.registrant = n.registrant || r2.registrant; n.registrantRedacted = !n.registrant; n.abuse = n.abuse || r2.abuse; n.registrar = n.registrar || r2.registrar; n.expires = n.expires || r2.expires; n.updated = n.updated || r2.updated; n.status = n.status.length ? n.status : r2.status; }
      }
      delete n.registrarRdap; return n;
    }
  }
  return null;
}

const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
async function doh(name, type) {
  const j = await getJson('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type, { headers: { accept: 'application/dns-json' } }, 3500);
  if (!j || !Array.isArray(j.Answer)) return [];
  return j.Answer.filter((a) => a.type === TYPES[type]).map((a) => ({ data: String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, ''), ttl: a.TTL }));
}
function arpa(ip) { return ip.split('.').reverse().join('.') + '.in-addr.arpa'; }

async function ipInfo(ip) {
  const j = await getJson('https://rdap.org/ip/' + ip, null, 4500), ptr = await doh(arpa(ip), 'PTR');
  const out = { ip, ptr: ptr[0] ? ptr[0].data.replace(/\.$/, '') : null, net: null, org: null, country: null, cidr: null };
  if (j) {
    out.net = j.name || null; out.country = j.country || null; if (j.cidr0_cidrs && j.cidr0_cidrs[0]) out.cidr = j.cidr0_cidrs[0].v4prefix + '/' + j.cidr0_cidrs[0].length;
    let found = null; const walk = (list) => (list || []).forEach((e) => { if (!found && (e.roles || []).some((r) => /registrant|administrative|technical/.test(r))) { const i = entityInfo(e); if (i.org || i.name) found = i.org || i.name; } walk(e.entities); }); walk(j.entities);
    out.org = found;
  }
  return out;
}

// Best effort: the Internet Archive is slow and sometimes down, so the page asks for this separately (?only=wayback) after the main answer is on screen.
async function wayback(host) {
  const j = await getJson('https://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent(host) + '&limit=1&output=json&fl=timestamp&filter=statuscode:200', null, 8000);
  let t = Array.isArray(j) && j.length > 1 ? j[1][0] : null, k = null;
  if (!t) { k = await getJson('https://archive.org/wayback/available?url=' + encodeURIComponent(host) + '&timestamp=19900101', null, 8000); const c = k && k.archived_snapshots && k.archived_snapshots.closest; if (c && c.timestamp) t = c.timestamp; }
  if (!t) return (j === null && k === null) ? { unavailable: true } : null;       // both calls failed: say so instead of claiming there is no snapshot
  return { first: t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8), url: 'https://web.archive.org/web/' + t + '/' + host };
}

module.exports = async (req, res) => {
  const t0 = Date.now(), host = cleanHost(req.query && (req.query.d || req.query.domain));
  if (!host) return bad(res, 400, 'Enter a domain name like example.com');
  if (req.query && req.query.only === 'wayback') {
    const w = await wayback(host);
    res.setHeader('Cache-Control', w ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=600');
    return res.status(200).json({ wayback: w });
  }
  try {
    const rd = rdapDomain(host), reg = host.split('.');
    const [a, aaaa, cname] = await Promise.all([doh(host, 'A'), doh(host, 'AAAA'), doh(host, 'CNAME')]);
    const r = await rd, apex = r ? r.domain : reg.slice(-2).join('.');
    const [ns, mx, txt, caa, soa, dmarc, wwwA] = await Promise.all([doh(apex, 'NS'), doh(apex, 'MX'), doh(apex, 'TXT'), doh(apex, 'CAA'), doh(apex, 'SOA'), doh('_dmarc.' + apex, 'TXT'), host === apex ? doh('www.' + apex, 'A') : Promise.resolve([])]);
    const ips = [...new Set(a.map((x) => x.data).concat(wwwA.map((x) => x.data)))].filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)).slice(0, 4);
    const ipData = await Promise.all(ips.map(ipInfo));
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ domain: apex, host, rdap: r, dns: { A: a, AAAA: aaaa, CNAME: cname, NS: ns, MX: mx, TXT: txt, CAA: caa, SOA: soa, DMARC: dmarc, wwwA }, ips: ipData, wayback: null, ms: Date.now() - t0 });
  } catch (e) { bad(res, 502, 'The lookup failed. Try again in a moment.'); }
};
module.exports.cleanHost = cleanHost;
module.exports.normaliseRdap = normaliseRdap;
