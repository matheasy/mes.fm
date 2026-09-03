(function () {
  if (!('sendBeacon' in navigator)) return;
  var data = new URLSearchParams({
    site: location.hostname,
    path: location.pathname + location.search,
    referrer: document.referrer || ''
  });
  navigator.sendBeacon('https://mes.fm/api/track', data);
})();
