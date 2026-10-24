// Google Apps Script for the private mes.fm/search-console page: Google Search Console clicks, impressions, CTR and
// position, sent to https://mes.fm/api/search-console-ingest. Search Console has no Apps Script "advanced service",
// so this calls the Search Console API (searchanalytics.query) itself with UrlFetchApp and the script's own OAuth token.
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
//     It sends every day Search Console still has (16 months) plus the 7 / 28 / 90 / 365-day summaries.
//  5. Run installTrigger() once: main() then runs every 6 hours.
// If the property is a URL-prefix property instead of a Domain property, change PROPERTY to 'https://mes.fm/'.
// If a run says 403 "User does not have sufficient permission", the Google account is not an owner / user of PROPERTY.

var INGEST_URL = 'https://mes.fm/api/search-console-ingest';
var PROPERTY = 'sc-domain:mes.fm';
var RESEND_DAYS = 5;          // Search Console lags 2-3 days and fills recent days in later: resend the last few each run
var BACKFILL_DAYS = 486;      // about 16 months, all Search Console keeps
var RANGES = [7, 28, 90, 365];
// rows kept per summary (the ingest API refuses more)
var TOP = { pages: 500, queries: 1000, countries: 250, devices: 10, pq: 1500 };

function main() { run(RESEND_DAYS); }
function backfill() { run(BACKFILL_DAYS); }

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'main') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('main').timeBased().everyHours(6).create();
}

function query(body) {
  var url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(PROPERTY) + '/searchAnalytics/query';
  body.dataState = 'all'; // include the newest (not yet final) days; they are resent later anyway
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
  });
  if (resp.getResponseCode() !== 200) throw new Error('Search Console said ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 400));
  return JSON.parse(resp.getContentText()).rows || [];
}

function ymd(d) { return Utilities.formatDate(d, 'America/Los_Angeles', 'yyyy-MM-dd'); }
function addDays(s, n) { return ymd(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5)); }
function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function post(payload) {
  var key = PropertiesService.getScriptProperties().getProperty('INGEST_KEY');
  if (!key) throw new Error('Set the script property INGEST_KEY first.');
  payload.source = 'gsc';
  payload.meta = { property: PROPERTY, tz: 'America/Los_Angeles' };
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

function run(nDays) {
  var today = ymd(new Date());
  var first = addDays(today, -nDays);
  // 1) day rows: totals + devices per day
  var days = {};
  query({ startDate: first, endDate: today, dimensions: ['date'], rowLimit: 25000 }).forEach(function (r) {
    days[r.keys[0]] = { t: [r.clicks, r.impressions, r2(r.position)], dev: [] };
  });
  query({ startDate: first, endDate: today, dimensions: ['date', 'device'], rowLimit: 25000 }).forEach(function (r) {
    if (days[r.keys[0]]) days[r.keys[0]].dev.push([r.keys[1], r.clicks, r.impressions, r2(r.position)]);
  });
  var dates = Object.keys(days).sort();
  if (!dates.length) { Logger.log('Search Console returned no days.'); return; }
  post({ days: days });
  // 2) range summaries ending on the newest day Search Console has, plus the period just before each
  var end = dates[dates.length - 1];
  RANGES.forEach(function (n) {
    var start = addDays(end, -(n - 1));
    var sums = {};
    sums[String(n)] = { cur: summary(start, end), prev: summary(addDays(start, -n), addDays(start, -1)) };
    post({ sums: sums }); // one POST per range keeps each request small
  });
}
