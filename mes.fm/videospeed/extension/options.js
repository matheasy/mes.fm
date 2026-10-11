/* MES Video Speed Controller: settings page */
(function () {
  'use strict';
  var V = MESVS, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), timer = 0;

  function save() {
    chrome.storage.sync.set({ mesvs: S }, function () {
      $('saved').textContent = 'Saved';
      clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 1500);
    });
  }

  function pretty(k) { return k === 'space' ? 'Space' : k.length === 1 ? k.toUpperCase() : k.replace(/^arrow/, '→ ').replace('→ left', '←').replace('→ right', '→').replace('→ up', '↑').replace('→ down', '↓'); }

  function drawKeys() {
    $('keys').innerHTML = '';
    V.ACTIONS.forEach(function (a) {
      var l = document.createElement('label'), b = document.createElement('input');
      l.appendChild(document.createTextNode(a[1]));
      b.type = 'text'; b.readOnly = true; b.className = 'key'; b.value = S.keys[a[0]] ? pretty(S.keys[a[0]]) : '(none)';
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') return;
        e.preventDefault();
        if (e.key === 'Backspace' || e.key === 'Delete') S.keys[a[0]] = '';
        else { var n = V.keyName(e); if (!n) return; for (var o in S.keys) if (S.keys[o] === n && o !== a[0]) S.keys[o] = ''; S.keys[a[0]] = n; }
        drawKeys(); save();
      });
      l.appendChild(b);
      $('keys').appendChild(l);
    });
  }

  function fill() {
    drawKeys();
    ['step', 'preferred', 'holdSpeed', 'seek', 'opacity'].forEach(function (k) { $(k).value = S[k]; });
    $('remember').value = S.remember; $('overlay').value = S.overlay;
    $('force').checked = S.force; $('audio').checked = S.audio;
    $('sites').value = S.disabledSites.join('\n');
  }

  ['step', 'preferred', 'holdSpeed', 'seek', 'opacity'].forEach(function (k) {
    $(k).addEventListener('change', function () { S[k] = Number($(k).value); S = V.merge(S); fill(); save(); });
  });
  ['remember', 'overlay'].forEach(function (k) { $(k).addEventListener('change', function () { S[k] = $(k).value; save(); }); });
  ['force', 'audio'].forEach(function (k) { $(k).addEventListener('change', function () { S[k] = $(k).checked; save(); }); });
  $('sites').addEventListener('change', function () {
    S.disabledSites = $('sites').value.split(/\s+/).map(function (s) { return s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); }).filter(Boolean);
    save();
  });
  $('reset').addEventListener('click', function () { S = V.merge(null); fill(); save(); });

  chrome.storage.sync.get('mesvs', function (a) { S = V.merge(a && a.mesvs); fill(); });
})();
