// YouTube live chat for mes.fm/stream-chat (MES Stream Chat). A browser page can't read YouTube's chat itself (no CORS), so this
// function fetches it on the page's behalf. No API key and no quota: it reads the same public pages YouTube's own popout chat uses.
//
// GET /api/yt-chat?ch=@handle | ?ch=UC...   -> is that channel live (or has a scheduled stream)? -> {v, live, upcoming, title} + the start below
// GET /api/yt-chat?v=<11-char video id>     -> start reading: {v, c, k, ver, wait, msgs, removed}
// GET /api/yt-chat?c=<continuation>&k=<key>&ver=<client version>  -> next batch: {c, wait, msgs, removed}  ({ended: true} when the chat is gone)
//
// Every input is checked against a strict pattern and only ever lands in a fixed youtube.com URL or POST body, so this is not an open proxy.
// Never cached (chat is live). Parsing lives in _stream-chat-lib.js (a copy of tool_apps_src/stream-chat/lib.js).
const C = require('./_stream-chat-lib.js');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const HDR = { 'User-Agent': UA, 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1; SOCS=CAI' };
const RE = { ch: /^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$/, v: /^[A-Za-z0-9_-]{11}$/, c: /^[A-Za-z0-9_%=-]{20,1500}$/, k: /^[A-Za-z0-9_-]{20,60}$/, ver: /^[0-9.]{5,30}$/ };

async function get(url, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { headers: HDR, signal: ctl.signal });
    if (!r.ok) throw new Error('YouTube HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function channel(ch) {
  const path = ch[0] === '@' ? '/' + ch : '/channel/' + ch;
  const info = C.ytLivePage(await get('https://www.youtube.com' + path + '/live'));
  if (!info.v || (!info.live && !info.upcoming)) return { live: false, upcoming: false };
  const out = await start(info.v);
  return Object.assign({ live: info.live, upcoming: info.upcoming, title: info.title }, out);
}

async function start(v) {
  const page = C.ytChatPage(await get('https://www.youtube.com/live_chat?is_popout=1&v=' + v));
  if (!page || !page.cont) return { v, ended: true, msgs: [], removed: [] };
  const a = C.ytActions(page.actions);
  return { v, c: page.cont.c, wait: page.cont.wait, k: page.key, ver: page.ver, msgs: a.msgs, removed: a.removed };
}

async function next(c, k, ver) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  let j;
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false&key=' + k, {
      method: 'POST', signal: ctl.signal,
      headers: Object.assign({ 'Content-Type': 'application/json' }, HDR),
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'en' } }, continuation: c }),
    });
    if (!r.ok) throw new Error('YouTube HTTP ' + r.status);
    j = await r.json();
  } finally { clearTimeout(t); }
  const lc = j && j.continuationContents && j.continuationContents.liveChatContinuation;
  if (!lc) return { ended: true, msgs: [], removed: [] };
  const nc = C.ytCont(lc.continuations), a = C.ytActions(lc.actions);
  return { c: nc ? nc.c : null, wait: nc ? nc.wait : 5000, ended: !nc, msgs: a.msgs, removed: a.removed };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const ok = (k) => typeof q[k] === 'string' && RE[k].test(q[k]);
  try {
    let out;
    if (ok('c') && ok('k') && ok('ver')) out = await next(q.c, q.k, q.ver);
    else if (ok('v')) out = await start(q.v);
    else if (ok('ch')) out = await channel(q.ch);
    else { res.status(400).json({ error: 'bad request' }); return; }
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e).slice(0, 120) });
  }
};
module.exports.channel = channel;
module.exports.start = start;
module.exports.next = next;
