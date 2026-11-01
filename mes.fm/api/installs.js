// Data for the public mes.fm/installs page: installs of the MES mobile apps on iPhone (App Store Connect) and Android (Google Play).
// No input from the browser (the query string is ignored); the keys never leave this function.
//
// iOS: App Store Connect API team key -> ES256 JWT -> GET /v1/salesReports (SALES / SUMMARY / DAILY, gzipped TSV), one report per day.
//   Env: APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY (the .p8 text; "\n" escapes are fine), APPSTORE_VENDOR_NUMBER.
// Android: the installs CSVs Google Play writes to the developer's Cloud Storage bucket
//   (stats/installs/installs_<package>_<YYYYMM>_<overview|country|device|os_version|app_version>.csv, UTF-16),
//   read with a service account (RS256 JWT -> OAuth token -> GCS JSON API).
//   Env: PLAY_SERVICE_ACCOUNT (the service account's JSON key, plain or base64), PLAY_BUCKET (pubsite_prod_rev_... or gs://pubsite_prod_rev_...).
// Optional: INSTALLS_SINCE (first day to fetch, default 2026-09-01).
// Ratings: the public iTunes lookup (no key) and Play's ratings CSVs (same bucket).
// Cache: every day's iOS report and every Play file is kept in Upstash (UPSTASH_REDIS_REST_URL / _TOKEN), so each run only fetches
// new or changed ones; the finished dataset is kept 6 h (key inst:data) and the edge caches the answer 6 h.
// CLI: node mes.fm/api/installs.js --sample  (writes the made-up mes.fm/installs/data/sample.json for the local preview)
const crypto = require('crypto');
const zlib = require('zlib');
const L = require('./_installs-lib.js');

const FRESH_MS = 6 * 3600e3;
const MAX_IOS_FETCH = 40;
const MAX_PLAY_FETCH = 60;
const BUDGET_MS = 8000;
const TZ = 'America/Los_Angeles'; // Apple's daily reports are Pacific days

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const pem = (s) => String(s || '').replace(/\\n/g, '\n').trim();

// App Store Connect token (ES256, at most 20 minutes)
function appleJwt(issuer, keyId, privateKey, now) {
  const iat = Math.floor((now || Date.now()) / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuer, iat, exp: iat + 1140, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: pem(privateKey), dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64url(sig);
}

// Google service-account assertion (RS256)
function googleJwt(sa, scope, now) {
  const iat = Math.floor((now || Date.now()) / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), pem(sa.private_key));
  return head + '.' + body + '.' + b64url(sig);
}

function serviceAccount(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s.startsWith('{')) { try { s = Buffer.from(s, 'base64').toString('utf8'); } catch (e) { return null; } }
  try { const j = JSON.parse(s); return j.client_email && j.private_key ? j : null; } catch (e) { return null; }
}
const bucketName = (b) => String(b || '').trim().replace(/^gs:\/\//, '').replace(/\/.*$/, '');

function setup(env) {
  const iosMiss = ['APPSTORE_ISSUER_ID', 'APPSTORE_KEY_ID', 'APPSTORE_PRIVATE_KEY', 'APPSTORE_VENDOR_NUMBER'].filter((k) => !env[k]);
  const playMiss = ['PLAY_SERVICE_ACCOUNT', 'PLAY_BUCKET'].filter((k) => !env[k]);
  if (!playMiss.length && !serviceAccount(env.PLAY_SERVICE_ACCOUNT)) playMiss.push('PLAY_SERVICE_ACCOUNT (not a valid key file)');
  return { ios: iosMiss, play: playMiss };
}

async function redis(commands) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return r.json();
  } catch (e) { return null; }
}
const pj = (x) => { try { return x && x.result ? JSON.parse(x.result) : null; } catch (e) { return null; } };
async function mget(keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 200) {
    const part = keys.slice(i, i + 200);
    const r = await redis([['MGET', ...part]]);
    const vals = (r && r[0] && r[0].result) || [];
    part.forEach((k, j) => { try { if (vals[j]) out[k] = JSON.parse(vals[j]); } catch (e) {} });
  }
  return out;
}
async function mset(pairs, ttl) {
  if (!pairs.length) return;
  await redis(pairs.map(([k, v]) => ['SET', k, JSON.stringify(v), 'EX', String(ttl)]));
}

async function pool(items, n, fn, deadline) {
  const out = []; let i = 0;
  const run = async () => { while (i < items.length && Date.now() < deadline) { const j = i++; out[j] = await fn(items[j]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

const pacificToday = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

// ---- iOS
async function iosDay(date, token, vendor) {
  const u = 'https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY' +
    '&filter[version]=1_1&filter[vendorNumber]=' + encodeURIComponent(vendor) + '&filter[reportDate]=' + date;
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/a-gzip' } });
  if (r.status === 404) { // "There were no sales for the date specified" (or not ready yet)
    let t = ''; try { t = await r.text(); } catch (e) {}
    return { rows: [], none: true, notYet: /not available yet|not ready/i.test(t) };
  }
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('App Store Connect refused the key (' + r.status + ')'), { fatal: true });
  if (!r.ok) throw new Error('App Store Connect ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  let text;
  try { text = zlib.gunzipSync(buf).toString('utf8'); } catch (e) { text = buf.toString('utf8'); }
  return { rows: L.iosRows(text) };
}

async function iosRefresh(env, now, deadline) {
  const today = pacificToday(now);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(env.INSTALLS_SINCE || '') ? env.INSTALLS_SINCE : '2026-09-01';
  const from = since > L.addDays(today, -365) ? since : L.addDays(today, -365);
  const dates = L.daysBetween(from, L.addDays(today, -1));
  const stored = await mget(dates.map((d) => 'inst:ios:' + d));
  const want = dates.filter((d) => {
    const s = stored['inst:ios:' + d];
    if (!s) return true;
    // recent days: Apple may still be adding to them, re-read every 6 h for 5 days
    return d >= L.addDays(today, -5) && now - (s.t || 0) > FRESH_MS && !s.final;
  }).reverse().slice(0, MAX_IOS_FETCH);
  const token = appleJwt(env.APPSTORE_ISSUER_ID, env.APPSTORE_KEY_ID, env.APPSTORE_PRIVATE_KEY, now);
  let error = null, fetched = 0;
  const writes = [];
  await pool(want, 6, async (d) => {
    if (error && error.fatal) return;
    try {
      const got = await iosDay(d, token, env.APPSTORE_VENDOR_NUMBER);
      if (got.notYet) return;
      const v = { t: now, r: got.rows, final: d < L.addDays(today, -5) };
      stored['inst:ios:' + d] = v; writes.push(['inst:ios:' + d, v]); fetched++;
    } catch (e) { error = error && error.fatal ? error : e; }
  }, deadline);
  await mset(writes, 400 * 86400);
  const days = {};
  let have = 0;
  dates.forEach((d) => { const s = stored['inst:ios:' + d]; if (s) { have++; if (s.r && s.r.length) days[d] = s.r; } });
  return { days, info: { ok: !error, error: error ? String(error.message || error) : null, fetched, have, of: dates.length, complete: have >= dates.length - 1, lastDay: L.addDays(today, -1) } };
}

// ---- Android
async function googleToken(sa) {
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + googleJwt(sa, 'https://www.googleapis.com/auth/devstorage.read_only'),
  });
  if (!r.ok) throw Object.assign(new Error('Google refused the service account (' + r.status + ')'), { fatal: true });
  const j = await r.json();
  if (!j.access_token) throw Object.assign(new Error('Google sent no token'), { fatal: true });
  return j.access_token;
}
async function gcsList(bucket, prefix, token) {
  const items = []; let page = '';
  for (let n = 0; n < 10; n++) {
    const r = await fetch('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket) + '/o?fields=items(name,generation,updated),nextPageToken&prefix=' + encodeURIComponent(prefix) + (page ? '&pageToken=' + encodeURIComponent(page) : ''),
      { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 403 || r.status === 401) throw Object.assign(new Error('The service account cannot read the bucket (' + r.status + '): check Play Console > Users and permissions'), { fatal: true });
    if (r.status === 404) throw Object.assign(new Error('Bucket not found: check PLAY_BUCKET'), { fatal: true });
    if (!r.ok) throw new Error('Cloud Storage ' + r.status);
    const j = await r.json();
    (j.items || []).forEach((x) => items.push(x));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return items;
}
async function gcsGet(bucket, name, token) {
  const r = await fetch('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(name) + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Cloud Storage ' + r.status + ' for ' + name);
  return L.decodeText(new Uint8Array(await r.arrayBuffer()));
}

async function playRefresh(env, now, deadline) {
  const sa = serviceAccount(env.PLAY_SERVICE_ACCOUNT);
  const bucket = bucketName(env.PLAY_BUCKET);
  const token = await googleToken(sa);
  const files = [], ratingFiles = [];
  let missingApps = [];
  for (const app of L.APPS) {
    const list = await gcsList(bucket, 'stats/installs/installs_' + app.android + '_', token);
    const mine = list.filter((x) => { const p = L.playName(x.name); return p && p.pkg === app.android && (p.dim === 'overview' || L.DIMKEY[p.dim]); });
    if (!mine.length) missingApps.push(app.k);
    mine.forEach((x) => files.push(Object.assign({ app: app.k }, x, L.playName(x.name))));
    try {
      const rl = (await gcsList(bucket, 'stats/ratings/ratings_' + app.android + '_', token)).filter((x) => /_overview\.csv$/.test(x.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
      if (rl[0]) ratingFiles.push(Object.assign({ app: app.k }, rl[0]));
    } catch (e) { /* ratings are a bonus */ }
  }
  const all = files.concat(ratingFiles.map((x) => Object.assign({ rating: true }, x)));
  const stored = await mget(all.map((x) => 'inst:play:' + x.name));
  const want = all.filter((x) => { const s = stored['inst:play:' + x.name]; return !s || String(s.g) !== String(x.generation); })
    .sort((a, b) => (a.name < b.name ? 1 : -1)).slice(0, MAX_PLAY_FETCH);
  let error = null;
  const writes = [];
  await pool(want, 6, async (x) => {
    try {
      const text = await gcsGet(bucket, x.name, token);
      const v = { g: x.generation, p: x.rating ? { rating: L.playRating(text) } : L.playParse(text, x.dim) };
      stored['inst:play:' + x.name] = v; writes.push(['inst:play:' + x.name, v]);
    } catch (e) { error = e; }
  }, deadline);
  await mset(writes, 800 * 86400);
  const play = {}, ratings = {};
  let have = 0;
  files.forEach((x) => {
    const s = stored['inst:play:' + x.name]; if (!s) return; have++;
    const a = play[x.app] || (play[x.app] = {});
    const key = x.dim === 'overview' ? 'overview' : x.dim;
    a[key] = (a[key] || []).concat(x.dim === 'overview' ? s.p.daily || [] : s.p.dims || []);
  });
  ratingFiles.forEach((x) => { const s = stored['inst:play:' + x.name]; if (s && s.p && s.p.rating) ratings[x.app] = s.p.rating; });
  return { play, ratings, info: { ok: !error, error: error ? String(error.message || error) : null, fetched: writes.length, have, of: files.length, complete: have >= files.length, noFiles: missingApps } };
}

// ---- public ratings + store links (iTunes lookup, no key)
async function iosLookup() {
  const out = {};
  await Promise.all(L.APPS.map(async (a) => {
    try {
      const r = await fetch('https://itunes.apple.com/lookup?bundleId=' + encodeURIComponent(a.bundle) + '&country=us');
      if (!r.ok) return;
      const j = await r.json();
      const x = j.results && j.results[0];
      if (x) out[a.k] = { id: String(x.trackId), url: String(x.trackViewUrl || '').replace(/\?.*$/, ''), rating: x.userRatingCount ? Math.round(x.averageUserRating * 100) / 100 : null, ratings: x.userRatingCount || 0, version: x.version || null };
    } catch (e) {}
  }));
  return out;
}

async function build(env, now) {
  const deadline = now + BUDGET_MS;
  const miss = setup(env);
  const sources = {
    ios: { setup: !miss.ios.length, missing: miss.ios },
    play: { setup: !miss.play.length, missing: miss.play },
  };
  const [ios, play, look] = await Promise.all([
    sources.ios.setup ? iosRefresh(env, now, deadline).catch((e) => ({ days: {}, info: { ok: false, error: String(e.message || e) } })) : null,
    sources.play.setup ? playRefresh(env, now, deadline).catch((e) => ({ play: {}, ratings: {}, info: { ok: false, error: String(e.message || e) } })) : null,
    iosLookup(),
  ]);
  if (ios) Object.assign(sources.ios, ios.info);
  if (play) Object.assign(sources.play, play.info);
  const ds = L.buildDataset(ios ? ios.days : {}, play ? play.play : {});
  const apps = L.APPS.map((a) => ({
    k: a.k, name: a.name, web: a.web,
    ios: Object.assign({ id: a.ios, url: a.ios ? 'https://apps.apple.com/app/id' + a.ios : null, rating: null, ratings: 0 }, look[a.k] || {}),
    android: { pkg: a.android, url: 'https://play.google.com/store/apps/details?id=' + a.android, rating: (play && play.ratings[a.k]) || null },
  }));
  return { v: 1, generated: new Date(now).toISOString(), sources, apps, daily: ds.daily, dims: ds.dims };
}

async function handler(req, res) {
  const now = Date.now();
  let data = null;
  const cached = await redis([['GET', 'inst:data']]);
  const c = cached && pj(cached[0]);
  if (c && now - Date.parse(c.generated) < FRESH_MS && c.done) data = c;
  if (!data) {
    try { data = await build(process.env, now); } catch (e) {
      if (c) data = c;
      else { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'data unavailable' }); }
    }
    const s = data.sources;
    data.done = (!s.ios.setup || (s.ios.ok && s.ios.complete)) && (!s.play.setup || (s.play.ok && s.play.complete));
    if (s.ios.setup || s.play.setup) await redis([['SET', 'inst:data', JSON.stringify(data), 'EX', String(7 * 86400)]]);
  }
  res.setHeader('Cache-Control', data.done && (data.sources.ios.setup || data.sources.play.setup) ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json(data);
}

// ---- made-up sample for the local preview (clearly marked sample: true)
function sample(now) {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const today = pacificToday(now);
  const dates = L.daysBetween(L.addDays(today, -90), L.addDays(today, -1));
  const CC = ['US', 'IN', 'GB', 'CA', 'PH', 'AU', 'VN', 'DE', 'BR', 'MX', 'NG', 'ID'];
  const W = [30, 16, 8, 8, 6, 4, 4, 3, 3, 3, 2, 2];
  const pick = (arr, w) => { let t = w.reduce((a, b) => a + b, 0) * rnd(); for (let i = 0; i < arr.length; i++) { t -= w[i]; if (t <= 0) return arr[i]; } return arr[0]; };
  const LAUNCH = { pct: 0, bmi: 15, grade: 18, gpa: 18, fit: 30 };
  const SIZE = { pct: 6, bmi: 3, grade: 4, gpa: 3, fit: 2 };
  const ios = {}, play = {};
  dates.forEach((d, di) => {
    const rows = [];
    L.APPS.forEach((a) => {
      if (di < LAUNCH[a.k]) return;
      const age = di - LAUNCH[a.k], base = SIZE[a.k] * (1 + age / 60) * (new Date(d).getUTCDay() % 6 === 0 ? 0.7 : 1);
      const n = Math.max(0, Math.round(base * (0.5 + rnd())));
      for (let i = 0; i < n; i++) rows.push([a.k, rnd() < 0.85 ? 'dl' : 're', pick(CC, W), rnd() < 0.82 ? 'iPhone' : rnd() < 0.8 ? 'iPad' : 'Desktop', age > 40 ? '1.1' : '1.0', 1]);
      if (age === 41) for (let i = 0; i < 4 * SIZE[a.k]; i++) rows.push([a.k, 'up', pick(CC, W), 'iPhone', '1.1', 1]);
      const p = play[a.k] || (play[a.k] = { overview: [], country: [], device: [], os_version: [], app_version: [] });
      const ai = Math.max(0, Math.round(base * 1.4 * (0.5 + rnd()))), un = Math.round(ai * 0.3 * rnd());
      const prev = p.overview.length ? p.overview[p.overview.length - 1][4] : 0;
      p.overview.push([d, ai, age === 42 ? 3 * SIZE[a.k] : 0, un, prev + ai - un]);
      for (let i = 0; i < ai; i++) {
        p.country.push([d, pick(CC, W), 1, 0]);
        p.device.push([d, pick(['Samsung Galaxy A15', 'Samsung Galaxy S23', 'Google Pixel 8', 'Xiaomi Redmi Note 13', 'OPPO A78', 'Motorola moto g'], [5, 3, 2, 3, 2, 2]), 1, 0]);
        p.os_version.push([d, pick(['Android 15', 'Android 14', 'Android 13', 'Android 12'], [4, 4, 2, 1]), 1, 0]);
        p.app_version.push([d, age > 42 ? '9' : '5', 1, 0]);
      }
    });
    ios[d] = rows;
  });
  const ds = L.buildDataset(ios, play);
  return {
    v: 1, sample: true, generated: new Date(now).toISOString(),
    sources: { ios: { setup: true, ok: true, complete: true, missing: [] }, play: { setup: true, ok: true, complete: true, missing: [] } },
    apps: L.APPS.map((a, i) => ({ k: a.k, name: a.name, web: a.web, ios: { id: a.ios, url: a.ios ? 'https://apps.apple.com/app/id' + a.ios : null, rating: 4.5 + i / 20, ratings: 3 + i }, android: { pkg: a.android, url: 'https://play.google.com/store/apps/details?id=' + a.android, rating: 4.6 } })),
    daily: ds.daily, dims: ds.dims, done: true,
  };
}

module.exports = handler;
module.exports.appleJwt = appleJwt;
module.exports.googleJwt = googleJwt;
module.exports.serviceAccount = serviceAccount;
module.exports.bucketName = bucketName;
module.exports.setup = setup;
module.exports.build = build;
module.exports.sample = sample;

if (require.main === module && process.argv.includes('--sample')) {
  const path = require('path'), fs = require('fs');
  const out = path.join(__dirname, '..', 'installs', 'data', 'sample.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(sample(Date.now())));
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
}
