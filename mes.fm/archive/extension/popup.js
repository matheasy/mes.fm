/* MES Archive popup: shows the current page, the ticked archive sites, and opens them. */
(function () {
  var A = MESArchive, X = MESARX, $ = function (id) { return document.getElementById(id); }, S = X.normalise({}), page = '';
  function save() { chrome.storage.sync.set({ sel: S.sel, custom: S.custom, vars: S.vars, strip: S.strip, background: S.background }); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function draw() {
    var eng = X.allEngines(S), h = '', groups = A.GROUPS.concat(S.custom.length ? [['custom', 'Your own sites', '']] : []);
    groups.forEach(function (g) {
      var l = eng.filter(function (e) { return e.g === g[0]; }); if (!l.length) return; h += '<div class="g">' + esc(g[1]) + '</div>';
      l.forEach(function (e) { h += '<label class="e"><input type="checkbox" data-id="' + esc(e.id) + '"' + (S.sel.indexOf(e.id) >= 0 ? ' checked' : '') + '> <span>' + esc(e.name) + (e.needs ? ' <small>(needs ' + esc(e.needs) + ')</small>' : '') + '</span>' + (e.variants ? '<select data-var="' + esc(e.id) + '">' + e.variants.map(function (v) { return '<option value="' + v.v + '"' + ((S.vars[e.id] || e.variants[0].v) === v.v ? ' selected' : '') + '>' + esc(v.label) + '</option>'; }).join('') + '</select>' : '') + '</label>'; });
    });
    $('list').innerHTML = h;
    $('sets').innerHTML = A.SETS.map(function (s) { return '<button data-set="' + s[0] + '" class="' + (s[2].length === S.sel.length && s[2].every(function (x) { return S.sel.indexOf(x) >= 0; }) ? 'on' : '') + '">' + esc(s[1]) + '</button>'; }).join('');
    var n = X.targets(S, page).length; $('go').disabled = !n; $('go').textContent = n ? 'Archive on ' + n + ' site' + (n === 1 ? '' : 's') : (page ? 'Tick at least one site' : 'Archive this page');
  }
  $('list').addEventListener('change', function (e) { var c = e.target.closest('input[data-id]'); if (c) { var id = c.getAttribute('data-id'), i = S.sel.indexOf(id); if (c.checked && i < 0) S.sel.push(id); else if (!c.checked && i >= 0) S.sel.splice(i, 1); save(); draw(); return; } var v = e.target.closest('select[data-var]'); if (v) { S.vars[v.getAttribute('data-var')] = v.value; save(); } });
  $('sets').addEventListener('click', function (e) { var b = e.target.closest('[data-set]'); if (!b) return; A.SETS.forEach(function (s) { if (s[0] === b.getAttribute('data-set')) S.sel = s[2].slice(); }); save(); draw(); });
  $('go').onclick = function () { var t = X.targets(S, page); t.forEach(function (x, i) { chrome.tabs.create({ url: x.url, active: !S.background && i === 0 }); }); window.close(); };
  chrome.storage.sync.get(null, function (raw) {
    S = X.normalise(raw);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      page = tabs && tabs[0] && tabs[0].url || ''; var clean = A.cleanUrl(page, S.strip), p = $('page');
      if (clean) { p.textContent = clean; p.title = clean; } else { p.className = 'page bad'; p.textContent = 'This page cannot be archived (only http and https addresses). Open a website first.'; page = ''; }
      draw();
    });
  });
})();
