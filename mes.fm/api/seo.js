// On-page SEO facts for mes.fm/seo. GET /api/seo?u=<page address>
// Fetches the page's HTML once, then /robots.txt of the final site and the sitemap(s) it names (or /sitemap.xml; a sitemap index: at most 3 child
// sitemaps), and returns *facts* (title, meta, headings, links, robots result, sitemap result ...), never the page itself. The parsing is
// ./_seo-lib.js = a byte-identical copy of tool_apps_src/seo/lib.js (the page scores the facts with the same code; tool_apps_src/seo-tests.js
// checks the copies match).
// Safety (same rules as api/site-traffic.js tech mode): http/https only, default ports only, no user:password@, no IP literals or private names;
// every hop (including each redirect, robots.txt and sitemap) is DNS-resolved over HTTPS first and refused unless every A / AAAA record is public;
// at most 4 redirects; timeouts; the page is read up to 1.5 MB, robots.txt 500 KB, sitemaps 3 MB; no cookies are sent or kept. Edge-cached 10 min.
const L = require('./_seo-lib.js');
const { cleanHost } = require('./domain-lookup.js');
const { ipv4Public, ipv6Public } = require('./site-traffic.js');

const UA = 'Mozilla/5.0 (compatible; MES-SEO-Checker/1.0; +https://mes.fm/seo)';
const PAGE_MAX = 1500000, ROBOTS_MAX = 500000, SITEMAP_MAX = 3000000, MAX_HOPS = 4, BUDGET_MS = 7000;
// Vercel's default limit is 10 s per call: the page gets up to 6 s, robots.txt + sitemaps share what is left (left() below), so a slow site cannot run over.
const left = (deadline, cap) => Math.max(800, Math.min(cap, deadline + 1500 - Date.now()));

function bad(res, code, msg) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json({ error: msg }); }
function tfetch(url, opts, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 5000);
  return fetch(url, Object.assign({ signal: ctl.signal }, opts || {})).finally(() => clearTimeout(t));
}

function makeResolver() {
  const cache = new Map();
  async function q(host, type) {
    try {
      const r = await tfetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, { headers: { accept: 'application/dns-json' } }, 3500);
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j.Answer) ? j.Answer.filter((a) => a.type === (type === 'A' ? 1 : 28)).map((a) => String(a.data)) : [];
    } catch (e) { return null; }
  }
  return function resolvesPublic(host) {
    if (!cache.has(host)) cache.set(host, (async () => {
      const [a, aaaa] = await Promise.all([q(host, 'A'), q(host, 'AAAA')]);
      if (a === null && aaaa === null) return { ok: false, why: 'dns' };
      const A = a || [], B = aaaa || [];
      if (!A.length && !B.length) return { ok: false, why: 'nxdomain' };
      return A.every(ipv4Public) && B.every(ipv6Public) ? { ok: true } : { ok: false, why: 'private' };
    })());
    return cache.get(host);
  };
}

// Is this (redirect) address one we are willing to visit? Returns the host or null.
function hopHost(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.port) return null;
  return cleanHost(u.hostname);
}

async function readLimited(res, max) {
  if (!res.body || !res.body.getReader) { const s = await res.text(); return { text: s.slice(0, max), bytes: Buffer.byteLength(s), truncated: s.length > max }; }
  const reader = res.body.getReader(), dec = new TextDecoder('utf-8', { fatal: false }); let n = 0, s = '', truncated = false;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    n += value.length; s += dec.decode(value, { stream: true });
    if (n >= max) { truncated = true; if (s.length > max) s = s.slice(0, max); n = Math.min(n, max); try { await reader.cancel(); } catch (e) {} break; }
  }
  return { text: s, bytes: n, truncated };
}

// fetch with manual redirects; every hop re-checked. -> {ok, status, url, chain, headers, text, bytes, truncated, ms} or {ok:false, error, chain}
async function safeFetch(start, resolve, opt) {
  let url = start; const chain = [];
  for (let hop = 0; ; hop++) {
    const host = hopHost(url);
    if (!host) return { ok: false, error: hop ? 'The page redirects to an address this tool will not visit (' + url.slice(0, 120) + ').' : 'That address cannot be checked.', chain };
    const pub = await resolve(host);
    if (!pub.ok) return { ok: false, error: pub.why === 'private' ? 'That name points to a private or reserved network address, so it is not checked.' : pub.why === 'nxdomain' ? 'The domain ' + host + ' does not exist (no DNS records).' : 'Could not look up ' + host + ' in DNS. Try again.', chain, dns: pub.why };
    const t0 = Date.now(); let r;
    try { r = await tfetch(url, { redirect: 'manual', headers: { 'user-agent': UA, accept: opt.accept || 'text/html,application/xhtml+xml,*/*;q=0.5', 'accept-language': 'en;q=0.9,*;q=0.5' } }, opt.ms || 8000); }
    catch (e) { return { ok: false, error: 'The site did not answer in time.', chain, timeout: true }; }
    const ms = Date.now() - t0;
    chain.push({ url, status: r.status, ms });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (!loc) return { ok: false, error: 'A redirect without a target address.', chain };
      if (hop + 1 > MAX_HOPS) return { ok: false, error: 'More than ' + MAX_HOPS + ' redirects, so the check stopped.', chain };
      try { url = new URL(loc, url).toString().replace(/#.*$/, ''); } catch (e) { return { ok: false, error: 'A redirect to a broken address.', chain }; }
      try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {}
      continue;
    }
    const headers = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k.toLowerCase()] = String(v).slice(0, 300); });
    const ct = (headers['content-type'] || '').toLowerCase();
    const want = opt.textOnly === false || !ct || /html|xml|text|json/.test(ct);
    const body = want ? await readLimited(r, opt.max) : (() => { try { r.body && r.body.cancel && r.body.cancel(); } catch (e) {} return { text: '', bytes: 0, truncated: false }; })();
    return { ok: true, status: r.status, url, chain, headers, text: body.text, bytes: body.bytes, truncated: body.truncated, ms };
  }
}

const KEEP = ['content-type', 'content-encoding', 'cache-control', 'x-robots-tag', 'strict-transport-security', 'server', 'last-modified', 'content-length', 'content-language', 'link', 'vary', 'age', 'x-cache', 'cf-cache-status', 'x-vercel-cache'];

async function robotsFor(origin, resolve, deadline) {
  if (Date.now() > deadline) return { checked: false };
  const r = await safeFetch(origin + '/robots.txt', resolve, { max: ROBOTS_MAX, ms: left(deadline, 3000), accept: 'text/plain,*/*;q=0.5' });
  if (!r.ok) return { found: false, error: r.error };
  if (r.status >= 400) return { found: false, status: r.status };
  const ct = (r.headers['content-type'] || '').toLowerCase();
  if (/html/.test(ct) && /<html/i.test(r.text.slice(0, 2000))) return { found: false, status: r.status, html: true };   // a "soft 404" HTML page served as robots.txt
  return { found: true, status: r.status, parsed: L.parseRobots(r.text), size: r.bytes };
}

async function sitemapFor(pageUrl, canonical, robots, origin, resolve, deadline) {
  const named = robots && robots.found ? robots.parsed.sitemaps.filter((s) => /^https?:\/\//i.test(s)) : [];
  const roots = (named.length ? named : [origin + '/sitemap.xml']).slice(0, 3);
  const targets = [pageUrl].concat(canonical && !L.sameUrl(canonical, pageUrl) ? [canonical] : []);
  const out = { found: false, inSitemap: null, checked: [], named: named.length, children: 0, urls: 0 };
  let budget = 4;                                                                     // sitemap fetches in total (roots + children)
  const look = (locs, where) => {
    out.urls += locs.length;
    for (const t of targets) { if (locs.some((l) => L.sameUrl(l, t))) { out.inSitemap = true; out.where = where; out.matched = t; return true; } }
    if (!out.loose) { const lo = locs.find((l) => targets.some((t) => L.sameUrl(l, t, true))); if (lo) out.loose = lo; }
    return false;
  };
  for (const root of roots) {
    if (budget-- <= 0 || Date.now() > deadline) break;
    const r = await safeFetch(root, resolve, { max: SITEMAP_MAX, ms: left(deadline, 3500), accept: 'application/xml,text/xml,*/*;q=0.5' });
    out.checked.push(root);
    if (!r.ok || r.status >= 400) continue;
    const sm = L.parseSitemap(r.text);
    if (sm.type === 'unknown') continue;
    out.found = true;
    if (sm.type !== 'index') { if (look(sm.locs, root)) return out; continue; }
    out.children += sm.locs.length;
    const kids = L.rankChildren(sm.locs, pageUrl).slice(0, 3);
    for (const k of kids) {
      if (budget-- <= 0 || Date.now() > deadline) break;
      const c = await safeFetch(k, resolve, { max: SITEMAP_MAX, ms: left(deadline, 3500), accept: 'application/xml,text/xml,*/*;q=0.5' });
      out.checked.push(k);
      if (!c.ok || c.status >= 400) continue;
      const cs = L.parseSitemap(c.text);
      if (cs.type === 'index') continue;                                              // nested indexes are not followed
      if (look(cs.locs, k)) return out;
    }
    if (sm.locs.length > kids.length) out.partial = true;
  }
  if (out.found && out.inSitemap === null) out.inSitemap = false;
  return out;
}

async function analyse(input) {
  const t0 = Date.now(), deadline = t0 + BUDGET_MS, resolve = makeResolver();
  const p = await safeFetch(input, resolve, { max: PAGE_MAX, ms: 6000 });
  if (!p.ok) return { input, error: p.error, chain: p.chain };
  const headers = {}; KEEP.forEach((k) => { if (p.headers[k]) headers[k] = p.headers[k]; });
  const ct = headers['content-type'] || '', isHtml = /html|xhtml/i.test(ct) || (!ct && /<html|<head|<title/i.test(p.text.slice(0, 3000)));
  const out = { input, finalUrl: p.url, status: p.status, chain: p.chain.map((c) => ({ url: c.url, status: c.status })), ms: p.ms, bytes: p.bytes, truncated: p.truncated, contentType: ct, https: p.url.startsWith('https:'), headers, checkedAt: new Date().toISOString() };
  out.page = isHtml && p.text ? L.extract(p.text, p.url) : null;
  if (out.page) out.page.finalUrl = p.url;
  const origin = new URL(p.url).origin;
  const rb = await robotsFor(origin, resolve, deadline);
  out.robots = { found: !!rb.found, status: rb.status || null, sitemaps: rb.found ? rb.parsed.sitemaps.slice(0, 10) : [], size: rb.size || null, error: rb.error || null };
  if (rb.found) { out.robots.google = L.robotsCheck(rb.parsed, p.url, 'googlebot'); out.robots.bing = L.robotsCheck(rb.parsed, p.url, 'bingbot'); out.robots.any = L.robotsCheck(rb.parsed, p.url, '*'); }
  out.sitemap = Date.now() < deadline ? await sitemapFor(p.url, out.page && out.page.canonical, rb, origin, resolve, deadline) : { found: false, skipped: true, checked: [] };
  out.totalMs = Date.now() - t0;
  return out;
}

module.exports = async (req, res) => {
  const q = req.query || {}, n = L.normalizeInput(q.u || q.url || '');
  if (n.error) return bad(res, 400, n.error);
  if (!cleanHost(n.host)) return bad(res, 400, 'That is not a public domain name.');
  try {
    const r = await analyse(n.url);
    if (r.error) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(200).json(r); }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(r);
  } catch (e) { bad(res, 502, 'The check failed. Try again in a moment.'); }
};
Object.assign(module.exports, { analyse, safeFetch, hopHost, makeResolver });
