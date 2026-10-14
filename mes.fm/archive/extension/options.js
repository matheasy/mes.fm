(function () {
  var A = MESArchive, X = MESARX, $ = function (id) { return document.getElementById(id); }, S = X.normalise({});
  function save() { chrome.storage.sync.set({ sel: S.sel, custom: S.custom, vars: S.vars, strip: S.strip, background: S.background }, function () { $('msg').textContent = 'Saved.'; setTimeout(function () { $('msg').textContent = ''; }, 1200); }); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function draw() {
    var eng = X.allEngines(S), h = '';
    A.GROUPS.concat(S.custom.length ? [['custom', 'Your own sites', '']] : []).forEach(function (g) { var l = eng.filter(function (e) { return e.g === g[0]; }); if (!l.length) return; h += '<div class="g">' + esc(g[1]) + '</div>'; l.forEach(function (e) { h += '<label><input type="checkbox" data-id="' + esc(e.id) + '"' + (S.sel.indexOf(e.id) >= 0 ? ' checked' : '') + '> <span>' + esc(e.name) + (e.needs ? ' <small>(needs ' + esc(e.needs) + ')</small>' : '') + '</span>' + (e.variants ? '<select data-var="' + esc(e.id) + '">' + e.variants.map(function (v) { return '<option value="' + v.v + '"' + ((S.vars[e.id] || e.variants[0].v) === v.v ? ' selected' : '') + '>' + esc(v.label) + '</option>'; }).join('') + '</select>' : '') + '</label>'; }); });
    $('list').innerHTML = h; $('clist').innerHTML = S.custom.map(function (c) { return '<div class="c"><span><b>' + esc(c.name) + '</b><br>' + esc(c.tpl) + '</span><button data-del="' + esc(c.id) + '">Remove</button></div>'; }).join('');
    $('strip').checked = S.strip; $('bg').checked = S.background;
  }
  $('list').addEventListener('change', function (e) { var c = e.target.closest('input[data-id]'); if (c) { var id = c.getAttribute('data-id'), i = S.sel.indexOf(id); if (c.checked && i < 0) S.sel.push(id); else if (!c.checked && i >= 0) S.sel.splice(i, 1); save(); return; } var v = e.target.closest('select[data-var]'); if (v) { S.vars[v.getAttribute('data-var')] = v.value; save(); } });
  $('strip').onchange = function () { S.strip = this.checked; save(); }; $('bg').onchange = function () { S.background = this.checked; save(); };
  $('ca').onclick = function () { var n = $('cn').value.trim(), t = $('ct').value.trim(); if (!n || !A.validTemplate(t)) { $('msg').textContent = 'Enter a name and an address that starts with http(s):// and contains %s'; return; } var id = 'c' + Date.now().toString(36); S.custom.push({ id: id, name: n, tpl: t }); S.sel.push(id); $('cn').value = ''; $('ct').value = ''; save(); draw(); };
  $('clist').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var id = b.getAttribute('data-del'); S.custom = S.custom.filter(function (c) { return c.id !== id; }); S.sel = S.sel.filter(function (x) { return x !== id; }); save(); draw(); });
  chrome.storage.sync.get(null, function (raw) { S = X.normalise(raw); draw(); });
})();
