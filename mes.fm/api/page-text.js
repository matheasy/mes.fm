// Read the text of a web page (an article, a blog post, a report page) for mes.fm/gnm, which cannot fetch other sites from the browser.
// GET /api/page-text?url=<http(s) link>  ->  {title, text, url}   (only the readable text: no HTML, scripts or pictures are passed on)
//   or {redo: "pdf"|"docx", url}  when the link is really a PDF / Word file (the page then opens it with main_js/link-open.js).
// Same safety rules as api/image-fetch.js (shared _url-guard.js): http(s) only, default ports, public addresses only (DoH, every A/AAAA
// checked, the connection pinned to the checked address), at most 4 redirects each re-checked, 8 s, 3 MB, no cookies, nothing forwarded,
// 60 per visitor IP per hour with Upstash. Nothing is stored.
'use strict';
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const G = require('./_url-guard.js');
const T = require('./_page-text-lib.js');

const MAX_BYTES = 3000000;
const DEADLINE_MS = 8000;
const MAX_HOPS = 4;
const PER_HOUR = 60;
const UA = 'Mozilla/5.0 (compatible; mes.fm-page-text/1.0; +https://mes.fm/gnm)';

function send(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(code).send(JSON.stringify(obj));
}
const fail = (res, code, msg) => send(res, code, { error: msg });

async function doh(host, type) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json(), want = type === 'A' ? 1 : 28;
    return Array.isArray(j.Answer) ? j.Answer.filter((a) => a.type === want).map((a) => a.data) : [];
  } catch (e) { return []; } finally { clearTimeout(t); }
}

function typeOk(ct) {
  const t = String(ct || '').toLowerCase().split(';')[0].trim();
  return !t || /^text\/(html|plain)$/.test(t) || t === 'application/xhtml+xml' || t === 'application/pdf' || t === G.DOCX || /octet-stream|zip|msword/.test(t);
}

function getPinned(url, ip, deadline) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http, left = deadline - Date.now();
    if (left <= 0) return reject(new Error('timeout'));
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET', servername: u.hostname, agent: false,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8,*/*;q=0.1', 'accept-language': 'en;q=0.9,*;q=0.5', 'accept-encoding': 'identity' },
      lookup: (host, opts, cb) => { if (opts && opts.all) cb(null, [{ address: ip.address, family: ip.family }]); else cb(null, ip.address, ip.family); },
    }, (r) => {
      const status = r.statusCode, headers = r.headers;
      if (status !== 200) { r.resume(); return resolve({ status, headers, body: null }); }
      if (!typeOk(headers['content-type'])) { r.destroy(); return resolve({ status, headers, body: null, badType: true }); }
      // a PDF / Word file: no need to read it, the browser opens it itself
      const t = String(headers['content-type'] || '').toLowerCase();
      if (/application\/pdf/.test(t)) { r.destroy(); return resolve({ status, headers, body: null, redo: 'pdf' }); }
      if (t.indexOf(G.DOCX) >= 0) { r.destroy(); return resolve({ status, headers, body: null, redo: 'docx' }); }
      const parts = []; let n = 0, done = false;
      r.on('data', (c) => { if (done) return; n += c.length; if (n > MAX_BYTES) { done = true; r.destroy(); resolve({ status, headers, body: Buffer.concat(parts), cut: true }); } else parts.push(c); });
      r.on('end', () => { if (!done) resolve({ status, headers, body: Buffer.concat(parts) }); });
      r.on('error', (e) => { if (!done) reject(e); });
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
  const key = 'pagetext:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24) + ':' + Math.floor(Date.now() / 3600000);
  try {
    const r = await fetch(url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3700]]) });
    const j = await r.json();
    return !(Array.isArray(j) && j[0] && j[0].result > PER_HOUR);
  } catch (e) { return true; }
}

async function handler(req, res, deps) {
  const resolve = (deps && deps.resolve) || doh, get = (deps && deps.get) || getPinned, limit = (deps && deps.rateOk) || rateOk;
  if (req.method !== 'GET') return fail(res, 405, 'GET only');
  const first = G.checkUrl(req.query && req.query.url);
  if (!first.ok) return fail(res, 400, first.reason);
  if (!(await limit(req))) return fail(res, 429, 'Too many pages read from your connection this hour. Copy the text and paste it instead.');
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
      if (r.redo) return send(res, 200, { redo: r.redo, url: c.url });
      if (r.badType) return fail(res, 415, 'That link is not a web page, PDF or Word file (it is ' + String(r.headers['content-type'] || 'unknown').split(';')[0] + ').');
      if (r.status === 401 || r.status === 403) return fail(res, 502, 'That site will not let other servers read the page (' + r.status + '). Open it, copy the text and paste it instead.');
      if (r.status !== 200 || !r.body) return fail(res, 502, 'The other site answered ' + r.status + '.');
      const sn = G.sniff(r.body), dx = G.sniffDocx(r.body);
      if (sn === 'application/pdf') return send(res, 200, { redo: 'pdf', url: c.url });
      if (dx) return send(res, 200, { redo: 'docx', url: c.url });
      if (sn) return fail(res, 415, 'That link is a picture: save it and drop it on the page instead.');
      const ct = String(r.headers['content-type'] || '').toLowerCase(), html = T.decode(r.body, ct);
      const out = /text\/plain/.test(ct) ? { title: '', text: html.slice(0, 400000) } : T.extract(html);
      if (out.text.replace(/\s/g, '').length < 40) return fail(res, 422, 'Hardly any text was found on that page (it may build itself with JavaScript or need a sign-in). Open it, copy the text and paste it instead.');
      return send(res, 200, { title: out.title, text: out.text, url: c.url, cut: !!r.cut });
    }
  } catch (e) {
    return fail(res, 504, /timeout/.test(String(e && e.message)) ? 'The other site did not answer in time.' : 'Could not fetch that link.');
  }
}

module.exports = (req, res) => handler(req, res);
Object.assign(module.exports, { handler, MAX_BYTES });
