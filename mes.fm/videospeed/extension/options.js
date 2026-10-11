/* MES Video Speed Controller: settings page (setups = profiles, shortcut table, preferences) */
(function () {
  'use strict';
  var V = MESVS, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), cur = 'default', timer = 0;

  function prof() { return V.profileById(S, cur); }
  function cfg() { return prof().config; }

  function save() {
    chrome.storage.sync.set({ mesvs: S }, function () {
      var m = chrome.runtime.lastError ? 'Not saved: ' + chrome.runtime.lastError.message : 'Saved';
      $('saved').textContent = m;
      clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 2200);
    });
  }

  function pretty(k) {
    if (!k) return '';
    if (k === 'space') return 'Space';
    var m = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓' };
    return m[k] || (k.length === 1 ? k.toUpperCase() : k);
  }

  function drawProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) {
      var o = document.createElement('option'); o.value = p.id;
      o.textContent = p.name + (p.id === S.active ? '  (in use)' : '');
      $('profile').appendChild(o);
    });
    $('profile').value = cur;
    $('del').disabled = S.profiles.length < 2;
  }

  function drawRows() {
    var box = $('rows'); box.innerHTML = '';
    cfg().bindings.forEach(function (bd, i) {
      var row = document.createElement('div'); row.className = 'row';
      var sel = document.createElement('select');
      V.ACTIONS.forEach(function (a) { var o = document.createElement('option'); o.value = a.id; o.textContent = a.label; sel.appendChild(o); });
      sel.value = bd.action;
      sel.addEventListener('change', function () {
        bd.action = sel.value;
        var a = V.ACT[bd.action];
        if (a.value) bd.value = a.def; else delete bd.value;
        drawRows(); save();
      });
      var key = document.createElement('input'); key.type = 'text'; key.readOnly = true; key.className = 'key'; key.value = pretty(bd.key); key.placeholder = 'key';
      key.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') return;
        e.preventDefault();
        if (e.key === 'Backspace' || e.key === 'Delete') bd.key = '';
        else {
          var n = V.keyName(e); if (!n) return;
          cfg().bindings.forEach(function (o) { if (o !== bd && o.key === n) o.key = ''; });   // one key, one job
          bd.key = n;
        }
        drawRows(); save();
      });
      row.appendChild(sel); row.appendChild(key);
      var spec = V.ACT[bd.action];
      if (spec.value) {
        var num = document.createElement('input'); num.type = 'number'; num.title = spec.value;
        num.min = spec.min; num.max = spec.max; num.step = spec.step; num.value = bd.value;
        num.addEventListener('change', function () { var v = Number(num.value); bd.value = isFinite(v) && v > 0 ? Math.min(spec.max, Math.max(spec.min, v)) : spec.def; num.value = bd.value; save(); });
        row.appendChild(num);
      }
      var x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove this shortcut'; x.setAttribute('aria-label', 'Remove this shortcut');
      x.addEventListener('click', function () { cfg().bindings.splice(i, 1); drawRows(); save(); });
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function drawPrefs() {
    var c = cfg();
    ['audio', 'hideByDefault', 'exclusive', 'force'].forEach(function (k) { $(k).checked = c[k]; });
    ['remember', 'overlay', 'opacity', 'holdSpeed'].forEach(function (k) { $(k).value = c[k]; });
  }

  function drawSites() {
    var box = $('sitemap'); box.innerHTML = '';
    var hosts = Object.keys(S.siteProfiles);
    if (!hosts.length) { box.innerHTML = '<p class="hint">None yet. Pick a setup in the toolbar popup and tick "Always use this setup on this site".</p>'; }
    hosts.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'sm';
      d.appendChild(document.createTextNode(h + ' → ' + V.profileById(S, S.siteProfiles[h]).name + ' '));
      var b = document.createElement('button'); b.textContent = 'Remove';
      b.addEventListener('click', function () { delete S.siteProfiles[h]; drawSites(); save(); });
      d.appendChild(b); box.appendChild(d);
    });
    $('sites').value = S.disabledSites.join('\n');
  }

  function draw() { drawProfiles(); drawRows(); drawPrefs(); drawSites(); }

  // ---- setups
  $('profile').addEventListener('change', function () {
    cur = $('profile').value; S.active = cur; draw(); save();
  });
  function add(name, config) {
    if (S.profiles.length >= 30) { alert('That is plenty of setups (30). Delete one first.'); return; }
    var p = { id: V.uid(), name: name, config: V.normConfig(config) };
    S.profiles.push(p); cur = p.id; S.active = p.id; draw(); save();
  }
  $('new').addEventListener('click', function () { var n = prompt('Name for the new setup (it starts as a copy of the standard one):', 'My setup'); if (n) add(n.slice(0, 40), V.defaultConfig()); });
  $('dup').addEventListener('click', function () { add((prof().name + ' copy').slice(0, 40), JSON.parse(JSON.stringify(cfg()))); });
  $('ren').addEventListener('click', function () { var n = prompt('New name:', prof().name); if (n) { prof().name = n.slice(0, 40); draw(); save(); } });
  $('del').addEventListener('click', function () {
    if (S.profiles.length < 2 || !confirm('Delete the setup "' + prof().name + '"?')) return;
    S.profiles = S.profiles.filter(function (p) { return p.id !== cur; });
    for (var h in S.siteProfiles) if (S.siteProfiles[h] === cur) delete S.siteProfiles[h];
    cur = S.profiles[0].id; if (!S.profiles.some(function (p) { return p.id === S.active; })) S.active = cur;
    draw(); save();
  });
  $('exp').addEventListener('click', function () {
    var text = JSON.stringify({ mesvsSetup: 1, name: prof().name, config: cfg() });
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { $('saved').textContent = 'Copied to the clipboard'; }, function () { prompt('Copy this text:', text); });
  });
  $('imp').addEventListener('click', function () {
    var t = prompt('Paste a setup that was exported from this extension:');
    if (!t) return;
    try { var o = JSON.parse(t); if (!o || !o.config) throw 0; add(String(o.name || 'Imported setup').slice(0, 40), o.config); }
    catch (e) { alert('That does not look like an exported setup.'); }
  });
  $('factory').addEventListener('click', function () {
    V.builtins().forEach(function (b) {
      var have = S.profiles.filter(function (p) { return p.id === b.id; })[0];
      if (have) { have.name = b.name; have.config = b.config; } else S.profiles.push(b);
    });
    draw(); save();
  });

  // ---- shortcuts and preferences
  $('add').addEventListener('click', function () { cfg().bindings.push({ action: 'faster', key: '', value: 0.1 }); drawRows(); save(); });
  ['audio', 'hideByDefault', 'exclusive', 'force'].forEach(function (k) { $(k).addEventListener('change', function () { cfg()[k] = $(k).checked; save(); }); });
  ['remember', 'overlay'].forEach(function (k) { $(k).addEventListener('change', function () { cfg()[k] = $(k).value; save(); }); });
  $('opacity').addEventListener('input', function () { cfg().opacity = Number($('opacity').value); save(); });
  $('holdSpeed').addEventListener('change', function () { cfg().holdSpeed = V.clamp($('holdSpeed').value); $('holdSpeed').value = cfg().holdSpeed; save(); });
  $('sites').addEventListener('change', function () {
    S.disabledSites = $('sites').value.split(/\s+/).map(function (s) { return s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); }).filter(Boolean);
    save();
  });

  chrome.storage.sync.get('mesvs', function (a) {
    var had = !!(a && a.mesvs);
    S = V.merge(a && a.mesvs); cur = S.active;
    draw();
    if (!had) save();   // store the two built-in setups the first time
  });
})();
