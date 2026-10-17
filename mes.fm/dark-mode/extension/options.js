/* MES Dark Mode: settings page */
(function () {
  'use strict';
  var V = MESDM, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), cur = 'default', timer = 0;

  function prof() { return V.profileById(S, cur); }
  function cfg() { return prof().config; }
  function save() {
    try { chrome.storage.local.set({ mesdm: S }); } catch (e) { /* ignore */ }
    chrome.storage.sync.set({ mesdm: S }, function () {
      $('saved').textContent = chrome.runtime.lastError ? 'Not saved' : 'Saved';
      clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 2000);
    });
  }

  var RANGES = ['brightness', 'contrast', 'sepia', 'grayscale'];
  function drawProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.id === S.active ? '  (in use)' : ''); $('profile').appendChild(o); });
    $('profile').value = cur; $('del').disabled = S.profiles.length < 2;
  }
  function drawFields() {
    var c = cfg();
    RANGES.forEach(function (k) { $(k).value = c[k]; $(k + 'out').textContent = c[k] + '%'; });
    $('mode').value = c.mode; $('scheduleFrom').value = c.scheduleFrom; $('scheduleTo').value = c.scheduleTo; $('keepImages').checked = c.keepImages;
    $('schedrow').style.display = c.mode === 'schedule' ? '' : 'none';
  }
  function drawSites() {
    var box = $('sitemap'); box.innerHTML = '';
    var hosts = Object.keys(S.siteModes);
    if (!hosts.length) box.innerHTML = '<p class="hint">None yet.</p>';
    hosts.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'sm';
      d.appendChild(document.createTextNode(h + ': ' + S.siteModes[h] + ' '));
      var b = document.createElement('button'); b.textContent = 'Remove';
      b.onclick = function () { delete S.siteModes[h]; drawSites(); save(); };
      d.appendChild(b); box.appendChild(d);
    });
  }
  function draw() { drawProfiles(); drawFields(); drawSites(); }

  RANGES.forEach(function (k) { $(k).addEventListener('input', function () { cfg()[k] = Number($(k).value); $(k + 'out').textContent = $(k).value + '%'; save(); }); });
  $('mode').addEventListener('change', function () { cfg().mode = $('mode').value; drawFields(); save(); });
  ['scheduleFrom', 'scheduleTo'].forEach(function (k) { $(k).addEventListener('change', function () { if ($(k).value) { cfg()[k] = $(k).value; save(); } }); });
  $('toolbar').addEventListener('change', function () { S.toolbar = $('toolbar').value; save(); });
  $('keepImages').addEventListener('change', function () { cfg().keepImages = $('keepImages').checked; save(); });

  $('profile').addEventListener('change', function () { cur = $('profile').value; S.active = cur; draw(); save(); });
  function add(name, config) {
    if (S.profiles.length >= 30) { alert('That is plenty of setups (30). Delete one first.'); return; }
    var p = { id: V.uid(), name: name, config: V.normConfig(config) };
    S.profiles.push(p); cur = p.id; S.active = p.id; draw(); save();
  }
  $('new').onclick = function () { var n = prompt('Name for the new setup (it starts as a copy of the standard one):', 'My setup'); if (n) add(n.slice(0, 40), V.defaultConfig()); };
  $('dup').onclick = function () { add((prof().name + ' copy').slice(0, 40), JSON.parse(JSON.stringify(cfg()))); };
  $('ren').onclick = function () { var n = prompt('New name:', prof().name); if (n) { prof().name = n.slice(0, 40); draw(); save(); } };
  $('del').onclick = function () {
    if (S.profiles.length < 2 || !confirm('Delete the setup "' + prof().name + '"?')) return;
    S.profiles = S.profiles.filter(function (p) { return p.id !== cur; });
    cur = S.profiles[0].id; if (!S.profiles.some(function (p) { return p.id === S.active; })) S.active = cur;
    draw(); save();
  };
  $('exp').onclick = function () {
    var text = JSON.stringify({ mesdmSetup: 1, name: prof().name, config: cfg() });
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { $('saved').textContent = 'Copied'; }, function () { prompt('Copy this text:', text); });
  };
  $('imp').onclick = function () {
    var t = prompt('Paste a setup exported from this extension:'); if (!t) return;
    try { var o = JSON.parse(t); if (!o || !o.config) throw 0; add(String(o.name || 'Imported setup').slice(0, 40), o.config); } catch (e) { alert('That does not look like an exported setup.'); }
  };
  $('factory').onclick = function () {
    V.builtins().forEach(function (b) {
      var have = S.profiles.filter(function (p) { return p.id === b.id; })[0];
      if (have) { have.name = b.name; have.config = b.config; } else S.profiles.push(b);
    });
    draw(); save();
  };

  chrome.storage.sync.get('mesdm', function (a) {
    var had = !!(a && a.mesdm);
    S = V.merge(a && a.mesdm); cur = S.active; $('toolbar').value = S.toolbar; draw();
    if (!had) save();
  });
})();
