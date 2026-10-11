/* MES Read Aloud: toolbar popup */
(function () {
  'use strict';
  var R = MESRA, SR = SRLib, $ = function (id) { return document.getElementById(id); };
  var S = R.merge(null), tab = null, host = '', timer = 0;
  var FILES = ['srlib.js', 'shared.js', 'reader.js'];

  function save() { clearTimeout(timer); timer = setTimeout(function () { chrome.storage.sync.set({ mesra: S }); }, 200); }
  function cfg() { return R.resolveProfile(S, host).config; }

  function fillVoices() {
    var vs = speechSynthesis.getVoices(), c = cfg();
    vs = vs.slice().sort(function (a, b) { return SR.voiceScore(b, '', navigator.language) - SR.voiceScore(a, '', navigator.language); });
    $('voice').innerHTML = '';
    var auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Automatic (best for the text)'; $('voice').appendChild(auto);
    vs.forEach(function (v) { var o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')'; $('voice').appendChild(o); });
    $('voice').value = c.voice;
  }
  function fillProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = R.resolveProfile(S, host).id;
  }
  function fillRate() { var r = cfg().rate; $('rate').value = r; $('rateout').textContent = (Math.round(r * 100) / 100) + '×'; }

  async function run(mode) {
    if (!tab) return;
    try {
      try { await chrome.tabs.sendMessage(tab.id, { mesra: 'ping' }); }
      catch (e) { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES }); }
      await chrome.tabs.sendMessage(tab.id, { mesra: 'read', mode: mode });
      window.close();
    } catch (e) { $('msg').textContent = 'The browser does not let extensions read this page (for example browser pages and the Web Store).'; }
  }
  $('page').onclick = function () { run('page'); };
  $('sel').onclick = function () { run('selection'); };

  $('profile').onchange = function () {
    if ($('siteprof').checked && host) S.siteProfiles[host] = $('profile').value; else S.active = $('profile').value;
    save(); fillVoices(); fillRate();
  };
  $('siteprof').onchange = function () {
    if ($('siteprof').checked && host) S.siteProfiles[host] = $('profile').value; else delete S.siteProfiles[host];
    save(); fillProfiles();
  };
  $('voice').onchange = function () { cfg().voice = $('voice').value; save(); };
  $('rate').oninput = function () { cfg().rate = Number($('rate').value); $('rateout').textContent = cfg().rate + '×'; save(); };

  chrome.storage.sync.get('mesra', function (a) {
    S = R.merge(a && a.mesra);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname.toLowerCase(); } catch (e) { host = ''; }
      Array.prototype.forEach.call(document.querySelectorAll('.hn'), function (n) { n.textContent = host || 'this site'; });
      if (!host) $('siteprof').disabled = true;
      fillProfiles(); fillVoices(); fillRate();
      speechSynthesis.addEventListener('voiceschanged', fillVoices);
      $('siteprof').checked = !!(host && S.siteProfiles[host]);
      // is anything selected on the page?
      try {
        var r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: function () { var s = window.getSelection(); return !!(s && !s.isCollapsed && /\S/.test(s.toString())); } });
        $('sel').disabled = !(r && r[0] && r[0].result);
      } catch (e) { $('sel').disabled = true; }
    });
  });
})();
