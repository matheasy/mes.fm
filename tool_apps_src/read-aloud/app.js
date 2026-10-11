/* Read Aloud page: show the version of the extension that is actually in the zip. */
(function () {
  var el = document.getElementById('ra-ver');
  if (!el || !window.fetch) return;
  fetch('/read-aloud/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (m && m.version) el.textContent = 'v' + m.version;
  }).catch(function () {});
})();
