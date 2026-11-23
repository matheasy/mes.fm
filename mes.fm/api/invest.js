// mes.fm/api/invest.js -- prices for mes.fm/investment-tracker. Keyless sources only; nothing about the visitor's
// portfolio is stored: the page sends just the symbols it needs (no amounts) and wallet addresses one at a time.
//
//   GET ?y=AAPL,SHOP.TO&c=bitcoin,hive   -> {v, at, q: {"s:AAPL": {p, c, ch, n}, "c:hive": {...}}, fx: {USD:1, CAD:1.37, ...}, miss: [keys]}
//   GET ?h=s:AAPL | c:hive&s=HIVE         -> {k, c, h: [[YYYY-MM-DD, close], ...]}  (daily, up to 5 years; crypto: Yahoo <SYM>-USD, else CoinGecko 365 days)
//   GET ?search=apple                      -> {r: [{k, sym, name, kind, ex}]}
//   GET ?w=btc:<addr> | eth | hive | xrp | sol | trx | ltc | doge | ada -> {chain, b: {"c:bitcoin": qty, ...}}
//       sol / trx / hive / xrp / ada also return tokens (t, q, hid as for eth; sol "e:<mint>", hive "e:he:<SYMBOL>",
//       xrp "e:xrp:<CURRENCY>.<issuer>", ada "e:ada:<policy id + asset name hex>"); terr = tokens could not be read this time.
//       eth also returns ERC-20 tokens: b gets "c:<CoinGecko id>" (popular tokens) or "e:<contract>" (others, with their price
//       in q: {"e:0x..": {p, c, ch, n}}), t: {key: [symbol, name]}, hid: tokens left out (looks like spam), src: "ethplorer" | "rpc".
//       The same address is also read on Base, Arbitrum and BNB Chain (built-in token lists): b = all networks added up,
//       n: {eth|base|arb|bnb: {key: qty}}, nerr: [networks that failed this time].
//
// Sources: Yahoo Finance chart / search (unofficial, may break), CoinGecko public API, open.er-api.com, mempool.space,
// ethereum / base / arbitrum-one / bsc / polygon-bor / optimism / avalanche-c-chain / linea / scroll / gnosis / mantle / sonic / celo -rpc.publicnode.com, api.ethplorer.io (freekey), api.hive.blog, xrplcluster.com, api.mainnet-beta.solana.com / solana-rpc.publicnode.com, lite-api.jup.ag (Solana token info),
// api.trongrid.io / tron-rpc.publicnode.com, Hive Engine RPC nodes, litecoinspace.org, api.bitcore.io / api.blockcypher.com / dogechain.info (DOGE), api.koios.rest (Cardano), api.geckoterminal.com (Cardano / XRPL token prices).
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
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  trx: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ltc: /^(ltc1[02-9ac-hj-np-z]{11,87}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  doge: /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  ada: /^(addr1[02-9ac-hj-np-z]{50,120}|stake1[02-9ac-hj-np-z]{50,60})$/
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
function walletParse(chain, j, extra, key) {
  if (chain === 'btc') { const c = j.chain_stats || {}, m = j.mempool_stats || {}; return { [key || 'c:bitcoin']: ((c.funded_txo_sum || 0) - (c.spent_txo_sum || 0) + (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0)) / 1e8 }; }
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

/* ---------- ERC-20 tokens ----------
   Popular tokens: contract -> [symbol, decimals, CoinGecko id, name]. Every contract's symbol and decimals were read from
   the chain itself (2026-11-23). These always count. Any other token in a wallet counts only when Ethplorer has a price,
   it trades >= $250k a day, is worth >= $10M in total and the holding is worth >= $1: wallets get airdropped lots of
   worthless "tokens" that claim big prices. */
const TOKENS = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': ['USDT', 6, 'tether', 'Tether'],
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': ['USDC', 6, 'usd-coin', 'USD Coin'],
  '0x6b175474e89094c44da98b954eedeac495271d0f': ['DAI', 18, 'dai', 'Dai'],
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': ['cbBTC', 8, 'coinbase-wrapped-btc', 'Coinbase Wrapped BTC'],
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': ['WETH', 18, 'weth', 'Wrapped Ether'],
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': ['stETH', 18, 'staked-ether', 'Lido Staked Ether'],
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
  '0xae78736cd615f374d3085123a210448e74fc6393': ['rETH', 18, 'rocket-pool-eth', 'Rocket Pool ETH'],
  '0x514910771af9ca656af840dff83e8264ecf986ca': ['LINK', 18, 'chainlink', 'Chainlink'],
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': ['UNI', 18, 'uniswap', 'Uniswap'],
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': ['SHIB', 18, 'shiba-inu', 'Shiba Inu'],
  '0x6982508145454ce325ddbe47a25d4ec3d2311933': ['PEPE', 18, 'pepe', 'Pepe'],
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': ['AAVE', 18, 'aave', 'Aave'],
  '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6': ['POL', 18, 'polygon-ecosystem-token', 'Polygon'],
  '0x5a98fcbea516cf06857215779fd812ca3bef1b32': ['LDO', 18, 'lido-dao', 'Lido DAO'],
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': ['MKR', 18, 'maker', 'Maker'],
  '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3': ['ONDO', 18, 'ondo-finance', 'Ondo'],
  '0x57e114b691db790c35207b2e685d4a43181e6061': ['ENA', 18, 'ethena', 'Ethena'],
  '0x4c9edd5852cd905f086c759e8383e09bff1e68b3': ['USDe', 18, 'ethena-usde', 'Ethena USDe'],
  '0x6c3ea9036406852006290770bedfcaba0e23a0e8': ['PYUSD', 6, 'paypal-usd', 'PayPal USD'],
  '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409': ['FDUSD', 18, 'first-digital-usd', 'First Digital USD'],
  '0x8e870d67f660d95d5be530380d0ec0bd388289e1': ['USDP', 18, 'paxos-standard', 'Pax Dollar'],
  '0x1a7e4e63778b4f12a199c062f3efdd288afcbce8': ['EURA', 18, 'ageur', 'EURA'],
  '0x45804880de22913dafe09f4980848ece6ecbaf78': ['PAXG', 18, 'pax-gold', 'PAX Gold'],
  '0x68749665ff8d2d112fa859aa293f07a622782f38': ['XAUt', 6, 'tether-gold', 'Tether Gold'],
  '0xd533a949740bb3306d119cc777fa900ba034cd52': ['CRV', 18, 'curve-dao-token', 'Curve DAO'],
  '0xc944e90c64b2c07662a292be6244bdf05cda44a7': ['GRT', 18, 'the-graph', 'The Graph'],
  '0x4d224452801aced8b2f0aebe155379bb5d594381': ['APE', 18, 'apecoin', 'ApeCoin'],
  '0x3845badade8e6dff049820680d1f14bd3903a5d0': ['SAND', 18, 'the-sandbox', 'The Sandbox'],
  '0x0f5d2fb29fb7d3cfee444a200298f468908cc942': ['MANA', 18, 'decentraland', 'Decentraland'],
  '0x0d8775f648430679a709e98d2b0cb6250d2887ef': ['BAT', 18, 'basic-attention-token', 'Basic Attention Token'],
  '0xaea46a60368a7bd060eec7df8cba43b7ef41ad85': ['FET', 18, 'fetch-ai', 'Artificial Superintelligence Alliance'],
  '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24': ['RNDR', 18, 'render-token', 'Render'],
  '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1': ['ARB', 18, 'arbitrum', 'Arbitrum'],
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': ['SNX', 18, 'havven', 'Synthetix'],
  '0xc00e94cb662c3520282e6f5717214004a7f26888': ['COMP', 18, 'compound-governance-token', 'Compound'],
  '0x111111111117dc0aa78b770fa6a738034120c302': ['1INCH', 18, '1inch', '1inch'],
  '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b': ['AXS', 18, 'axie-infinity', 'Axie Infinity'],
  '0x6810e776880c02933d47db1b9fc05908e5386b96': ['GNO', 18, 'gnosis', 'Gnosis'],
  '0x58b6a8a3302369daec383334672404ee733ab239': ['LPT', 18, 'livepeer', 'Livepeer'],
  '0x4a220e6096b25eadb88358cb44068a3248254675': ['QNT', 18, 'quant-network', 'Quant'],
  '0x3c3a81e81dc49a522a592e7622a7e711c06bf354': ['MNT', 18, 'mantle', 'Mantle'],
  '0xb8c77482e45f1f44de1745f52c74426c631bdd52': ['BNB', 18, 'binancecoin', 'BNB'],
  '0x75231f58b43240c9718dd58b4967c5114342a86c': ['OKB', 18, 'okb', 'OKB'],
  '0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3': ['LEO', 18, 'leo-token', 'LEO Token'],
  '0xd1d2eb1b1e90b638588728b4130137d262c87cae': ['GALA', 8, 'gala', 'Gala'],
  '0xe28b3b32b6c345a34ff64674606124dd5aceca30': ['INJ', 18, 'injective-protocol', 'Injective'],
  '0x163f8c2467924be0ae7b5347228cabf260318753': ['WLD', 18, 'worldcoin-wld', 'Worldcoin'],
  '0x5283d291dbcf85356a21ba090e6db59121208b44': ['BLUR', 18, 'blur', 'Blur'],
  '0x0b38210ea11411557c13457d4da7dc6ea731b88a': ['API3', 18, 'api3', 'API3']
};
/* Other networks an Ethereum address also lives on. Each has a built-in token list (contract -> [symbol, decimals,
   CoinGecko id, name]; symbols and decimals read from each chain 2026-11-23) read with one batch call to publicnode,
   so there is no spam to filter. Native coin: ETH on Base / Arbitrum / Optimism / Linea / Scroll, BNB, POL, AVAX, xDAI, MNT, S, CELO on the others. */
const NETS = {
  base: { name: 'Base', rpc: 'https://base-rpc.publicnode.com', native: ['c:ethereum', 'ETH', 'Ethereum'], tokens: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': ['USDbC', 6, 'usd-coin', 'USD Coin'],
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': ['USDT', 6, 'tether', 'Tether'],
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': ['DAI', 18, 'dai', 'Dai'],
    '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42': ['EURC', 6, 'euro-coin', 'EURC'],
    '0x4200000000000000000000000000000000000006': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': ['cbETH', 18, 'coinbase-wrapped-staked-eth', 'Coinbase Wrapped Staked ETH'],
    '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': ['cbBTC', 8, 'coinbase-wrapped-btc', 'Coinbase Wrapped BTC'],
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631': ['AERO', 18, 'aerodrome-finance', 'Aerodrome'],
    '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': ['DEGEN', 18, 'degen-base', 'Degen'],
    '0x532f27101965dd16442e59d40670faf5ebb142e4': ['BRETT', 18, 'based-brett', 'Brett'],
    '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b': ['VIRTUAL', 18, 'virtual-protocol', 'Virtuals Protocol'],
    '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4': ['TOSHI', 18, 'toshi', 'Toshi'],
    '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196': ['LINK', 18, 'chainlink', 'Chainlink']
  } },
  arb: { name: 'Arbitrum', rpc: 'https://arbitrum-one-rpc.publicnode.com', native: ['c:ethereum', 'ETH', 'Ethereum'], tokens: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': ['USDC.e', 6, 'usd-coin', 'USD Coin'],
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': ['USDT', 6, 'tether', 'Tether'],
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': ['DAI', 18, 'dai', 'Dai'],
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x5979d7b546e38e414f7e9822514be443a4800529': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0x912ce59144191c1204e64559fe8253a0e49e6548': ['ARB', 18, 'arbitrum', 'Arbitrum'],
    '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a': ['GMX', 18, 'gmx', 'GMX'],
    '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': ['LINK', 18, 'chainlink', 'Chainlink'],
    '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0': ['UNI', 18, 'uniswap', 'Uniswap'],
    '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8': ['PENDLE', 18, 'pendle', 'Pendle'],
    '0x539bde0d7dbd336b79148aa742883198bbf60342': ['MAGIC', 18, 'magic', 'Magic'],
    '0x9623063377ad1b27544c965ccd7342f7ea7e88c7': ['GRT', 18, 'the-graph', 'The Graph']
  } },
  bnb: { name: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com', native: ['c:binancecoin', 'BNB', 'BNB'], tokens: {
    '0x55d398326f99059ff775485246999027b3197955': ['USDT', 18, 'tether', 'Tether'],
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': ['USDC', 18, 'usd-coin', 'USD Coin'],
    '0xe9e7cea3dedca5984780bafc599bd69add087d56': ['BUSD', 18, 'binance-usd', 'Binance USD'],
    '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409': ['FDUSD', 18, 'first-digital-usd', 'First Digital USD'],
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': ['DAI', 18, 'dai', 'Dai'],
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': ['WBNB', 18, 'wbnb', 'Wrapped BNB'],
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8': ['ETH', 18, 'ethereum', 'Ethereum'],
    '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': ['BTCB', 18, 'bitcoin-bep2', 'Binance Bitcoin'],
    '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82': ['CAKE', 18, 'pancakeswap-token', 'PancakeSwap'],
    '0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe': ['XRP', 18, 'ripple', 'XRP'],
    '0xba2ae424d960c26247dd6c32edc70b295c744c43': ['DOGE', 8, 'dogecoin', 'Dogecoin'],
    '0x3ee2200efb3400fabb9aacf31297cbdd1d435d47': ['ADA', 18, 'cardano', 'Cardano'],
    '0x7083609fce4d1d8dc0c979aab8c869ea2c873402': ['DOT', 18, 'polkadot', 'Polkadot'],
    '0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd': ['LINK', 18, 'chainlink', 'Chainlink'],
    '0x4b0f1812e5df2a09796481ff14017e6005508003': ['TWT', 18, 'trust-wallet-token', 'Trust Wallet Token'],
    '0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e3': ['TRX', 6, 'tron', 'TRON'],
    '0x1ce0c2827e2ef14d5c4f29a091d735a204794041': ['AVAX', 18, 'avalanche-2', 'Avalanche'],
    '0xbf5140a22578168fd562dccf235e5d43a02ce9b1': ['UNI', 18, 'uniswap', 'Uniswap'],
    '0x4338665cbb7b2485a8855a139b75d5e34ab0db94': ['LTC', 18, 'litecoin', 'Litecoin'],
    '0x2859e4544c4bb03966803b044a93563bd2d0dd4d': ['SHIB', 18, 'shiba-inu', 'Shiba Inu']
  } },
  pol: { name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', native: ['c:polygon-ecosystem-token', 'POL', 'Polygon'], tokens: {
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': ['USDC.e', 6, 'usd-coin', 'USD Coin'],
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': ['USDT', 6, 'tether', 'Tether'],
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': ['DAI', 18, 'dai', 'Dai'],
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': ['WPOL', 18, 'polygon-ecosystem-token', 'Wrapped POL'],
    '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39': ['LINK', 18, 'chainlink', 'Chainlink'],
    '0xd6df932a45c0f255f85145f286ea0b292b21c90b': ['AAVE', 18, 'aave', 'Aave'],
    '0xb33eaad8d922b1083446dc23f610c2567fb5180f': ['UNI', 18, 'uniswap', 'Uniswap'],
    '0xb5c064f955d8e7f38fe0460c556a72987494ee17': ['QUICK', 18, 'quickswap', 'QuickSwap'],
    '0xbbba073c31bf03b8acf7c28ef0738decf3695683': ['SAND', 18, 'the-sandbox', 'The Sandbox'],
    '0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4': ['MANA', 18, 'decentraland', 'Decentraland'],
    '0x172370d5cd63279efa6d502dab29171933a610af': ['CRV', 18, 'curve-dao-token', 'Curve']
  } },
  op: { name: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com', native: ['c:ethereum', 'ETH', 'Ethereum'], tokens: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x7f5c764cbc14f9669b88837ca1490cca17c31607': ['USDC.e', 6, 'usd-coin', 'USD Coin'],
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': ['USDT', 6, 'tether', 'Tether'],
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': ['DAI', 18, 'dai', 'Dai'],
    '0x4200000000000000000000000000000000000006': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x4200000000000000000000000000000000000042': ['OP', 18, 'optimism', 'Optimism'],
    '0x68f180fcce6836688e9084f035309e29bf0a2095': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0x1f32b1c2345538c0c6f582fcb022739c4a194ebb': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6': ['LINK', 18, 'chainlink', 'Chainlink'],
    '0x8700daec35af8ff88c16bdf0418774cb3d7599b4': ['SNX', 18, 'havven', 'Synthetix'],
    '0x9560e827af36c94d2ac33a39bce1fe78631088db': ['VELO', 18, 'velodrome-finance', 'Velodrome'],
    '0x6fd9d7ad17242c41f7131d257212c54a0e816691': ['UNI', 18, 'uniswap', 'Uniswap'],
    '0x76fb31fb4af56892a25e32cfc43de717950c9278': ['AAVE', 18, 'aave', 'Aave']
  } },
  avax: { name: 'Avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', native: ['c:avalanche-2', 'AVAX', 'Avalanche'], tokens: {
    '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': ['USDC.e', 6, 'usd-coin', 'USD Coin'],
    '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7': ['USDT', 6, 'tether', 'Tether'],
    '0xc7198437980c041c805a1edcba50c1ce5db95118': ['USDT.e', 6, 'tether', 'Tether'],
    '0xd586e7f844cea2f87f50152665bcbc2c279d8d70': ['DAI.e', 18, 'dai', 'Dai'],
    '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': ['WAVAX', 18, 'avalanche-2', 'Wrapped AVAX'],
    '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': ['WETH.e', 18, 'weth', 'Wrapped Ether'],
    '0x152b9d0fdc40c096757f570a51e494bd4b943e50': ['BTC.b', 8, 'bitcoin-avalanche-bridged-btc-b', 'Bitcoin (bridged)'],
    '0x50b7545627a5162f82a992c33b87adc75187b218': ['WBTC.e', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': ['sAVAX', 18, 'benqi-liquid-staked-avax', 'Staked AVAX'],
    '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd': ['JOE', 18, 'joe', 'JOE'],
    '0x5947bb275c521040051d82396192181b413227a3': ['LINK.e', 18, 'chainlink', 'Chainlink'],
    '0x63a72806098bd3d9520cc43356dd78afe5d386d9': ['AAVE.e', 18, 'aave', 'Aave'],
    '0x8729438eb15e2c8b576fcc6aecda6a148776c0f5': ['QI', 18, 'benqi', 'BENQI']
  } },
  linea: { name: 'Linea', rpc: 'https://linea-rpc.publicnode.com', native: ['c:ethereum', 'ETH', 'Ethereum'], tokens: {
    '0x176211869ca2b568f2a7d4ee941e073a821ee1ff': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0xa219439258ca9da29e9cc4ce5596924745e12b93': ['USDT', 6, 'tether', 'Tether'],
    '0x4af15ec2a0bd43db75dd04e62faa3b8ef36b00d5': ['DAI', 18, 'dai', 'Dai'],
    '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0xb5bedd42000b71fdde22d3ee8a79bd49a568fc8f': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0x1789e0043623282d5dcc7f213d703c6d8bafbb04': ['LINEA', 18, 'linea', 'Linea']
  } },
  scroll: { name: 'Scroll', rpc: 'https://scroll-rpc.publicnode.com', native: ['c:ethereum', 'ETH', 'Ethereum'], tokens: {
    '0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0xf55bec9cafdbe8730f096aa55dad6d22d44099df': ['USDT', 6, 'tether', 'Tether'],
    '0xca77eb3fefe3725dc33bccb54edefc3d9f764f97': ['DAI', 18, 'dai', 'Dai'],
    '0x5300000000000000000000000000000000000004': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x3c1bca5a656e69edcd0d4e36bebb3fcdaca60cf1': ['WBTC', 8, 'wrapped-bitcoin', 'Wrapped Bitcoin'],
    '0xf610a9dfb7c89644979b4a0f27063e9e7d7cda32': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0xd29687c813d741e2f938f4ac377128810e217b1b': ['SCR', 18, 'scroll', 'Scroll']
  } },
  gno: { name: 'Gnosis', rpc: 'https://gnosis-rpc.publicnode.com', native: ['c:xdai', 'xDAI', 'xDAI'], tokens: {
    '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x4ecaba5870353805a9f068101a40e0f32ed605c6': ['USDT', 6, 'tether', 'Tether'],
    '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d': ['WXDAI', 18, 'xdai', 'Wrapped xDAI'],
    '0xaf204776c7245bf4147c2612bf6e5972ee483701': ['sDAI', 18, 'savings-xdai', 'Savings xDAI'],
    '0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x6c76971f98945ae98dd7d4dfca8711ebea946ea6': ['wstETH', 18, 'wrapped-steth', 'Wrapped stETH'],
    '0x9c58bacc331c9aa871afd802db6379a98e80cedb': ['GNO', 18, 'gnosis', 'Gnosis']
  } },
  mnt: { name: 'Mantle', rpc: 'https://mantle-rpc.publicnode.com', native: ['c:mantle', 'MNT', 'Mantle'], tokens: {
    '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae': ['USDT', 6, 'tether', 'Tether'],
    '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111': ['WETH', 18, 'weth', 'Wrapped Ether'],
    '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8': ['WMNT', 18, 'mantle', 'Wrapped Mantle'],
    '0xcda86a272531e8640cd7f1a92c01839911b90bb0': ['mETH', 18, 'mantle-staked-ether', 'Mantle Staked Ether']
  } },
  sonic: { name: 'Sonic', rpc: 'https://sonic-rpc.publicnode.com', native: ['c:sonic-3', 'S', 'Sonic'], tokens: {
    '0x29219dd400f2bf60e5a23d13be72b486d4038894': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38': ['wS', 18, 'sonic-3', 'Wrapped Sonic'],
    '0x50c42deacd8fc9773493ed674b675be577f2634b': ['WETH', 18, 'weth', 'Wrapped Ether']
  } },
  celo: { name: 'Celo', rpc: 'https://celo-rpc.publicnode.com', native: ['c:celo', 'CELO', 'Celo'], tokens: {
    '0xceba9300f2b948710d2653dd7b07f33a8b32118c': ['USDC', 6, 'usd-coin', 'USD Coin'],
    '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': ['USDT', 6, 'tether', 'Tether'],
    '0x765de816845861e75a25fca122bb6898b8b1282a': ['USDm', 18, 'celo-dollar', 'Mento Dollar (cUSD)'],
    '0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73': ['EURm', 18, 'celo-euro', 'Mento Euro (cEUR)']
  } }
};
const SPAM = { vol: 250000, cap: 10e6, val: 1 };
const TRON_NET = { name: 'TRON', native: ['c:tron', 'TRX', 'TRON'], natDec: 6, tokens: null };
// raw integer string + decimals -> number (BigInt, so 18-decimal amounts don't lose the whole part)
function units(raw, dec) {
  let n; try { n = BigInt(raw); } catch (e) { return 0; }
  if (n <= 0n) return 0;
  const d = 10n ** BigInt(dec || 0);
  return Number(n / d) + Number(n % d) / Number(d);
}
// Ethplorer getAddressInfo -> {b, t, q, hid}. Listed tokens -> "c:<CoinGecko id>" (priced like any coin); other tokens
// that pass the spam filter -> "e:<contract>" with Ethplorer's own price in q (the page has no other price for them).
function parseEthplorer(j) {
  if (!j || !j.ETH || j.error) throw new Error((j && j.error && j.error.message) || 'no answer');
  const b = { 'c:ethereum': units(j.ETH.rawBalance || '0', 18) || +j.ETH.balance || 0 }, t = {}, q = {};
  let hid = 0;
  (j.tokens || []).forEach((x) => {
    const i = x.tokenInfo || {}, a = String(i.address || '').toLowerCase(), dec = +i.decimals || 0;
    const n = units(x.rawBalance != null ? x.rawBalance : String(x.balance || 0), dec);
    if (!n) return;
    const known = TOKENS[a];
    if (known) { const k = 'c:' + known[2]; b[k] = (b[k] || 0) + n; t[k] = [known[0], known[3]]; return; }
    const p = i.price || {};
    if (p.rate > 0 && (p.volume24h || 0) >= SPAM.vol && (p.marketCapUsd || 0) >= SPAM.cap && n * p.rate >= SPAM.val && /^0x[0-9a-f]{40}$/.test(a)) {
      const k = 'e:' + a, sym = String(i.symbol || '').replace(/[^\w.$-]/g, '').slice(0, 12) || 'TOKEN';
      b[k] = n; t[k] = [sym, String(i.name || sym).replace(/[<>]/g, '').slice(0, 60)];
      q[k] = { p: +p.rate, c: 'USD', ch: isFinite(p.diff) ? +p.diff : null, n: t[k][1] };
    } else hid++;
  });
  return { b, t, q, hid };
}
// ETH + listed tokens from a publicnode RPC batch: [{id 0: eth_getBalance}, {id n: balanceOf(token n-1)}]
function rpcBatch(addr, list) {
  const pad = addr.toLowerCase().slice(2).padStart(64, '0');
  return [{ jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [addr, 'latest'] }]
    .concat(list.map((a, n) => ({ jsonrpc: '2.0', id: n + 1, method: 'eth_call', params: [{ to: a, data: '0x70a08231' + pad }, 'latest'] })));
}
// The holdings line of a coin uses one name on every network: USDC.e / USDbC / DAI.e / USDT0 -> USDC / USDC / DAI / USDT
function plainSym(sym) { return sym === 'USDbC' ? 'USDC' : sym.replace(/\.e$/, ''); }
// net: undefined = Ethereum (TOKENS), else a NETS key
function parseEthRpc(j, list, net) {
  if (!Array.isArray(j)) throw new Error('no balance');
  const N = net ? (typeof net === 'object' ? net : NETS[net]) : null, tokens = N ? N.tokens : TOKENS, nat = N ? N.native : ['c:ethereum', 'ETH', 'Ethereum'];
  const by = {}; j.forEach((x) => { by[x.id] = x; });
  if (!by[0] || !by[0].result) throw new Error('no balance');
  const b = {}, t = {}, eth = units(by[0].result, (N && N.natDec) || 18);
  if (eth) { b[nat[0]] = eth; t[nat[0]] = [nat[1], nat[2]]; }
  list.forEach((a, n) => {
    const r = by[n + 1], tk = tokens[a];
    if (!r || !r.result || r.result === '0x' || !tk) return;
    const q = units(r.result, tk[1]);
    if (q) { const k = 'c:' + tk[2]; b[k] = (b[k] || 0) + q; t[k] = t[k] || (k === nat[0] ? [nat[1], nat[2]] : [plainSym(tk[0]), tk[3]]); }
  });
  if (!net && !b['c:ethereum']) b['c:ethereum'] = 0;
  return { b, t, hid: 0 };
}
async function ethMain(addr) {
  try {
    const r = parseEthplorer(await getJSON('https://api.ethplorer.io/getAddressInfo/' + addr + '?apiKey=freekey'));
    return { b: r.b, t: r.t, q: r.q, hid: r.hid, src: 'ethplorer' };
  } catch (e) {
    // Fallback: ETH + the popular tokens straight from the chain (one batch call)
    const list = Object.keys(TOKENS);
    return Object.assign({ src: 'rpc' }, parseEthRpc(await getJSON('https://ethereum-rpc.publicnode.com', { body: JSON.stringify(rpcBatch(addr, list)) }), list));
  }
}
async function ethNet(addr, net) {
  const list = Object.keys(NETS[net].tokens);
  return parseEthRpc(await getJSON(NETS[net].rpc, { body: JSON.stringify(rpcBatch(addr, list)) }), list, net);
}
// One address, every EVM network in NETS (+ Ethereum). b = everything added up (what the holdings use); n = per network, for the wallet card;
// nerr = networks that could not be read this time (the rest still count).
async function ethWallet(addr) {
  const nets = ['eth'].concat(Object.keys(NETS));
  const rs = await Promise.allSettled([ethMain(addr)].concat(Object.keys(NETS).map((k) => ethNet(addr, k))));
  if (rs.every((r) => r.status === 'rejected')) throw rs[0].reason;
  const out = { b: {}, t: {}, q: {}, n: {}, nerr: [], hid: 0, src: '' };
  rs.forEach((r, i) => {
    const net = nets[i];
    if (r.status === 'rejected') { out.nerr.push(net); return; }
    const v = r.value;
    out.n[net] = v.b;
    Object.keys(v.b).forEach((k) => { out.b[k] = (out.b[k] || 0) + v.b[k]; });
    Object.assign(out.q, v.q || {});
    Object.keys(v.t || {}).forEach((k) => { if (!out.t[k]) out.t[k] = v.t[k]; });
    if (net === 'eth') { out.hid = v.hid || 0; out.src = v.src; }
  });
  if (out.b['c:ethereum'] == null) out.b['c:ethereum'] = 0;
  return out;
}

/* ---------- Solana tokens ----------
   Every SPL token account (Token + Token-2022 programs) is read with getTokenAccountsByOwner. Popular mints (list below,
   symbol + decimals checked against Jupiter 2026-11-23) count as "c:<CoinGecko id>". Any other mint is looked up on
   Jupiter's token API (symbol, price, liquidity) and counts as "e:<mint>" only when it has >= $100k of liquidity, a >= $10M
   market cap and >= $25k of trading in 24 h, and the holding is worth >= $1. Jupiter's own "verified" tag is not enough
   (it was on a fake "NVIDIA" token with a $57k market cap). Wallets get airdropped lots of junk. */
const SPL = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': ['USDC', 6, 'usd-coin', 'USD Coin'],
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': ['USDT', 6, 'tether', 'Tether'],
  'Dn4noZ5jgGfkntzcQSUZ8czkreiZ1ForXYoV2H8Dm7S1': ['USDT', 6, 'tether', 'Tether (Wormhole)'],
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': ['PYUSD', 6, 'paypal-usd', 'PayPal USD'],
  'So11111111111111111111111111111111111111112': ['SOL', 9, 'solana', 'Solana'],
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': ['JUP', 6, 'jupiter-exchange-solana', 'Jupiter'],
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': ['BONK', 5, 'bonk', 'Bonk'],
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': ['WIF', 6, 'dogwifcoin', 'dogwifhat'],
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL': ['JTO', 9, 'jito-governance-token', 'Jito'],
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': ['PYTH', 6, 'pyth-network', 'Pyth Network'],
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': ['RAY', 6, 'raydium', 'Raydium'],
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': ['ORCA', 6, 'orca', 'Orca'],
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': ['JitoSOL', 9, 'jito-staked-sol', 'Jito Staked SOL'],
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': ['mSOL', 9, 'msol', 'Marinade Staked SOL'],
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': ['bSOL', 9, 'blazestake-staked-sol', 'BlazeStake Staked SOL'],
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v': ['JupSOL', 9, 'jupiter-staked-sol', 'Jupiter Staked SOL'],
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': ['JLP', 6, 'jupiter-perpetuals-liquidity-provider-token', 'Jupiter Perps LP'],
  '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ': ['W', 6, 'wormhole', 'Wormhole'],
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': ['RENDER', 8, 'render-token', 'Render'],
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr': ['POPCAT', 9, 'popcat', 'Popcat'],
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': ['TRUMP', 6, 'official-trump', 'Official Trump'],
  '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv': ['PENGU', 6, 'pudgy-penguins', 'Pudgy Penguins'],
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij': ['cbBTC', 8, 'coinbase-wrapped-btc', 'Coinbase Wrapped BTC'],
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': ['ETH', 8, 'ethereum-wormhole', 'Ether (Wormhole)'],
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump': ['FARTCOIN', 6, 'fartcoin', 'Fartcoin'],
  'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux': ['HNT', 8, 'helium', 'Helium'],
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': ['MEW', 5, 'cat-in-a-dogs-world', 'cat in a dogs world'],
  'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7': ['DRIFT', 6, 'drift-protocol', 'Drift'],
  'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS': ['KMNO', 6, 'kamino', 'Kamino'],
  'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs': ['GRASS', 9, 'grass', 'Grass']
};
const SOL_SPAM = { liq: 100000, cap: 10e6, vol: 25000, val: 1 }, SOL_LOOKUP = 300;
const SOL_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const SOL_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// token accounts (jsonParsed, any number of answers) -> {mint: amount}
function solTally(lists) {
  const m = {};
  lists.forEach((j) => ((j && j.result && j.result.value) || []).forEach((x) => {
    const i = x && x.account && x.account.data && x.account.data.parsed && x.account.data.parsed.info;
    if (!i || !B58.test(i.mint || '') || !i.tokenAmount) return;
    const n = units(i.tokenAmount.amount || '0', +i.tokenAmount.decimals || 0);
    if (n > 0) m[i.mint] = (m[i.mint] || 0) + n;
  }));
  return m;
}
// lamports + {mint: amount} + Jupiter token records -> {b, t, q, hid, more}; more = mints not looked up (over the cap)
function parseSol(lamports, tally, jup) {
  const b = { 'c:solana': (+lamports || 0) / 1e9 }, t = {}, q = {}, info = {};
  (jup || []).forEach((x) => { if (x && x.id) info[x.id] = x; });
  let hid = 0, more = 0, asked = 0;
  Object.keys(tally).forEach((mint) => {
    const n = tally[mint], k0 = SPL[mint];
    if (k0) { const k = 'c:' + k0[2]; b[k] = (b[k] || 0) + n; if (k !== 'c:solana') t[k] = [k0[0], k0[3]]; return; }
    const x = info[mint];
    if (!x) { if (asked++ >= SOL_LOOKUP) more++; else hid++; return; }
    const p = +x.usdPrice || 0;
    const d = x.stats24h || {}, vol = (+d.buyVolume || 0) + (+d.sellVolume || 0);
    if (p > 0 && (+x.liquidity || 0) >= SOL_SPAM.liq && (+x.mcap || 0) >= SOL_SPAM.cap && vol >= SOL_SPAM.vol && n * p >= SOL_SPAM.val) {
      const k = 'e:' + mint, sym = String(x.symbol || '').replace(/[^\w.$-]/g, '').slice(0, 12) || 'TOKEN';
      b[k] = n; t[k] = [sym, String(x.name || sym).replace(/[<>]/g, '').slice(0, 60)];
      const ch = d.priceChange;
      q[k] = { p, c: 'USD', ch: isFinite(ch) && ch !== null ? +ch : null, n: t[k][1] };
    } else hid++;
  });
  return { b, t, q, hid: hid + more, more };
}
async function solRpc(body) {
  let err;
  for (const u of SOL_RPCS) { try { const j = await getJSON(u, { body: JSON.stringify(body), ms: 9000 }); if (j && j.result) return j; err = new Error((j && j.error && j.error.message) || 'no answer'); } catch (e) { err = e; } }
  throw err;
}
async function solWallet(addr) {
  const [bal, ...tok] = await Promise.allSettled([solRpc({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] })]
    .concat(SOL_PROGRAMS.map((p) => solRpc({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [addr, { programId: p }, { encoding: 'jsonParsed' }] }))));
  if (bal.status === 'rejected') throw bal.reason;
  const tally = solTally(tok.filter((r) => r.status === 'fulfilled').map((r) => r.value));
  const unknown = Object.keys(tally).filter((m) => !SPL[m]).slice(0, SOL_LOOKUP), jup = [];
  const parts = []; for (let i = 0; i < unknown.length; i += 100) parts.push(unknown.slice(i, i + 100));
  const rs = await Promise.allSettled(parts.map((p) => getJSON('https://lite-api.jup.ag/tokens/v2/search?query=' + p.join(','), { ms: 8000 })));
  rs.forEach((r) => { if (r.status === 'fulfilled' && Array.isArray(r.value)) jup.push(...r.value); });
  const out = parseSol(bal.value.result.value, tally, jup);
  if (tok.some((r) => r.status === 'rejected')) out.terr = 1;
  if (parts.length && rs.every((r) => r.status === 'rejected')) out.terr = 1;
  delete out.more;
  return out;
}

/* ---------- TRON ----------
   TRX (incl. staked / delegated / unstaking TRX) and TRC-20 tokens from TronGrid's account endpoint. Only the listed
   tokens count (symbol + decimals read from the chain 2026-11-23); TRON wallets get a lot of spam tokens. Backup:
   publicnode's TRON JSON-RPC (TRX on hand + listed tokens, no staked TRX). */
const TRC20 = {
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': ['USDT', 6, 'tether', 'Tether'],
  'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8': ['USDC', 6, 'usd-coin', 'USD Coin'],
  'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn': ['USDD', 18, 'usdd', 'USDD'],
  'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4': ['TUSD', 18, 'true-usd', 'TrueUSD'],
  'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR': ['WTRX', 6, 'tron', 'Wrapped TRX'],
  'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9': ['BTC', 8, 'bitcoin', 'Bitcoin (TRON)'],
  'THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF': ['ETH', 18, 'ethereum', 'Ethereum (TRON)'],
  'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4': ['BTT', 18, 'bittorrent', 'BitTorrent'],
  'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7': ['WIN', 6, 'wink', 'WINkLink'],
  'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9': ['JST', 18, 'just', 'JUST'],
  'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S': ['SUN', 18, 'sun-token', 'Sun'],
  'TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq': ['NFT', 6, 'apenft', 'APENFT'],
  'TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5': ['sTRX', 18, 'staked-trx', 'Staked TRX']
};
const B58A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// TRON base58 address -> 0x + 20-byte hex (the EVM-style form TRON's JSON-RPC takes); null if the checksum is wrong
function tronHex(a) {
  let n = 0n;
  for (const c of String(a)) { const i = B58A.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const h = n.toString(16).padStart(50, '0');
  if (h.length !== 50 || h.slice(0, 2) !== '41') return null;
  const sum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(Buffer.from(h.slice(0, 42), 'hex')).digest()).digest('hex').slice(0, 8);
  return sum === h.slice(42) ? '0x' + h.slice(2, 42) : null;
}
function parseTrongrid(j) {
  if (!j || !Array.isArray(j.data)) throw new Error((j && j.Error) || 'no answer');
  const a = j.data[0];
  if (!a) return { b: { 'c:tron': 0 }, t: {}, hid: 0 };
  let sun = +a.balance || 0;
  (a.frozenV2 || []).forEach((f) => { sun += +f.amount || 0; });
  (a.unfrozenV2 || []).forEach((f) => { sun += +f.unfreeze_amount || 0; });
  const r = a.account_resource || {};
  sun += (+a.delegated_frozenV2_balance_for_bandwidth || 0) + (+r.delegated_frozenV2_balance_for_energy || 0);
  const b = { 'c:tron': sun / 1e6 }, t = {};
  let hid = 0;
  (a.trc20 || []).forEach((o) => Object.keys(o || {}).forEach((c) => {
    const tk = TRC20[c];
    if (!tk) { if (String(o[c]) !== '0') hid++; return; }
    const n = units(String(o[c]), tk[1]);
    if (n) { const k = 'c:' + tk[2]; b[k] = (b[k] || 0) + n; if (k !== 'c:tron') t[k] = [tk[0], tk[3]]; }
  }));
  return { b, t, hid };
}
async function trxWallet(addr) {
  try { return parseTrongrid(await getJSON('https://api.trongrid.io/v1/accounts/' + addr)); } catch (e) {
    const hex = tronHex(addr); if (!hex) throw new Error('That does not look like a TRON address.');
    const list = Object.keys(TRC20), hl = list.map(tronHex);
    if (!TRON_NET.tokens) { TRON_NET.tokens = {}; list.forEach((a, i) => { TRON_NET.tokens[hl[i]] = TRC20[a]; }); }
    const r = parseEthRpc(await getJSON('https://tron-rpc.publicnode.com/jsonrpc', { body: JSON.stringify(rpcBatch(hex, hl)) }), hl, TRON_NET);
    return Object.assign(r, { src: 'rpc' });
  }
}

/* ---------- Hive Engine (tokens on Hive: LEO, BEE, SPS, STEM ...) ----------
   Balance + staked + unstaking + delegated out. SWAP.* tokens are 1:1 with their coin. Others are priced in HIVE from the
   Hive Engine market (last trade) and count only when someone is bidding for them and the holding is worth >= $0.50. */
const HE_RPCS = ['https://api.hive-engine.com/rpc/contracts', 'https://engine.rishipanthee.com/contracts', 'https://herpc.dtools.dev/contracts'];
const HE_SWAP = { 'SWAP.HIVE': 'c:hive', 'SWAP.HBD': 'c:hive_dollar', 'SWAP.BTC': 'c:bitcoin', 'SWAP.ETH': 'c:ethereum', 'SWAP.LTC': 'c:litecoin', 'SWAP.DOGE': 'c:dogecoin', 'SWAP.USDT': 'c:tether', 'SWAP.BNB': 'c:binancecoin', 'SWAP.MATIC': 'c:polygon-ecosystem-token' };
const HE_MIN = 0.5;
function heQty(x) { return ['balance', 'stake', 'pendingUnstake', 'delegationsOut', 'pendingUndelegations'].reduce((s, f) => s + (parseFloat(x[f]) || 0), 0); }
function parseHiveEngine(bals, metrics, hiveUsd) {
  const b = {}, t = {}, q = {}, mk = {};
  (metrics || []).forEach((m) => { if (m && m.symbol) mk[m.symbol] = m; });
  let hid = 0;
  (bals || []).forEach((x) => {
    const sym = String(x && x.symbol || ''), n = heQty(x || {});
    if (!(n > 0) || !/^[A-Z0-9.]{1,12}$/.test(sym)) return;
    if (HE_SWAP[sym]) { const k = HE_SWAP[sym]; b[k] = (b[k] || 0) + n; if (!/^c:hive/.test(k)) t[k] = [sym.slice(5), sym + ' (Hive Engine)']; return; }
    const m = mk[sym], last = m ? parseFloat(m.lastPrice) || 0 : 0, bid = m ? parseFloat(m.highestBid) || 0 : 0;
    const p = last * (hiveUsd || 0);
    if (!(bid > 0) || !(p > 0) || n * p < HE_MIN) { hid++; return; }
    const k = 'e:he:' + sym;
    b[k] = n; t[k] = [sym, sym + ' (Hive Engine)'];
    q[k] = { p, c: 'USD', ch: m.priceChangePercent != null && isFinite(parseFloat(m.priceChangePercent)) ? parseFloat(m.priceChangePercent) : null, n: t[k][1] };
  });
  return { b, t, q, hid };
}
async function heFind(contract, table, query) {
  let err;
  for (const u of HE_RPCS) {
    try { const j = await getJSON(u, { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'find', params: { contract, table, query, limit: 1000 } }), ms: 7000 }); if (j && Array.isArray(j.result)) return j.result; err = new Error('no answer'); } catch (e) { err = e; }
  }
  throw err;
}
async function heWallet(account) {
  const bals = await heFind('tokens', 'balances', { account });
  const syms = bals.filter((x) => heQty(x) > 0 && !HE_SWAP[x.symbol]).map((x) => x.symbol);
  const [metrics, hq] = await Promise.all([syms.length ? heFind('market', 'metrics', { symbol: { $in: syms } }) : [], quotes([], ['hive'])]);
  return parseHiveEngine(bals, metrics, hq.q['c:hive'] && hq.q['c:hive'].p);
}

/* ---------- Litecoin, Dogecoin, Cardano ---------- */
// DOGE: BitPay's Bitcore API, then BlockCypher, then Dogechain (all keyless, each with its own rate limit)
async function dogeWallet(addr) {
  const tries = [
    async () => { const j = await getJSON('https://api.bitcore.io/api/DOGE/mainnet/address/' + addr + '/balance'); if (j.balance == null) throw new Error('no balance'); return (+j.balance || 0) / 1e8; },
    async () => { const j = await getJSON('https://api.blockcypher.com/v1/doge/main/addrs/' + addr + '/balance'); if (j.final_balance == null) throw new Error('no balance'); return (+j.final_balance || 0) / 1e8; },
    async () => { const j = await getJSON('https://dogechain.info/api/v1/address/balance/' + addr); if (!j.success) throw new Error('no balance'); return +j.balance || 0; }
  ];
  let err;
  for (const f of tries) { try { return { 'c:dogecoin': await f() }; } catch (e) { err = e; } }
  throw err;
}
// A Cardano wallet spreads its coins over many addresses that share one stake key: read the whole stake account
// (coins + unclaimed staking rewards + native tokens) when there is one.
async function adaWallet(addr) {
  const K = 'https://api.koios.rest/api/v1/';
  let stake = /^stake1/.test(addr) ? addr : null, bal = 0, assets = null;
  if (!stake) {
    const a = (await getJSON(K + 'address_info', { body: JSON.stringify({ _addresses: [addr] }) }))[0];
    if (!a) return { b: { 'c:cardano': 0 }, t: {}, q: {}, hid: 0 };
    stake = a.stake_address; bal = (+a.balance || 0) / 1e6;
  }
  const [info, toks] = await Promise.allSettled([
    stake ? getJSON(K + 'account_info', { body: JSON.stringify({ _stake_addresses: [stake] }) }) : Promise.resolve(null),
    stake ? getJSON(K + 'account_assets', { body: JSON.stringify({ _stake_addresses: [stake] }), ms: 9000 }) : getJSON(K + 'address_assets', { body: JSON.stringify({ _addresses: [addr] }), ms: 9000 })
  ]);
  const s = info.status === 'fulfilled' && info.value && info.value[0];
  if (s) bal = (+s.total_balance || 0) / 1e6; else if (info.status === 'rejected' && stake && !bal) throw info.reason;
  if (toks.status === 'fulfilled' && Array.isArray(toks.value)) assets = toks.value;
  const out = await gtTokens('cardano', adaTokenList(assets || []), { 'c:cardano': bal });
  if (!assets) out.terr = 1;
  return out;
}
/* Cardano native tokens -> [{id (policy + name hex), qty, sym, name}]. NFTs (one of a kind, no decimals) are skipped:
   a wallet can hold hundreds and they have no market price. */
function hexText(h) {
  if (!/^([0-9a-f]{2})*$/i.test(h || '')) return '';
  const s = Buffer.from(h, 'hex').toString('utf8');
  return /^[\x20-\x7e]{1,32}$/.test(s) ? s : '';
}
function adaTokenList(assets) {
  const m = {};
  (assets || []).forEach((x) => {
    const pol = String(x && x.policy_id || '').toLowerCase(), nm = String(x.asset_name || '').toLowerCase(), dec = +x.decimals || 0;
    if (!/^[0-9a-f]{56}$/.test(pol) || !/^[0-9a-f]{0,64}$/.test(nm)) return;
    let raw; try { raw = BigInt(x.quantity || '0'); } catch (e) { return; }
    if (raw <= 0n || (dec === 0 && raw === 1n)) return;
    const id = pol + nm, txt = hexText(nm) || nm.slice(0, 8) || 'TOKEN';
    if (m[id]) m[id].qty += units(String(raw), dec); else m[id] = { id, qty: units(String(raw), dec), sym: txt.replace(/[^\w.$-]/g, '').slice(0, 12) || 'TOKEN', name: txt.replace(/[<>]/g, '').slice(0, 60) };
  });
  return Object.values(m);
}
// Cardano tokens with a CoinGecko id (price history for charts): policy id + asset name hex -> [symbol, CoinGecko id, name]
const ADA_MAP = { '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b': ['SNEK', 'snek', 'Snek'], '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e': ['MIN', 'minswap', 'Minswap'] };
/* XRP Ledger tokens: trust lines with a positive balance (a negative one means this account issued it). */
const XRPL_MAP = { 'RLUSD.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De': ['RLUSD', 'ripple-usd', 'Ripple USD'], 'SOLO.rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz': ['SOLO', 'solo-coin', 'Sologenic'], 'CSC.rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr': ['CSC', 'casinocoin', 'CasinoCoin'] };
function xrplCur(c) { c = String(c || ''); if (/^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(c)) return c; if (/^[0-9A-F]{40}$/i.test(c)) return hexText(c.replace(/(00)+$/i, '')) || c.slice(0, 8); return ''; }
function xrplTokenList(lines) {
  const m = {};
  (lines || []).forEach((l) => {
    const n = parseFloat(l && l.balance), cur = String(l && l.currency || ''), iss = String(l && l.account || '');
    if (!(n > 0) || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(iss) || !(/^[A-Za-z0-9]{3}$/.test(cur) || /^[0-9A-F]{40}$/i.test(cur))) return;
    const id = (cur.length === 40 ? cur.toUpperCase() : cur) + '.' + iss, txt = xrplCur(cur) || 'TOKEN';
    if (m[id]) m[id].qty += n; else m[id] = { id, qty: n, sym: txt.replace(/[^\w.$-]/g, '').slice(0, 12) || 'TOKEN', name: txt.replace(/[<>]/g, '').slice(0, 40) + ' (' + iss.slice(0, 6) + '…)' };
  });
  return Object.values(m);
}
/* Prices for Cardano / XRPL tokens from GeckoTerminal (CoinGecko's free on-chain price API: 30 tokens a call).
   A token counts only when its pools hold >= $25k, it traded >= $100 in 24 h and the holding is worth >= $1. */
const GT_SPAM = { res: 25000, vol: 100, val: 1 }, GT_MAX = 90;
function parseGt(net, list, attrs, b) {
  const t = {}, q = {}, a = attrs || {}, pr = a.token_prices || {}, rs = a.total_reserve_in_usd || {}, vo = a.h24_volume_usd || {}, chg = a.h24_price_change_percentage || {};
  const find = (o, id) => o[id] != null ? o[id] : o[id.toLowerCase()];
  let hid = 0;
  list.forEach((x, i) => {
    const known = net === 'xrpl' ? XRPL_MAP[xrplCur(x.id.split('.')[0]) + '.' + x.id.split('.')[1]] : ADA_MAP[x.id];
    const p = parseFloat(find(pr, x.id)) || 0;
    if (known) { const k = 'c:' + known[1]; b[k] = (b[k] || 0) + x.qty; t[k] = [known[0], known[2]]; return; }
    if (i >= GT_MAX || !(p > 0) || (parseFloat(find(rs, x.id)) || 0) < GT_SPAM.res || (parseFloat(find(vo, x.id)) || 0) < GT_SPAM.vol || x.qty * p < GT_SPAM.val) { hid++; return; }
    const k = 'e:' + (net === 'xrpl' ? 'xrp:' : 'ada:') + x.id;
    b[k] = (b[k] || 0) + x.qty; t[k] = [x.sym, x.name];
    const c = parseFloat(find(chg, x.id));
    q[k] = { p, c: 'USD', ch: isFinite(c) ? c : null, n: x.name };
  });
  return { b, t, q, hid };
}
async function gtTokens(net, list, b) {
  const look = list.slice(0, GT_MAX), parts = [], attrs = { token_prices: {}, total_reserve_in_usd: {}, h24_volume_usd: {}, h24_price_change_percentage: {} };
  for (let i = 0; i < look.length; i += 30) parts.push(look.slice(i, i + 30));
  const rs = await Promise.allSettled(parts.map((p) => getJSON('https://api.geckoterminal.com/api/v2/simple/networks/' + net + '/token_price/' + p.map((x) => x.id).join(',') + '?include_24hr_vol=true&include_total_reserve_in_usd=true&include_24hr_price_change=true', { ms: 8000 })));
  rs.forEach((r) => { const a = r.status === 'fulfilled' && r.value && r.value.data && r.value.data.attributes; if (a) Object.keys(attrs).forEach((f) => Object.assign(attrs[f], a[f] || {})); });
  const out = parseGt(net, list, attrs, b);
  if (parts.length && rs.every((r) => r.status === 'rejected')) out.terr = 1;
  return out;
}
async function xrpWallet(addr) {
  const X = 'https://xrplcluster.com';
  const [ai, al] = await Promise.allSettled([
    getJSON(X, { body: JSON.stringify({ method: 'account_info', params: [{ account: addr, ledger_index: 'validated' }] }) }),
    getJSON(X, { body: JSON.stringify({ method: 'account_lines', params: [{ account: addr, ledger_index: 'validated', limit: 400 }] }) })
  ]);
  if (ai.status === 'rejected') throw ai.reason;
  const b = walletParse('xrp', ai.value);
  const lines = al.status === 'fulfilled' && al.value.result && al.value.result.lines;
  const out = await gtTokens('xrpl', xrplTokenList(lines || []), b);
  if (al.status === 'rejected' || (!lines && !(al.value.result && al.value.result.error === 'actNotFound'))) out.terr = 1;
  return out;
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
  else if (chain === 'eth') { const r = Object.assign({ chain }, await ethWallet(addr)); cacheSet([[ck, r]], TTL.w); return r; }
  else if (chain === 'xrp' || chain === 'ada') { const r = Object.assign({ chain }, await (chain === 'xrp' ? xrpWallet(addr) : adaWallet(addr))); cacheSet([[ck, r]], TTL.w); return r; }
  else if (chain === 'sol' || chain === 'trx') { const r = Object.assign({ chain }, await (chain === 'sol' ? solWallet(addr) : trxWallet(addr))); cacheSet([[ck, r]], TTL.w); return r; }
  else if (chain === 'ltc') b = walletParse('btc', await getJSON('https://litecoinspace.org/api/address/' + addr), null, 'c:litecoin');
  else if (chain === 'doge') b = await dogeWallet(addr);
  else if (chain === 'hive') {
    const [a, g, he] = await Promise.all([
      getJSON('https://api.hive.blog', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_accounts', params: [[addr]] }) }),
      getJSON('https://api.hive.blog', { body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'condenser_api.get_dynamic_global_properties', params: [] }) }),
      heWallet(addr).catch(() => null)
    ]);
    b = walletParse(chain, a, g.result);
    // Hive Engine tokens ride along; if Hive Engine is down the HIVE / HBD balance still counts
    const r = { chain, b, t: {}, q: {}, hid: 0 };
    if (he) { Object.keys(he.b).forEach((k) => { b[k] = (b[k] || 0) + he.b[k]; }); r.t = he.t; r.q = he.q; r.hid = he.hid; } else r.terr = 1;
    cacheSet([[ck, r]], TTL.w); return r;
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
      const m = String(q.w).match(/^(btc|eth|hive|xrp|sol|trx|ltc|doge|ada):(.{3,130})$/);
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
module.exports._t = { ySym, cgId, parseYahooQuote, parseYahooHist, walletParse, parseEthplorer, parseEthRpc, plainSym, units, solTally, parseSol, SPL, parseTrongrid, tronHex, TRC20, parseHiveEngine, heQty, adaTokenList, xrplTokenList, xrplCur, parseGt, hexText, TOKENS, NETS, ethWallet };

if (require.main === module) {
  // node mes.fm/api/invest.js  -> quick live check of every source
  const run = (query) => new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.c = c; return this; }, send(b) { resolve([this.c, b.slice(0, 260)]); } };
    module.exports({ query, headers: {} }, res);
  });
  (async () => {
    for (const qy of [{ y: 'AAPL,SHOP.TO,VOD.L', c: 'bitcoin,hive' }, { h: 's:AAPL' }, { h: 'c:hive', s: 'HIVE' }, { search: 'tesla' },
      { w: 'btc:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }, { w: 'eth:0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe' }, { w: 'eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }, { w: 'hive:mes' },
      { w: 'xrp:rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh' }, { w: 'sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }]) {
      console.log(JSON.stringify(qy), ...(await run(qy)));
    }
  })();
}
