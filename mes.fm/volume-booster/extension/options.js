/* MES Volume Booster: settings page */
(function () {
  'use strict';
  var V = MESVB, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), timer = 0;
  function save() {
    chrome.storage.sync.set({ mesvb: S }, function () { $('saved').textContent = 'Saved'; clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 1800); });
  }
  function draw() { $('max').value = S.max; $('step').value = S.step; $('limiter').checked = S.limiter; $('remember').checked = S.remember; }
  $('max').onchange = function () { S.max = Number($('max').value); save(); };
  $('step').onchange = function () { S.step = Number($('step').value); save(); };
  $('limiter').onchange = function () { S.limiter = $('limiter').checked; save(); };
  $('remember').onchange = function () { S.remember = $('remember').checked; save(); };
  $('forget').onclick = function () { chrome.storage.local.remove('mesvbSites', function () { $('saved').textContent = 'Forgotten'; }); };
  chrome.storage.sync.get('mesvb', function (a) { S = V.merge(a && a.mesvb); draw(); });
})();
