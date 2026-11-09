// node tool_apps_src/yt-comments-tests.js : input checks of api/yt-comments.js (fetch mocked) + next-token parsing
const A = require('../mes.fm/api/yt-comments.js');
let n = 0; const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exit(1); } n++; };
ok(A.nextToken('{"continuationCommand":{"token":"aaa"}} {"continuationCommand":{"token":"bbb"}}') === 'bbb', 'nextToken = last');
ok(A.nextToken('{}') === null, 'no token');
function res() { const r = { h: {}, code: 0 }; r.setHeader = (k, v) => { r.h[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.send = (b) => { r.body = JSON.parse(b); return r; }; return r; }
(async () => {
  let calls = 0; global.fetch = async () => { calls++; return { ok: false, status: 500, text: async () => '' }; };
  for (const q of [{ v: 'bad' }, { v: 'https://evil.example/' }, { v: 'dQw4w9WgXcQ', c: 'x' }, { v: 'dQw4w9WgXcQ', c: 'a'.repeat(30) }, { v: 'dQw4w9WgXcQ', c: 'a'.repeat(30), ver: 'x' }, { v: ['dQw4w9WgXcQ'] }]) {
    const r = res(); await A({ query: q }, r); ok(r.code === 400 && r.h['Cache-Control'] === 'no-store', 'refuses ' + JSON.stringify(q).slice(0, 40));
  }
  ok(calls === 0, 'nothing fetched for bad input');
  const r = res(); await A({ query: { v: 'dQw4w9WgXcQ' } }, r); ok(r.code === 502 && r.h['Cache-Control'] === 'no-store', '502 not cached');
  console.log('yt-comments tests ok: ' + n);
})();
