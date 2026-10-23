// Google Apps Script for the private mes.fm/ads page: AdSense earnings per page, country, device and site.
// Install: script.google.com -> New project "MES ads page - AdSense" -> paste this file -> Services (+) ->
// "AdSense Management API" (identifier AdSense, v2) -> Project Settings -> Script properties: INGEST_KEY = the key
// (Vercel env EARNINGS_INGEST_KEY) -> run backfill() once (authorise with the AdSense Google account) ->
// run installTrigger() once (hourly runs).
// main() sends the last DAYS days (a re-send replaces those days); backfill() sends the last 120 days.

var INGEST_URL = 'https://mes.fm/api/earnings-ingest';
var ACCOUNT = 'accounts/pub-1461238060884369';
var DAYS = 35;

// Runs hourly (installTrigger): each run resends the last 3 days so today stays current; the 6 am run resends DAYS.
function main() { send(+Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'H') === 6 ? DAYS : 3); }
function backfill() { send(120); }

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'main') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('main').timeBased().everyHours(1).create();
}

function report(n, dims) {
  var end = new Date(), start = new Date(Date.now() - (n - 1) * 864e5);
  var res = AdSense.Accounts.Reports.generate(ACCOUNT, {
    dateRange: 'CUSTOM',
    'startDate.year': start.getFullYear(), 'startDate.month': start.getMonth() + 1, 'startDate.day': start.getDate(),
    'endDate.year': end.getFullYear(), 'endDate.month': end.getMonth() + 1, 'endDate.day': end.getDate(),
    dimensions: ['DATE'].concat(dims),
    metrics: ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'IMPRESSIONS', 'CLICKS'],
    currencyCode: 'CAD',
    reportingTimeZone: 'ACCOUNT_TIME_ZONE',
    limit: 100000,
  });
  return (res.rows || []).map(function (row) { return row.cells.map(function (c) { return c.value; }); });
}

function send(n) {
  var key = PropertiesService.getScriptProperties().getProperty('INGEST_KEY');
  if (!key) throw new Error('Set the script property INGEST_KEY first.');
  var days = {};
  var at = function (d) { return days[d] || (days[d] = { pages: [], geo: [], dev: [], dom: [] }); };
  var num = function (v) { var x = Number(v); return isFinite(x) && x > 0 ? x : 0; };
  // row = [date, ...dims, earnings, page views, impressions, clicks]
  report(n, ['PAGE_URL']).forEach(function (r) { if (r[1]) at(r[0]).pages.push([String(r[1]).slice(0, 300), num(r[2]), num(r[3]), num(r[4]), num(r[5])]); });
  report(n, ['COUNTRY_CODE', 'COUNTRY_NAME']).forEach(function (r) { at(r[0]).geo.push([String(r[1] || ''), String(r[2] || ''), num(r[3]), num(r[4])]); });
  report(n, ['PLATFORM_TYPE_NAME']).forEach(function (r) { at(r[0]).dev.push([String(r[1] || ''), num(r[2]), num(r[3])]); });
  report(n, ['DOMAIN_NAME']).forEach(function (r) { at(r[0]).dom.push([String(r[1] || '').slice(0, 300), num(r[2]), num(r[3])]); });
  var resp = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Ingest-Key': key },
    payload: JSON.stringify({ source: 'adsense', meta: { currency: 'CAD', tz: Session.getScriptTimeZone() }, days: days }),
  });
  Logger.log(resp.getResponseCode() + ' ' + resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('mes.fm said ' + resp.getResponseCode() + ': ' + resp.getContentText());
}
