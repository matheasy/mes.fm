(function () {
  if (!('sendBeacon' in navigator)) return;
  // Ad-click / campaign tags are unique per visitor (?gclid=...), so left in the path every paid click would become
  // its own leaderboard member across ~14 Upstash sorted sets. Strip them; real params (shared-calculation links) stay.
  var q = new URLSearchParams(location.search);
  var isTag = function (k) { return /^(gclid|gbraid|wbraid|gad_source|gad_campaignid|msclkid|fbclid)$/i.test(k) || /^utm_/i.test(k); };
  // A Google Ads click carries one of these tags; the stats then count the view as 'Google Ads' instead of plain Google search.
  // Only when the visit comes from another site, though: a bookmark, a restored tab or a reload of a page first reached through an
  // ad still has the tags (and no referrer, or this site's), and was being counted as a new ad click on every visit, which also
  // hid those visitors from the 'came back' numbers.
  var ref = document.referrer || '';
  var fromElsewhere = ref && !/^https?:\/\/([^\/]*\.)?mes\.fm(\/|$)/i.test(ref);
  var paid = fromElsewhere && /(^|[?&])(gclid|gbraid|wbraid|gad_source|gad_campaignid)=/i.test(location.search) ? 'g' : '';
  Array.from(q.keys()).forEach(function (k) { if (isTag(k)) q.delete(k); });
  // ...and take the tags out of the address bar, so bookmarks, shared links and saved tabs made from now on are clean
  // (every other query parameter stays: shared calculations need theirs).
  try {
    var clean = new URLSearchParams(location.search), had = false;
    Array.from(clean.keys()).forEach(function (k) { if (isTag(k)) { clean.delete(k); had = true; } });
    if (had && history.replaceState) { var cs = clean.toString(); history.replaceState(history.state, '', location.pathname + (cs ? '?' + cs : '') + location.hash); }
  } catch (e) {}
  // /search-engines is meant to be a browser's default search: the words people type arrive as ?q=, which must never reach the stats
  // the same for pages whose links carry private input (/contact?subject=&message= = feedback text from the rating box): the health calculators' dates, domains looked up, image links
  if (/^\/(nba-picks|fav|contact|ratings|translate|image-to-text|time-calculator|tip-calculator|age-calculator|statistics-calculator|birthday-personality|seo|reminder|birthday|zodiac|ovulation-calculator|period-calculator|due-date-calculator|pregnancy-test-calculator|conception-date-calculator|weeks-pregnant-calculator|domain-lookup|site-traffic|reverse-image-search|baby-growth-percentile-calculator|bmr-calculator|body-fat-calculator|macro-calculator|water-intake-calculator|tdee-calculator|heart-rate-zone-calculator|waist-to-hip-ratio-calculator|protein-intake-calculator|sleep-calculator|body-surface-area-calculator|pregnancy-calorie-calculator|bmi-calculator-kids|define)\/?$/.test(location.pathname)) Array.from(q.keys()).forEach(function (k) { q.delete(k); });
  if (/^\/search-engines\/?$/.test(location.pathname)) Array.from(q.keys()).forEach(function (k) { q.delete(k); });
  var qs = q.toString();
  var data = new URLSearchParams({
    site: location.hostname,
    path: (/^\/f\/[a-z0-9]+$/.test(location.pathname) ? '/fav' : /^\/define\/[^\/]+\/?$/.test(location.pathname) ? '/define' : /^\/r\/[a-z0-9]+\/?$/.test(location.pathname) ? '/reminder' : location.pathname) + (qs ? '?' + qs : ''),   // short links (/f/<id>, /r/<id>) count as their page, never with the id
    referrer: document.referrer || '',
    ad: paid
  });
  // Do Google Ads visitors come back? The first ad click remembers its landing page and day in this browser only
  // (localStorage 'mes-adv', never a cookie, forgotten after 180 days); a later non-ad visit on another day reports
  // "came back" against that landing page and day. /stats shows totals only (api/track.js, api/ads-returns.js).
  try {
    var day = new Date().toISOString().slice(0, 10), rec = JSON.parse(localStorage.getItem('mes-adv') || 'null');
    if (rec && !(Date.parse(day) - Date.parse(rec.d) <= 180 * 864e5)) rec = null;
    if (paid && !rec) {
      rec = { p: location.pathname.slice(0, 150), d: day, n: 0, l: day };
      data.set('adf', '1');
    } else if (rec && !paid && day !== rec.l) {
      rec.n++;
      data.set('adr', String(rec.n));
    }
    if (rec) {
      rec.l = day;
      if (data.has('adf') || data.has('adr')) { data.set('adp', rec.p); data.set('add', rec.d); }
      localStorage.setItem('mes-adv', JSON.stringify(rec));
    } else localStorage.removeItem('mes-adv');
  } catch (e) {}
  navigator.sendBeacon('https://mes.fm/api/track', data);
})();
