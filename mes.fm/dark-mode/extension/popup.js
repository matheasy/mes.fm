/* MES Dark Mode: toolbar popup */
(function () {
  'use strict';
  var V = MESDM, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', timer = 0, forTab = new URLSearchParams(location.search).get('tab');   // ?tab= when opened from the right-click menu in a window of its own

  function cfg() { return V.profileById(S, S.active).config; }
  function save() { clearTimeout(timer); timer = setTimeout(function () { try { chrome.storage.local.set({ mesdm: S }); } catch (e) { /* ignore */ } chrome.storage.sync.set({ mesdm: S }, function () { setTimeout(status, 250); }); }, 150); }

  function seg(id, value) { Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle('on', b.dataset.m === value); }); }
  function draw() {
    var c = cfg();
    $('enabled').checked = S.enabled;
    seg('site', host ? V.siteMode(S, host) : ''); seg('mode', c.mode);
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('profile').appendChild(o); });
    $('profile').value = S.active;
    ['brightness', 'contrast', 'sepia'].forEach(function (k) { $(k).value = c[k]; $(k + 'out').textContent = c[k] + '%'; });
  }

  function status() {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { mesdm: 'status' }, { frameId: 0 }, function (r) {
      var el = $('status');
      if (chrome.runtime.lastError || !r) { el.textContent = 'Not available on this page (browser pages are off limits).'; return; }
      if (r.off) el.textContent = 'Off on this site.';
      else if (r.want == null) el.textContent = 'Nothing is changed on this page. Press the toolbar button (or Alt+Shift+D) to switch this tab only.';
      else if (r.invert) el.textContent = r.want ? 'Dark mode is on for this page.' : 'Light mode is on for this page.';
      else el.textContent = r.want ? 'This page is already dark, so it is left alone.' : 'This page is already light, so it is left alone.';
    });
  }

  $('toolbar').onchange = function () { S.toolbar = $('toolbar').value; save(); };
  $('enabled').onchange = function () { S.enabled = $('enabled').checked; save(); };
  $('site').onclick = function (e) {
    if (!e.target.dataset || e.target.dataset.m === undefined || !host) return;
    var m = JSON.parse(JSON.stringify(S.siteModes)); if (e.target.dataset.m) m[host] = e.target.dataset.m; else delete m[host];
    S.siteModes = m; draw(); save();
  };
  $('mode').onclick = function (e) { if (e.target.dataset && e.target.dataset.m) { cfg().mode = e.target.dataset.m; draw(); save(); } };
  $('profile').onchange = function () { S.active = $('profile').value; draw(); save(); };
  ['brightness', 'contrast', 'sepia'].forEach(function (k) { $(k).oninput = function () { cfg()[k] = Number($(k).value); $(k + 'out').textContent = $(k).value + '%'; save(); }; });

  chrome.storage.sync.get('mesdm', function (a) {
    S = V.merge(a && a.mesdm);
    var got = function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname.toLowerCase(); } catch (e) { host = ''; }
      $('toolbar').value = S.toolbar; draw(); status();
    };
    if (forTab) chrome.tabs.get(Number(forTab), function (t) { got(t ? [t] : []); }); else chrome.tabs.query({ active: true, currentWindow: true }, got);
  });
})();
