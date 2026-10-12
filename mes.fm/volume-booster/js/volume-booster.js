/* volume-booster page: show the version of the extension that is actually in the zip. */
(function () {
  var el = document.getElementById('vb-ver');
  if (!el || !window.fetch) return;
  fetch('/volume-booster/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (m && m.version) el.textContent = 'v' + m.version;
  }).catch(function () {});
})();
