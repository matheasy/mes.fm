/* MES Text Size: toolbar popup */
(function () {
  'use strict';
  var T = MESTS, $ = function (id) { return document.getElementById(id); };
  var S = T.merge(null), host = '', timer = 0;
  var PRESETS = [80, 100, 125, 150, 200, 250];

  function level() { return T.levelFor(S, host); }
  function draw() {
    var l = level();
    $('level').textContent = l + '%'; $('slider').min = S.min; $('slider').max = S.max; $('slider').value = l; $('applyto').value = S.applyTo;
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button data-l="' + p + '"' + (p === l ? ' class="on"' : '') + '>' + p + '%</button>'; }).join('');
    var k = T.siteKey(S, host);
    $('msg').textContent = k ? 'This site has its own size.' : S.allLevel !== 100 ? 'Using the all-sites size.' : ' ';
  }
  function setLevel(l) {
    if (!host) { $('msg').textContent = 'Not available on this page.'; return; }
    S = T.withLevel(S, host, l, S.applyTo); draw();
    clearTimeout(timer); timer = setTimeout(function () { chrome.storage.sync.set({ mests: S }); }, 80);
  }

  $('smaller').onclick = function () { setLevel(T.stepLevel(level(), -1, S.step, S.min, S.max)); };
  $('larger').onclick = function () { setLevel(T.stepLevel(level(), 1, S.step, S.min, S.max)); };
  $('slider').oninput = function () { setLevel(Number($('slider').value)); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.l) setLevel(Number(e.target.dataset.l)); };
  $('reset').onclick = function () { setLevel(100); };
  $('applyto').onchange = function () { S.applyTo = $('applyto').value; chrome.storage.sync.set({ mests: S }); draw(); };

  chrome.storage.sync.get('mests', function (a) {
    S = T.merge(a && a.mests);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      try { host = new URL(tabs[0].url).hostname; } catch (e) { host = ''; }
      $('host').textContent = host || 'this tab';
      draw();
    });
  });
})();
