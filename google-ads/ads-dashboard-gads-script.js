// Google Ads Script for the private mes.fm/ads page (installed in the MES.fm MANAGER account: Tools -> Bulk actions ->
// Scripts, name "MES ads page", schedule Hourly). A manager account has no metrics of its own, so the script steps into
// each client account (AdsManagerApp.select) and sums the ones named in ACCOUNTS (only MES (VND); MF (VND) is a client's, MES (CAD) is retired), costs converted to CAD; other accounts are skipped and logged.
// Sends spend per campaign x device, per country and per landing page for the last few days to
// https://mes.fm/api/earnings-ingest. Costs are sent as CAD micros (converted per account in the script).
// Paste the real key into INGEST_KEY when installing (Vercel env EARNINGS_INGEST_KEY); this repo copy has a placeholder.
// main() (the only function a scheduled Ads script runs) sends the last DAYS days; a re-send replaces those days.

var INGEST_URL = 'https://mes.fm/api/earnings-ingest';
var INGEST_KEY = 'PASTE-THE-KEY-HERE';
var DAYS = 35; // daily re-send covers late conversions / corrections; set 120 once for a longer history

// Scheduled Hourly: each run resends the last 3 days (so today stays current); the 6 am run resends DAYS.
function main() { var h = +Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'H'); send(h === 6 ? DAYS : 3); }

function collect(acct, n, at, k) {
  var spent = 0;
  var cad = function (micros) { return Math.round(+micros * k); };
  var tz = acct.getTimeZone();
  var day = function (back) { return Utilities.formatDate(new Date(Date.now() - back * 864e5), tz, 'yyyy-MM-dd'); };
  var from = day(n - 1), to = day(0);
  var when = " WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
  var it = AdsApp.search('SELECT segments.date, campaign.name, segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign' + when + ' AND metrics.impressions > 0');
  while (it.hasNext()) {
    var r = it.next();
    at(r.segments.date).camps.push([r.campaign.name, r.segments.device, +r.metrics.impressions, +r.metrics.clicks, cad(r.metrics.costMicros)]);
    spent += cad(r.metrics.costMicros) / 1e6;
  }

  var geoRows = [], ids = {};
  it = AdsApp.search('SELECT segments.date, campaign.name, user_location_view.country_criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM user_location_view' + when + ' AND metrics.impressions > 0');
  while (it.hasNext()) {
    r = it.next();
    var id = String(r.userLocationView.countryCriterionId);
    ids[id] = true;
    geoRows.push([r.segments.date, id, r.campaign.name, +r.metrics.impressions, +r.metrics.clicks, cad(r.metrics.costMicros)]);
  }
  var names = {};
  var idList = Object.keys(ids).filter(function (x) { return /^\d+$/.test(x); });
  if (idList.length) {
    it = AdsApp.search('SELECT geo_target_constant.id, geo_target_constant.country_code, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.id IN (' + idList.join(',') + ')');
    while (it.hasNext()) { r = it.next(); names[String(r.geoTargetConstant.id)] = [r.geoTargetConstant.countryCode || '', r.geoTargetConstant.name || '']; }
  }
  geoRows.forEach(function (g) {
    var nm = names[g[1]] || ['', 'Unknown'];
    at(g[0]).geo.push([nm[0], nm[1], g[2], g[3], g[4], g[5]]);
  });

  it = AdsApp.search('SELECT segments.date, campaign.name, landing_page_view.unexpanded_final_url, metrics.clicks, metrics.cost_micros FROM landing_page_view' + when + ' AND metrics.impressions > 0');
  while (it.hasNext()) {
    r = it.next();
    at(r.segments.date).lp.push([String(r.landingPageView.unexpandedFinalUrl || '').slice(0, 300), r.campaign.name, +r.metrics.clicks, cad(r.metrics.costMicros)]);
  }
  return spent;
}

var ACCOUNTS = ['MES (VND)'];   // client accounts to count, by name (MF (VND) is a client's account, not MES spend)
// Costs are converted to CAD (the page's currency) at the day's rate from open.er-api.com, so accounts in different
// currencies add up; the page then shows them as they are.

function send(n) {
  var days = {}, tz = null;
  var at = function (d) { return days[d] || (days[d] = { camps: [], geo: [], lp: [] }); };
  var rates = null;
  try { rates = JSON.parse(UrlFetchApp.fetch('https://open.er-api.com/v6/latest/CAD').getContentText()).rates; } catch (e) { Logger.log('no exchange rates: ' + e); }
  var accounts = typeof AdsManagerApp !== 'undefined' ? AdsManagerApp.accounts().get() : null;
  var list = [];
  if (accounts) { while (accounts.hasNext()) list.push(accounts.next()); } else list.push(null);
  list.forEach(function (child) {
    if (child) AdsManagerApp.select(child);
    var acct = AdsApp.currentAccount();
    if (child && ACCOUNTS.indexOf(acct.getName()) === -1) { Logger.log('skipped ' + acct.getName()); return; }
    var cur = acct.getCurrencyCode();
    var k = cur === 'CAD' ? 1 : (rates && rates[cur] ? 1 / rates[cur] : null);   // account currency -> CAD
    if (!k) { Logger.log('skipped ' + acct.getName() + ': no exchange rate for ' + cur); return; }
    tz = tz || acct.getTimeZone();
    try { var spent = collect(acct, n, at, k); Logger.log('read ' + acct.getName() + ': ' + spent.toFixed(2) + ' CAD (' + (spent / k).toFixed(0) + ' ' + cur + ') in ' + n + ' days'); }
    catch (e) { Logger.log('could not read ' + acct.getName() + ': ' + e); }   // e.g. a sub-manager account
  });
  tz = tz || AdsApp.currentAccount().getTimeZone();
  var day = function (back) { return Utilities.formatDate(new Date(Date.now() - back * 864e5), tz, 'yyyy-MM-dd'); };
  // every day in the range is sent, so a day with no spend replaces an older copy
  for (var b = 0; b < n; b++) at(day(b));
  var resp = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Ingest-Key': INGEST_KEY },
    payload: JSON.stringify({ source: 'gads', meta: { currency: 'CAD', tz: tz }, days: days }),
  });
  Logger.log(resp.getResponseCode() + ' ' + resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('mes.fm said ' + resp.getResponseCode() + ': ' + resp.getContentText());
}
