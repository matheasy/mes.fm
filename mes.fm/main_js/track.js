(function () {
  if (!('sendBeacon' in navigator)) return;
  // Ad-click / campaign tags are unique per visitor (?gclid=...), so left in the path every paid click would become
  // its own leaderboard member across ~14 Upstash sorted sets. Strip them; real params (shared-calculation links) stay.
  var q = new URLSearchParams(location.search);
  Array.from(q.keys()).forEach(function (k) {
    if (/^(gclid|gbraid|wbraid|gad_source|gad_campaignid|msclkid|fbclid)$/i.test(k) || /^utm_/i.test(k)) q.delete(k);
  });
  var qs = q.toString();
  var data = new URLSearchParams({
    site: location.hostname,
    path: location.pathname + (qs ? '?' + qs : ''),
    referrer: document.referrer || ''
  });
  navigator.sendBeacon('https://mes.fm/api/track', data);
})();
