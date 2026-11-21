// BitChute live chat for mes.fm/stream-chat (MES Stream Chat). BitChute's chat is a socket.io server (chat001.bitchute.com) that the
// page can join straight from the browser (it accepts mes.fm), but the anonymous chat token comes from BitChute's API, which only
// allows www.bitchute.com in CORS. So this function asks for that token on the page's behalf:
//
// GET /api/bitchute-chat?id=<BitChute video id>  -> { auth, room (the channel id = chat room), title, live }
//
// The token is the one BitChute gives any signed-out visitor (profile "anonymous", read only). The id is pattern-checked and only
// ever goes into the JSON body of fixed api.bitchute.com calls, so this is not an open proxy.
const API = 'https://api.bitchute.com/api/beta/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

async function post(path, id) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 7000);
  try {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Accept: 'application/json' },
      body: JSON.stringify({ video_id: id }), signal: ac.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('BitChute HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function info(id) {
  const [cf, v] = await Promise.all([post('apps/commentfreely/video/', id), post('video', id).catch(() => null)]);
  if (!cf || !cf.auth) return null;
  let room = '';
  try { room = JSON.parse(Buffer.from(String(cf.auth).split('.')[0], 'base64').toString('utf8')).channel_id || ''; } catch (e) {}
  if (!room && v && v.channel) room = v.channel.channel_id || '';
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(room)) throw new Error('BitChute gave no chat room');
  return { auth: String(cf.auth), room, title: (v && v.video_name) || '', live: !!(v && v.state_id === 'live'), chat: !(v && v.show_rantrave === false) };
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'bad id' }); }
  try {
    const out = await info(id);
    if (!out) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'no BitChute video with that id' }); }
    res.setHeader('Cache-Control', 'public, s-maxage=60, max-age=0');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: (e && e.message) || 'BitChute did not answer' });
  }
};

if (require.main === module) info(process.argv[2] || 'Bn6wFTsUutQY').then(o => console.log(o && { ...o, auth: o.auth.slice(0, 20) + '…' }), e => console.error(e));
