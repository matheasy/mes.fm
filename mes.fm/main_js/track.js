(function () {
  if (!('sendBeacon' in navigator)) return;
  // Ad-click / campaign tags are unique per visitor (?gclid=...), so left in the path every paid click would become
  // its own leaderboard member across ~14 Upstash sorted sets. Strip them; real params (shared-calculation links) stay.
  var q = new URLSearchParams(location.search);
  Array.from(q.keys()).forEach(function (k) {
    if (/^(gclid|gbraid|wbraid|gad_source|gad_campaignid|msclkid|fbclid)$/i.test(k) || /^utm_/i.test(k)) q.delete(k);
  });
  // /search-engines is meant to be a browser's default search: the words people type arrive as ?q=, which must never reach the stats
  // the same for pages whose links carry private input: the health calculators' dates, domains looked up, image links
  if (/^\/(ovulation-calculator|period-calculator|due-date-calculator|pregnancy-test-calculator|conception-date-calculator|weeks-pregnant-calculator|domain-lookup|reverse-image-search|baby-growth-percentile-calculator|bmr-calculator|body-fat-calculator|macro-calculator|water-intake-calculator|tdee-calculator|heart-rate-zone-calculator|waist-to-hip-ratio-calculator|protein-intake-calculator|sleep-calculator|body-surface-area-calculator|pregnancy-calorie-calculator)\/?$/.test(location.pathname)) Array.from(q.keys()).forEach(function (k) { q.delete(k); });
  if (/^\/search-engines\/?$/.test(location.pathname)) Array.from(q.keys()).forEach(function (k) { q.delete(k); });
  var qs = q.toString();
  var data = new URLSearchParams({
    site: location.hostname,
    path: location.pathname + (qs ? '?' + qs : ''),
    referrer: document.referrer || ''
  });
  navigator.sendBeacon('https://mes.fm/api/track', data);
})();
