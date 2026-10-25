// Google Apps Script for the private mes.fm/search-console page: Google Search Console clicks, impressions, CTR and
// position, sent to https://mes.fm/api/search-console-ingest. Search Console has no Apps Script "advanced service",
// so this calls the Search Console API (searchanalytics.query) itself with UrlFetchApp and the script's own OAuth token.
//
// Version 2 (2026-10-24): fresh data (today / yesterday, marked incomplete), hourly numbers for the last days, and
// day-by-day breakdowns (country x device, page x country x device, query x page x country x device) for the last
// 182 days, which the page uses for its filters.
//
// Install (once):
//  1. script.google.com -> New project, name it "MES Search Console page" -> paste this whole file over Code.gs.
//  2. Project Settings (gear) -> tick "Show appsscript.json manifest file in editor". Open appsscript.json and make it
//     (keep your own timeZone if it differs):
//       {
//         "timeZone": "America/Vancouver",
//         "exceptionLogging": "STACKDRIVER",
//         "runtimeVersion": "V8",
//         "oauthScopes": [
//           "https://www.googleapis.com/auth/webmasters.readonly",
//           "https://www.googleapis.com/auth/script.external_request",
//           "https://www.googleapis.com/auth/script.scriptapp"
//         ]
//       }
//  3. Project Settings -> Script properties -> add INGEST_KEY = the same key as Vercel env EARNINGS_INGEST_KEY (the one
//     the AdSense script uses).
//  4. Run backfill() once (choose the Google account that owns mes.fm in Search Console and allow access).
//     It sends every day Search Console still has (16 months), the 7 / 28 / 90 / 365-day summaries and then the
//     day-by-day breakdowns for the last 182 days. The breakdowns can take longer than Apps Script's 6-minute limit:
//     the script then saves where it was and continues by itself a minute later (a one-time trigger), until it logs
//     "Breakdowns: all done".
//  5. Run installTrigger() once: main() then runs every hour (the last 5 days, fresh data, hours; the summaries every 6 hours).
// Updating from version 1: paste this file over Code.gs, Save, run installTrigger() (hourly now), then run backfillDims()
// once (only the breakdowns; the day totals and summaries you already sent stay).
// If the property is a URL-prefix property instead of a Domain property, change PROPERTY to 'https://mes.fm/'.
// If a run says 403 "User does not have sufficient permission", the Google account is not an owner / user of PROPERTY.

var INGEST_URL = 'https://mes.fm/api/search-console-ingest';
var PROPERTY = 'sc-domain:mes.fm';
var RESEND_DAYS = 5;          // Search Console lags 2-3 days and fills recent days in later: resend the last few each run
var BACKFILL_DAYS = 486;      // about 16 months, all Search Console keeps
var DIM_DAYS = 182;           // breakdowns kept for filters: 90 days + the 90 before (comparison) + a little
var RANGES = [7, 28, 90, 365];
var SUMMARY_EVERY_H = 6;      // range summaries are heavier: every 6 hours is plenty
// rows kept per summary (the ingest API refuses more)
var TOP = { pages: 500, queries: 1000, countries: 250, devices: 10, pq: 1500 };
// rows kept per day in each breakdown (the ingest API refuses more; mes.fm is far below these)
var DIM_TOP = { a: 3500, b: 7000, q: 7000 };
var DIM_SETS = { a: ['country', 'device'], b: ['page', 'country', 'device'], q: ['query', 'page', 'country', 'device'] };

function main() {
  run(RESEND_DAYS, { dims: true, hours: true, sums: summariesDue() });
}
function backfill() {
  run(BACKFILL_DAYS, { dims: false, hours: true, sums: true });
  PropertiesService.getScriptProperties().deleteProperty('DIMS_NEXT');
  backfillDims();
}
// Breakdowns for the last DIM_DAYS days, a week at a time, resumable (see step 4 above).
function backfillDims() {
  var props = PropertiesService.getScriptProperties();
  var t0 = Date.now();
  var today = ymd(new Date());
  var first = addDays(today, -(DIM_DAYS - 1));
  var next = props.getProperty('DIMS_NEXT') || first;
  if (next < first) next = first;
  clearContinue();
  while (next <= today) {
    var to = addDays(next, 6) > today ? today : addDays(next, 6);
    sendDims(next, to);
    next = addDays(to, 1);
    props.setProperty('DIMS_NEXT', next);
    if (Date.now() - t0 > 4.5 * 60000 && next <= today) {
      ScriptApp.newTrigger('backfillDims').timeBased().after(60 * 1000).create();
      Logger.log('Breakdowns: sent up to ' + to + ', continuing in a minute by itself.');
      return;
    }
  }
  props.deleteProperty('DIMS_NEXT');
  Logger.log('Breakdowns: all done.');
}
function clearContinue() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backfillDims') ScriptApp.deleteTrigger(t); });
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'main') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('main').timeBased().everyHours(1).create();
}

function summariesDue() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('SUMS_AT') || 0);
  return Date.now() - last > (SUMMARY_EVERY_H - 0.25) * 3600000;
}

var LAST_META = null; // metadata of the last Search Console answer
var FRESH = null;     // first day Search Console still calls incomplete (firstIncompleteDate of the day query)

function query(body) {
  var url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(PROPERTY) + '/searchAnalytics/query';
  if (!body.dataState) body.dataState = 'all'; // include the newest (not yet final) days; they are resent later anyway
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
  });
  if (resp.getResponseCode() !== 200) throw new Error('Search Console said ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 400));
  var json = JSON.parse(resp.getContentText());
  if (json.metadata) LAST_META = json.metadata;
  return json.rows || [];
}
// All rows of a query, 25,000 at a time.
function queryAll(body) {
  var out = [], start = 0;
  for (var page = 0; page < 40; page++) {
    body.rowLimit = 25000; body.startRow = start;
    var rows = query(body);
    out = out.concat(rows);
    if (rows.length < 25000) break;
    start += 25000;
  }
  return out;
}

function ymd(d) { return Utilities.formatDate(d, 'America/Los_Angeles', 'yyyy-MM-dd'); }
function addDays(s, n) { return Utilities.formatDate(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5), 'UTC', 'yyyy-MM-dd'); }
function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function post(payload) {
  var key = PropertiesService.getScriptProperties().getProperty('INGEST_KEY');
  if (!key) throw new Error('Set the script property INGEST_KEY first.');
  payload.source = 'gsc';
  payload.meta = { property: PROPERTY, tz: 'America/Los_Angeles', fresh: FRESH };
  var resp = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Ingest-Key': key }, payload: JSON.stringify(payload),
  });
  Logger.log(resp.getResponseCode() + ' ' + resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('mes.fm said ' + resp.getResponseCode() + ': ' + resp.getContentText());
}

// Top rows of one dimension set over [start, end], as [...keys, clicks, impressions, position].
function top(start, end, dims, n) {
  return query({ startDate: start, endDate: end, dimensions: dims, rowLimit: n }).map(function (r) {
    return r.keys.map(function (k) { return String(k).slice(0, 400); }).concat([r.clicks, r.impressions, r2(r.position)]);
  });
}

function summary(start, end) {
  return {
    start: start, end: end,
    pages: top(start, end, ['page'], TOP.pages),
    queries: top(start, end, ['query'], TOP.queries),
    countries: top(start, end, ['country'], TOP.countries),
    devices: top(start, end, ['device'], TOP.devices),
    pq: top(start, end, ['page', 'query'], TOP.pq),
  };
}

// Hourly totals (Pacific hours) for the last few days; Search Console only has these for recent days. Any error (an
// older API without hourly data) just means no hours.
function hours(first, today) {
  var out = {};
  try {
    query({ startDate: first, endDate: today, dimensions: ['hour'], dataState: 'hourly_all', rowLimit: 25000 }).forEach(function (r) {
      // key looks like "2026-10-24T13:00:00-07:00"
      var k = String(r.keys[0]), d = k.slice(0, 10), h = Number(k.slice(11, 13));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(h >= 0 && h <= 23)) return;
      (out[d] || (out[d] = [])).push([h, r.clicks, r.impressions, r2(r.position)]);
    });
  } catch (e) { Logger.log('No hourly data: ' + e.message); }
  return out;
}

// Day-by-day breakdowns for [from, to], dictionary-encoded per day: { s: [strings], r: [[indexes..., c, i, pos]] }.
function sendDims(from, to) {
  var byDay = {};
  Object.keys(DIM_SETS).forEach(function (set) {
    var dims = ['date'].concat(DIM_SETS[set]);
    var rows = queryAll({ startDate: from, endDate: to, dimensions: dims });
    var perDay = {};
    rows.forEach(function (r) { (perDay[r.keys[0]] || (perDay[r.keys[0]] = [])).push(r); });
    Object.keys(perDay).forEach(function (d) {
      var list = perDay[d].sort(function (a, b) { return b.clicks - a.clicks || b.impressions - a.impressions; }).slice(0, DIM_TOP[set]);
      var dict = {}, s = [], out = [];
      list.forEach(function (r) {
        var row = [];
        for (var k = 1; k < r.keys.length; k++) {
          var v = String(r.keys[k]).slice(0, 400);
          if (!(v in dict)) { dict[v] = s.length; s.push(v); }
          row.push(dict[v]);
        }
        out.push(row.concat([r.clicks, r.impressions, r2(r.position)]));
      });
      (byDay[d] || (byDay[d] = {}))[set] = { s: s, r: out };
    });
  });
  // POST a few days at a time so each request stays small (Vercel takes up to 4.5 MB)
  var days = Object.keys(byDay).sort(), batch = {}, size = 0;
  days.forEach(function (d) {
    var len = JSON.stringify(byDay[d]).length;
    if (size + len > 2500000 && Object.keys(batch).length) { post({ dims: batch }); batch = {}; size = 0; }
    batch[d] = byDay[d]; size += len;
  });
  if (Object.keys(batch).length) post({ dims: batch });
}

function run(nDays, opts) {
  var today = ymd(new Date());
  var first = addDays(today, -nDays);
  // 1) day rows: totals + devices per day, fresh flag, hours
  var days = {};
  query({ startDate: first, endDate: today, dimensions: ['date'], rowLimit: 25000 }).forEach(function (r) {
    days[r.keys[0]] = { t: [r.clicks, r.impressions, r2(r.position)], dev: [] };
  });
  var fresh = LAST_META && LAST_META.firstIncompleteDate ? LAST_META.firstIncompleteDate : addDays(today, -2);
  FRESH = fresh;
  query({ startDate: first, endDate: today, dimensions: ['date', 'device'], rowLimit: 25000 }).forEach(function (r) {
    if (days[r.keys[0]]) days[r.keys[0]].dev.push([r.keys[1], r.clicks, r.impressions, r2(r.position)]);
  });
  Object.keys(days).forEach(function (d) { if (d >= fresh) days[d].f = 1; });
  if (opts.hours) {
    var h = hours(addDays(today, -3), today);
    Object.keys(h).forEach(function (d) { if (days[d]) days[d].h = h[d]; });
  }
  var dates = Object.keys(days).sort();
  if (!dates.length) { Logger.log('Search Console returned no days.'); return; }
  // POST in chunks of 120 days (the ingest API takes up to 500 per request)
  for (var k = 0; k < dates.length; k += 120) {
    var part = {};
    dates.slice(k, k + 120).forEach(function (d) { part[d] = days[d]; });
    post({ days: part });
  }
  // 2) breakdowns for the days just sent
  if (opts.dims) sendDims(addDays(today, -(Math.min(nDays, DIM_DAYS) - 1)), today);
  // 3) range summaries ending on the newest day Search Console has, plus the period just before each
  if (opts.sums) {
    var end = dates[dates.length - 1];
    RANGES.forEach(function (n) {
      var start = addDays(end, -(n - 1));
      var sums = {};
      sums[String(n)] = { cur: summary(start, end), prev: summary(addDays(start, -n), addDays(start, -1)) };
      post({ sums: sums }); // one POST per range keeps each request small
    });
    PropertiesService.getScriptProperties().setProperty('SUMS_AT', String(Date.now()));
  }
}
