/* MES Video Speed Controller: toolbar popup */
(function () {
  'use strict';
  var V = MESVS, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', speed = 1;

  var PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  $('presets').innerHTML = PRESETS.map(function (p) { return '<button data-s="' + p + '">' + V.fmt(p) + '</button>'; }).join('');

  function saveSettings() { chrome.storage.sync.set({ mesvs: S }); }
  function cfg() { return V.resolveProfile(S, host).config; }
  function stepFor(action) { var b = V.bindingFor(action, cfg().bindings); return b ? b.value : 0.1; }

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

  $('m').onclick = function () { setSpeed(V.stepSpeed(speed, -1, stepFor('slower'))); };
  $('p').onclick = function () { setSpeed(V.stepSpeed(speed, 1, stepFor('faster'))); };
  $('sl').oninput = function () { setSpeed($('sl').value); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.s) setSpeed(e.target.dataset.s); };

  function drawProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = V.resolveProfile(S, host).id;
  }

  $('profile').onchange = function () {
    if ($('siteprof').checked && host) S.siteProfiles[host] = $('profile').value; else S.active = $('profile').value;
    saveSettings();
  };
  $('siteprof').onchange = function () {
    if ($('siteprof').checked && host) S.siteProfiles[host] = $('profile').value; else delete S.siteProfiles[host];
    saveSettings(); drawProfiles();
  };
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
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname.toLowerCase(); } catch (e) { host = ''; }
      Array.prototype.forEach.call(document.querySelectorAll('.hn'), function (n) { n.textContent = host || 'this site'; });
      if (!host) { $('off').disabled = true; $('siteprof').disabled = true; }
      drawProfiles();
      $('siteprof').checked = !!(host && S.siteProfiles[host]);
      $('off').checked = V.matchesSite(host, S.disabledSites);
      if ($('off').checked) { $('none').hidden = false; $('nonetext').textContent = 'Turned off on this site.'; }
      else send({ mesvs: 'get' });
    });
  });
})();
