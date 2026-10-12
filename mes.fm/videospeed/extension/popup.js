/* MES Video Speed Controller: toolbar popup */
(function () {
  'use strict';
  var V = MESVS, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', speed = 1, holding = false;

  var PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  $('presets').innerHTML = PRESETS.map(function (p) { return '<button data-s="' + p + '">' + V.fmt(p) + '</button>'; }).join('');

  function saveSettings() { chrome.storage.sync.set({ mesvs: S }); }
  function cfg() { return V.resolveProfile(S, host).config; }
  function stepFor(action) { var b = V.bindingFor(action, cfg().bindings); return b ? b.value : 0.1; }

  function show(sp) {
    speed = sp;
    $('cur').textContent = V.fmt2(sp) + '×';
    $('sl').value = Math.min(4, sp);
    Array.prototype.forEach.call($('presets').children, function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.s) - sp) < 0.001); });
  }

  function send(msg) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, msg, function (r) {
      if (chrome.runtime.lastError || !r) { $('has').hidden = true; $('none').hidden = false; return; }
      $('has').hidden = false; $('none').hidden = true;
      if (!holding) show(r.speed);
      if (typeof r.hidden === 'boolean') $('showui').checked = !r.hidden;
    });
  }
  function setSpeed(v) { speed = V.clamp(v); show(speed); send({ mesvs: 'set', speed: speed }); }

  // a press steps once; holding repeats and keeps getting faster (every repeat comes 15% sooner, down to 60 ms)
  function repeater(btn, dir, action) {
    var t = 0, iv = 200, on = false;
    function act() { setSpeed(V.stepSpeed(speed, dir, stepFor(action))); }
    function stop() { clearTimeout(t); if (on) { on = false; holding = false; send({ mesvs: 'get' }); } }
    btn.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      act(); iv = 200; on = true; holding = true;
      t = setTimeout(function loop() { if (!on) return; act(); iv = Math.max(60, iv * 0.85); t = setTimeout(loop, iv); }, 380);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, stop); });
    btn.addEventListener('click', function (e) { if (e.detail === 0) act(); });
  }
  repeater($('m'), -1, 'slower');
  repeater($('p'), 1, 'faster');
  $('showui').onchange = function () { send({ mesvs: 'ui', show: $('showui').checked }); };
  $('hidedef').onchange = function () {
    var id = V.resolveProfile(S, host).id, pr = S.profiles.filter(function (x) { return x.id === id; })[0];
    if (pr) { pr.config.hideByDefault = $('hidedef').checked; saveSettings(); }
  };
  $('sl').oninput = function () { setSpeed($('sl').value); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.s) setSpeed(e.target.dataset.s); };

  function drawProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = V.resolveProfile(S, host).id;
  }

  $('profile').onchange = function () {
    if ($('siteprof').checked && host) S.siteProfiles[host] = $('profile').value; else S.active = $('profile').value;
    saveSettings(); $('hidedef').checked = !!cfg().hideByDefault;
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
      $('hidedef').checked = !!cfg().hideByDefault;
      $('siteprof').checked = !!(host && S.siteProfiles[host]);
      $('off').checked = V.matchesSite(host, S.disabledSites);
      if ($('off').checked) { $('none').hidden = false; $('nonetext').textContent = 'Turned off on this site.'; }
      else send({ mesvs: 'get' });
    });
  });
})();
