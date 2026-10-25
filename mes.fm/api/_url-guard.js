// Pure helpers for api/image-fetch.js (fetching a picture from a link someone typed on mes.fm/translate or mes.fm/image-to-text).
// Kept separate so node can test them without the network: node tool_apps_src/image-fetch-tests.js (DNS is passed in, so tests use a fake one).
// The leading underscore keeps Vercel from serving this file as a function.
//
//   checkUrl(text)            -> { ok, url, host, reason }   http(s) only, default ports, no user:password@, a real public-looking host name (no IP literals)
//   ipv4Public(ip) / ipv6Public(ip)                          false for loopback, private, link-local, CGNAT, multicast, documentation, 6to4 / Teredo / mapped ...
//   pickPublicIp(host, resolve) -> Promise<{ address, family } | null>   resolve(host, "A"|"AAAA") -> [addresses]; null unless EVERY address is public
//   sniff(bytes)              -> "image/jpeg" | ... | "application/pdf" | null   type from the first bytes (the header's Content-Type is not trusted)
'use strict';

function ipv4Public(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return false;
  const [a, b, c] = p.map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;                // this network, private, loopback, multicast + reserved
  if (a === 100 && b >= 64 && b <= 127) return false;                              // carrier-grade NAT
  if (a === 169 && b === 254) return false;                                        // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

// Expand an IPv6 address to 8 numbers (null if it is not one). Handles "::" and a trailing dotted IPv4 part.
function v6groups(ip) {
  let s = String(ip).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const q = m[2].split('.').map(Number);
    if (q.some((x) => x > 255)) return null;
    s = m[1] + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = head.concat(Array(fill).fill('0'), tail);
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}
// Allow-list: only global unicast 2000::/3, minus documentation, Teredo and 6to4 (they can wrap a private IPv4 address).
function ipv6Public(ip) {
  const g = v6groups(ip);
  if (!g) return false;
  if (g[0] < 0x2000 || g[0] > 0x3fff) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false;
  if (g[0] === 0x2002) return false;
  if (g[0] === 0x3fff && g[1] <= 0x0fff) return false;                            // 3fff::/20 documentation (RFC 9637)
  return true;
}

function checkUrl(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return { ok: false, reason: 'No link given.' };
  if (s.length > 2048) return { ok: false, reason: 'That link is too long.' };
  let u;
  try { u = new URL(s); } catch (e) { return { ok: false, reason: 'That is not a web link.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'Only http:// and https:// links can be fetched.' };
  if (u.username || u.password) return { ok: false, reason: 'Links with a user name or password are not fetched.' };
  if (u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))) return { ok: false, reason: 'Only the normal web ports are allowed.' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || host.includes(':') || /^\d+(\.\d+){0,3}$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: 'Links to a bare IP address are not fetched.' };
  if (host.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return { ok: false, reason: 'That is not a public web address.' };
  if (/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/.test(host)) return { ok: false, reason: 'That is not a public web address.' };
  u.hash = '';
  return { ok: true, url: u.toString(), host, https: u.protocol === 'https:' };
}

async function pickPublicIp(host, resolve) {
  const [a, aaaa] = await Promise.all([resolve(host, 'A').catch(() => []), resolve(host, 'AAAA').catch(() => [])]);
  const v4 = (a || []).filter(Boolean), v6 = (aaaa || []).filter(Boolean);
  if (!v4.length && !v6.length) return null;
  if (!v4.every(ipv4Public) || !v6.every(ipv6Public)) return null;                 // one private answer = refuse (rebinding tricks mix them)
  return v4.length ? { address: v4[0], family: 4 } : { address: v6[0], family: 6 };
}

function sniff(b) {
  if (!b || b.length < 12) return null;
  const at = (i, str) => { for (let k = 0; k < str.length; k++) if (b[i + k] !== str.charCodeAt(k)) return false; return true; };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && at(1, 'PNG')) return 'image/png';
  if (at(0, 'GIF8')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(0, '%PDF-')) return 'application/pdf';
  if (at(0, 'BM')) return 'image/bmp';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'image/tiff';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (at(4, 'ftyp')) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

// Header Content-Type we are willing to read at all (the bytes decide the real type). SVG is refused: it is a document that can run script.
function typeAllowed(ct) {
  const t = String(ct || '').toLowerCase().split(';')[0].trim();
  if (!t) return true;                                                            // some servers send none; sniff() decides
  if (t === 'image/svg+xml') return false;
  return /^image\//.test(t) || t === 'application/pdf' || t === 'application/octet-stream' || t === 'binary/octet-stream';
}

module.exports = { ipv4Public, ipv6Public, v6groups, checkUrl, pickPublicIp, sniff, typeAllowed };
