// Pure helpers for api/pq-check.js ("Is this website quantum-safe?" on mes.fm/quantum-safe-check). No network here, so node can test them:
// node tool_apps_src/quantum-safe-check-tests.js. The leading underscore keeps Vercel from serving this file as a function.
//
//   clientHello(host, group)   -> Buffer   one TLS 1.3 ClientHello record offering a single key share in `group`
//   parseServerReply(buf)      -> null (need more bytes) | { kind: "hello"|"hrr"|"alert"|"other", group, tls13, alert }
//   grade(r)                   -> { grade, label, summary }   r = { pq, draft, tls, kx, certType, certBits, https }
//
// Why a hand-made ClientHello: it does not depend on the OpenSSL version of the Vercel runtime. It offers ONLY the post-quantum hybrid
// key share; a server that supports it answers with a ServerHello using that group, one that does not asks for another group
// (HelloRetryRequest) or refuses. The handshake is never finished, so the key share does not need a matching secret key: the ML-KEM part
// is a fixed, valid ML-KEM-768 encapsulation key (made once with @noble/post-quantum from a fixed seed) and the X25519 part is random.
'use strict';
const crypto = require('crypto');

const GROUPS = { X25519MLKEM768: 0x11ec, X25519Kyber768Draft00: 0x6399, X25519: 0x001d, P256: 0x0017, P384: 0x0018, SecP256r1MLKEM768: 0x11eb };
const GROUP_NAMES = {}; Object.keys(GROUPS).forEach((k) => { GROUP_NAMES[GROUPS[k]] = k; });
const MLKEM768_PK = Buffer.from('klonAK0GT/d4tNpM9RRXpIIkpSdRJQqO4QslHIGLr8rG9BIeoySK+Pyo1+RrIZtvLzgYnbQJDWeCA/weR0gismg49IGvvzqPLEPPcwCznvcwZDo/e+Jg4ZVEmBlj47V3oPq4L5Mmolo0zFtI6BNR2nIrsXeu+xuYKbJwIzxpVbQavqUmOeeS03ZN06l+TJqYq6wBtem5ykPIiqZyO1uuYOMcLqsRbikYqDDBjdMP33gsDsiJQUaqq2HF4Fk6aRmZ+wc24KsJCpg14bBnO3OQUSsymZERkXthDDeRA/U7SLbEMozNIuBGi4Z0P1uOBGJYPAiqJIOnymjIDHdWUCtdjQNVMEh8BAxHCneZnSA3FEg1agMp0Wc/cgKIDwAbXsHHTKFEPOMlgLuspjokSxSO6YeaOMZuzJpwvjnOH2sNmIEFleVf7VGhHlQfNgG0kfwAfUeu3pCNzyxWuNkqYIim5RhWDieVaIU4ZvpvaLNnlfN47KBuLAgTnsiQ2MmZNfop77oXmOxrlDWpQmQ0zPrDTnR+l7K0sxNxFPMFd0RNwfcJ1XE1IWxStFgNQAJNQOXMOQuJeJEiFODIkjU0JWOleunNAUYIxATAs6uhOGGtzslX41jKFNiGyqRx9fWqHLBa8sBmEPRK80gy5mVoNlCcv6qfbcO1e6ozTgdWsrwZxYS/g4rHNNMgfVmwNJiiZeU5OiRS0qdOWGVmQrU0OyqAo6rG7MPH8wVtI5hj6YYrDzwAmwlFNcybnoE4SRdJ+zSwV2wHFtoVwxs2y+J7bYVygqG1d4lxOZE6ErGL7MQkTEKMjQaNtgKC1ah6a9CelwJq2NlxhjeaIDAntpOiregjBsWl2umzCIe4vQSKMkauCyCLpvlNdOVl9pMdy4WST2S5jitvwOkw2rlsUfhsFSLP/0c5O2DFFClbwiEHwLNuBhy/RdKDTWNry3ePcYFHFkSoSyZUH6BSMNdMx+OCvrC6vEmn8FoVUpOPJPEGOaCmVzGedblPlCASbKEpl+HHr1BWgsFQ0iZBiKK/3OYbP/w3b0li0jmNsZQF9xUaBmpMUGxY37eiXggWGlZ/EsUZNVeBwnMZnsjFY8nCVxdE1TKl6HpOw5yTroSwR+g3m5R9GaY8X2lieUQZAupTYAg9JjejbcCz3PVRwfyJ74ugcTk/aIEcNlimRMrP/DM6SvC/RFJJdLd9N0mAwRYwDPayi2tbS/w/FNyB1ylL0zhQa9exytivKEwwptOObxU04ceMOcUiKzlZ4ZynicWAUEI1b8O+DfxAWCs59jIToLamZKMgNMlETGatn1ZEeAgNBdtIpRyeEJiALwyegjqznEhmjSQxkuK0sEKe43lSBIt3tCchcXpu53dHS8PJjwaQx1iUshRshkIfKfpECeADpbtmsfkJZyq4GGoEASy0eld2JwA9VjOzNgmRAGPDxRMx9AQAN2gpfbO9MeFlUbUvbNSK0EWK7Ou0qOY5NddnQ7BNOsgHw3wxaJBaHTou/SfFZZSx/nJU0uZ/f6GHI2XN3jQwPAOrwSCUBmKBTnrf4GmX1lK0AB/GEsK3z8qgBnwjipQoV6Q=', 'base64');   // 1184 bytes
const HRR_RANDOM = Buffer.from('cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c', 'hex');
const ALERTS = { 40: 'handshake_failure', 47: 'illegal_parameter', 70: 'protocol_version', 71: 'insufficient_security', 80: 'internal_error', 112: 'unrecognized_name', 50: 'decode_error', 109: 'missing_extension' };

function u16(n) { return Buffer.from([n >> 8 & 255, n & 255]); }
function u24(n) { return Buffer.from([n >> 16 & 255, n >> 8 & 255, n & 255]); }
function vec16(b) { return Buffer.concat([u16(b.length), b]); }
function ext(type, body) { return Buffer.concat([u16(type), vec16(body)]); }

function keyShare(group) {
  if (group === GROUPS.X25519MLKEM768) return Buffer.concat([MLKEM768_PK, crypto.randomBytes(32)]);          // ML-KEM first, then X25519 (draft-ietf-tls-ecdhe-mlkem)
  if (group === GROUPS.X25519Kyber768Draft00) return Buffer.concat([crypto.randomBytes(32), MLKEM768_PK]);   // X25519 first, then Kyber768 (same size and layout)
  if (group === GROUPS.X25519) return crypto.randomBytes(32);
  throw new Error('unsupported group');
}

function clientHello(host, group) {
  const sni = Buffer.from(host, 'ascii');
  const exts = Buffer.concat([
    ext(0x0000, vec16(Buffer.concat([Buffer.from([0]), vec16(sni)]))),                                     // server_name
    ext(0x000a, vec16(Buffer.concat([u16(group), u16(GROUPS.X25519), u16(GROUPS.P256), u16(GROUPS.P384)]))), // supported_groups
    ext(0x000b, Buffer.from([1, 0])),                                                                        // ec_point_formats
    ext(0x000d, vec16(Buffer.concat([0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601, 0x0807].map(u16)))), // signature_algorithms
    ext(0x0010, vec16(Buffer.concat([Buffer.from([8]), Buffer.from('http/1.1')]))),                          // ALPN
    ext(0x002b, Buffer.from([4, 0x03, 0x04, 0x03, 0x03])),                                                   // supported_versions: TLS 1.3, 1.2
    ext(0x002d, Buffer.from([1, 1])),                                                                        // psk_key_exchange_modes
    ext(0x0033, vec16(Buffer.concat([u16(group), vec16(keyShare(group))])))                                  // key_share
  ]);
  const suites = [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8].map(u16);
  const body = Buffer.concat([u16(0x0303), crypto.randomBytes(32), Buffer.from([32]), crypto.randomBytes(32), vec16(Buffer.concat(suites)), Buffer.from([1, 0]), vec16(exts)]);
  const hs = Buffer.concat([Buffer.from([1]), u24(body.length), body]);
  return Buffer.concat([Buffer.from([0x16, 0x03, 0x01]), u16(hs.length), hs]);
}

// Reads the first handshake message the server sends (records may be split). Returns null while more bytes are needed.
function parseServerReply(buf) {
  if (buf.length < 5) return null;
  const type = buf[0], len = buf.readUInt16BE(3);
  if (type === 0x15) { if (buf.length < 7) return null; return { kind: 'alert', alert: ALERTS[buf[6]] || ('alert ' + buf[6]) }; }
  if (type !== 0x16) return { kind: 'other' };
  // gather handshake bytes across records
  let off = 0, hsb = [];
  while (off + 5 <= buf.length && buf[off] === 0x16) { const l = buf.readUInt16BE(off + 3); if (off + 5 + l > buf.length) break; hsb.push(buf.slice(off + 5, off + 5 + l)); off += 5 + l; }
  const hs = Buffer.concat(hsb);
  if (hs.length < 4) return null;
  const mlen = hs.readUIntBE(1, 3);
  if (hs.length < 4 + mlen) return null;
  if (hs[0] !== 2) return { kind: 'other' };
  const m = hs.slice(4, 4 + mlen);
  let p = 2; const random = m.slice(p, p + 32); p += 32;
  const sidLen = m[p]; p += 1 + sidLen; p += 2; /* cipher */ p += 1; /* compression */
  const hrr = random.equals(HRR_RANDOM);
  let group = null, tls13 = false;
  if (p + 2 <= m.length) {
    const end = p + 2 + m.readUInt16BE(p); p += 2;
    while (p + 4 <= end) {
      const t = m.readUInt16BE(p), l = m.readUInt16BE(p + 2), d = m.slice(p + 4, p + 4 + l); p += 4 + l;
      if (t === 0x002b && l >= 2 && d.readUInt16BE(0) === 0x0304) tls13 = true;
      if (t === 0x0033 && l >= 2) group = d.readUInt16BE(0);   // ServerHello: group + share; HelloRetryRequest: selected_group
    }
  }
  void len;
  return { kind: hrr ? 'hrr' : 'hello', group, groupName: group == null ? null : (GROUP_NAMES[group] || ('0x' + group.toString(16))), tls13 };
}

function grade(r) {
  if (!r.https) return { grade: 'F', label: 'Not encrypted', summary: 'The site does not use HTTPS, so anyone on the network can read it today, quantum computer or not.' };
  if (r.pq) return { grade: 'A', label: 'Quantum-safe key exchange', summary: 'Connections use the post-quantum hybrid ' + r.kx + ', so traffic recorded today cannot be decrypted later by a quantum computer ("harvest now, decrypt later").' };
  if (r.draft) return { grade: 'B', label: 'Old post-quantum draft', summary: 'The server only speaks the obsolete Kyber draft (X25519Kyber768Draft00). Current browsers no longer offer it, so in practice visitors get classical encryption.' };
  if (r.tls === 'TLSv1.3') return { grade: 'C', label: 'Not quantum-safe yet', summary: 'Modern TLS 1.3, but with classical key exchange only (' + (r.kx || 'X25519 / P-256') + '). A future quantum computer running Shor\'s algorithm could decrypt traffic recorded today.' };
  return { grade: 'D', label: 'Not quantum-safe, older TLS', summary: 'Only ' + (r.tls || 'an older TLS version') + ' with classical key exchange. Upgrading to TLS 1.3 is the first step towards post-quantum encryption.' };
}

module.exports = { GROUPS, GROUP_NAMES, MLKEM768_PK, HRR_RANDOM, clientHello, parseServerReply, grade, keyShare };
