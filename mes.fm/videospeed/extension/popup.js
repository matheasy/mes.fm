/* MES Video Speed Controller: toolbar popup */
(function () {
  'use strict';
  var V = MESVS, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', speed = 1;

  var PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  $('presets').innerHTML = PRESETS.map(function (p) { return '<button data-s="' + p + '">' + V.fmt(p) + '</button>'; }).join('');

  function saveSettings() { chrome.storage.sync.set({ mesvs: S }); }

  function show(sp) {
    speed = sp;
    $('cur').textContent = V.fmt(sp) + '×';
    $('sl').value = Math.min(4, sp);
    Array.prototype.forEach.call($('presets').children, function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.s) - sp) < 0.001); });
  }

  function send(msg) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, msg, function (r) {
      if (chrome.runtime.lastError || !r) { $('has').hidden = true; $('none').hidden = false; return; }
      $('has').hidden = false; $('none').hidden = true;
      show(r.speed);
    });
  }
  function setSpeed(v) { send({ mesvs: 'set', speed: V.clamp(v) }); }

  $('m').onclick = function () { setSpeed(V.stepSpeed(speed, -1, S.step)); };
  $('p').onclick = function () { setSpeed(V.stepSpeed(speed, 1, S.step)); };
  $('sl').oninput = function () { setSpeed($('sl').value); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.s) setSpeed(e.target.dataset.s); };

  $('remember').onchange = function () { S.remember = $('remember').value; saveSettings(); };
  $('overlay').onchange = function () { S.overlay = $('overlay').value; saveSettings(); };
  $('off').onchange = function () {
    var list = S.disabledSites.filter(function (d) { return d.toLowerCase() !== host; });
    if ($('off').checked && host) list.push(host);
    S.disabledSites = list;
    saveSettings();
    if ($('off').checked) { $('has').hidden = true; $('none').hidden = false; $('nonetext').textContent = 'Turned off on this site.'; }
    else setTimeout(function () { send({ mesvs: 'get' }); }, 250);
  };

  chrome.storage.sync.get('mesvs', function (a) {
    S = V.merge(a && a.mesvs);
    $('remember').value = S.remember;
    $('overlay').value = S.overlay;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname.toLowerCase(); } catch (e) { host = ''; }
      if (host) $('hostname').textContent = host; else $('off').disabled = true;
      $('off').checked = V.matchesSite(host, S.disabledSites);
      if ($('off').checked) { $('none').hidden = false; $('nonetext').textContent = 'Turned off on this site.'; }
      else send({ mesvs: 'get' });
    });
  });
})();
