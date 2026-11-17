// Page views for Karo's private stats page (www.alpinewestcreative.com/stats): one small beacon per page load to
// mes.fm/api/track, stored under the site's own keys (mes.fm/api/_site.js). No cookies, nothing stored in the browser;
// the beacon carries only the page path and the referring page. The phone layout (/m/...) counts as the same page.
(function () {
  if (!('sendBeacon' in navigator) || !/(^|\.)alpinewestcreative\.com$/i.test(location.hostname)) return;
  var path = location.pathname.replace(/^\/m(\/|$)/, '/').replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  var data = new URLSearchParams({ site: location.hostname, path: path, referrer: document.referrer || '' });
  navigator.sendBeacon('https://mes.fm/api/track', data);
})();
