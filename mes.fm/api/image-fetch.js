// Fetch a picture (or PDF) from a link for mes.fm/translate and mes.fm/image-to-text, when the browser cannot load it itself
// (the other site sends no CORS headers). GET /api/image-fetch?url=<http(s) link>  ->  the bytes, with their real type.
//
// The link is typed by a visitor, so this is careful not to become a way into private networks or an open proxy:
//   - http / https only, default ports, no user:password@, no bare IP addresses, no data: / blob: / file: (checkUrl in _url-guard.js)
//   - the name is resolved with DNS-over-HTTPS (Cloudflare) and refused unless EVERY address is public; the connection is then made to
//     that checked address (Node's `lookup` hook), so a second DNS answer cannot point it somewhere else (DNS rebinding)
//   - redirects are followed by hand, at most 4, each new link checked the same way
//   - 8 s for the whole thing, MAX_BYTES at most, no cookies, nothing forwarded from the visitor
//   - only image/* (not SVG) or PDF, and the first bytes must really be one (sniff); the reply carries the sniffed type,
//     `nosniff`, a sandbox CSP and no-store, so opening the URL directly can never run anything on mes.fm
//   - 60 fetches per visitor IP per hour when Upstash Redis is set up (same UPSTASH_REDIS_REST_URL / _TOKEN as api/fav.js); without it, no limit
// MAX_BYTES is 4.4 MB because a Vercel Function's response body is capped at 4.5 MB: bigger files must be downloaded and dropped on the page.
'use strict';
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const G = require('./_url-guard.js');

const MAX_BYTES = 4400000;
const DEADLINE_MS = 8000;
const MAX_HOPS = 4;
const PER_HOUR = 60;
const UA = 'mes.fm-image-fetch/1.0 (+https://mes.fm/image-to-text)';

function fail(res, code, msg) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(code).send(JSON.stringify({ error: msg }));
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

// One request to `url`, connected to the already-checked address `ip`. Resolves { status, headers, body: Buffer | null }.
function getPinned(url, ip, deadline) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http;
    const left = deadline - Date.now();
    if (left <= 0) return reject(new Error('timeout'));
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET',
      servername: u.hostname, agent: false,
      headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,application/pdf;q=0.9,*/*;q=0.1', 'accept-encoding': 'identity' },
      lookup: (host, opts, cb) => { if (opts && opts.all) cb(null, [{ address: ip.address, family: ip.family }]); else cb(null, ip.address, ip.family); },
    }, (r) => {
      const status = r.statusCode, headers = r.headers;
      if (status >= 300 && status < 400) { r.resume(); return resolve({ status, headers, body: null }); }
      if (status !== 200) { r.resume(); return resolve({ status, headers, body: null }); }
      if (!G.typeAllowed(headers['content-type'])) { r.destroy(); return resolve({ status, headers, body: null, badType: true }); }
      const len = +headers['content-length'];
      if (len > MAX_BYTES) { r.destroy(); return resolve({ status, headers, body: null, tooBig: true }); }
      const parts = []; let n = 0;
      r.on('data', (c) => { n += c.length; if (n > MAX_BYTES) { r.destroy(); resolve({ status, headers, body: null, tooBig: true }); } else parts.push(c); });
      r.on('end', () => resolve({ status, headers, body: Buffer.concat(parts) }));
      r.on('error', reject);
    });
    req.setTimeout(left, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function rateOk(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return true;
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();
  const key = 'imgfetch:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24) + ':' + Math.floor(Date.now() / 3600000);
  try {
    const r = await fetch(url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3700]]) });
    const j = await r.json();
    return !(Array.isArray(j) && j[0] && j[0].result > PER_HOUR);
  } catch (e) { return true; }                                                   // Redis down: don't block people
}

async function handler(req, res, deps) {
  const resolve = (deps && deps.resolve) || doh, get = (deps && deps.get) || getPinned, limit = (deps && deps.rateOk) || rateOk;
  if (req.method !== 'GET') return fail(res, 405, 'GET only');
  const first = G.checkUrl(req.query && req.query.url);
  if (!first.ok) return fail(res, 400, first.reason);
  if (!(await limit(req))) return fail(res, 429, 'Too many pictures fetched from your connection this hour. Download the picture and drop the file instead.');
  const deadline = Date.now() + DEADLINE_MS;
  let url = first.url, hops = 0;
  try {
    for (;;) {
      const c = G.checkUrl(url);
      if (!c.ok) return fail(res, 400, 'The link redirects somewhere this tool will not go: ' + c.reason);
      const ip = await G.pickPublicIp(c.host, resolve);
      if (!ip) return fail(res, 400, 'That address does not point to a public web server.');
      const r = await get(c.url, ip, deadline);
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers && r.headers.location;
        if (!loc || ++hops > MAX_HOPS) return fail(res, 502, 'Too many redirects.');
        try { url = new URL(loc, c.url).toString(); } catch (e) { return fail(res, 502, 'Bad redirect.'); }
        continue;
      }
      if (r.tooBig) return fail(res, 413, 'That file is bigger than ' + (MAX_BYTES / 1e6).toFixed(1) + ' MB. Download it and drop the file on the page instead.');
      if (r.badType) return fail(res, 415, 'That link is not a picture or PDF (it is ' + String(r.headers['content-type'] || 'unknown').split(';')[0] + ').');
      if (r.status !== 200 || !r.body) return fail(res, 502, 'The other site answered ' + r.status + '.');
      const type = G.sniff(r.body);
      if (!type) return fail(res, 415, 'That link is not a picture or PDF this page can read.');
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Length', String(r.body.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(r.body);
    }
  } catch (e) {
    return fail(res, 504, /timeout/.test(String(e && e.message)) ? 'The other site did not answer in time.' : 'Could not fetch that link.');
  }
}

module.exports = (req, res) => handler(req, res);
Object.assign(module.exports, { handler, MAX_BYTES });
