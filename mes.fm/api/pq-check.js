// GET /api/pq-check?u=<link>  -- "Is this website quantum-safe?" for mes.fm/quantum-safe-check.
// Answers JSON about the site's HTTPS: does it accept the post-quantum hybrid key exchange (X25519MLKEM768, or the old Kyber draft),
// TLS version, cipher, classical key exchange, certificate key type / size / issuer / expiry, and where the page redirects.
// Safety (same rules as api/image-fetch.js, helpers in _url-guard.js): http(s) links only, default ports, no IP literals; the name is resolved
// over DNS-over-HTTPS and refused unless EVERY address is public; every connection goes to that checked address (no rebinding);
// redirects are reported, never followed to another host; 6 s budget; nothing from the other site's page body is returned.
// 60 checks per visitor IP per hour with Upstash (same UPSTASH_REDIS_REST_URL / _TOKEN as api/fav.js); cached at the edge for an hour.
'use strict';
const net = require('net'), tls = require('tls'), crypto = require('crypto');
const G = require('./_url-guard.js'), P = require('./_pq-tls.js');
const PER_HOUR = 60, STEP_MS = 5000;

function send(res, code, obj, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', cache ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.status(code).send(JSON.stringify(obj));
}
async function doh(host, type) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json(), want = type === 'A' ? 1 : 28;
    return Array.isArray(j.Answer) ? j.Answer.filter((a) => a.type === want).map((a) => a.data) : [];
  } catch (e) { return []; } finally { clearTimeout(t); }
}
async function rateOk(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return true;
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();
  const key = 'pqcheck:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24) + ':' + Math.floor(Date.now() / 3600000);
  try {
    const r = await fetch(url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3700]]) });
    const j = await r.json();
    return !(Array.isArray(j) && j[0] && j[0].result > PER_HOUR);
  } catch (e) { return true; }
}

// Raw ClientHello offering one key share; resolves the parsed server reply.
function probeGroup(ip, host, group) {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0), done = false;
    const s = net.connect({ host: ip.address, port: 443, family: ip.family });
    const fin = (r) => { if (done) return; done = true; clearTimeout(t); s.destroy(); resolve(r); };
    const t = setTimeout(() => fin({ kind: 'timeout' }), STEP_MS);
    s.on('connect', () => s.write(P.clientHello(host, group)));
    s.on('data', (d) => { buf = Buffer.concat([buf, d]); if (buf.length > 65536) return fin({ kind: 'other' }); const r = P.parseServerReply(buf); if (r) fin(r); });
    s.on('error', (e) => fin({ kind: 'error', code: e.code || 'error' }));
    s.on('end', () => fin(P.parseServerReply(buf) || { kind: 'closed' }));
  });
}
// A normal handshake (whatever this Node offers) for TLS version, cipher, classical group and the certificate; then one HEAD for redirects.
function classic(ip, host, path) {
  return new Promise((resolve) => {
    let done = false;
    const s = tls.connect({ host: ip.address, port: 443, servername: host, ALPNProtocols: ['http/1.1'], rejectUnauthorized: false });
    const fin = (r) => { if (done) return; done = true; clearTimeout(t); s.destroy(); resolve(r); };
    const t = setTimeout(() => fin(info || { error: 'timeout' }), STEP_MS);
    let info = null, head = '';
    s.on('secureConnect', () => {
      const c = s.getPeerCertificate(true) || {}, kx = s.getEphemeralKeyInfo() || {};
      let ktype = null, kbits = null, curve = null;
      try { const x = new crypto.X509Certificate(c.raw); const k = x.publicKey; ktype = k.asymmetricKeyType; const d = k.asymmetricKeyDetails || {}; kbits = d.modulusLength || null; curve = d.namedCurve || null; } catch (e) {}
      info = { tls: s.getProtocol(), cipher: (s.getCipher() || {}).name, kx: kx.name || null, certValid: s.authorized, certError: s.authorized ? null : String(s.authorizationError || ''),
        cert: { type: ktype === 'rsa' ? 'RSA' : ktype === 'ec' ? 'ECDSA' : ktype ? ktype.toUpperCase() : null, bits: kbits, curve: curve,
          issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || null, subject: (c.subject && c.subject.CN) || null, validTo: c.valid_to || null } };
      s.write('HEAD ' + path + ' HTTP/1.1\r\nHost: ' + host + '\r\nUser-Agent: mes.fm-quantum-safe-check/1.0\r\nConnection: close\r\n\r\n');
    });
    s.on('data', (d) => { head += d.toString('latin1'); if (head.length > 16384 || head.includes('\r\n\r\n')) { const m = /^HTTP\/1\.[01] (\d{3})/.exec(head), loc = /\r\nlocation:\s*([^\r\n]+)/i.exec(head); if (info) { info.status = m ? +m[1] : null; info.location = loc ? loc[1].trim().slice(0, 500) : null; } fin(info); } });
    s.on('error', (e) => fin(info || { error: e.code || 'error' }));
    s.on('end', () => fin(info || { error: 'closed' }));
  });
}

async function check(host, path, deps) {
  const resolve = (deps && deps.resolve) || doh, probe = (deps && deps.probe) || probeGroup, cl = (deps && deps.classic) || classic;
  const ip = await G.pickPublicIp(host, resolve);
  if (!ip) return { error: 'That name does not point to a public web server.' };
  const t0 = Date.now();
  const [a, c] = await Promise.all([probe(ip, host, P.GROUPS.X25519MLKEM768), cl(ip, host, path)]);
  if (c.error && (a.kind === 'error' || a.kind === 'timeout')) return { error: 'No HTTPS answer from ' + host + ' (' + (c.error || a.code || a.kind) + ').', https: false };
  const pq = a.kind === 'hello' && a.group === P.GROUPS.X25519MLKEM768;
  let draft = false, b = null;
  if (!pq) { b = await probe(ip, host, P.GROUPS.X25519Kyber768Draft00); draft = b.kind === 'hello' && b.group === P.GROUPS.X25519Kyber768Draft00; }
  const r = { host, ip: ip.family === 4 ? ip.address.replace(/\.\d+$/, '.x') : ip.address.replace(/:[0-9a-f]*:[0-9a-f]*$/i, ':…'), https: true, pq, draft,
    kx: pq ? 'X25519MLKEM768' : draft ? 'X25519Kyber768Draft00' : (a.kind === 'hrr' && a.groupName) || c.kx || null,
    tls: c.tls || (a.tls13 ? 'TLSv1.3' : null), cipher: c.cipher || null, cert: c.cert || null, certValid: c.certValid !== false, certError: c.certError || null,
    serverReply: a.kind, status: c.status || null, location: c.location || null, ms: Date.now() - t0 };
  if (r.location) { try { const u = new URL(r.location, 'https://' + host + path); if (u.hostname.toLowerCase() !== host) r.redirectHost = u.hostname.toLowerCase(); } catch (e) {} }
  Object.assign(r, P.grade(r));
  return r;
}

async function handler(req, res, deps) {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  let raw = String((req.query && req.query.u) || '').trim();
  if (raw && !/^[a-z]+:\/\//i.test(raw)) raw = 'https://' + raw;
  const c = G.checkUrl(raw);
  if (!c.ok) return send(res, 400, { error: c.reason });
  if (!(await ((deps && deps.rateOk) || rateOk)(req))) return send(res, 429, { error: 'Too many checks from your connection this hour. Try again later.' });
  let path = '/'; try { const u = new URL(c.url); path = (u.pathname || '/') + (u.search || ''); } catch (e) {}
  try {
    const r = await check(c.host, path.slice(0, 1000), deps);
    if (r.error) return send(res, 502, Object.assign({ host: c.host }, r));
    r.httpsInLink = c.https;
    return send(res, 200, r, true);
  } catch (e) { return send(res, 504, { host: c.host, error: 'The check did not finish in time.' }); }
}

module.exports = (req, res) => handler(req, res);
Object.assign(module.exports, { handler, check });

// node mes.fm/api/pq-check.js github.com mes.fm  -> live check from this computer
if (require.main === module) (async () => { for (const h of process.argv.slice(2)) console.log(JSON.stringify(await check(h, '/'))); })();
