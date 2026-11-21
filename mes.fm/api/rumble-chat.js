// Rumble live chat for mes.fm/stream-chat (MES Stream Chat). Rumble's chat feed (an event stream at web7.rumble.com) answers 403 to any
// browser page on another site (it checks the Origin header), so this function reads it on the page's behalf: it opens the stream,
// takes the first "init" event (Rumble sends the recent messages and the users there), closes it and returns the messages. The page
// asks again every few seconds and drops ones it already has.
//
// GET /api/rumble-chat?id=<chat number, as in rumble.com/chat/popup/<number>>  -> { msgs, removed }
//
// The id must be 5-14 digits and only ever lands in a fixed web7.rumble.com URL, so this is not an open proxy. Cached 2 s at the edge so
// several open panels share one read. Parsing lives in _stream-chat-lib.js (a copy of tool_apps_src/stream-chat/lib.js).
const C = require('./_stream-chat-lib.js');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

async function read(id, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 6000);
  let txt = '';
  try {
    const r = await fetch('https://web7.rumble.com/chat/api/chat/' + id + '/stream', { headers: { 'User-Agent': UA, Accept: 'text/event-stream' }, signal: ctl.signal });
    if (r.status === 404 || r.status === 204 || !r.body) return { gone: true }; // 204 = no chat open at that number (yet)
    if (!r.ok) throw new Error('Rumble HTTP ' + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      txt += dec.decode(value, { stream: true });
      if (/\n\n/.test(txt) && C.sseEvents(txt).some(e => e.type === 'init')) break;
      if (txt.length > 4e6) break;
    }
    try { rd.cancel(); } catch (e) {}
  } catch (e) {
    if (!(e && e.name === 'AbortError') || !txt) throw e;
  } finally { clearTimeout(t); }
  const users = {}, out = { msgs: [], removed: [] };
  C.sseEvents(txt).forEach(ev => { const r = C.rmEvent(ev, users); out.msgs.push(...r.msgs); out.removed.push(...r.removed); });
  return out;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^\d{5,14}$/.test(id)) { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'bad id' }); }
  try {
    const out = await read(id);
    if (out.gone) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'no chat open at that number yet' }); }
    res.setHeader('Cache-Control', 'public, s-maxage=2, max-age=0');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: (e && e.message) || 'Rumble did not answer' });
  }
};

if (require.main === module) {
  read(process.argv[2] || '450179158').then(o => console.log(JSON.stringify(o).slice(0, 800)), e => console.error(e));
}
