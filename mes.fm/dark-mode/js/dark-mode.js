/* Dark Mode page: show the version of the extension that is actually in the zip. */
(function () {
  var el = document.getElementById('dm-ver');
  if (!el || !window.fetch) return;
  fetch('/dark-mode/extension/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (m && m.version) { el.textContent = 'v' + m.version; var a = document.getElementById('dm-dl'); if (a) a.href = '/dark-mode/mes-dark-mode.zip?v=' + m.version; }   // the version in the link stops a cached older zip being served
  }).catch(function () {});
})();
