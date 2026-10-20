/* MES Dark Mode: toolbar popup (also opened in a small window from the button's right-click menu, with ?tab=) */
(function () {
  'use strict';
  var V = MESDM, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', timer = 0, mine = 0, last = null, forTab = new URLSearchParams(location.search).get('tab');

  function cfg() { return V.profileById(S, S.active).config; }
  function save() { mine = Date.now(); clearTimeout(timer); timer = setTimeout(function () { try { chrome.storage.local.set({ mesdm: S }); } catch (e) { /* ignore */ } chrome.storage.sync.set({ mesdm: S }, function () { void chrome.runtime.lastError; setTimeout(status, 250); }); }, 150); }

  function seg(id, value) { Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle('on', b.dataset.m === value); }); }
  function draw() {
    var c = cfg();
    $('enabled').checked = S.enabled;
    $('host').textContent = host || 'this site';
    seg('site', host ? V.siteMode(S, host) : ''); seg('mode', c.mode);
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = S.active;
    ['brightness', 'contrast', 'sepia'].forEach(function (k) { $(k).value = c[k]; $(k + 'out').textContent = c[k] + '%'; });
  }

  // the first line says what this tab is doing and why
  function status() {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { mesdm: 'status' }, { frameId: 0 }, function (r) {
      var ok = !chrome.runtime.lastError && r;
      last = ok ? r : null;
      if (ok && r.host && r.host !== host) { host = r.host; draw(); }
      var e = V.explain(last), b = $('flip');
      $('status').textContent = ok ? e.text : 'Nothing is running on this page yet. Press the button below to switch it (browser pages and the Web Store cannot be changed).';
      b.disabled = false;
      b.textContent = ok && r.scope === 'all' ? (r.want === true ? 'Every page back to normal' : 'Make every page dark') : ok && r.on ? 'Switch this tab back' : 'Make this tab dark';
    });
  }

  $('flip').onclick = function () {
    if (!tab) return;
    $('flip').disabled = true;
    chrome.runtime.sendMessage({ mesdm: 'flip', tabId: tab.id }, function (r) {
      void chrome.runtime.lastError;
      if (r && r.ok === false) $('status').textContent = 'MES Dark Mode cannot change this page.';
      setTimeout(status, 350);
    });
  };
  $('toolbar').onchange = function () { S.toolbar = $('toolbar').value; save(); };
  $('enabled').onchange = function () { S.enabled = $('enabled').checked; save(); };
  $('site').onclick = function (e) {
    if (!e.target.dataset || e.target.dataset.m === undefined || !host) return;
    var m = JSON.parse(JSON.stringify(S.siteModes)), k = V.siteKey(S, host);
    if (e.target.dataset.m) m[host] = e.target.dataset.m; else { delete m[host]; if (k) delete m[k]; }   // Auto also removes a wider entry (example.com for www.example.com) that would still apply
    S.siteModes = m; draw(); save();
  };
  $('mode').onclick = function (e) { if (e.target.dataset && e.target.dataset.m) { cfg().mode = e.target.dataset.m; draw(); save(); } };
  $('profile').onchange = function () { S.active = $('profile').value; draw(); save(); };
  ['brightness', 'contrast', 'sepia'].forEach(function (k) { $(k).oninput = function () { cfg()[k] = Number($(k).value); $(k + 'out').textContent = $(k).value + '%'; save(); }; });

  V.loadStored(chrome, function (stored) {
    S = V.merge(stored);
    var got = function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname.toLowerCase(); } catch (e) { host = ''; }
      $('toolbar').value = S.toolbar; draw(); status();
    };
    if (forTab) chrome.tabs.get(Number(forTab), function (t) { void chrome.runtime.lastError; got(t ? [t] : []); }); else chrome.tabs.query({ active: true, currentWindow: true }, got);
  });
  chrome.storage.onChanged.addListener(function (ch, area) {   // changed elsewhere (the shortcut with "All pages", the settings page): show it; our own saves are already shown
    if ((area !== 'sync' && area !== 'local') || !ch.mesdm) return;
    if (Date.now() - mine > 1500) { S = V.merge(ch.mesdm.newValue); draw(); }
    setTimeout(status, 150);
  });
})();
