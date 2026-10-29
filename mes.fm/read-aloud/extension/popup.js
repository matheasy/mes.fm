/* MES Read Aloud: toolbar popup */
(function () {
  'use strict';
  var R = MESRA, SR = SRLib, $ = function (id) { return document.getElementById(id); };
  var S = R.merge(null), tab = null, host = '', timer = 0;
  var FILES = ['srlib.js', 'shared.js', 'reader.js'];

  function save() { clearTimeout(timer); timer = setTimeout(function () { chrome.storage.sync.set({ mesra: S }); }, 200); }
  function cfg() { return R.resolveProfile(S, host).config; }

  var vlist = [];
  function fillVoices() {
    vlist = speechSynthesis.getVoices();
    MESRAPick.fillVoices($('voice'), vlist, { auto: 'Automatic (best for the text)', value: cfg().voice, textLang: '' });
  }
  MESRAPick.attach($('voice'), { up: false, sample: 'This is how MES Read Aloud sounds with this voice.', voice: function (id) { for (var i = 0; i < vlist.length; i++) if (vlist[i].voiceURI === id) return vlist[i]; return null; } });
  var isDoc = false;
  function openDoc(src) { chrome.tabs.create({ url: chrome.runtime.getURL('doc.html') + (src ? '?src=' + encodeURIComponent(src) : ''), index: tab ? tab.index + 1 : undefined }); window.close(); }
  $('file').onclick = function () { openDoc(''); };
  var DOCS = ['https://docs.google.com/*', 'https://*.googleusercontent.com/*'];
  $('docsAllow').onclick = function () {
    chrome.permissions.request({ origins: DOCS }, function (ok) { $('docs').hidden = !!ok; $('msg').textContent = ok ? 'Google Docs allowed. Press "Read this page".' : 'Not allowed: the extension will read the Doc another way, which may miss parts of long Docs.'; });
  };
  $('extPage').onclick = function () { chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }); window.close(); };
  function fillProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = R.resolveProfile(S, host).id;
  }
  function fillRate() { var r = cfg().rate; $('rate').value = r; $('rateout').textContent = (Math.round(r * 100) / 100) + '×'; }

  async function run(mode) {
    if (!tab) return;
    if (isDoc && mode === 'page') { openDoc(tab.url); return; }
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
      // a PDF or a Word file: read it in the extension's file reader page (the browser's PDF viewer cannot be scripted)
      isDoc = R.isPdfUrl(tab.url) || R.isDocxUrl(tab.url);
      if (!isDoc && /^(https?|file):/.test(tab.url || '')) {
        try { var ct = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: function () { return document.contentType; } }); isDoc = !!(ct && ct[0] && ct[0].result === 'application/pdf'); } catch (e) { /* ignore */ }
      }
      if (isDoc) {
        $('page').textContent = R.isDocxUrl(tab.url) ? 'Read this Word file' : 'Read this PDF';
        if (/^file:/.test(tab.url)) chrome.extension.isAllowedFileSchemeAccess(function (ok) { $('fileoff').hidden = !!ok; });
      }
      if (R.docsId(tab.url)) chrome.permissions.contains({ origins: DOCS }, function (has) { $('docs').hidden = !!has; });
      // is anything selected on the page?
      try {
        var r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: function () { var s = window.getSelection(); return !!(s && !s.isCollapsed && /\S/.test(s.toString())); } });
        $('sel').disabled = !(r && r[0] && r[0].result);
      } catch (e) { $('sel').disabled = true; }
    });
  });
})();
