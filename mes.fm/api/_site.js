// Which website a stats / Search Console request is for.
//
// mes.fm's own pages use the plain keys (pageviews:*, gscdash:*, chartnotes:v1). Other sites MES runs dashboards for keep
// the same data shape under a key prefix in the same Upstash database, so their numbers never mix with mes.fm's:
//   awc = www.alpinewestcreative.com (Karo's site): keys awc:pageviews:*, awc:gscdash:*, awc:chartnotes:v1.
// Their pages live at mes.fm/awc/... and call mes.fm/api/awc/<name>, small wrappers that run the normal handler inside
// runAs('awc', ...). The handlers' Upstash helpers pass every command through prefixCommands(), which reads the site of
// the current request from an AsyncLocalStorage (safe with several requests at once in one warm instance).
// middleware.js puts /awc/* and /api/awc/* behind their own password; alpinewestcreative.com proxies /stats,
// /search-console, /seo, /awc/* and /api/awc/* here (karo.mes.fm/vercel.json).
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const SITES = {
  mes: { id: 'mes', prefix: '', bing: 'https://mes.fm/', origins: ['https://mes.fm', 'https://www.mes.fm'] },
  awc: {
    id: 'awc',
    prefix: 'awc:',
    host: 'www.alpinewestcreative.com',
    bing: 'https://www.alpinewestcreative.com/',
    origins: ['https://www.alpinewestcreative.com', 'https://alpinewestcreative.com', 'https://mes.fm', 'https://www.mes.fm'],
  },
};

function site() { return als.getStore() || SITES.mes; }
function runAs(id, fn) { return als.run(SITES[id], fn); }

// where the keys are in each command these handlers send
const FIRST = new Set(['GET', 'SET', 'EXPIRE', 'ZINCRBY', 'HINCRBY', 'ZREVRANGE', 'ZRANGE', 'HGETALL', 'ZMSCORE', 'ZSCORE', 'ZADD', 'HGET', 'HSET', 'INCR', 'INCRBY', 'TTL', 'ZCARD']);
const ALL = new Set(['DEL', 'MGET', 'EXISTS']);

function prefixOne(cmd, p) {
  const name = String(cmd[0]).toUpperCase();
  const c = cmd.slice();
  if (FIRST.has(name)) c[1] = p + c[1];
  else if (ALL.has(name)) for (let i = 1; i < c.length; i++) c[i] = p + c[i];
  else if (name === 'ZUNIONSTORE' || name === 'ZINTERSTORE') {
    c[1] = p + c[1];
    const n = Number(c[2]);
    for (let i = 3; i < 3 + n; i++) c[i] = p + c[i];
  } else throw new Error('no key rule for ' + name); // never send an unprefixed key for another site
  return c;
}

function prefixWith(p, commands) { return p ? commands.map((c) => prefixOne(c, p)) : commands; }
function prefixCommands(commands) { return prefixWith(site().prefix, commands); }

module.exports = { SITES, site, runAs, prefixCommands, prefixWith, prefixOne };
