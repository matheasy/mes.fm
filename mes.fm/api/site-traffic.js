// Site rank / popularity for mes.fm/site-traffic. Real visit counts are only known to a site's owner (or a paid panel such as Similarweb's); the page turns the
// rank into a rough visits RANGE itself (MESTraffic.estimate in tool_apps_src/site-traffic/lib.js). This function returns only public data:
//   (default)      Tranco rank (research list combining Chrome UX Report, Cloudflare Radar, Majestic, Umbrella, Farsight) with its last ~30 daily ranks, plus
//                  `longHistory`: every daily rank we have seen for that domain, kept in Upstash (`st:rh:<apex>`, date -> rank, 800 days) so the chart grows past 30 days
//   ?only=crux     Chrome UX Report (free Google API, env CRUX_API_KEY): phone / desktop / tablet share, Core Web Vitals, ~40 weeks of weekly history, for the origin
//   ?only=radar    Cloudflare Radar (free token, env CLOUDFLARE_RADAR_TOKEN, permission "User Details Read" is enough): rank or bucket, categories, top countries
//                  Without a key either mode answers {setup: true} and the page just leaves that section out.
//   ?only=wayback  Internet Archive capture history (one capture per year, first and latest)
//   ?only=tech     OPT-IN: fetches the site's home page once and reports the technology it can recognise (headers, <meta generator>, script URLs).
//                  Only the recognised names and a few public header values leave this function, never the page itself.
//
// GET /api/site-traffic?d=example.com[&only=wayback|tech]
// Safety (same spirit as api/domain-lookup.js): the name is validated, the only fetches in rank / wayback mode go to fixed services; tech mode visits the *typed* site, so it
// resolves the name through DNS-over-HTTPS first and refuses any address that is not public, re-checks every redirect hop the same way, uses https/http on the default ports only,
// stops after 250 KB and 5 s, sends no cookies and returns nothing but the fingerprint results. Edge-cached; errors are no-store. Keys stay on the server and are never echoed.
const { cleanHost } = require('./domain-lookup.js');

function bad(res, code, msg) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json({ error: msg }); }
function tfetch(url, opts, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 5000);
  return fetch(url, Object.assign({ signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'mes.fm-site-traffic/1.0 (+https://mes.fm/site-traffic)' } }, opts || {})).finally(() => clearTimeout(t));
}
async function getJson(url, opts, ms) { try { const r = await tfetch(url, opts, ms); if (!r.ok) return { status: r.status, j: null }; return { status: 200, j: await r.json() }; } catch (e) { return { status: 0, j: null }; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- registrable domain (small public-suffix heuristic: Tranco ranks registrable domains, not subdomains) ----
const SLD = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'nom', 'mil', 'sch', 'gv', 'ltd', 'plc', 'me', 'info', 'biz']);
const SHARED = ['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'myshopify.com', 'web.app', 'firebaseapp.com', 'onrender.com', 'fly.dev', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'substack.com', 'medium.com', 'tumblr.com', 'github.com', 'youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'reddit.com'];
function registrable(host) {
  const l = host.split('.');
  if (l.length <= 2) return host;
  const tld = l[l.length - 1], sl = l[l.length - 2];
  if (tld.length === 2 && SLD.has(sl) && l.length >= 3) return l.slice(-3).join('.');
  return l.slice(-2).join('.');
}
function isShared(apex) { return SHARED.includes(apex); }

// ---- rank ----
function bucket(rank) {
  const b = [[1000, 'Top 1,000'], [5000, 'Top 5,000'], [10000, 'Top 10,000'], [50000, 'Top 50,000'], [100000, 'Top 100,000'], [500000, 'Top 500,000'], [1000000, 'Top 1 million'], [5000000, 'Top 5 million']];
  for (const x of b) if (rank <= x[0]) return x[1];
  return null;
}
async function tranco(apex) {
  const url = 'https://tranco-list.eu/api/ranks/domain/' + encodeURIComponent(apex);
  let r = await getJson(url, null, 6000);
  if (r.status === 429) { await sleep(1300); r = await getJson(url, null, 6000); }    // Tranco asks for ~1 request a second
  if (!r.j || !Array.isArray(r.j.ranks)) return { unavailable: true };
  const ranks = r.j.ranks.filter((x) => x && Number.isFinite(x.rank)).map((x) => ({ date: x.date, rank: x.rank })).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!ranks.length) return { ranked: false };
  const cur = ranks[ranks.length - 1].rank;
  return { ranked: true, rank: cur, date: ranks[ranks.length - 1].date, bucket: bucket(cur), history: ranks };
}

// ---- rank history kept in Upstash (only ranked domains, so only names Tranco already lists can be stored) ----
async function redis(commands) {
  const r = await tfetch(process.env.UPSTASH_REDIS_REST_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) }, 3000);
  return r.json();
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function keepHistory(apex, history, store) {
  store = store || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? redis : null);
  if (!store || !history || !history.length) return null;
  const key = 'st:rh:' + apex, hset = ['HSET', key];
  history.forEach((h) => { if (DATE_RE.test(h.date)) hset.push(h.date, String(h.rank)); });
  try {
    const out = await store([hset, ['EXPIRE', key, String(800 * 86400)], ['HGETALL', key]]);
    const flat = out && out[2] && out[2].result; if (!Array.isArray(flat)) return null;
    const rows = []; for (let i = 0; i + 1 < flat.length; i += 2) { const n = +flat[i + 1]; if (DATE_RE.test(flat[i]) && n > 0) rows.push({ date: flat[i], rank: n }); }
    return rows.sort((a, b) => a.date < b.date ? -1 : 1);
  } catch (e) { return null; }
}

// ---- Chrome UX Report (real Chrome users; per origin, so subdomains work too) ----
const CRUX_METRICS = ['form_factors', 'navigation_types', 'largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift', 'experimental_time_to_first_byte'];
const ymd = (d) => d ? d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0') : null;
const num = (x) => { const n = typeof x === 'string' ? parseFloat(x) : x; return Number.isFinite(n) ? n : null; };
function cruxNow(rec) {
  const m = rec.metrics || {}, out = { period: rec.collectionPeriod ? { first: ymd(rec.collectionPeriod.firstDate), last: ymd(rec.collectionPeriod.lastDate) } : null };
  if (m.form_factors && m.form_factors.fractions) out.ff = m.form_factors.fractions;
  if (m.navigation_types && m.navigation_types.fractions) out.nav = m.navigation_types.fractions;
  const cwv = {}; [['lcp', 'largest_contentful_paint'], ['inp', 'interaction_to_next_paint'], ['cls', 'cumulative_layout_shift'], ['ttfb', 'experimental_time_to_first_byte']].forEach(([k, n]) => {
    const x = m[n]; if (!x) return; cwv[k] = { p75: num(x.percentiles && x.percentiles.p75), good: x.histogram && x.histogram[0] ? num(x.histogram[0].density) : null };
  });
  out.cwv = cwv; return out;
}
function cruxHist(rec) {
  const m = rec.metrics || {}, out = { dates: (rec.collectionPeriods || []).map((p) => ymd(p.lastDate)) };
  const ft = m.form_factors && m.form_factors.fractionTimeseries;
  if (ft) { out.ff = {}; ['desktop', 'phone', 'tablet'].forEach((k) => { out.ff[k] = ft[k] && Array.isArray(ft[k].fractions) ? ft[k].fractions.map(num) : null; }); }
  [['lcp', 'largest_contentful_paint'], ['inp', 'interaction_to_next_paint'], ['cls', 'cumulative_layout_shift']].forEach(([k, n]) => {
    const x = m[n]; out[k] = x && x.percentilesTimeseries && Array.isArray(x.percentilesTimeseries.p75s) ? x.percentilesTimeseries.p75s.map(num) : null;
  });
  return out;
}
async function crux(host, key) {
  key = key || process.env.CRUX_API_KEY; if (!key) return { setup: true };
  const base = 'https://chromeuxreport.googleapis.com/v1/records:';
  const ask = (what, origin, extra) => tfetch(base + what + '?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(Object.assign({ origin, metrics: CRUX_METRICS }, extra || {})) }, 7000)
    .then(async (r) => ({ status: r.status, j: r.ok ? await r.json() : null })).catch(() => ({ status: 0, j: null }));
  const origins = ['https://' + host, host.startsWith('www.') ? 'https://' + host.slice(4) : 'https://www.' + host];
  for (const origin of origins) {
    const [now, hist] = await Promise.all([ask('queryRecord', origin), ask('queryHistoryRecord', origin, { collectionPeriodCount: 40 })]);
    if (now.status === 0 || now.status === 429 || now.status >= 500) return { unavailable: true };
    if (now.status === 400 || now.status === 403) return { unavailable: true, keyProblem: now.status === 403 };
    if (now.j && now.j.record) return Object.assign({ found: true, origin }, cruxNow(now.j.record), { history: hist.j && hist.j.record ? cruxHist(hist.j.record) : null });
  }
  return { found: false };
}

// ---- Cloudflare Radar ----
async function radar(apex, token) {
  token = token || process.env.CLOUDFLARE_RADAR_TOKEN; if (!token) return { setup: true };
  const opt = { headers: { Authorization: 'Bearer ' + token, accept: 'application/json' } }, B = 'https://api.cloudflare.com/client/v4/radar/ranking/';
  const [d, ts] = await Promise.all([getJson(B + 'domain/' + encodeURIComponent(apex) + '?includeTopLocations=true&format=JSON', opt, 7000),
    getJson(B + 'timeseries_groups?domains=' + encodeURIComponent(apex) + '&dateRange=52w&format=JSON', opt, 7000)]);
  if (d.status === 401 || d.status === 403) return { unavailable: true, keyProblem: true };
  if (!d.j || !d.j.result) return d.status === 404 || d.status === 400 ? { found: false } : { unavailable: true };
  const x = d.j.result.details_0 || {};
  const out = { found: !!(x.rank || x.bucket), rank: num(x.rank), bucket: num(x.bucket), categories: (x.categories || []).map((c) => c && c.name).filter(Boolean).slice(0, 6),
    locations: (x.top_locations || []).slice(0, 10).map((l) => ({ code: l.locationCode, name: l.locationName, rank: num(l.rank) })) };
  const s = ts.j && ts.j.result && ts.j.result.serie_0;
  if (s && Array.isArray(s.timestamps)) { const vals = s[apex] || Object.keys(s).filter((k) => k !== 'timestamps').map((k) => s[k])[0];
    if (Array.isArray(vals) && vals.some((v) => num(v))) out.series = s.timestamps.map((t, i) => ({ date: String(t).slice(0, 10), rank: num(vals[i]) })).filter((p) => p.rank); }
  return out;
}

// ---- wayback ----
async function wayback(host) {
  const base = 'https://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent(host) + '&output=json&fl=timestamp&filter=statuscode:200';
  const [yearly, newest] = await Promise.all([getJson(base + '&collapse=timestamp:4&limit=60', null, 9000), getJson(base + '&limit=-1', null, 9000)]);
  if (!yearly.j && !newest.j) return { unavailable: true };
  const fmt = (t) => t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8);
  const rows = Array.isArray(yearly.j) ? yearly.j.slice(1).map((x) => x[0]) : [];
  const last = Array.isArray(newest.j) && newest.j.length > 1 ? newest.j[newest.j.length - 1][0] : null;
  if (!rows.length && !last) return { captured: false };
  return { captured: true, first: rows[0] ? fmt(rows[0]) : null, firstUrl: rows[0] ? 'https://web.archive.org/web/' + rows[0] + '/' + host : null, last: last ? fmt(last) : null, lastUrl: last ? 'https://web.archive.org/web/' + last + '/' + host : null, years: rows.map((t) => +t.slice(0, 4)) };
}

// ---- tech detection ----
function ipv4Public(ip) {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && p[2] === 0) || (b === 0 && p[2] === 2))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && p[2] === 100))) return false;
  if (a === 203 && b === 0 && p[2] === 113) return false;
  return true;
}
function ipv6Public(ip) {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1' || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || /^f[cd]/.test(s) || s.startsWith('ff') || s.startsWith('::ffff:') || s.startsWith('64:ff9b') || s.startsWith('2001:db8') || s.startsWith('100:')) return false;
  return true;
}
async function resolvesPublic(host) {
  const q = async (type) => { const r = await getJson('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, { headers: { accept: 'application/dns-json' } }, 3500); return r.j && Array.isArray(r.j.Answer) ? r.j.Answer.filter((a) => a.type === (type === 'A' ? 1 : 28)).map((a) => a.data) : []; };
  const [a, aaaa] = await Promise.all([q('A'), q('AAAA')]);
  if (!a.length && !aaaa.length) return false;
  return a.every(ipv4Public) && aaaa.every(ipv6Public);
}

const TECH = [
  // [name, category, test-kind, regex]; kind: h = a header "name: value" line, m = <meta generator>, s = script/link URLs, b = anywhere in the HTML
  ['WordPress', 'CMS', 'b', /\/wp-(content|includes)\//i], ['WordPress', 'CMS', 'm', /^wordpress/i], ['Shopify', 'E-commerce', 'b', /cdn\.shopify\.com|Shopify\.theme/i], ['Wix', 'Site builder', 'b', /static\.wixstatic\.com|wix\.com\/website-builder/i],
  ['Squarespace', 'Site builder', 'b', /static1?\.squarespace\.com|squarespace-cdn/i], ['Webflow', 'Site builder', 'b', /assets-global\.website-files\.com|data-wf-page|webflow\.com/i], ['Ghost', 'CMS', 'm', /^ghost/i], ['Drupal', 'CMS', 'm', /^drupal/i],
  ['Joomla', 'CMS', 'm', /^joomla/i], ['Blogger', 'CMS', 'b', /blogger\.com\/static|blogspot\.com/i], ['Hugo', 'Static site generator', 'm', /^hugo/i], ['Jekyll', 'Static site generator', 'm', /^jekyll/i], ['Docusaurus', 'Static site generator', 'm', /^docusaurus/i],
  ['Gatsby', 'Static site generator', 'm', /^gatsby/i], ['Astro', 'Static site generator', 'm', /^astro/i], ['Next.js', 'JavaScript framework', 'b', /\/_next\/static\/|__NEXT_DATA__/i], ['Nuxt', 'JavaScript framework', 'b', /\/_nuxt\/|__NUXT__/i],
  ['React', 'JavaScript library', 'b', /data-reactroot|react(\.production|-dom)(\.min)?\.js/i], ['Vue.js', 'JavaScript library', 'b', /vue(\.runtime)?(\.global)?(\.prod)?(\.min)?\.js|data-v-[0-9a-f]{6,}/i], ['Angular', 'JavaScript framework', 'b', /ng-version=|angular(\.min)?\.js/i],
  ['Svelte', 'JavaScript framework', 'b', /svelte-[a-z0-9]{5,}|\/_app\/immutable\//i], ['jQuery', 'JavaScript library', 'b', /jquery([-.][0-9][\w.-]*)?(\.min)?\.js/i], ['Bootstrap', 'CSS framework', 'b', /bootstrap(\.min)?\.(css|js)|bootstrapcdn/i],
  ['Tailwind CSS', 'CSS framework', 'b', /cdn\.tailwindcss\.com|tailwind(css)?(\.min)?\.css/i], ['Google Analytics', 'Analytics', 'b', /google-analytics\.com\/(analytics|ga)\.js|googletagmanager\.com\/gtag\/js|gtag\(/i],
  ['Google Tag Manager', 'Tag manager', 'b', /googletagmanager\.com\/gtm\.js/i], ['Google AdSense', 'Advertising', 'b', /pagead2\.googlesyndication\.com|adsbygoogle/i], ['Facebook Pixel', 'Analytics', 'b', /connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i],
  ['Plausible', 'Analytics', 'b', /plausible\.io\/js/i], ['Matomo', 'Analytics', 'b', /matomo\.(js|php)|piwik\.(js|php)/i], ['Hotjar', 'Analytics', 'b', /static\.hotjar\.com/i], ['Cloudflare Web Analytics', 'Analytics', 'b', /static\.cloudflareinsights\.com/i],
  ['Google Fonts', 'Fonts', 'b', /fonts\.(googleapis|gstatic)\.com/i], ['Font Awesome', 'Fonts', 'b', /font-?awesome|fontawesome/i], ['reCAPTCHA', 'Security', 'b', /google\.com\/recaptcha\//i], ['hCaptcha', 'Security', 'b', /hcaptcha\.com/i],
  ['Stripe', 'Payments', 'b', /js\.stripe\.com/i], ['PayPal', 'Payments', 'b', /paypal(objects)?\.com\/(sdk|js)/i], ['Intercom', 'Live chat', 'b', /widget\.intercom\.io/i], ['Disqus', 'Comments', 'b', /disqus\.com\/embed/i], ['FastComments', 'Comments', 'b', /fastcomments\.com/i],
  ['Cloudflare', 'CDN / proxy', 'h', /^(server: cloudflare|cf-ray:)/im], ['Vercel', 'Hosting', 'h', /^(server: vercel|x-vercel-id:)/im], ['Netlify', 'Hosting', 'h', /^(server: netlify|x-nf-request-id:)/im], ['GitHub Pages', 'Hosting', 'h', /^(server: github\.com|x-github-request-id:)/im],
  ['Amazon CloudFront', 'CDN / proxy', 'h', /^(via:.*cloudfront|x-amz-cf-id:)/im], ['Fastly', 'CDN / proxy', 'h', /^(x-served-by: cache-|x-fastly-request-id:|via:.*varnish)/im], ['Akamai', 'CDN / proxy', 'h', /^(server: akamaighost|x-akamai)/im],
  ['nginx', 'Web server', 'h', /^server: nginx/im], ['Apache', 'Web server', 'h', /^server: apache/im], ['Microsoft IIS', 'Web server', 'h', /^server: microsoft-iis/im], ['LiteSpeed', 'Web server', 'h', /^server: litespeed/im], ['Caddy', 'Web server', 'h', /^server: caddy/im],
  ['PHP', 'Language', 'h', /^x-powered-by:.*php/im], ['ASP.NET', 'Framework', 'h', /^(x-powered-by: asp\.net|x-aspnet-version:)/im], ['Express', 'Framework', 'h', /^x-powered-by: express/im], ['WP Engine', 'Hosting', 'h', /^(x-powered-by: wp engine|x-wpe-)/im],
  ['HSTS', 'Security headers', 'h', /^strict-transport-security:/im], ['Content-Security-Policy', 'Security headers', 'h', /^content-security-policy:/im]
];
function detect(headers, html) {
  const hdr = Object.keys(headers).map((k) => k + ': ' + headers[k]).join('\n');
  const metas = []; (html.match(/<meta[^>]+name=["']generator["'][^>]*>/gi) || []).forEach((m) => { const c = m.match(/content=["']([^"']+)["']/i); if (c) metas.push(c[1]); });
  const out = new Map();
  TECH.forEach((t) => {
    const [name, cat, kind, re] = t; let hit = false;
    if (kind === 'h') hit = re.test(hdr); else if (kind === 'm') hit = metas.some((m) => re.test(m)); else hit = re.test(html);
    if (hit && !out.has(name)) out.set(name, { name, category: cat });
  });
  return { tech: [...out.values()], generator: metas[0] ? metas[0].slice(0, 80) : null };
}
async function readLimited(res, max) {
  const reader = res.body.getReader(), dec = new TextDecoder('utf-8', { fatal: false }); let n = 0, s = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; s += dec.decode(value, { stream: true }); if (n >= max) { try { await reader.cancel(); } catch (e) {} break; } }
  return s;
}
async function tech(host) {
  let url = 'https://' + host + '/', hops = 0, fellBack = false;
  for (;;) {
    let u; try { u = new URL(url); } catch (e) { return { error: 'Bad redirect' }; }
    const h = cleanHost(u.hostname);
    if (!h || u.port || (u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return { error: 'The site redirects somewhere this tool will not visit.' };
    if (!(await resolvesPublic(h))) return { error: 'That name does not point to a public web server.' };
    let r;
    try { r = await tfetch(url, { redirect: 'manual', headers: { accept: 'text/html,*/*;q=0.5', 'user-agent': 'mes.fm-site-traffic/1.0 (+https://mes.fm/site-traffic)' } }, 5000); }
    catch (e) { if (!fellBack && url.startsWith('https://') && hops === 0) { fellBack = true; url = 'http://' + host + '/'; continue; } return { error: 'The site did not answer in time.' }; }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location'); if (!loc || ++hops > 4) return { error: 'Too many redirects.' };
      try { url = new URL(loc, url).toString(); } catch (e) { return { error: 'Bad redirect' }; } continue;
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase(), headers = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = String(v).slice(0, 200); });
    const html = /html|xml|text/.test(ct) && r.body ? await readLimited(r, 250000) : '';
    const d = detect(headers, html), title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,400})/i) || [])[1];
    const lang = (html.match(/<html[^>]+lang=["']([A-Za-z-]{2,10})["']/i) || [])[1];
    const clean = (s) => s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) : null;
    return { status: r.status, finalHost: u.hostname, https: u.protocol === 'https:', server: headers.server || null, poweredBy: headers['x-powered-by'] || null, tech: d.tech, generator: d.generator, title: clean(title), description: clean(desc), lang: lang || null, bytes: html.length };
  }
}

module.exports = async (req, res) => {
  const t0 = Date.now(), host = cleanHost(req.query && (req.query.d || req.query.domain));
  if (!host) return bad(res, 400, 'Enter a domain name like example.com');
  const only = req.query && req.query.only, apex = registrable(host);
  try {
    if (only === 'wayback') {
      const w = await wayback(host); res.setHeader('Cache-Control', w.unavailable ? 'public, s-maxage=300' : 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({ domain: host, wayback: w });
    }
    if (only === 'tech') {
      const t = await tech(host); res.setHeader('Cache-Control', t.error ? 'public, s-maxage=300' : 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ domain: host, tech: t });
    }
    if (only === 'crux') {
      const c = await crux(host); res.setHeader('Cache-Control', c.unavailable ? 'no-store' : c.setup ? 'public, s-maxage=600' : 'public, s-maxage=43200, stale-while-revalidate=172800');
      return res.status(200).json({ domain: host, crux: c });
    }
    if (only === 'radar') {
      const r = await radar(apex); res.setHeader('Cache-Control', r.unavailable ? 'no-store' : r.setup ? 'public, s-maxage=600' : 'public, s-maxage=43200, stale-while-revalidate=172800');
      return res.status(200).json({ domain: host, apex, radar: r });
    }
    const rank = await tranco(apex);
    if (rank.ranked) { const long = await keepHistory(apex, rank.history); if (long && long.length > rank.history.length) rank.longHistory = long; }
    res.setHeader('Cache-Control', rank.unavailable ? 'public, s-maxage=60' : 'public, s-maxage=3600, stale-while-revalidate=43200');
    res.status(200).json({ domain: host, apex, shared: isShared(apex), subdomain: host !== apex, rank, source: { name: 'Tranco', url: 'https://tranco-list.eu/query_rank?domain=' + encodeURIComponent(apex) }, ms: Date.now() - t0 });
  } catch (e) { bad(res, 502, 'The lookup failed. Try again in a moment.'); }
};
Object.assign(module.exports, { keepHistory, crux, cruxNow, cruxHist, radar, registrable, isShared, bucket, ipv4Public, ipv6Public, detect });
