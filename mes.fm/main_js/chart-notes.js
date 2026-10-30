// Chart notes (annotations) for the private dashboards' day-by-day charts (mes.fm/search-console and mes.fm/ads), like
// Search Console's own: a short note on a day, drawn as a marker on the x axis; hover for the text, click to edit.
// Shared by both pages and stored server-side by /api/chart-notes (behind the same password); on 127.0.0.1 / localhost
// (no /api) or if the API cannot be reached, they are kept in this browser's localStorage (mes-chart-notes) instead.
//   MESNotes.ready            Promise, resolved once the notes are loaded
//   MESNotes.list()           [{ id, d, t, at }] oldest day first
//   MESNotes.on(fn)           fn() after every change (redraw the chart)
//   MESNotes.edit(d, id?)     dialog: add a note on day d, or edit note id
//   MESNotes.manage()         dialog: every note, edit / delete, add one on any day
//   MESNotes.marks(o)         SVG for the markers: o = { days: [date per x], X(i), y0 (plot bottom), y1 (plot top), size? }
//   MESNotes.attach(box)      clicks on a marker inside box open that day's note(s); stops the chart's own handlers
(function () {
  'use strict';
  if (window.MESNotes) return;
  var LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  var LSK = 'mes-chart-notes';
  var NOTES = [], subs = [], useLocal = LOCAL;
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };
  var fmtD = function (s) { try { return new Date(s + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s; } };
  var todayStr = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var sortN = function () { NOTES.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.at < b.at ? -1 : 1); }); };
  var fire = function () { sortN(); subs.forEach(function (f) { try { f(); } catch (e) {} }); };

  function readLocal() { try { var l = JSON.parse(localStorage.getItem(LSK) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function writeLocal() { try { localStorage.setItem(LSK, JSON.stringify(NOTES)); } catch (e) {} }
  function api(body) {
    return fetch('/api/chart-notes', { method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  var ready = (useLocal ? Promise.resolve({ notes: readLocal() }) : api().catch(function () { useLocal = true; return { notes: readLocal() }; }))
    .then(function (j) { NOTES = (j && j.notes) || []; fire(); });

  // one change, server or local; resolves when stored
  function change(body) {
    if (useLocal) {
      var at = new Date().toISOString();
      if (body.op === 'add') NOTES.push({ id: Math.random().toString(16).slice(2, 14), d: body.d, t: body.t, at: at });
      else NOTES = NOTES.map(function (n) { return n.id === body.id ? (body.op === 'delete' ? null : Object.assign({}, n, { d: body.d || n.d, t: body.t != null ? body.t : n.t, at: at })) : n; }).filter(Boolean);
      writeLocal(); fire(); return Promise.resolve();
    }
    return api(body).then(function (j) {
      if (body.op === 'add') NOTES.push(j.note);
      else if (body.op === 'delete') NOTES = NOTES.filter(function (n) { return n.id !== body.id; });
      else NOTES = NOTES.map(function (n) { return n.id === body.id ? j.note : n; });
      fire();
    });
  }

  // ---- styles (own colours for light / dark; the dialog lives on <body>, outside the page's tool area)
  var css = document.createElement('style');
  css.id = 'mcn-css';
  css.textContent =
    ':root{--mcn-c:#c2410c}body.dark-mode{--mcn-c:#fb923c}' +
    '.mcn-mark{cursor:pointer}.mcn-mark:hover circle,.mcn-mark:focus circle{stroke-width:3}' +
    '.mcn-dlg{border:1px solid #c9ced6;border-radius:12px;padding:0;max-width:min(30em,calc(100vw - 24px));width:100%;background:#fff;color:#1f2328;box-shadow:0 12px 40px rgba(0,0,0,.25);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '.mcn-dlg *{color:inherit;box-sizing:border-box}.mcn-dlg::backdrop{background:rgba(0,0,0,.35)}' +
    '.mcn-in{padding:14px 16px 12px}.mcn-dlg h3{margin:0 0 8px;font-size:1.05em}' +
    '.mcn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}' +
    '.mcn-dlg input{font:inherit;padding:7px 9px;border:1px solid #b9c0ca;border-radius:8px;background:#fff;color:#1f2328;min-width:0}' +
    '.mcn-dlg input[type=text]{flex:1 1 14em}.mcn-dlg input[type=date]{flex:0 0 auto}' +
    '.mcn-dlg button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #b9c0ca;background:#f4f6f8;cursor:pointer}' +
    '.mcn-dlg button.mcn-pri{background:#1a73e8;border-color:#1a73e8;color:#fff}.mcn-dlg button.mcn-del{color:#b42318;border-color:#e7b4ae;background:#fff}' +
    '.mcn-dlg .mcn-x{float:right;border:0;background:none;font-size:1.3em;line-height:1;padding:0 4px}' +
    '.mcn-list{list-style:none;margin:6px 0 0;padding:0;max-height:min(50vh,22em);overflow:auto}' +
    '.mcn-list li{display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid #e3e6ea}' +
    '.mcn-list li b{flex:0 0 auto;font-weight:600;font-size:.88em;white-space:nowrap}.mcn-list li span{flex:1 1 auto;overflow-wrap:anywhere}' +
    '.mcn-list li button{padding:2px 8px;font-size:.85em}.mcn-note{font-size:.85em;opacity:.75;margin:6px 0 0}' +
    'body.dark-mode .mcn-dlg{background:#1f2329;color:#e8eaed;border-color:#3c434d}' +
    'body.dark-mode .mcn-dlg input{background:#14171b;color:#e8eaed;border-color:#4a525d;color-scheme:dark}' +
    'body.dark-mode .mcn-dlg button{background:#2a3038;border-color:#4a525d}body.dark-mode .mcn-dlg button.mcn-pri{background:#1a73e8;border-color:#1a73e8;color:#fff}' +
    'body.dark-mode .mcn-dlg button.mcn-del{background:#2a3038;color:#ff9b8f;border-color:#6b3a35}body.dark-mode .mcn-list li{border-color:#3c434d}';
  (document.head || document.documentElement).appendChild(css);

  var dlg = null;
  function dialog(html, init) {
    if (dlg) dlg.remove();
    dlg = document.createElement('dialog');
    dlg.className = 'mcn-dlg';
    dlg.innerHTML = '<div class="mcn-in"><button type="button" class="mcn-x" aria-label="Close" data-close>×</button>' + html + '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    dlg.addEventListener('close', function () { if (dlg) { dlg.remove(); dlg = null; } });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    init(dlg);
  }
  var errMsg = function (box, e) { box.querySelector('.mcn-note').textContent = 'Could not save (' + (e && e.message || e) + ').'; };
  var where = function () { return useLocal ? 'Saved in this browser only (the notes server is not reachable here).' : 'Shared by the Search Console and Ad money charts.'; };

  function edit(d, id) {
    var n = id ? NOTES.filter(function (x) { return x.id === id; })[0] : null;
    d = (n && n.d) || d || todayStr();
    var others = NOTES.filter(function (x) { return x.d === d && (!n || x.id !== n.id); });
    dialog('<h3>' + (n ? 'Edit note' : 'Add a note') + '</h3>' +
      '<form class="mcn-f"><div class="mcn-row"><input type="date" name="d" value="' + esc(d) + '" required aria-label="Day"><input type="text" name="t" maxlength="200" required placeholder="e.g. Argentina campaigns started" value="' + esc(n ? n.t : '') + '" aria-label="Note"></div>' +
      '<div class="mcn-row"><button type="submit" class="mcn-pri">' + (n ? 'Save' : 'Add note') + '</button>' + (n ? '<button type="button" class="mcn-del" data-del>Delete</button>' : '') + '<button type="button" data-close>Cancel</button></div>' +
      (others.length ? '<p class="mcn-note">Also on this day:</p><ul class="mcn-list">' + others.map(function (o) { return '<li><span>' + esc(o.t) + '</span><button type="button" data-ed="' + esc(o.id) + '">Edit</button></li>'; }).join('') + '</ul>' : '') +
      '<p class="mcn-note">' + where() + '</p></form>', function (box) {
      var f = box.querySelector('form');
      setTimeout(function () { f.t.focus(); }, 30);
      f.onsubmit = function (e) {
        e.preventDefault();
        var t = f.t.value.trim(), day = f.d.value;
        if (!t || !day) return;
        (n ? change({ op: 'update', id: n.id, d: day, t: t }) : change({ op: 'add', d: day, t: t })).then(function () { box.close(); }, function (er) { errMsg(box, er); });
      };
      var del = box.querySelector('[data-del]');
      if (del) del.onclick = function () { if (!confirm('Delete this note?')) return; change({ op: 'delete', id: n.id }).then(function () { box.close(); }, function (er) { errMsg(box, er); }); };
      box.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { edit(null, b.dataset.ed); }; });
    });
  }
  function manage() {
    var list = NOTES.slice().reverse();
    dialog('<h3>Chart notes (' + NOTES.length + ')</h3>' +
      '<form class="mcn-f"><div class="mcn-row"><input type="date" name="d" value="' + todayStr() + '" required aria-label="Day"><input type="text" name="t" maxlength="200" required placeholder="New note" aria-label="New note"><button type="submit" class="mcn-pri">Add</button></div></form>' +
      (list.length ? '<ul class="mcn-list">' + list.map(function (o) {
        return '<li><b>' + esc(fmtD(o.d)) + '</b><span>' + esc(o.t) + '</span><button type="button" data-ed="' + esc(o.id) + '">Edit</button><button type="button" class="mcn-del" data-rm="' + esc(o.id) + '" aria-label="Delete">×</button></li>';
      }).join('') + '</ul>' : '<p class="mcn-note">No notes yet. Right-click (or long-press) a day on the chart, or use “+ Note” beside the day’s numbers.</p>') +
      '<p class="mcn-note">' + where() + '</p>', function (box) {
      var f = box.querySelector('form');
      f.onsubmit = function (e) { e.preventDefault(); var t = f.t.value.trim(); if (!t || !f.d.value) return; change({ op: 'add', d: f.d.value, t: t }).then(manage, function (er) { errMsg(box, er); }); };
      box.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { edit(null, b.dataset.ed); }; });
      box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { if (!confirm('Delete this note?')) return; change({ op: 'delete', id: b.dataset.rm }).then(manage, function (er) { errMsg(box, er); }); }; });
    });
  }

  // markers: a dashed line up the plot and a numbered dot on the x axis; <title> = the tooltip
  function marks(o) {
    var by = {};
    NOTES.forEach(function (n) { (by[n.d] || (by[n.d] = [])).push(n); });
    var out = '', r = o.size || 7;
    (o.days || []).forEach(function (d, i) {
      var ns = by[d]; if (!ns) return;
      var x = o.X(i).toFixed(1);
      var tip = fmtD(d) + '\n' + ns.map(function (n) { return '• ' + n.t; }).join('\n');
      out += '<g class="mcn-mark" data-nd="' + esc(d) + '" tabindex="0" role="button" aria-label="' + esc('Note: ' + tip) + '"><title>' + esc(tip) + '</title>' +
        '<line x1="' + x + '" x2="' + x + '" y1="' + o.y1 + '" y2="' + o.y0 + '" style="stroke:var(--mcn-c)" stroke-width="1.2" stroke-dasharray="2 3" stroke-opacity=".7"/>' +
        '<circle cx="' + x + '" cy="' + o.y0 + '" r="' + r + '" style="fill:var(--mcn-c);stroke:var(--mcn-bg,#fff)" stroke-width="2"/>' +
        '<text x="' + x + '" y="' + (o.y0 + 3.6) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" style="pointer-events:none">' + (ns.length > 1 ? ns.length : '✎') + '</text></g>';
    });
    return out;
  }
  function openDay(d) { var ns = NOTES.filter(function (n) { return n.d === d; }); if (ns.length) edit(null, ns[0].id); else edit(d); }
  function attach(box) {
    if (box.__mcn) return; box.__mcn = 1;
    var hit = function (e) { var m = e.target.closest && e.target.closest('.mcn-mark'); return m && box.contains(m) ? m : null; };
    box.addEventListener('pointerdown', function (e) { if (hit(e)) e.stopPropagation(); }, true);
    box.addEventListener('click', function (e) { var m = hit(e); if (m) { e.stopPropagation(); e.preventDefault(); openDay(m.dataset.nd); } }, true);
    box.addEventListener('keydown', function (e) { var m = hit(e); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); openDay(m.dataset.nd); } }, true);
  }

  window.MESNotes = {
    ready: ready,
    list: function () { return NOTES.slice(); },
    on: function (fn) { subs.push(fn); },
    edit: edit, manage: manage, marks: marks, attach: attach,
    isLocal: function () { return useLocal; },
  };
})();
