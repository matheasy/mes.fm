// Pure helpers for api/page-text.js: turn a web page's HTML into its readable text (title + paragraphs), no DOM needed.
// Used by mes.fm/gnm ("Read a report or article"). Tested by tool_apps_src/page-text-tests.js.
'use strict';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', deg: '°', copy: '©', reg: '®', trade: '™', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ccedil: 'ç', ntilde: 'ñ', iacute: 'í', oacute: 'ó', uacute: 'ú', times: '×', micro: 'µ', plusmn: '±', frac12: '½', shy: '' };
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : ''; } catch (x) { return ''; } }
    const v = ENT[e.toLowerCase()]; return v === undefined ? m : v;
  });
}
// Which charset the bytes are in: the header's, else a <meta charset> in the first 4 KB, else utf-8
function charsetOf(contentType, buf) {
  let m = /charset=["']?([\w-]+)/i.exec(String(contentType || ''));
  if (m) return m[1].toLowerCase();
  const head = Buffer.from(buf.slice(0, 4096)).toString('latin1');
  m = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : 'utf-8';
}
function decode(buf, contentType) {
  const cs = charsetOf(contentType, buf);
  try { return new TextDecoder(cs).decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}
function strip(s) { return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
// The largest <tag>...</tag> block (articles are rarely nested inside each other)
function biggest(html, tag) {
  const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi'); let m, best = '';
  while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
  return best;
}
function extract(html) {
  let h = String(html || '');
  const title = strip((/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(h) || [])[1] || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '');
  h = h.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|object|canvas|math|select|button|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style|link|meta|input|img|source|br\s*\/?)\b[^>]*>/gi, (m, t) => /^br/i.test(t) ? '\n' : ' ');
  let body = biggest(h, 'article');
  if (body.length < 400) { const mn = biggest(h, 'main'); if (mn.length > body.length) body = mn; }
  if (body.length < 400) body = biggest(h, 'body') || h;
  body = body.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  body = body.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, inner) => { const t = strip(inner); return t ? '\n\n' + t + (/[:.?!]$/.test(t) ? '' : ':') + '\n' : ' '; })
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/?(p|div|section|blockquote|pre|table|tr|ul|ol|dl|dt|dd|figure|figcaption|center|address|details|summary)\b[^>]*>/gi, '\n\n')
    .replace(/<\/?(td|th)\b[^>]*>/gi, ' \t ');
  let text = decodeEntities(body.replace(/<[^>]*>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  text = text.split('\n').filter((l, i, a) => l.length > 1 || l === '').join('\n').replace(/\n{3,}/g, '\n\n');
  if (text.length > 400000) text = text.slice(0, 400000);
  return { title, text };
}
module.exports = { decodeEntities, charsetOf, decode, extract, biggest };
