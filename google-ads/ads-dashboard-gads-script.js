// Google Ads Script for the private mes.fm/ads page (installed in the MES (VND) account:
// Tools -> Bulk actions -> Scripts, name "MES ads page", schedule Daily).
// Sends spend per campaign x device, per country and per landing page for the last few days to
// https://mes.fm/api/earnings-ingest. Costs stay in micros of the account currency; the site converts to CAD.
// Paste the real key into INGEST_KEY when installing (Vercel env EARNINGS_INGEST_KEY); this repo copy has a placeholder.
// main() (the only function a scheduled Ads script runs) sends the last DAYS days; a re-send replaces those days.

var INGEST_URL = 'https://mes.fm/api/earnings-ingest';
var INGEST_KEY = 'PASTE-THE-KEY-HERE';
var DAYS = 35; // daily re-send covers late conversions / corrections; set 120 once for a longer history

function main() { send(DAYS); }

function send(n) {
  var acct = AdsApp.currentAccount();
  var tz = acct.getTimeZone();
  var day = function (back) { return Utilities.formatDate(new Date(Date.now() - back * 864e5), tz, 'yyyy-MM-dd'); };
  var from = day(n - 1), to = day(0);
  var when = " WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
  var days = {};
  var at = function (d) { return days[d] || (days[d] = { camps: [], geo: [], lp: [] }); };

  var it = AdsApp.search('SELECT segments.date, campaign.name, segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign' + when + ' AND metrics.impressions > 0');
  while (it.hasNext()) {
    var r = it.next();
    at(r.segments.date).camps.push([r.campaign.name, r.segments.device, +r.metrics.impressions, +r.metrics.clicks, +r.metrics.costMicros]);
  }

  var geoRows = [], ids = {};
  it = AdsApp.search('SELECT segments.date, campaign.name, user_location_view.country_criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM user_location_view' + when + ' AND metrics.impressions > 0');
  while (it.hasNext()) {
    r = it.next();
    var id = String(r.userLocationView.countryCriterionId);
    ids[id] = true;
    geoRows.push([r.segments.date, id, r.campaign.name, +r.metrics.impressions, +r.metrics.clicks, +r.metrics.costMicros]);
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
    at(r.segments.date).lp.push([String(r.landingPageView.unexpandedFinalUrl || '').slice(0, 300), r.campaign.name, +r.metrics.clicks, +r.metrics.costMicros]);
  }

  // every day in the range is sent, so a day with no spend replaces an older copy
  for (var b = 0; b < n; b++) at(day(b));
  var resp = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Ingest-Key': INGEST_KEY },
    payload: JSON.stringify({ source: 'gads', meta: { currency: acct.getCurrencyCode(), tz: tz }, days: days }),
  });
  Logger.log(resp.getResponseCode() + ' ' + resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('mes.fm said ' + resp.getResponseCode() + ': ' + resp.getContentText());
}
