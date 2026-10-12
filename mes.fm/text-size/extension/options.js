/* MES Text Size: settings page */
(function () {
  'use strict';
  var T = MESTS, $ = function (id) { return document.getElementById(id); };
  var S = T.merge(null), timer = 0;
  function save() { chrome.storage.sync.set({ mests: S }, function () { $('saved').textContent = 'Saved'; clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 1800); }); }
  function drawSites() {
    var box = $('sitemap'); box.innerHTML = ''; var hosts = Object.keys(S.siteLevels).sort();
    if (!hosts.length) box.innerHTML = '<p class="hint">None yet. Change the size from the toolbar popup on any site.</p>';
    hosts.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'sm';
      d.appendChild(document.createTextNode(h + ': ' + S.siteLevels[h] + '% '));
      var b = document.createElement('button'); b.textContent = 'Remove'; b.onclick = function () { delete S.siteLevels[h]; drawSites(); save(); };
      d.appendChild(b); box.appendChild(d);
    });
  }
  function draw() { $('step').value = S.step; $('applyTo').value = S.applyTo; $('allLevel').value = S.allLevel; $('allout').textContent = S.allLevel + '%'; drawSites(); }
  $('step').onchange = function () { S.step = Number($('step').value); save(); };
  $('applyTo').onchange = function () { S.applyTo = $('applyTo').value; save(); };
  $('allLevel').oninput = function () { S.allLevel = T.clampLevel($('allLevel').value, S.min, S.max); $('allout').textContent = S.allLevel + '%'; save(); };
  chrome.storage.sync.get('mests', function (a) { S = T.merge(a && a.mests); draw(); });
})();
