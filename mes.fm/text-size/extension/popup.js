/* MES Text Size: toolbar popup */
(function () {
  'use strict';
  var T = MESTS, $ = function (id) { return document.getElementById(id); };
  var S = T.merge(null), host = '', tabId = null, tabLevel = null, reachable = false, timer = 0;
  var PRESETS = [80, 100, 125, 150, 200, 250];

  function level() { return T.effective(S, host, tabLevel); }
  function draw() {
    var l = level(), src = T.sourceOf(S, host, tabLevel);
    $('level').textContent = l + '%'; $('slider').min = S.min; $('slider').max = S.max; $('slider').value = l; $('applyto').value = S.applyTo;
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button data-l="' + p + '"' + (p === l ? ' class="on"' : '') + '>' + p + '%</button>'; }).join('');
    var site = T.levelFor(S, host);
    $('msg').textContent = !reachable ? 'Reload this page to use MES Text Size on it (pages open before the extension was installed or updated need a reload).'
      : src === 'tab' ? 'This tab has its own size' + (site !== l ? ' (the site\'s is ' + site + '%).' : '.')
      : src === 'site' ? 'This site has its own size, in every tab.'
      : S.allLevel !== 100 ? 'Using the all-sites size.' : ' ';
    $('cleartab').hidden = src !== 'tab';
  }
  function sendTab(l, cb) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { mests: 'settab', l: l }, function (r) { void chrome.runtime.lastError; if (cb) cb(r); });
  }
  function setLevel(l) {
    if (!host || !reachable) { draw(); return; }
    l = T.clampLevel(l, S.min, S.max);
    if (S.applyTo === 'tab') { tabLevel = l; draw(); clearTimeout(timer); timer = setTimeout(function () { sendTab(l); }, 60); return; }
    var hadTab = tabLevel != null;
    S = T.withLevel(S, host, l, S.applyTo); tabLevel = null; draw();
    clearTimeout(timer); timer = setTimeout(function () { chrome.storage.sync.set({ mests: S }); if (hadTab) sendTab(null); }, 80);
  }

  $('smaller').onclick = function () { setLevel(T.stepLevel(level(), -1, S.step, S.min, S.max)); };
  $('larger').onclick = function () { setLevel(T.stepLevel(level(), 1, S.step, S.min, S.max)); };
  $('slider').oninput = function () { setLevel(Number($('slider').value)); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.l) setLevel(Number(e.target.dataset.l)); };
  $('reset').onclick = function () { setLevel(100); };
  $('cleartab').onclick = function () { tabLevel = null; sendTab(null); draw(); };
  $('applyto').onchange = function () { S.applyTo = $('applyto').value; chrome.storage.sync.set({ mests: S }); draw(); };

  chrome.storage.sync.get('mests', function (a) {
    S = T.merge(a && a.mests);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      tabId = t ? t.id : null;
      try { host = new URL(t.url).hostname; } catch (e) { host = ''; }
      $('host').textContent = host || 'this tab';
      if (tabId == null) { draw(); return; }
      chrome.tabs.sendMessage(tabId, { mests: 'get' }, { frameId: 0 }, function (r) {
        void chrome.runtime.lastError;
        if (r) { reachable = true; tabLevel = typeof r.tab === 'number' ? r.tab : null; if (r.host) host = r.host; }
        draw();
      });
    });
  });
})();
