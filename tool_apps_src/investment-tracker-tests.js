/* node tool_apps_src/investment-tracker-tests.js -- maths of mes.fm/investment-tracker (MESInv) and the prices API helpers. */
"use strict";
const I = require("./investment-tracker/lib.js");
const A = require("../mes.fm/api/invest.js");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL " + m); } }
function near(a, b, m, e) { ok(Math.abs(a - b) <= (e || 1e-6), m + " (" + a + " vs " + b + ")"); }

/* numbers + dates */
near(I.num("1,234.50"), 1234.5, "num en"); near(I.num("1.234,50"), 1234.5, "num eu"); near(I.num("12,5"), 12.5, "num comma");
near(I.num("$1 200"), 1200, "num space"); near(I.num("(12)"), -12, "num paren"); near(I.num("0,123"), 0.123, "num 0,123"); near(I.num("1,234,567"), 1234567, "num millions");
ok(isNaN(I.num("abc")), "num nan");
ok(I.date("2026-1-5") === "2026-01-05", "date iso"); ok(I.date("25/12/2025") === "2025-12-25", "date dmy"); ok(I.date("2025-03-04T10:00:00Z") === "2025-03-04", "date ts");
near(I.conv(100, "USD", "CAD", { USD: 1, CAD: 1.4 }), 140, "conv"); near(I.conv(140, "CAD", "USD", { USD: 1, CAD: 1.4 }), 100, "conv back");

/* average cost */
const cur = () => "USD";
let r = I.positions([
	{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 10, p: 10, fee: 0 },
	{ id: 2, d: "2025-02-01", t: "buy", a: "s:X", q: 10, p: 20, fee: 0 },
	{ id: 3, d: "2025-03-01", t: "sell", a: "s:X", q: 5, p: 30, fee: 0 }
], { method: "avg", base: "USD", cur });
let p = r.pos["s:X"];
near(p.q, 15, "avg qty"); near(p.cost, 225, "avg cost left"); near(p.real[0].gain, 75, "avg gain 5*(30-15)");
/* FIFO */
r = I.positions([
	{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 10, p: 10, fee: 0 },
	{ id: 2, d: "2025-02-01", t: "buy", a: "s:X", q: 10, p: 20, fee: 0 },
	{ id: 3, d: "2025-03-01", t: "sell", a: "s:X", q: 15, p: 30, fee: 0 }
], { method: "fifo", base: "USD", cur });
p = r.pos["s:X"]; near(p.q, 5, "fifo qty"); near(p.cost, 100, "fifo cost left"); near(p.real[0].gain, 450 - 200, "fifo gain");
/* fees: buy fee in cost, sell fee off proceeds */
r = I.positions([{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 10, p: 10, fee: 5 }, { id: 2, d: "2025-01-02", t: "sell", a: "s:X", q: 10, p: 11, fee: 5 }], { base: "USD", cur });
p = r.pos["s:X"]; near(p.real[0].gain, 105 - 105, "fees both ways"); near(p.q, 0, "sold out"); near(p.cost, 0, "cost zero when sold out");
/* split */
r = I.positions([{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 10, p: 100, fee: 0 }, { id: 2, d: "2025-06-01", t: "split", a: "s:X", q: 4 }, { id: 3, d: "2025-07-01", t: "sell", a: "s:X", q: 20, p: 30, fee: 0 }], { base: "USD", cur, method: "fifo" });
p = r.pos["s:X"]; near(p.q, 20, "split qty"); near(p.cost, 500, "split cost unchanged then half sold"); near(p.real[0].gain, 600 - 500, "split gain");
/* oversell warns and clamps */
r = I.positions([{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 1, p: 10 }, { id: 9, d: "2025-01-02", t: "sell", a: "s:X", q: 3, p: 10 }], { base: "USD", cur });
ok(r.warn.length === 1 && r.warn[0].id === 9, "oversell warning"); near(r.pos["s:X"].q, 0, "oversell clamps");
/* base currency with trade fx */
r = I.positions([{ id: 1, d: "2025-01-01", t: "buy", a: "s:X", q: 10, p: 10, fx: 1.3 }, { id: 2, d: "2025-02-01", t: "sell", a: "s:X", q: 10, p: 12, fx: 1.4 }], { base: "CAD", cur: () => "USD", fx: { USD: 1, CAD: 1.35 } });
near(r.pos["s:X"].real[0].gainB, 120 * 1.4 - 100 * 1.3, "gain in CAD with fx"); near(r.pos["s:X"].real[0].gain, 20, "gain in USD");
/* transfer out keeps no gain; dividend counted */
r = I.positions([{ id: 1, d: "2025-01-01", t: "buy", a: "c:b", q: 2, p: 100 }, { id: 2, d: "2025-02-01", t: "out", a: "c:b", q: 1 }, { id: 3, d: "2025-03-01", t: "div", a: "c:b", p: 7 }], { base: "USD", cur });
near(r.pos["c:b"].q, 1, "out qty"); ok(r.pos["c:b"].real.length === 0, "out no gain"); near(r.pos["c:b"].inc, 7, "dividend");

/* holdings */
const st = I.clean(I.example("USD"));
const prices = { fx: { USD: 1, CAD: 1.4 }, q: { "s:AAPL": { p: 200, c: "USD", ch: 1 }, "s:VOO": { p: 500, c: "USD", ch: -1 }, "c:bitcoin": { p: 60000, c: "USD", ch: 2 }, "c:hive": { p: 0.25, c: "USD" } } };
let h = I.holdings(st, prices, { "c:bitcoin": 0.5 });
const btc = h.rows.find((x) => x.k === "c:bitcoin");
near(btc.q, 0.6, "wallet added to qty"); near(btc.value, 36000, "btc value");
near(h.T.value, 15 * 200 + 15 * 500 + 36000 + 5000 * 0.25, "total value");
ok(Math.abs(h.rows.reduce((s, x) => s + x.w, 0) - 1) < 1e-9, "weights sum to 1");
st.base = "CAD"; h = I.holdings(st, prices); near(h.rows.find((x) => x.k === "s:AAPL").value, 3000 * 1.4, "value in CAD");
const by = I.realizedByYear(h.pos); ok(by.length === 2, "realized years " + by.length);
const al = I.allocation(h.rows, st, "kind"); ok(al.length === 2 && al[0].label, "allocation by kind");

/* timeline */
const s2 = I.blank("USD"); s2.assets["s:X"] = { k: "s:X", kind: "s", sym: "X", cur: "USD" };
s2.tx = [{ id: 1, d: "2025-01-02", t: "buy", a: "s:X", q: 10, p: 10 }, { id: 2, d: "2025-01-04", t: "sell", a: "s:X", q: 5, p: 12 }];
const tl = I.timeline(s2, { "s:X": [["2025-01-02", 10], ["2025-01-03", 11], ["2025-01-05", 13]] }, { USD: 1 }, I.dateRange("2025-01-01", "2025-01-05"));
near(tl[0].value, 0, "tl before"); near(tl[1].value, 100, "tl day1"); near(tl[2].value, 110, "tl day2"); near(tl[3].value, 55, "tl carry forward after sell"); near(tl[4].value, 65, "tl day5");
near(tl[4].invested, 100 - 60, "tl invested");

/* CSV */
const csv = 'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes\n' +
	'2024-01-05T10:00:00Z,Buy,BTC,0.01,USD,"44,000.00",440,445,5,Bought\n2024-02-01T10:00:00Z,Sell,BTC,0.005,USD,48000,240,238,2,\n2024-03-01T10:00:00Z,Staking Income,ETH,0.002,USD,3000,6,6,0,\n2024-03-02,Mystery,ETH,1,USD,1,1,1,0,\n';
const rows = I.parseCSV(csv), map = I.guessColumns(rows[0]);
ok(map.date === 0 && map.type === 1 && map.sym === 2 && map.q === 3 && map.p === 5 && map.fee === 8, "coinbase columns " + JSON.stringify(map));
const conv = I.rowsToTx(rows, map);
ok(conv.tx.length === 3 && conv.skipped.length === 1, "coinbase rows " + conv.tx.length + "/" + conv.skipped.length);
near(conv.tx[0].p, 44000, "price with comma"); ok(conv.tx[2].t === "in", "staking = transfer in");
ok(I.parseCSV("a;b\n1;2")[1][1] === "2", "semicolon csv");
ok(I.parseCSV('Date\tSymbol\tShares\tPrice\n2025-01-01\tAAPL\t3\t100')[1][2] === "3", "tab csv");
const g2 = I.guessColumns(["Date", "Action", "Symbol", "Quantity", "Price", "Commission", "Net Amount", "Currency"]);
ok(g2.total === 6 && g2.cur === 7 && g2.fee === 5, "broker columns");
const tx2 = I.rowsToTx([["Date", "Action", "Symbol", "Quantity", "Price", "Net Amount"], ["2025-01-01", "DIVIDEND", "VOO", "", "", "12.40"], ["2025-02-01", "DIVIDEND", "VOO", "", "", ""]], { date: 0, type: 1, sym: 2, q: 3, p: 4, total: 5 });
ok(tx2.tx.length === 1 && tx2.tx[0].t === "div" && tx2.tx[0].p === 12.4 && tx2.skipped.length === 1, "dividend rows");

/* quick add */
let qa = I.parseQuick("buy 10 AAPL at 150 on 2026-01-05");
ok(qa && qa.t === "buy" && qa.q === 10 && qa.sym === "AAPL" && qa.p === 150 && qa.d === "2026-01-05", "quick buy " + JSON.stringify(qa));
qa = I.parseQuick("sell 0.5 btc @ 60,000 fee 5"); ok(qa.t === "sell" && qa.q === 0.5 && qa.sym === "BTC" && qa.p === 60000 && qa.fee === 5, "quick sell " + JSON.stringify(qa));
qa = I.parseQuick("SHOP.TO 3 120"); ok(qa.sym === "SHOP.TO" && qa.q === 3 && qa.p === 120, "quick plain");
ok(I.parseQuick("10 20") === null, "quick needs symbol");

/* wallets */
ok(I.walletOk("btc", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"), "btc ok"); ok(!I.walletOk("btc", "0x123"), "btc bad");
ok(I.walletOk("eth", "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"), "eth ok"); ok(I.walletOk("hive", "mes"), "hive ok"); ok(!I.walletOk("hive", "MES!"), "hive bad");
ok(I.walletOk("xrp", "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh"), "xrp ok"); ok(I.walletOk("sol", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), "sol ok");

/* clean / merge / backup */
const dirty = { base: "XXX", assets: { "s:AAPL": { sym: "AAPL", cur: "USD" }, "bad key!": {} }, tx: [{ id: "a", d: "2025-01-01", t: "buy", a: "s:AAPL", q: 1, p: 1 }, { d: "nope", t: "buy", a: "s:AAPL" }, { d: "2025-01-01", t: "hack", a: "s:AAPL" }], wallets: [{ chain: "btc", addr: "x" }] };
const c = I.clean(dirty); ok(c.base === "USD" && Object.keys(c.assets).length === 1 && c.tx.length === 1 && c.wallets.length === 0, "clean");
const m = I.merge(c, { assets: { "c:hive": { sym: "HIVE" } }, tx: [{ id: "a", d: "2025-01-01", t: "buy", a: "s:AAPL", q: 1, p: 1 }, { id: "b", d: "2025-01-02", t: "buy", a: "c:hive", q: 5, p: 1 }] });
ok(m.added === 1 && m.state.tx.length === 2, "merge adds new only");
ok(I.readBackup(I.backup(st)).tx.length === st.tx.length, "backup round trip");
ok(I.txCSV(st).split("\n").length === st.tx.length + 1, "tx csv");

/* API helpers */
ok(A._t.ySym("SHOP.TO") && A._t.ySym("^GSPC") && A._t.ySym("BTC-USD") && !A._t.ySym("a b") && !A._t.ySym("x".repeat(30)), "yahoo symbol check");
ok(A._t.cgId("hive_dollar") && !A._t.cgId("../x"), "cg id check");
const yq = A._t.parseYahooQuote({ chart: { result: [{ meta: { currency: "CAD", regularMarketPrice: 100, chartPreviousClose: 98, longName: "Shopify" }, timestamp: [1, 2], indicators: { quote: [{ close: [98, 100] }] } }] } });
near(yq.p, 100, "yahoo price"); ok(yq.c === "CAD", "yahoo currency"); near(yq.ch, (100 / 98 - 1) * 100, "yahoo change");
const yh = A._t.parseYahooHist({ chart: { result: [{ timestamp: [1735833600, 1735920000], indicators: { quote: [{ close: [10, null] }] } }] } });
ok(yh.length === 1 && yh[0][0] === "2025-01-02", "yahoo history " + JSON.stringify(yh));
const bal = A._t.walletParse("hive", { result: [{ balance: "10.000 HIVE", savings_balance: "1.000 HIVE", hbd_balance: "2.500 HBD", savings_hbd_balance: "1.000 HBD", vesting_shares: "2000.000000 VESTS", delegated_vesting_shares: "0.000000 VESTS" }] }, { total_vesting_fund_hive: "1000.000 HIVE", total_vesting_shares: "2000.000000 VESTS" });
near(bal["c:hive"], 10 + 1 + 1000, "hive balance incl HP"); near(bal["c:hive_dollar"], 3.5, "hbd balance");
near(A._t.walletParse("btc", { chain_stats: { funded_txo_sum: 300000000, spent_txo_sum: 100000000 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } })["c:bitcoin"], 2, "btc balance");
near(A._t.walletParse("eth", { result: "0xde0b6b3a7640000" })["c:ethereum"], 1, "eth balance");
near(A._t.walletParse("xrp", { result: { account_data: { Balance: "25000000" } } })["c:ripple"], 25, "xrp balance");
near(A._t.walletParse("sol", { result: { value: 2500000000 } })["c:solana"], 2.5, "sol balance");

/* ERC-20 tokens */
const T = A._t;
near(T.units("1000000", 6), 1, "units 6 dec"); near(T.units("123456789012345678901234", 18), 123456.789012345678901234, "units big 18 dec"); ok(T.units("0x", 18) === 0 && T.units("-5", 2) === 0, "units junk");
ok(Object.keys(T.TOKENS).length >= 40 && Object.keys(T.TOKENS).every((a) => /^0x[0-9a-f]{40}$/.test(a) && T.cgId(T.TOKENS[a][2])), "token table well formed");
const ep = T.parseEthplorer({ ETH: { rawBalance: "2000000000000000000", balance: 2 }, tokens: [
  { tokenInfo: { address: "0xA0b86991c6218b36c1d19d4a2e9eB0cE3606eB48", decimals: "6", symbol: "USDC", price: { rate: 1 } }, rawBalance: "5000000" },
  { tokenInfo: { address: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", decimals: "18", symbol: "ENS", name: "Ethereum Name Service", price: { rate: 4, diff: -1, volume24h: 2e7, marketCapUsd: 1.5e8 } }, rawBalance: "3000000000000000000" },
  { tokenInfo: { address: "0x9cdf242ef7975d8c68d5c1f5b6905801699b1940", decimals: "18", symbol: "WHITE", price: { rate: 0.0001, volume24h: 65, marketCapUsd: 2e7 } }, rawBalance: "1" + "0".repeat(28) },
  { tokenInfo: { address: "0x1111111111111111111111111111111111111111", decimals: "18", symbol: "SCAM<b>", price: false }, rawBalance: "1000" },
  { tokenInfo: { address: "0x2222222222222222222222222222222222222222", decimals: "18", symbol: "TINY", price: { rate: 1, volume24h: 1e9, marketCapUsd: 1e9 } }, rawBalance: "100000000000000000" }] });
near(ep.b["c:ethereum"], 2, "ethplorer eth"); near(ep.b["c:usd-coin"], 5, "listed token -> coingecko key"); ok(ep.t["c:usd-coin"][0] === "USDC", "listed token name");
near(ep.b["e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72"], 3, "traded token -> e: key"); near(ep.q["e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72"].p, 4, "e: token price");
ok(!ep.b["e:0x9cdf242ef7975d8c68d5c1f5b6905801699b1940"] && !ep.b["e:0x1111111111111111111111111111111111111111"] && !ep.b["e:0x2222222222222222222222222222222222222222"] && ep.hid === 3, "spam / tiny tokens left out " + ep.hid);
const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", list = [usdc, "0xdac17f958d2ee523a2206206994597c13d831ec7"];
const rp = T.parseEthRpc([{ id: 0, result: "0xde0b6b3a7640000" }, { id: 1, result: "0x" + (2500000).toString(16).padStart(64, "0") }, { id: 2, result: "0x" + "0".repeat(64) }], list);
near(rp.b["c:ethereum"], 1, "rpc eth"); near(rp.b["c:usd-coin"], 2.5, "rpc token"); ok(!("c:tether" in rp.b), "rpc zero token skipped");
const ws = I.clean({ base: "USD", assets: { "e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72": { sym: "ENS" }, "e:0xZZ": { sym: "x" } }, tx: [], wallets: [{ id: "w1", chain: "eth", addr: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe", hide: ["c:usd-coin", "<x>"] }] });
ok(ws.assets["e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72"] && Object.keys(ws.assets).length === 1, "clean keeps e: assets"); ok(ws.wallets[0].hide.length === 1, "clean keeps valid hide list");
const wq = I.walletQty(ws, { w1: { b: { "c:ethereum": 1, "c:usd-coin": 50, "e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72": 3 } } });
ok(wq["c:ethereum"] === 1 && !wq["c:usd-coin"] && wq["e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72"] === 3, "hidden token not counted");

/* other networks */
ok(Object.keys(T.NETS).every((n) => Object.keys(T.NETS[n].tokens).length >= 3 && /^https:\/\/[a-z0-9-]+-rpc\.publicnode\.com$/.test(T.NETS[n].rpc) && T.cgId(T.NETS[n].native[0].slice(2)) && Object.keys(T.NETS[n].tokens).every((a) => /^0x[0-9a-f]{40}$/.test(a) && T.cgId(T.NETS[n].tokens[a][2]))), "network token tables well formed");
const pl = Object.keys(T.NETS.pol.tokens);
{ const r = T.parseEthRpc([{ id: 0, result: "0xde0b6b3a7640000" }].concat(pl.map((a, i) => ({ id: i + 1, result: a === "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" ? "0x" + (2500000).toString(16).padStart(64, "0") : "0x0" }))), pl, "pol");
  ok(r.b["c:polygon-ecosystem-token"] === 1 && r.b["c:usd-coin"] === 2.5 && !r.b["c:ethereum"], "polygon: POL native + USDC"); }
const bl = Object.keys(T.NETS.bnb.tokens), usdtB = "0x55d398326f99059ff775485246999027b3197955";
const rb = T.parseEthRpc([{ id: 0, result: "0x1bc16d674ec80000" }].concat(bl.map((a, i) => ({ id: i + 1, result: a === usdtB ? "0x" + (10n ** 19n).toString(16).padStart(64, "0") : "0x0" }))), bl, "bnb");
near(rb.b["c:binancecoin"], 2, "bnb native is BNB"); near(rb.b["c:tether"], 10, "bnb usdt 18 decimals"); ok(!rb.b["c:ethereum"], "bnb has no eth key");
ok(I.EVM_NETS.length === 1 + Object.keys(T.NETS).length && I.EVM_NETS.slice(1).every((g) => T.NETS[g[0]] && T.NETS[g[0]].native[0] === g[2]) && I.walletOk("eth", "0xF977814e90dA44bFA03b6295A0616a897441aceC"), "evm networks");

/* Solana */
const acct = (mint, amount, decimals) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount: String(amount), decimals } } } } } });
const USDCm = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", GOOD = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump", FAKE = "9dwPiStDBwJJqC3QzMnjpJP7xohZbMVmHELFx3uy3KRq";
const tal = T.solTally([{ result: { value: [acct(USDCm, 1500000, 6), acct(USDCm, 500000, 6), acct(GOOD, 2000000, 6), acct(FAKE, 9e12, 6), acct("bad<mint>", 5, 0)] } }, { result: { value: [acct("So11111111111111111111111111111111111111112", 5e8, 9)] } }]);
near(tal[USDCm], 2, "sol tally adds accounts of one mint"); ok(!tal["bad<mint>"], "sol tally drops bad mints");
const jupRec = [{ id: GOOD, symbol: "jelly<x>", name: "Jelly", usdPrice: 2, liquidity: 2e6, mcap: 4e7, stats24h: { buyVolume: 1e5, sellVolume: 1e5, priceChange: -3 } },
  { id: FAKE, symbol: "NVDA", name: "NVIDIA", usdPrice: 7e-5, liquidity: 15000, mcap: 57000, isVerified: true, stats24h: { buyVolume: 300 } }];
const ps = T.parseSol(3e9, tal, jupRec);
near(ps.b["c:solana"], 3.5, "SOL + wrapped SOL"); near(ps.b["c:usd-coin"], 2, "listed SPL -> coingecko key"); ok(ps.t["c:usd-coin"][0] === "USDC" && !ps.t["c:solana"], "sol names");
near(ps.b["e:" + GOOD], 2, "traded SPL -> e:<mint>"); ok(ps.q["e:" + GOOD].p === 2 && ps.q["e:" + GOOD].ch === -3 && ps.t["e:" + GOOD][0] === "jellyx", "SPL price, change, safe symbol");
ok(!ps.b["e:" + FAKE] && ps.hid === 1, "'verified' junk token left out");
ok(Object.keys(T.SPL).every((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m) && T.cgId(T.SPL[m][2])), "SPL table well formed");

/* TRON */
ok(T.tronHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t") === "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c" && T.tronHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u") === null, "tron address -> hex, bad checksum refused");
ok(Object.keys(T.TRC20).every((a) => T.tronHex(a) && T.cgId(T.TRC20[a][2])), "TRC-20 table well formed");
const tg = T.parseTrongrid({ data: [{ balance: 5e6, frozenV2: [{ amount: 2e6 }, { type: "ENERGY", amount: 1e6 }, { type: "TRON_POWER" }], unfrozenV2: [{ unfreeze_amount: 1e6 }], delegated_frozenV2_balance_for_bandwidth: 1e6,
  trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "12500000" }, { TXspamspamspamspamspamspamspamspam1: "99" }, { TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9: "0" }] }] });
near(tg.b["c:tron"], 10, "TRX incl. staked, unstaking, delegated"); near(tg.b["c:tether"], 12.5, "TRC-20 USDT"); ok(tg.hid === 1 && tg.t["c:tether"][0] === "USDT", "unknown TRC-20 left out");
ok(T.parseTrongrid({ data: [] }).b["c:tron"] === 0, "unused TRON address = 0");

/* Hive Engine */
const he = T.parseHiveEngine([{ symbol: "LEO", balance: "100", stake: "50", pendingUnstake: "0", delegationsOut: "10" }, { symbol: "SWAP.HIVE", balance: "20" }, { symbol: "SWAP.BTC", balance: "0.01" },
  { symbol: "DEAD", balance: "1000" }, { symbol: "DUST", balance: "1" }, { symbol: "ZERO", balance: "0" }],
  [{ symbol: "LEO", lastPrice: "0.5", highestBid: "0.4", priceChangePercent: "-1.5%" }, { symbol: "DEAD", lastPrice: "1", highestBid: "0" }, { symbol: "DUST", lastPrice: "0.1", highestBid: "0.1" }], 0.25);
near(he.b["e:he:LEO"], 160, "HE balance + stake + delegated out"); near(he.q["e:he:LEO"].p, 0.125, "HE price = HIVE price x last trade"); ok(he.q["e:he:LEO"].ch === -1.5, "HE change");
near(he.b["c:hive"], 20, "SWAP.HIVE -> HIVE"); near(he.b["c:bitcoin"], 0.01, "SWAP.BTC -> BTC"); ok(he.t["c:bitcoin"][0] === "BTC" && !he.t["c:hive"], "swap names");
ok(!he.b["e:he:DEAD"] && !he.b["e:he:DUST"] && he.hid === 2, "no-bid / dust HE tokens left out");

/* token keys + new wallets */
ok(I.EKEY.test("e:" + GOOD) && I.EKEY.test("e:he:SWAP.HIVE") && I.EKEY.test("e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72") && !I.EKEY.test("e:he:<b>") && !I.EKEY.test("e:0xZZ"), "token key rule");
ok(I.tokenLink("e:" + GOOD)[0] === "Solscan" && I.tokenLink("e:he:LEO")[0] === "Tribaldex" && I.tokenLink("e:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72")[0] === "Etherscan", "token links");
const ws2 = I.clean({ base: "USD", assets: { ["e:" + GOOD]: { sym: "JELLY" }, "e:he:LEO": { sym: "LEO" } }, tx: [], wallets: [{ id: "s", chain: "sol", addr: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", hide: ["e:he:LEO", "e:" + GOOD] }, { id: "t", chain: "trx", addr: "TT1DyeqXaaJkt6UhVYFWUXBXknaXnBudTK" }, { id: "l", chain: "ltc", addr: "ltc1qr07zu594qf63xm7l7x6pu3a2v39m2z6hh5pp4t" }, { id: "d", chain: "doge", addr: "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L" }, { id: "a", chain: "ada", addr: "stake1u84nmqs3fcg6cxsv8dkw4anyd7fuvak2tw2pygwz2gumuegct98mh" }] });
ok(Object.keys(ws2.assets).length === 2 && ws2.wallets.length === 5 && ws2.wallets[0].hide.length === 2, "clean keeps Solana / Hive Engine tokens and the new wallets");

/* Cardano + XRPL tokens */
const SNEKID = "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b", NIGHTP = "0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa";
const adl = T.adaTokenList([{ policy_id: SNEKID.slice(0, 56), asset_name: SNEKID.slice(56), decimals: 0, quantity: "5000" }, { policy_id: NIGHTP, asset_name: "4e49474854", decimals: 6, quantity: "2500000" },
  { policy_id: "000ffeb007da43324aefe044555fbe5bc469c38aa5063f95dc2ff72a", asset_name: "536e656b2052657761726473", decimals: 0, quantity: "1" }, { policy_id: "zz", asset_name: "", quantity: "9" }]);
ok(adl.length === 2 && adl[1].sym === "NIGHT" && adl[1].qty === 2.5, "cardano tokens: NFTs and bad ids skipped, decimals applied");
const gb = { "c:cardano": 10 }, ga = T.parseGt("cardano", adl, { token_prices: { [SNEKID]: "0.0004", [NIGHTP + "4e49474854"]: "0.05" }, total_reserve_in_usd: { [SNEKID]: "1e6", [NIGHTP + "4e49474854"]: "5e5" }, h24_volume_usd: { [SNEKID]: "8e4", [NIGHTP + "4e49474854"]: "50" }, h24_price_change_percentage: {} }, gb);
near(ga.b["c:snek"], 5000, "SNEK -> coingecko key"); ok(!ga.b["e:ada:" + NIGHTP + "4e49474854"] && ga.hid === 1, "low-volume cardano token left out");
const xl = T.xrplTokenList([{ currency: "524C555344000000000000000000000000000000", account: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", balance: "12.5" }, { currency: "CSC", account: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr", balance: "-3" },
  { currency: "YLW", account: "rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG", balance: "100" }, { currency: "<x>", account: "rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG", balance: "1" }]);
ok(xl.length === 2 && xl[0].sym === "RLUSD" && T.xrplCur("CSC") === "CSC", "xrpl lines: issued (negative) and bad codes skipped, hex codes decoded");
const xb = { "c:ripple": 5 }, xg = T.parseGt("xrpl", xl, { token_prices: { "YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG": "0.2" }, total_reserve_in_usd: { "YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG": "40000" }, h24_volume_usd: { "YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG": "900" }, h24_price_change_percentage: { "YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG": "4" } }, xb);
near(xg.b["c:ripple-usd"], 12.5, "RLUSD -> coingecko key"); near(xg.q["e:xrp:YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG"].p, 0.2, "xrpl token price"); ok(xg.q["e:xrp:YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG"].ch === 4, "xrpl change");
ok(I.EKEY.test("e:xrp:YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG") && I.EKEY.test("e:xrp:524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De") && I.EKEY.test("e:ada:" + SNEKID) && !I.EKEY.test("e:xrp:<x>.r1"), "xrpl / cardano token keys");
ok(I.tokenLink("e:xrp:YLW.rBWr5wTBJhc5osje2PcRZkaWFcamqjnDBG")[0] === "XRPSCAN" && I.tokenLink("e:ada:" + SNEKID)[0] === "Cardanoscan", "xrpl / cardano links");

console.log(bad ? bad + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(bad ? 1 : 0);
