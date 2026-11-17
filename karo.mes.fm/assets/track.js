// Page views for Karo's private stats page (www.alpinewestcreative.com/stats): one small beacon per page load to
// /p on her own domain (proxied to mes.fm/api/awc/p = the mes.fm tracker; a beacon straight to mes.fm/api/track is
// blocked by Brave and ad blockers as a third-party tracker), stored under the site's own keys (mes.fm/api/_site.js). No cookies, nothing stored in the browser;
// the beacon carries only the page path and the referring page. The phone layout (/m/...) counts as the same page.
(function () {
  if (!('sendBeacon' in navigator) || !/(^|\.)alpinewestcreative\.com$/i.test(location.hostname)) return;
  var path = location.pathname.replace(/^\/m(\/|$)/, '/').replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  var data = new URLSearchParams({ site: location.hostname, path: path, referrer: document.referrer || '' });
  navigator.sendBeacon('/p', data);
})();
