// mes.fm/api/invest.js -- prices for mes.fm/investment-tracker. Keyless sources only; nothing about the visitor's
// portfolio is stored: the page sends just the symbols it needs (no amounts) and wallet addresses one at a time.
//
//   GET ?y=AAPL,SHOP.TO&c=bitcoin,hive   -> {v, at, q: {"s:AAPL": {p, c, ch, n}, "c:hive": {...}}, fx: {USD:1, CAD:1.37, ...}, miss: [keys]}
//   GET ?h=s:AAPL | c:hive&s=HIVE         -> {k, c, h: [[YYYY-MM-DD, close], ...]}  (daily, up to 5 years; crypto: Yahoo <SYM>-USD, else CoinGecko 365 days)
//   GET ?search=apple                      -> {r: [{k, sym, name, kind, ex}]}
//   GET ?w=btc:<addr> | eth | hive | xrp | sol -> {chain, b: {"c:bitcoin": qty, ...}}
//
// Sources: Yahoo Finance chart / search (unofficial, may break), CoinGecko public API, open.er-api.com, mempool.space,
// ethereum-rpc.publicnode.com, api.hive.blog, xrplcluster.com, api.mainnet-beta.solana.com.
// Each item is cached in Upstash (same vars as api/fav.js); without them it still works, just uncached.
'use strict';
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (compatible; mes.fm-invest/1.0)';
const TTL = { q: 300, fx: 21600, h: 43200, s: 86400, w: 120 };
const MAX_Y = 60, MAX_C = 80, HOURLY = 1500;

const ySym = (s) => /^[A-Z0-9][A-Z0-9.\-=^]{0,19}$/.test(s) || /^\^[A-Z0-9.]{1,15}$/.test(s);
const cgId = (s) => /^[a-z0-9][a-z0-9_-]{0,60}$/.test(s);
const RE = {
  btc: /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  eth: /^0x[0-9a-fA-F]{40}$/,
  hive: /^[a-z][a-z0-9.-]{2,15}$/,
  xrp: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
};

const up = () => !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
async function redis(commands) {
  if (!up()) return commands.map(() => null);
  try {
    const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands)
    });
    const j = await r.json();
    return j.map((x) => (x && x.result !== undefined ? x.result : null));
  } catch (e) { return commands.map(() => null); }
}
async function cacheGet(keys) { if (!keys.length) return []; const r = await redis(keys.map((k) => ['GET', 'inv:' + k])); return r.map((x) => { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } }); }
function cacheSet(pairs, ttl) { if (pairs.length) redis(pairs.map(([k, v]) => ['SET', 'inv:' + k, JSON.stringify(v), 'EX', String(ttl)])); }

async function getJSON(url, opt) {
  opt = opt || {};
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opt.ms || 7000);
  try {
    const r = await fetch(url, { method: opt.body ? 'POST' : 'GET', body: opt.body, signal: ctl.signal, headers: Object.assign({ 'user-agent': UA, accept: 'application/json' }, opt.body ? { 'content-type': 'application/json' } : {}) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------- parsing (exported for tests) ---------- */
function fixCur(p, c) {
  if (c === 'GBp' || c === 'GBX') return [p / 100, 'GBP'];
  if (c === 'ZAc') return [p / 100, 'ZAR'];
  if (c === 'ILA') return [p / 100, 'ILS'];
  return [p, c || 'USD'];
}
function parseYahooQuote(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.meta) return null;
  const m = res.meta, closes = ((res.indicators || {}).quote || [{}])[0].close || [];
  let p = m.regularMarketPrice;
  if (!(p > 0)) { for (let i = closes.length - 1; i >= 0; i--) if (closes[i] > 0) { p = closes[i]; break; } }
  if (!(p > 0)) return null;
  const prev = m.previousClose || m.chartPreviousClose;
  const [pp, c] = fixCur(p, m.currency), [pv] = fixCur(prev || 0, m.currency);
  return { p: pp, c, ch: pv > 0 ? (pp / pv - 1) * 100 : null, n: m.longName || m.shortName || m.symbol || '' };
}
function parseYahooHist(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) return [];
  const ts = res.timestamp, cl = ((res.indicators || {}).quote || [{}])[0].close || [], div = (res.meta && res.meta.currency === 'GBp') ? 100 : (res.meta && res.meta.currency === 'ZAc') ? 100 : 1;
  const out = [], seen = {};
  for (let i = 0; i < ts.length; i++) {
    if (!(cl[i] > 0)) continue;
    const d = new Date((ts[i] + (res.meta && res.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
    if (seen[d] != null) { out[seen[d]][1] = +(cl[i] / div).toPrecision(8); continue; }
    seen[d] = out.length; out.push([d, +(cl[i] / div).toPrecision(8)]);
  }
  return out;
}
const asset = (s) => { const m = String(s || '').match(/^\s*([\d.]+)\s+([A-Z]+)/); return m ? +m[1] : 0; };
function walletParse(chain, j, extra) {
  if (chain === 'btc') { const c = j.chain_stats || {}, m = j.mempool_stats || {}; return { 'c:bitcoin': ((c.funded_txo_sum || 0) - (c.spent_txo_sum || 0) + (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0)) / 1e8 }; }
  if (chain === 'eth') { if (!j.result) throw new Error('no balance'); return { 'c:ethereum': Number(BigInt(j.result)) / 1e18 }; }
  if (chain === 'xrp') { const a = j.result && j.result.account_data; if (!a) { if (j.result && j.result.error === 'actNotFound') return { 'c:ripple': 0 }; throw new Error('no account'); } return { 'c:ripple': +a.Balance / 1e6 }; }
  if (chain === 'sol') { if (!j.result || j.result.value == null) throw new Error('no balance'); return { 'c:solana': j.result.value / 1e9 }; }
  if (chain === 'hive') {
    const a = j.result && j.result[0]; if (!a) throw new Error('no such Hive account');
    const g = extra || {}, perVest = asset(g.total_vesting_fund_hive) / (asset(g.total_vesting_shares) || 1);
    const hp = (asset(a.vesting_shares) - asset(a.delegated_vesting_shares)) * perVest;
    return { 'c:hive': asset(a.balance) + asset(a.savings_balance) + hp, 'c:hive_dollar': asset(a.hbd_balance) + asset(a.savings_hbd_balance) };
  }
  throw new Error('unknown chain');
}

/* ---------- fetchers ---------- */
async function yahooQuote(sym) {
  return parseYahooQuote(await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=1d'));
}
async function quotes(ys, cs) {
  const keys = ys.map((s) => 's:' + s).concat(cs.map((c) => 'c:' + c));
  const cached = await cacheGet(keys.map((k) => 'q:' + k)), q = {}, miss = [];
  keys.forEach((k, i) => { if (cached[i]) q[k] = cached[i]; });
  const needY = ys.filter((s) => !q['s:' + s]), needC = cs.filter((c) => !q['c:' + c]), fresh = [];
  await Promise.all(needY.map(async (s) => {
    try { const r = await yahooQuote(s); if (r) { q['s:' + s] = r; fresh.push(['q:s:' + s, r]); } } catch (e) { /* missing */ }
  }));
  for (let i = 0; i < needC.length; i += 60) {
    const part = needC.slice(i, i + 60);
    try {
      const j = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + part.join(',') + '&vs_currencies=usd&include_24hr_change=true');
      part.forEach((id) => { const x = j[id]; if (x && x.usd > 0) { const r = { p: x.usd, c: 'USD', ch: x.usd_24h_change != null ? x.usd_24h_change : null }; q['c:' + id] = r; fresh.push(['q:c:' + id, r]); } });
    } catch (e) { /* missing */ }
  }
  cacheSet(fresh, TTL.q);
  keys.forEach((k) => { if (!q[k]) miss.push(k); });
  return { q, miss };
}
async function fxRates() {
  const [c] = await cacheGet(['fx']);
  if (c) return c;
  const j = await getJSON('https://open.er-api.com/v6/latest/USD');
  if (!j || !j.rates) throw new Error('no rates');
  cacheSet([['fx', j.rates]], TTL.fx);
  return j.rates;
}
async function history(key, sym) {
  const [c] = await cacheGet(['h:' + key]);
  if (c) return c;
  let out = null;
  const yahoo = async (s) => {
    const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?range=5y&interval=1d', { ms: 9000 });
    const h = parseYahooHist(j), m = j.chart.result[0].meta || {};
    return h.length ? { k: key, c: fixCur(1, m.currency)[1], h } : null;
  };
  if (key[0] === 's') out = await yahoo(key.slice(2));
  else {
    if (sym && /^[A-Z0-9]{1,10}$/.test(sym)) { try { out = await yahoo(sym + '-USD'); } catch (e) { out = null; } }
    if (!out || out.h.length < 30) {
      const j = await getJSON('https://api.coingecko.com/api/v3/coins/' + key.slice(2) + '/market_chart?vs_currency=usd&days=365&interval=daily', { ms: 9000 });
      const seen = {}, h = [];
      (j.prices || []).forEach(([t, p]) => { const d = new Date(t).toISOString().slice(0, 10); if (seen[d] != null) h[seen[d]][1] = p; else { seen[d] = h.length; h.push([d, +p.toPrecision(8)]); } });
      if (h.length) out = { k: key, c: 'USD', h };
    }
  }
  if (!out) throw new Error('no history');
  cacheSet([['h:' + key, out]], TTL.h);
  return out;
}
async function search(q) {
  const ck = 's:' + q.toLowerCase();
  const [c] = await cacheGet([ck]);
  if (c) return c;
  const out = [];
  const [y, g] = await Promise.allSettled([
    getJSON('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=10&newsCount=0&listsCount=0'),
    getJSON('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q))
  ]);
  if (g.status === 'fulfilled') (g.value.coins || []).slice(0, 6).forEach((x) => { if (cgId(x.id)) out.push({ k: 'c:' + x.id, sym: String(x.symbol || '').toUpperCase(), name: x.name, kind: 'c', ex: x.market_cap_rank ? 'Crypto · #' + x.market_cap_rank : 'Crypto' }); });
  if (y.status === 'fulfilled') (y.value.quotes || []).forEach((x) => {
    if (!x.symbol || !ySym(x.symbol) || x.quoteType === 'CRYPTOCURRENCY' || x.quoteType === 'OPTION' || x.quoteType === 'FUTURE') return;
    out.push({ k: 's:' + x.symbol, sym: x.symbol, name: x.longname || x.shortname || x.symbol, kind: 's', ex: [x.typeDisp || x.quoteType, x.exchDisp || x.exchange].filter(Boolean).join(' · ') });
  });
  const crypto1 = out.filter((x) => x.kind === 'c'), stock = out.filter((x) => x.kind === 's');
  // Put an exact ticker match first.
  const U = q.toUpperCase(), L = q.toLowerCase(), rank = (x) => (x.sym === U || String(x.name).toLowerCase() === L ? 0 : 1);
  const r = { r: stock.concat(crypto1).sort((a, b) => rank(a) - rank(b)).slice(0, 14) };
  cacheSet([[ck, r]], TTL.s);
  return r;
}
async function wallet(chain, addr) {
  const ck = 'w:' + chain + ':' + addr;
  const [c] = await cacheGet([ck]);
  if (c) return c;
  let b;
  if (chain === 'btc') b = walletParse(chain, await getJSON('https://mempool.space/api/address/' + addr));
  else if (chain === 'eth') b = walletParse(chain, await getJSON('https://ethereum-rpc.publicnode.com', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }) }));
  else if (chain === 'xrp') b = walletParse(chain, await getJSON('https://xrplcluster.com', { body: JSON.stringify({ method: 'account_info', params: [{ account: addr, ledger_index: 'validated' }] }) }));
  else if (chain === 'sol') b = walletParse(chain, await getJSON('https://api.mainnet-beta.solana.com', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }) }));
  else if (chain === 'hive') {
    const [a, g] = await Promise.all([
      getJSON('https://api.hive.blog', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_accounts', params: [[addr]] }) }),
      getJSON('https://api.hive.blog', { body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'condenser_api.get_dynamic_global_properties', params: [] }) })
    ]);
    b = walletParse(chain, a, g.result);
  }
  const r = { chain, b };
  cacheSet([[ck, r]], TTL.w);
  return r;
}

function ipHash(req) {
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();
  return crypto.createHash('sha256').update('inv|' + ip + '|' + (process.env.UPSTASH_REDIS_REST_TOKEN || '')).digest('hex').slice(0, 16);
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj, cache) => { res.setHeader('Cache-Control', cache || 'no-store'); res.status(code).send(JSON.stringify(obj)); };
  try {
    if (up()) {
      const hk = 'inv:rl:' + ipHash(req) + ':' + Math.floor(Date.now() / 3600000);
      const [n] = await redis([['INCR', hk], ['EXPIRE', hk, '3700']]);
      if (n > HOURLY) return send(429, { error: 'Too many requests. Try again in a little while.' });
    }
    if (q.search != null) {
      const s = String(q.search).trim().slice(0, 40);
      if (s.length < 1) return send(400, { error: 'empty search' });
      return send(200, await search(s), 'public, max-age=300');
    }
    if (q.w) {
      const m = String(q.w).match(/^(btc|eth|hive|xrp|sol):(.{3,100})$/);
      if (!m || !RE[m[1]].test(m[2])) return send(400, { error: 'That does not look like a ' + (m ? m[1].toUpperCase() : '') + ' address.' });
      return send(200, await wallet(m[1], m[2]));
    }
    if (q.h) {
      const k = String(q.h);
      if (!((k[0] === 's' && ySym(k.slice(2))) || (k[0] === 'c' && cgId(k.slice(2)))) || k[1] !== ':') return send(400, { error: 'bad key' });
      const sym = String(q.s || '').toUpperCase().slice(0, 10);
      return send(200, await history(k, sym), 'public, max-age=3600');
    }
    const ys = String(q.y || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const cs = String(q.c || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (ys.length > MAX_Y || cs.length > MAX_C) return send(400, { error: 'too many symbols' });
    if (ys.some((s) => !ySym(s)) || cs.some((s) => !cgId(s))) return send(400, { error: 'bad symbol' });
    const [r, fx] = await Promise.all([quotes(ys, cs), fxRates().catch(() => null)]);
    return send(200, { v: 1, at: Date.now(), q: r.q, fx: fx || { USD: 1 }, miss: r.miss }, 'public, max-age=60');
  } catch (e) {
    return send(502, { error: String(e && e.message || e).slice(0, 200) });
  }
};
module.exports._t = { ySym, cgId, parseYahooQuote, parseYahooHist, walletParse };

if (require.main === module) {
  // node mes.fm/api/invest.js  -> quick live check of every source
  const run = (query) => new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.c = c; return this; }, send(b) { resolve([this.c, b.slice(0, 260)]); } };
    module.exports({ query, headers: {} }, res);
  });
  (async () => {
    for (const qy of [{ y: 'AAPL,SHOP.TO,VOD.L', c: 'bitcoin,hive' }, { h: 's:AAPL' }, { h: 'c:hive', s: 'HIVE' }, { search: 'tesla' },
      { w: 'btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }, { w: 'eth:0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe' }, { w: 'hive:mes' },
      { w: 'xrp:rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh' }, { w: 'sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }]) {
      console.log(JSON.stringify(qy), ...(await run(qy)));
    }
  })();
}
