// Live CPI data for mes.fm/inflationcalculator.
//
// The calculator used to ship a frozen 2018/2019 snapshot (it came out of a MySQL
// table on GoDaddy). This endpoint pulls the same four sources fresh from their
// publishers and the Vercel edge caches the answer, so the page stays current with
// no manual step:
//
//   World Bank  FP.CPI.TOTL (annual, 2010=100, ~190 countries)   api.worldbank.org
//   FRED        CPIAUCNS = BLS CPI-U, US, monthly since 1913     fred.stlouisfed.org
//   StatCan     Table 18-10-0004 vector 41690973, Canada monthly statcan.gc.ca
//   UK ONS      D7BT CPI index (2015=100), monthly since 1988    ons.gov.uk
//               + the earlier long-run annual series (1800-1988) chained on, see below
//
// GET /api/inflation -> { v:2, updated, sources:{...}, errors:[...] }
//
// If one publisher is down the source is filled from the committed snapshot
// (inflationcalculator/data/inflation-data.json) and listed in `errors`; if they
// all are, the snapshot is returned as is. Refresh the snapshot with
//   node mes.fm/api/inflation.js --write
//
// Payload shape, per source -> countries -> country:
//   { iso, cur, a:{s:1960, v:[...]}, m:{s:"1913-01", v:[...]} }
// `a` = annual series starting at year s (complete years only), `m` = monthly series
// starting at month s (optional). `null` entries are gaps.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'inflationcalculator', 'data');
const SNAPSHOT = path.join(DATA_DIR, 'inflation-data.json');

// ISO3 -> currency, so results can say "$", "€", "£"... (anything unlisted shows a plain number)
const CURRENCIES = {
  USD: 'USA ECU SLV PRI PAN TLS FSM MHL PLW',
  EUR: 'AUT BEL CYP DEU ESP EST FIN FRA GRC HRV IRL ITA LTU LUX LVA MLT NLD PRT SVK SVN',
  GBP: 'GBR', CAD: 'CAN', AUD: 'AUS', NZD: 'NZL', JPY: 'JPN', CNY: 'CHN', INR: 'IND', KRW: 'KOR',
  CHF: 'CHE LIE', SEK: 'SWE', NOK: 'NOR', DKK: 'DNK', ISK: 'ISL', PLN: 'POL', CZK: 'CZE', HUF: 'HUN',
  RON: 'ROU', BGN: 'BGR', RUB: 'RUS', UAH: 'UKR', TRY: 'TUR', ILS: 'ISR', SAR: 'SAU', AED: 'ARE',
  QAR: 'QAT', KWD: 'KWT', BHD: 'BHR', OMR: 'OMN', JOD: 'JOR', EGP: 'EGY', MAD: 'MAR', TND: 'TUN',
  DZD: 'DZA', NGN: 'NGA', GHS: 'GHA', KES: 'KEN', ETB: 'ETH', ZAR: 'ZAF', TZS: 'TZA', UGX: 'UGA',
  MXN: 'MEX', BRL: 'BRA', ARS: 'ARG', CLP: 'CHL', COP: 'COL', PEN: 'PER', UYU: 'URY', BOB: 'BOL',
  PYG: 'PRY', CRC: 'CRI', GTQ: 'GTM', HNL: 'HND', DOP: 'DOM', JMD: 'JAM', TTD: 'TTO', BSD: 'BHS',
  BBD: 'BRB', HKD: 'HKG', SGD: 'SGP', TWD: 'TWN', THB: 'THA', MYR: 'MYS', IDR: 'IDN', PHP: 'PHL',
  VND: 'VNM', PKR: 'PAK', BDT: 'BGD', LKR: 'LKA', NPR: 'NPL', MMK: 'MMR', KHR: 'KHM', MNT: 'MNG',
  KZT: 'KAZ', UZS: 'UZB', GEL: 'GEO', AMD: 'ARM', AZN: 'AZE', RSD: 'SRB', MKD: 'MKD', ALL: 'ALB',
  BAM: 'BIH', MDL: 'MDA', BYN: 'BLR', IRR: 'IRN', IQD: 'IRQ', LBP: 'LBN', FJD: 'FJI', PGK: 'PNG',
  XOF: 'BEN BFA CIV GNB MLI NER SEN TGO', XAF: 'CMR CAF TCD COG GAB GNQ', MUR: 'MUS', MZN: 'MOZ',
  AOA: 'AGO', ZMW: 'ZMB', BWP: 'BWA', NAD: 'NAM', RWF: 'RWA', MGA: 'MDG', SDG: 'SDN',
};
const CUR_OF = {};
for (const [cur, list] of Object.entries(CURRENCIES)) for (const iso of list.split(' ')) CUR_OF[iso] = cur;

async function getText(url, opts, tries = 2) {
  try {
    const res = await fetch(url, Object.assign({ headers: { 'User-Agent': 'mes.fm-inflationcalculator/2.0 (+https://mes.fm/inflationcalculator)' } }, opts));
    if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    if (tries > 1) return getText(url, opts, tries - 1);   // publishers' APIs drop a request now and then
    throw e;
  }
}

const r3 = (n) => Math.round(n * 1000) / 1000;

// months: [{y, m (1-12), v}] sorted -> {a:{s,v}, m:{s,v}} (gaps null, annual = mean of the months published, needing at least 11 of 12 -- BLS skipped October 2025)
function fromMonthly(rows) {
  rows.sort((p, q) => p.y - q.y || p.m - q.m);
  const first = rows[0];
  const byKey = new Map(rows.map((r) => [r.y * 12 + r.m - 1, r.v]));
  const k0 = first.y * 12 + first.m - 1;
  const k1 = rows[rows.length - 1].y * 12 + rows[rows.length - 1].m - 1;
  const mv = [];
  for (let k = k0; k <= k1; k++) mv.push(byKey.has(k) ? r3(byKey.get(k)) : null);
  const ms = first.y + '-' + String(first.m).padStart(2, '0');
  const av = [];
  let y0 = first.y;
  const yLast = Math.floor(k1 / 12);
  for (let y = y0; y <= yLast; y++) {
    let sum = 0, n = 0;
    for (let m = 0; m < 12; m++) {
      const v = byKey.get(y * 12 + m);
      if (v != null) { sum += v; n++; }
    }
    if (y === yLast ? n === 12 : n >= 11) av.push(r3(sum / n));
    else if (y === yLast) break;     // partial current year: the client derives a year-to-date value from `m`
    else av.push(null);
  }
  return { a: { s: y0, v: av }, m: { s: ms, v: mv } };
}

async function worldBank() {
  const [cJson, dJson] = await Promise.all([
    getText('https://api.worldbank.org/v2/country?format=json&per_page=400').then(JSON.parse),
    getText('https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL?format=json&per_page=20000&date=1960:' + (new Date().getUTCFullYear())).then(JSON.parse),
  ]);
  const real = new Map();   // iso3 -> name  (region "NA" = aggregate such as "World", "Euro area")
  for (const c of cJson[1]) if (c.region && c.region.id !== 'NA') real.set(c.id, c.name.trim());
  const by = {};
  let last = 0;
  for (const r of dJson[1]) {
    if (r.value == null || !real.has(r.countryiso3code)) continue;
    const y = +r.date;
    (by[r.countryiso3code] = by[r.countryiso3code] || {})[y] = r.value;
    if (y > last) last = y;
  }
  const countries = {};
  for (const iso of Object.keys(by).sort((p, q) => real.get(p).localeCompare(real.get(q)))) {
    const ys = Object.keys(by[iso]).map(Number);
    const s = Math.min(...ys), e = Math.max(...ys);
    const v = [];
    for (let y = s; y <= e; y++) v.push(by[iso][y] == null ? null : r3(by[iso][y]));
    if (ys.length < 3) continue;   // a country with 1-2 data points can't be charted
    countries[real.get(iso)] = { iso, cur: CUR_OF[iso] || null, a: { s, v } };
  }
  return {
    label: 'World Bank', freq: 'annual', base: '2010 = 100', through: last,
    note: 'World Bank, Consumer price index (2010 = 100), indicator FP.CPI.TOTL. Annual averages; countries report on their own schedule, so the latest year varies.',
    url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL', countries,
  };
}

async function fred() {
  const csv = await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS');
  const rows = [];
  for (const line of csv.trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const n = parseFloat(v);
    if (!isNaN(n)) rows.push({ y: +d.slice(0, 4), m: +d.slice(5, 7), v: n });
  }
  return {
    label: 'FRED (US BLS)', freq: 'monthly', base: '1982-84 = 100',
    note: 'US Bureau of Labor Statistics CPI-U, all items, not seasonally adjusted (FRED series CPIAUCNS), monthly since January 1913.',
    url: 'https://fred.stlouisfed.org/series/CPIAUCNS',
    countries: { 'United States': Object.assign({ iso: 'USA', cur: 'USD' }, fromMonthly(rows)) },
  };
}

async function statcan() {
  const text = await getText('https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'mes.fm-inflationcalculator/2.0' },
    body: JSON.stringify([{ vectorId: 41690973, latestN: 1800 }]),
  });
  const pts = JSON.parse(text)[0].object.vectorDataPoint;
  const rows = pts.filter((p) => p.value != null).map((p) => ({ y: +p.refPer.slice(0, 4), m: +p.refPer.slice(5, 7), v: p.value }));
  return {
    label: 'StatCan', freq: 'monthly', base: '2002 = 100',
    note: 'Statistics Canada Table 18-10-0004-01, Consumer Price Index, Canada, all-items, monthly since January 1914.',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401',
    countries: { Canada: Object.assign({ iso: 'CAN', cur: 'CAD' }, fromMonthly(rows)) },
  };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
async function ukOns() {
  const csv = await getText('https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7bt/mm23');
  const rows = [], annual = {};
  for (const line of csv.split('\n')) {
    const m = line.match(/^"(\d{4})(?: ([A-Z]{3}))?","([\d.]+)"/);
    if (!m) continue;
    const v = parseFloat(m[3]);
    if (!m[2]) annual[+m[1]] = v;
    else if (MONTHS.includes(m[2])) rows.push({ y: +m[1], m: MONTHS.indexOf(m[2]) + 1, v });
  }
  const out = fromMonthly(rows);
  // Chain the earlier long-run annual series (1800-1988; retail-price based) onto the CPI so UK
  // comparisons can start before 1988: scale it so its 1988 value equals ONS's 1988 average.
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'uk-long-run-pre-1989.json'), 'utf8')); } catch (e) { /* optional */ }
  if (hist['1988'] && out.a.v[0] != null) {
    const k = out.a.v[0] / hist['1988'];
    const s = Math.min(...Object.keys(hist).map(Number));
    const pre = [];
    for (let y = s; y < out.a.s; y++) pre.push(hist[y] == null ? null : r3(hist[y] * k));
    out.a = { s, v: pre.concat(out.a.v) };
  }
  return {
    label: 'UK ONS', freq: 'monthly', base: '2015 = 100',
    note: 'Office for National Statistics CPI index, all items (series D7BT, monthly from 1988). Years before 1988 come from the earlier long-run UK price series (back to 1800, retail-price based), scaled to join the CPI in 1988, so annual comparisons that cross 1988 mix the two measures.',
    url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23',
    countries: { 'United Kingdom': Object.assign({ iso: 'GBR', cur: 'GBP' }, out) },
  };
}

function readSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch (e) { return null; }
}

async function build() {
  const snap = readSnapshot();
  const jobs = { 'World Bank': worldBank, FRED: fred, StatCan: statcan, 'UK ONS': ukOns };
  const sources = {}, errors = [];
  await Promise.all(Object.entries(jobs).map(async ([key, fn]) => {
    try {
      sources[key] = await fn();
    } catch (e) {
      errors.push(key + ': ' + (e && e.message));
      if (snap && snap.sources && snap.sources[key]) sources[key] = Object.assign({}, snap.sources[key], { stale: true });
    }
  }));
  // keep the dropdown order stable
  const ordered = {};
  for (const k of Object.keys(jobs)) if (sources[k]) ordered[k] = sources[k];
  return { v: 2, updated: new Date().toISOString(), sources: ordered, errors };
}

module.exports = async (req, res) => {
  try {
    const data = await build();
    if (!Object.keys(data.sources).length) throw new Error('no source available');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Fresh for 12h at the edge, then served stale (and refreshed in the background) for up to a week.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=43200, stale-while-revalidate=604800');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    const snap = readSnapshot();
    if (snap) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.status(200).json(Object.assign({}, snap, { errors: [String(e && e.message)] }));
    } else {
      res.status(502).json({ error: 'Inflation data is temporarily unavailable.' });
    }
  }
};
module.exports.build = build;

if (require.main === module && process.argv.includes('--write')) {
  build().then((d) => {
    if (d.errors.length) { console.error('Errors:', d.errors); process.exit(1); }
    fs.writeFileSync(SNAPSHOT, JSON.stringify(d));
    for (const [k, s] of Object.entries(d.sources)) console.log(k, Object.keys(s.countries).length, 'countries');
    console.log('wrote', SNAPSHOT, fs.statSync(SNAPSHOT).size, 'bytes');
  }).catch((e) => { console.error(e); process.exit(1); });
}
