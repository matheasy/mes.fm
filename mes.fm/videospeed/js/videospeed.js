/* Video Speed Controller page: show the version of the extension that is actually in the zip. */
(function () {
  var el = document.getElementById('vs-ver');
  if (!el || !window.fetch) return;
  fetch('/videospeed/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (m && m.version) el.textContent = 'v' + m.version;
  }).catch(function () {});
})();
