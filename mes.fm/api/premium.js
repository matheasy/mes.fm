// Ad-free status for mes.fm/premium, read straight from the Hive blockchain (no accounts, nothing stored here).
//
// GET ?u=<hive username>  ->  { user, adFree, until, untilMs, how, months, lastPayment, subscription, checked }
//
// A person is ad-free while the HBD they sent to @mes covers today: every transfer (or recurrent-transfer execution) of at
// least 1.000 HBD from that account to @mes buys floor(amount) months of 31 days, stacked from the later of the payment
// time and the end of the time already paid for. An active recurrent transfer to @mes of >= 1 HBD per 720 hours (Keychain's
// "Subscribe 1 HBD / month") also counts until its next execution + 3 days of grace, so a monthly subscription never shows
// ads for the few hours around a renewal. Sources (with node fallbacks): condenser_api.get_account_history of the user,
// filtered to transfer / recurrent_transfer / fill_recurrent_transfer ops (up to 4 pages of 1,000, 400 days back), and
// condenser_api.find_recurrent_transfers. Any HBD transfer counts, whatever its memo, so a person who forgot the memo is
// not penalised. On-chain payments are public: that is said on the page and in the privacy policy.
//
// The browser keeps the answer as localStorage "mes-adfree" ({user, until, ...}); the AdSense loaders, aside.js and
// bottom-ad.js read that, and site-search.js asks this endpoint again once a day. Edge-cached 60 s (+5 min stale), so a
// payment shows up within about a minute. Node tests: node tool_apps_src/premium-api-tests.js.

const NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network', 'https://hive-api.arcange.eu'];
const TARGET = 'mes';
const MONTH_MS = 31 * 864e5;
const GRACE_MS = 3 * 864e5;
const LOOKBACK_MS = 400 * 864e5;
const NAME_RE = /^[a-z][a-z0-9-]{1,14}[a-z0-9](\.[a-z][a-z0-9-]{1,14}[a-z0-9])*$/;
// operation filters (get_account_history): low = transfer (2) | recurrent_transfer (49); high = fill_recurrent_transfer (83 - 64 = 19)
const FILTER_LOW = 4 + 562949953421312;
const FILTER_HIGH = 524288;

function validName(n) { return typeof n === 'string' && n.length >= 3 && n.length <= 16 && NAME_RE.test(n); }

// "1.000 HBD" or {amount:"1000", precision:3, nai:"@@000000013"} -> {n, sym}
function parseAmount(a) {
  if (a && typeof a === 'object' && a.amount != null) {
    const sym = a.nai === '@@000000013' ? 'HBD' : a.nai === '@@000000021' ? 'HIVE' : a.nai === '@@000000037' ? 'VESTS' : '?';
    return { n: Number(a.amount) / Math.pow(10, a.precision || 3), sym };
  }
  const m = String(a || '').trim().match(/^(\d+(?:\.\d+)?)\s+([A-Z]+)$/);
  return m ? { n: Number(m[1]), sym: m[2] === 'SBD' ? 'HBD' : m[2] } : { n: 0, sym: '?' };
}
const ts = (s) => Date.parse(/Z$/.test(s) ? s : s + 'Z');

// Pure: history entries ([index, {op:[name, data], timestamp}]) + recurrent transfers + now -> status
function computeAdFree({ user, history, recurrents, now }) {
  const pays = [];
  for (const h of history || []) {
    const e = Array.isArray(h) ? h[1] : h;
    if (!e || !Array.isArray(e.op)) continue;
    const [name, d] = e.op;
    if ((name !== 'transfer' && name !== 'fill_recurrent_transfer') || !d) continue;
    if (d.from !== user || d.to !== TARGET) continue;
    const a = parseAmount(d.amount);
    if (a.sym !== 'HBD' || a.n < 1) continue;
    const t = ts(e.timestamp);
    if (!isFinite(t) || t > now + 6e5) continue;
    pays.push({ t, n: a.n, kind: name === 'transfer' ? 'payment' : 'subscription', memo: String(d.memo || '').slice(0, 80) });
  }
  pays.sort((a, b) => a.t - b.t);
  let until = 0, months = 0, lastKind = null;
  for (const p of pays) {
    const m = Math.floor(p.n + 1e-9);
    until = Math.max(until, p.t) + m * MONTH_MS;
    months += m;
    lastKind = p.kind;
  }
  let sub = null;
  for (const r of recurrents || []) {
    if (!r || r.from !== user || r.to !== TARGET) continue;
    const a = parseAmount(r.amount);
    const hours = Number(r.recurrence) || 0;
    if (a.sym !== 'HBD' || a.n <= 0 || !hours) continue;
    const ok = a.n * 744 >= hours && (Number(r.remaining_executions) || 0) > 0 && (Number(r.consecutive_failures) || 0) === 0;
    const next = ts(r.trigger_date);
    const s = { amount: a.n.toFixed(3) + ' HBD', everyHours: hours, next: isFinite(next) ? new Date(next).toISOString() : null,
      remaining: Number(r.remaining_executions) || 0, failures: Number(r.consecutive_failures) || 0, counts: ok };
    if (!sub || ok) sub = s;
    if (ok && isFinite(next)) until = Math.max(until, next + GRACE_MS);
  }
  const adFree = until > now;
  const last = pays.length ? pays[pays.length - 1] : null;
  return {
    user, adFree, untilMs: until || 0, until: until ? new Date(until).toISOString() : null,
    how: !adFree ? null : sub && sub.counts ? 'subscription' : lastKind,
    months,
    lastPayment: last ? { at: new Date(last.t).toISOString(), amount: last.n.toFixed(3) + ' HBD', kind: last.kind } : null,
    subscription: sub,
    checked: new Date(now).toISOString(),
  };
}

async function rpc(method, params, fetchImpl) {
  const f = fetchImpl || fetch;
  let last;
  for (const node of NODES) {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
      const r = await f(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('no node answered');
}

async function fetchHistory(user, now, fetchImpl) {
  const out = [];
  let start = -1;
  for (let page = 0; page < 4; page++) {
    const limit = start === -1 ? 1000 : Math.min(1000, start + 1);
    if (limit <= 0) break;
    const res = await rpc('condenser_api.get_account_history', [user, start, limit, FILTER_LOW, FILTER_HIGH], fetchImpl);
    if (!Array.isArray(res) || !res.length) break;
    out.push(...res);
    const oldest = res[0];
    if (res.length < limit) break;
    if (ts(oldest[1].timestamp) < now - LOOKBACK_MS) break;
    start = oldest[0] - 1;
    if (start < 0) break;
  }
  return out;
}

async function status(user, opt = {}) {
  const now = opt.now || Date.now();
  const [history, recurrents] = await Promise.all([
    fetchHistory(user, now, opt.fetch),
    rpc('condenser_api.find_recurrent_transfers', [user], opt.fetch).catch(() => []),
  ]);
  return computeAdFree({ user, history, recurrents, now });
}

module.exports = async (req, res) => {
  const u = String((req.query && req.query.u) || '').trim().replace(/^@/, '').toLowerCase();
  if (!validName(u)) { res.setHeader('Cache-Control', 'no-store'); res.status(400).json({ error: 'bad username' }); return; }
  try {
    const out = await status(u);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'The Hive nodes did not answer. Try again in a minute.' });
  }
};
module.exports.computeAdFree = computeAdFree;
module.exports.parseAmount = parseAmount;
module.exports.validName = validName;
module.exports.status = status;
module.exports.FILTER_LOW = FILTER_LOW;
module.exports.FILTER_HIGH = FILTER_HIGH;
