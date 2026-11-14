// YouTube captions for mes.fm/transcript (MES Transcript & Timestamps). A browser page can't read YouTube's captions itself (no CORS, and the
// caption links on the normal watch page now need a token only YouTube's own player makes), so this function asks YouTube's player API the way
// its Android app does and reads the caption track it names. No API key, no quota, no account.
//
// GET /api/yt-transcript?v=<11-char id>[&lang=<track code>][&tl=<translate-to code>]
//   -> {v, title, author, channelId, len, desc, tracks:[{code, name, auto}], lang, tl (or tlFail), trans:[{code, name}], cues:[[start s, dur s, text]]}
//   -> {v, title, ..., tracks: [], cues: [], why: 'none'} when the video has no captions
// Every input is checked against a strict pattern and only lands in fixed youtube.com URLs, so this is not a proxy. Cached a day at the edge.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const RE = { v: /^[A-Za-z0-9_-]{11}$/, lang: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, kind: /^(asr)?$/ };
const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip' },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)' },
];

async function timed(url, opt, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
  try { return await fetch(url, Object.assign({ signal: ctl.signal }, opt)); } finally { clearTimeout(t); }
}

function ent(s) {
  const one = (x) => x.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (m, e) => {
    e = e.toLowerCase();
    if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] || m;
  });
  return one(one(s)); // YouTube's XML double-encodes (&amp;#39;)
}

// <transcript><text start="1" dur="4.4">words</text>...  (format 1)   or   <timedtext format="3"><body><p t="1000" d="4400">...</p>  (srv3)
function parseXml(xml) {
  const out = [];
  let m;
  const r1 = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = r1.exec(xml))) { const t = ent(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); if (t) out.push([+m[1], +(m[2] || 0), t]); }
  if (out.length) return out;
  const r3 = /<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  while ((m = r3.exec(xml))) { const t = ent(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); if (t) out.push([+m[1] / 1000, +(m[2] || 0) / 1000, t]); }
  return out;
}

const txt = (o) => (o && (o.simpleText || (o.runs || []).map((r) => r.text).join(''))) || '';

async function player(v) {
  let last = null;
  for (const c of CLIENTS) {
    const client = Object.assign({ hl: 'en', gl: 'US' }, c); delete client.ua;
    try {
      const r = await timed('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'Accept-Language': 'en' },
        body: JSON.stringify({ context: { client }, videoId: v, contentCheckOk: true, racyCheckOk: true }),
      });
      if (!r.ok) { last = 'YouTube HTTP ' + r.status; continue; }
      const j = await r.json();
      const st = j.playabilityStatus && j.playabilityStatus.status;
      if (st && st !== 'OK' && !(j.captions)) { last = (j.playabilityStatus.reason || st); if (st === 'ERROR') return { err: last, code: 404 }; continue; }
      return { j, ua: c.ua };
    } catch (e) { last = e.name === 'AbortError' ? 'YouTube took too long to answer.' : e.message; }
  }
  return { err: last || 'YouTube did not answer.', code: 502 };
}

async function build(v, lang, kind, tl) {
  const p = await player(v);
  if (p.err) return { status: p.code, body: { error: p.err } };
  const j = p.j, d = j.videoDetails || {};
  const ctr = (j.captions && j.captions.playerCaptionsTracklistRenderer) || {};
  const raw = ctr.captionTracks || [];
  const tracks = raw.map((t) => ({ code: t.languageCode, name: txt(t.name) || t.languageCode, auto: t.kind === 'asr' }));
  const trans = (ctr.translationLanguages || []).map((t) => ({ code: t.languageCode, name: txt(t.languageName) || t.languageCode }));
  const base = { v, title: d.title || '', author: d.author || '', channelId: d.channelId || '', len: +d.lengthSeconds || 0, desc: (d.shortDescription || '').slice(0, 5000), live: !!d.isLiveContent, tracks, trans };
  if (!raw.length) return { status: 200, body: Object.assign(base, { cues: [], why: 'none' }) };
  // Pick: the asked language (manual before auto unless kind says asr), else a manual track, else the first.
  let pick = null;
  if (lang) pick = raw.find((t) => t.languageCode === lang && (kind === 'asr' ? t.kind === 'asr' : t.kind !== 'asr')) || raw.find((t) => t.languageCode === lang);
  if (!pick) pick = raw.find((t) => t.kind !== 'asr') || raw[0];
  const url = pick.baseUrl.replace(/&fmt=[^&]*/, '');
  let r = null;
  // YouTube's machine translation (&tlang=) answers 429 to almost every request, so it is tried once and the original language is the fallback.
  if (tl && trans.some((t) => t.code === tl) && tl !== pick.languageCode) {
    r = await timed(url + '&tlang=' + encodeURIComponent(tl), { headers: { 'User-Agent': p.ua, 'Accept-Language': 'en' } }).catch(() => null);
    if (!r || !r.ok) { r = null; base.tlFail = tl; }
  }
  if (r) base.tl = tl; else r = await timed(url, { headers: { 'User-Agent': p.ua, 'Accept-Language': 'en' } });
  if (!r.ok) return { status: 502, body: { error: 'YouTube HTTP ' + r.status + ' for the captions.' } };
  const cues = parseXml(await r.text());
  if (!cues.length) return { status: 502, body: Object.assign(base, { cues: [], error: 'YouTube sent an empty caption file.' }) };
  return { status: 200, body: Object.assign(base, { lang: pick.languageCode, auto: pick.kind === 'asr', cues: cues.map((c) => [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000, c[2]]) }) };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const v = String(q.v || ''), lang = String(q.lang || ''), kind = String(q.kind || ''), tl = String(q.tl || '');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!RE.v.test(v) || (lang && !RE.lang.test(lang)) || (tl && !RE.lang.test(tl)) || !RE.kind.test(kind)) {
    res.statusCode = 400; res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify({ error: 'Bad video id.' }));
  }
  try {
    const out = await build(v, lang, kind, tl);
    res.statusCode = out.status;
    res.setHeader('Cache-Control', out.status === 200 ? 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
    res.end(JSON.stringify(out.body));
  } catch (e) {
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ error: e.message || String(e) }));
  }
};
module.exports._t = { parseXml, ent, build };

if (require.main === module) {
  build(process.argv[2] || 'NOG9VOBtpY4', process.argv[3] || '', '', process.argv[4] || '').then((o) => {
    const b = o.body; console.log(o.status, b.title, '|', b.author, b.len + 's', 'tracks', JSON.stringify(b.tracks), 'lang', b.lang, 'tl', b.tl, 'cues', (b.cues || []).length, 'trans', (b.trans || []).length, b.error || '');
    console.log((b.cues || []).slice(0, 3));
  });
}
