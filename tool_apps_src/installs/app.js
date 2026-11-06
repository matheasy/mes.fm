// MES App Installs (public, mes.fm/installs): installs of the MES apps on iPhone and Android.
// Data = /api/installs (App Store Connect + Google Play, see mes.fm/api/installs.js), summed here with MESInst (lib.js).
// On 127.0.0.1 / localhost (no /api there) or with ?mock=1 the page shows the made-up /installs/data/sample.json.
(function () {
  'use strict';
  var I = window.MESInst;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };
  var int = function (v) { return v == null ? '–' : Math.round(v).toLocaleString(); };
  var MOCK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
  var ST = { r: '30d', app: '', plat: '', split: 'plat' };
  try { var sv = JSON.parse(localStorage.getItem('mes-installs:v1') || '{}'); if (sv && typeof sv === 'object') ST = Object.assign(ST, sv); } catch (e) {}
  if (!I.RANGES.hasOwnProperty(ST.r)) ST.r = '30d';
  var save = function () { try { localStorage.setItem('mes-installs:v1', JSON.stringify(ST)); } catch (e) {} };
  var DATA = null, SUM = null, PREV = null, DATES = [];
  var SHOW = { cc: 15, dev: 15, os: 15, ver: 15 };
  var SORT = {};
  var APPC = { pct: '#2563eb', bmi: '#b3529d', grade: '#575fab', gpa: '#5a812d', fit: '#e8590c' };
  var css = function (n) { return getComputedStyle($('in')).getPropertyValue(n).trim(); };

  var regionName = (function () { try { var dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); return function (c) { try { return dn.of(c) || c; } catch (e) { return c; } }; } catch (e) { return function (c) { return c; }; } })();
  var flag = function (c) { return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : '🌐'; };
  var appName = function (k) { var a = DATA && DATA.apps.filter(function (x) { return x.k === k; })[0]; return a ? a.name : k; };
  var platName = function (p) { return p === 'i' ? 'iPhone & iPad' : 'Android'; };
  var dot = function (p) { return '<span class="in-dot in-dot--' + p + '" title="' + platName(p) + '"></span>'; };

  function chips(group, attr, val) { document.querySelectorAll('#' + group + ' button[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'); }); }
  function wire() {
    $('in-range').onclick = function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; ST.r = b.dataset.r; save(); render(); };
    $('in-plat').onclick = function (e) { var b = e.target.closest('button[data-p]'); if (!b) return; ST.plat = b.dataset.p; save(); render(); };
    $('in-app').onclick = function (e) { var b = e.target.closest('button[data-a]'); if (!b) return; ST.app = b.dataset.a; save(); render(); };
    $('in-split').onclick = function (e) { var b = e.target.closest('button[data-s]'); if (!b) return; ST.split = b.dataset.s; save(); render(); };
    ['cc', 'dev', 'os', 'ver'].forEach(function (k) { $('m-' + k).onclick = function () { SHOW[k] = SHOW[k] >= 1e6 ? 15 : 1e6; render(); }; });
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (SUM) drawChart(); }, 120); });
  }

  function load() {
    var url = MOCK ? '/installs/data/sample.json' : '/api/installs';
    fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      DATA = d; buildAppChips(); setupCards(); render();
    }).catch(function () {
      $('in-meta').textContent = 'The install numbers could not be loaded right now. Try again in a few minutes.';
    });
  }

  function buildAppChips() {
    var h = '<button type="button" class="tu-chip" data-a="">All apps</button>';
    DATA.apps.forEach(function (a) { h += '<button type="button" class="tu-chip" data-a="' + esc(a.k) + '"><span class="in-sw" style="background:' + (APPC[a.k] || '#888') + '"></span>' + esc(a.name.replace(/ Calculators?$/, '')) + '</button>'; });
    $('in-app').innerHTML = h;
    if (ST.app && !DATA.apps.some(function (a) { return a.k === ST.app; })) ST.app = '';
  }

  var STEPS = {
    ios: '<h3>iPhone numbers are not connected yet</h3><p>One-time setup (about 10 minutes), in <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noopener">App Store Connect → Users and Access → Integrations → App Store Connect API</a>:</p><ol>' +
      '<li>Under <b>Team Keys</b>, press <b>+</b> (Generate API Key). Name it <i>MES installs page</i>, Access <b>Sales</b> (or Finance). Generate.</li>' +
      '<li>Copy the <b>Issuer ID</b> (above the list) and the key\'s <b>Key ID</b>. Press <b>Download</b> to save the <code>AuthKey_XXXX.p8</code> file (Apple lets you download it only once: keep it safe).</li>' +
      '<li>Find your <b>vendor number</b>: <a href="https://appstoreconnect.apple.com/trends/reports" target="_blank" rel="noopener">Sales and Trends → Reports</a>, the number next to your name at the top (8 digits, starts with 8 or 9).</li>' +
      '<li>In Vercel → the <b>mes.fm</b> project → Settings → Environment Variables, add four plain project variables (Production): <code>APPSTORE_ISSUER_ID</code>, <code>APPSTORE_KEY_ID</code>, <code>APPSTORE_VENDOR_NUMBER</code> and <code>APPSTORE_PRIVATE_KEY</code> (open the .p8 file in TextEdit and paste everything, including the BEGIN / END lines).</li>' +
      '<li>Redeploy. The first load fetches every day since September; give it a minute and reload.</li></ol>',
    play: '<h3>Android numbers are not connected yet</h3><p>One-time setup (about 15 minutes):</p><ol>' +
      '<li>In <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Google Cloud Console → IAM → Service accounts</a> (any project, e.g. <i>mes-search-console</i>), press <b>Create service account</b>, name it <i>mes-installs</i>, no roles needed. Open it → <b>Keys → Add key → Create new key → JSON</b>. A .json file downloads.</li>' +
      '<li>In <a href="https://play.google.com/console/users-and-permissions" target="_blank" rel="noopener">Play Console → Users and permissions</a> press <b>Invite new users</b>, paste the service account\'s e-mail (…@….iam.gserviceaccount.com), and under <b>Account permissions</b> tick <b>View app information and download bulk reports (read-only)</b>. Invite. (It can take up to a day before Google lets it read the reports.)</li>' +
      '<li>Find the bucket: Play Console → <b>Download reports → Statistics</b> → press <b>Copy Cloud Storage URI</b>. It looks like <code>gs://pubsite_prod_rev_0123456789/stats/installs/</code>.</li>' +
      '<li>In Vercel → the <b>mes.fm</b> project → Settings → Environment Variables, add <code>PLAY_BUCKET</code> = that URI (the <code>gs://pubsite_prod_rev_…</code> part is enough) and <code>PLAY_SERVICE_ACCOUNT</code> = the whole contents of the .json file (open it in TextEdit, copy all).</li>' +
      '<li>Redeploy and reload this page.</li></ol>'
  };
  function setupCards() {
    var s = DATA.sources || {}, h = '';
    ['ios', 'play'].forEach(function (k) {
      var x = s[k] || {};
      if (!x.setup) h += '<div class="tu-card in-setcard">' + STEPS[k] + (x.missing && x.missing.length ? '<p class="tu-note">Missing: ' + x.missing.map(function (m) { return '<code>' + esc(m) + '</code>'; }).join(', ') + '</p>' : '') + '</div>';
      else if (x.ok === false && x.error) h += '<div class="tu-card in-setcard in-setcard--err"><h3>' + (k === 'ios' ? 'App Store Connect' : 'Google Play') + ' did not answer</h3><p>' + esc(x.error) + '</p><p class="tu-note">The numbers below may be missing the newest days. Check the keys if this stays.</p></div>';
    });
    if (h && !MOCK && !(DATA.daily || []).length) h += '<p class="tu-note"><a href="?mock=1">See the page with made-up sample numbers</a></p>';
    $('in-setup').innerHTML = h;
  }

  function render() {
    chips('in-range', 'data-r', ST.r); chips('in-plat', 'data-p', ST.plat); chips('in-app', 'data-a', ST.app); chips('in-split', 'data-s', ST.split);
    var sp = I.span(DATA);
    DATES = I.rangeDates(ST.r, sp.last, sp.first);
    var from = DATES[0], to = DATES[DATES.length - 1];
    SUM = I.summarize(DATA, { from: from, to: to, app: ST.app, plat: ST.plat });
    PREV = null;
    if (ST.r !== 'all' && from) { var n = DATES.length; var pf = I.addDays(from, -n); PREV = sp.first && sp.first <= pf ? I.summarize(DATA, { from: pf, to: I.addDays(from, -1), app: ST.app, plat: ST.plat }) : null; }
    var meta = (MOCK ? '<b class="in-sample">Sample data</b> (made up, for the local preview). ' : '');
    meta += sp.last ? 'Showing <b>' + I.addDays(from, 0) + '</b> to <b>' + to + '</b>' + (ST.app ? ' · ' + esc(appName(ST.app)) : '') + (ST.plat ? ' · ' + platName(ST.plat) : '') + '.' : 'No install numbers yet.';
    if (DATA.generated) meta += ' <span class="in-dim">Updated ' + new Date(DATA.generated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + '.</span>';
    $('in-meta').innerHTML = meta;
    tiles(); drawChart(); appTable(); ccTable();
    dimTable('dev', SUM.devices, 'Device'); dimTable('os', SUM.os.filter(function (x) { return x.plat === 'a'; }), 'Android version'); dimTable('ver', SUM.versions, 'Version');
    $('in-ossec').hidden = ST.plat === 'i';
  }

  function change(cur, prev) {
    if (prev == null || !PREV) return '';
    if (!prev) return cur ? '<small class="in-up">new</small>' : '';
    var p = (cur - prev) / prev * 100;
    return '<small class="' + (p >= 0 ? 'in-up' : 'in-dn') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + '% vs the ' + DATES.length + ' days before</small>';
  }
  function tile(v, label, extra, title) { return '<div class="tu-stat"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="tu-stat__value">' + v + '</div><div class="tu-stat__label">' + esc(label) + '</div>' + (extra || '') + '</div>'; }
  function tiles() {
    var t = SUM.totals, p = PREV && PREV.totals, h = '';
    h += tile(int(t.ins), 'Installs', change(t.ins, p && p.ins));
    if (ST.plat !== 'a') h += tile(int(t.iosIns), 'iPhone & iPad', change(t.iosIns, p && p.iosIns));
    if (ST.plat !== 'i') h += tile(int(t.andIns), 'Android', change(t.andIns, p && p.andIns));
    if (ST.plat !== 'a') { h += tile(int(t.dl), 'First-time downloads', '', 'iPhone & iPad: an Apple account getting the app for the first time'); h += tile(int(t.re), 'Re-downloads', '', 'iPhone & iPad: the same Apple account installing again'); }
    h += tile(int(t.up), 'Updates');
    if (ST.plat !== 'i') { h += tile(int(t.un), 'Uninstalls', '', 'Android only'); h += tile(int(t.active), 'Active devices', t.activeDay ? '<small>Android, on ' + t.activeDay + '</small>' : '', 'Android phones and tablets with the app installed'); }
    var rs = ratingSummary();
    if (rs) h += tile(rs.v, 'Rating', '<small>' + esc(rs.note) + '</small>');
    $('in-tiles').innerHTML = h;
  }
  function ratingSummary() {
    var sum = 0, n = 0, parts = [];
    DATA.apps.forEach(function (a) {
      if (ST.app && a.k !== ST.app) return;
      if (ST.plat !== 'a' && a.ios && a.ios.rating && a.ios.ratings) { sum += a.ios.rating * a.ios.ratings; n += a.ios.ratings; }
      if (ST.plat !== 'i' && a.android && a.android.rating) parts.push(a.android.rating);
    });
    if (n) return { v: '★ ' + (sum / n).toFixed(1), note: n + ' App Store rating' + (n === 1 ? '' : 's') + (parts.length ? ' · Play ★ ' + (parts.reduce(function (x, y) { return x + y; }, 0) / parts.length).toFixed(1) : '') };
    if (parts.length) return { v: '★ ' + (parts.reduce(function (x, y) { return x + y; }, 0) / parts.length).toFixed(1), note: 'Google Play' };
    return null;
  }

  function niceTop(max) { max = max || 1; var step = Math.pow(10, Math.floor(Math.log10(max))); var m = max / step; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * step; }
  function series() {
    if (ST.split === 'app') {
      var keys = DATA.apps.map(function (a) { return a.k; }).filter(function (k) { return !ST.app || k === ST.app; });
      return keys.map(function (k) { return { k: k, name: appName(k), col: APPC[k] || '#888', v: function (day) { return (day && day.byApp[k]) || 0; } }; });
    }
    var out = [];
    if (ST.plat !== 'a') out.push({ k: 'i', name: 'iPhone & iPad', col: css('--in-ios'), v: function (day) { return day ? day.i : 0; } });
    if (ST.plat !== 'i') out.push({ k: 'a', name: 'Android', col: css('--in-and'), v: function (day) { return day ? day.a : 0; } });
    return out;
  }
  function drawChart() {
    var svg = $('in-svg'), box = $('in-chart'), tip = $('in-tip');
    var byD = {}; SUM.days.forEach(function (x) { byD[x.d] = x; });
    var S = series();
    $('in-legend').innerHTML = S.map(function (s) { return '<span><i class="in-key" style="background:' + s.col + '"></i>' + esc(s.name) + '</span>'; }).join('');
    var W = box.clientWidth || 600, H = box.clientHeight || 220, padL = 40, padR = 8, padT = 8, padB = 22;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var cMuted = css('--in-muted'), cLine = css('--in-line');
    if (!DATES.length) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="13" fill="' + cMuted + '">No installs yet</text>'; return; }
    var max = 0; DATES.forEach(function (d) { var t = 0; S.forEach(function (s) { t += s.v(byD[d]); }); max = Math.max(max, t); });
    var top = niceTop(max), iw = W - padL - padR, ih = H - padT - padB, bw = iw / DATES.length;
    var y = function (v) { return padT + ih - v / top * ih; };
    var h = '';
    for (var g = 0; g <= 4; g++) { var gv = top * g / 4, gy = y(gv); h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + cLine + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + cMuted + '">' + (gv % 1 ? gv.toFixed(1) : gv.toLocaleString()) + '</text>'; }
    DATES.forEach(function (d, i) {
      var base = 0, bx = padL + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
      S.forEach(function (s) { var v = s.v(byD[d]); if (!v) return; h += '<rect x="' + bx.toFixed(1) + '" y="' + y(base + v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0.5, y(base) - y(base + v)).toFixed(1) + '" fill="' + s.col + '"/>'; base += v; });
    });
    var every = Math.ceil(DATES.length / Math.max(2, Math.floor(iw / 62)));
    DATES.forEach(function (d, i) { if (i % every === 0) h += '<text x="' + (padL + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + d.slice(5) + '</text>'; });
    h += '<line id="in-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cMuted + '" stroke-dasharray="3 3" visibility="hidden"/>';
    svg.innerHTML = h;
    var move = function (e) {
      var pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect(), i = Math.floor((pt.clientX - r.left - padL) / (r.width - padL - padR) * DATES.length);
      if (i < 0 || i >= DATES.length) { tip.style.display = 'none'; return; }
      var d = DATES[i], day = byD[d], tot = 0, lines = '';
      S.forEach(function (s) { var v = s.v(day); tot += v; lines += '<br><i class="in-key" style="background:' + s.col + '"></i>' + esc(s.name) + ': ' + int(v); });
      tip.innerHTML = '<b>' + new Date(d + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + '</b><br>' + int(tot) + ' installs' + lines +
        (day && day.up ? '<br>' + int(day.up) + ' updates' : '') + (day && day.un ? '<br>' + int(day.un) + ' uninstalls (Android)' : '');
      tip.style.display = 'block';
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - r.left + 12)) + 'px';
      var cr = $('in-cross'); if (cr) { var cx = padL + i * bw + bw / 2; cr.setAttribute('x1', cx); cr.setAttribute('x2', cx); cr.setAttribute('visibility', 'visible'); }
    };
    box.onmousemove = move; box.ontouchstart = move; box.ontouchmove = move;
    box.onmouseleave = function () { tip.style.display = 'none'; var cr = $('in-cross'); if (cr) cr.setAttribute('visibility', 'hidden'); };
  }

  // sortable table: cols = [{k, label, f(row) -> html, v(row) -> sort value, cls}]
  function table(id, cols, rows, opts) {
    opts = opts || {};
    var s = SORT[id] || { k: opts.sort || cols[1].k, dir: -1 };
    var col = cols.filter(function (c) { return c.k === s.k; })[0] || cols[1];
    rows = rows.slice().sort(function (a, b) { var x = col.v(a), y = col.v(b); if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * s.dir; });
    var lim = opts.limit || 1e9, more = $(opts.more || '');
    var h = '<thead><tr>' + cols.map(function (c) { return '<th data-k="' + c.k + '"' + (c.k === s.k ? ' class="on" aria-sort="' + (s.dir < 0 ? 'descending' : 'ascending') + '"' : '') + ' title="' + esc(c.title || 'Sort') + '">' + c.label + (c.k === s.k ? (s.dir < 0 ? ' ▾' : ' ▴') : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="empty" colspan="' + cols.length + '">Nothing in this range yet</td></tr>';
    // in-cell bars (column option b = colour, or function(row) -> colour, or segs(row) -> [[value, colour], ...] for a
    // stacked bar): a thin bar under the number, scaled to the column's largest value over every row (not just those shown)
    var mx = {};
    cols.forEach(function (c) { if (!c.b && !c.segs) return; var m = 0; rows.forEach(function (r) { var v = +c.v(r); if (isFinite(v) && v > m) m = v; }); mx[c.k] = m; });
    var cell = function (c, r) {
      var h = c.f(r); if (!mx[c.k]) return h;
      var v = +c.v(r); if (!isFinite(v) || v <= 0) return h;
      var segs = c.segs ? c.segs(r) : [[v, typeof c.b === 'function' ? c.b(r) : c.b]];
      return h + '<span class="in-ib" aria-hidden="true">' + segs.map(function (g) { return g[0] > 0 ? '<i style="width:' + Math.max(c.segs ? 0 : 2, Math.min(100, g[0] / mx[c.k] * 100)).toFixed(1) + '%;background:' + g[1] + '"></i>' : ''; }).join('') + '</span>';
    };
    rows.slice(0, lim).forEach(function (r) { h += '<tr>' + cols.map(function (c) { var cl = (c.cls || '') + (mx[c.k] ? ' in-bc' : ''); return '<td' + (cl.trim() ? ' class="' + cl.trim() + '"' : '') + '>' + cell(c, r) + '</td>'; }).join('') + '</tr>'; });
    h += '</tbody>';
    if (opts.foot) h += '<tfoot><tr>' + opts.foot.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr></tfoot>';
    var t = $(id); t.innerHTML = h;
    t.querySelectorAll('th[data-k]').forEach(function (th) { th.onclick = function () { var k = th.dataset.k; var cur = SORT[id] || s; SORT[id] = { k: k, dir: cur.k === k ? -cur.dir : (k === cols[0].k ? 1 : -1) }; render(); }; });
    if (more) { more.hidden = rows.length <= 15; more.textContent = lim >= 1e6 ? 'Show fewer' : 'Show all ' + rows.length; }
    attachResizer(t);
  }

  // First column resize (same handle as /stats and /ads): drag the header's right edge (mouse / touch / pen), arrow keys
  // when focused, double-click or double-tap resets. Width per table in localStorage mes-installs:colw:<table id>.
  var lastTap = 0;
  function setColW(el, px, save) {
    var key = 'mes-installs:colw:' + el.id;
    if (px == null) {
      el.classList.remove('w-set'); el.style.removeProperty('--in-col-w');
      if (save) { try { localStorage.removeItem(key); } catch (e) {} }
      return;
    }
    var max = Math.max(130, el.parentElement.clientWidth - 80);
    var w = Math.round(Math.min(max, Math.max(70, px)));
    el.style.setProperty('--in-col-w', w + 'px'); el.classList.add('w-set');
    if (save) { try { localStorage.setItem(key, String(w)); } catch (e) {} }
  }
  function attachResizer(el) {
    var th = el.querySelector('thead th'); if (!th) return;
    if (!el.dataset.wRestored) {
      el.dataset.wRestored = '1';
      try { var saved = parseInt(localStorage.getItem('mes-installs:colw:' + el.id), 10); if (saved > 0) setColW(el, saved, false); } catch (e) {}
    }
    var h = document.createElement('span');
    h.className = 'in-resizer'; h.tabIndex = 0;
    h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', 'Resize the first column (double-click to reset)');
    h.title = 'Drag to resize this column. Double-click to reset.';
    th.appendChild(h);
    h.addEventListener('click', function (e) { e.stopPropagation(); });
    h.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      setColW(el, th.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16), true);
    });
    h.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      var startX = e.clientX, startW = th.getBoundingClientRect().width;
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      document.body.classList.add('in-col-resizing'); h.classList.add('dragging');
      function move(ev) { setColW(el, startW + ev.clientX - startX, false); }
      function up(ev) {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        try { h.releasePointerCapture(ev.pointerId); } catch (err) {}
        document.body.classList.remove('in-col-resizing'); h.classList.remove('dragging');
        if (Math.abs(ev.clientX - startX) < 4) {
          var now = Date.now();
          if (now - lastTap < 400) { lastTap = 0; setColW(el, null, true); } else lastTap = now;
          return;
        }
        setColW(el, th.getBoundingClientRect().width, true);
      }
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  }

  function appTable() {
    var rows = DATA.apps.filter(function (a) { return !ST.app || a.k === ST.app; }).map(function (a) {
      var s = SUM.apps.filter(function (x) { return x.k === a.k; })[0] || { iosIns: 0, andIns: 0, dl: 0, re: 0, up: 0, un: 0, active: null };
      return { a: a, s: s, tot: (ST.plat === 'a' ? 0 : s.iosIns) + (ST.plat === 'i' ? 0 : s.andIns) };
    });
    var star = function (v, n) { return v ? '★ ' + v.toFixed(1) + (n ? ' <small>(' + n + ')</small>' : '') : '<span class="in-dim">–</span>'; };
    var cols = [
      { k: 'n', label: 'App', v: function (r) { return r.a.name; }, f: function (r) { return '<span class="in-sw" style="background:' + (APPC[r.a.k] || '#888') + '"></span><a href="' + esc(r.a.web) + '">' + esc(r.a.name) + '</a>'; } },
      { k: 't', label: 'Installs', v: function (r) { return r.tot; }, b: function (r) { return APPC[r.a.k] || '#888'; }, f: function (r) { return int(r.tot); } }
    ];
    if (ST.plat !== 'a') cols.push({ k: 'i', label: 'iPhone', b: 'var(--in-ios)', v: function (r) { return r.s.iosIns; }, f: function (r) { return int(r.s.iosIns); } },
      { k: 'dl', label: 'First<small>iPhone</small>', title: 'First-time downloads', b: 'var(--in-ios)', v: function (r) { return r.s.dl; }, f: function (r) { return int(r.s.dl); } },
      { k: 're', label: 'Re-dl<small>iPhone</small>', title: 'Re-downloads', b: 'var(--in-ios)', v: function (r) { return r.s.re; }, f: function (r) { return int(r.s.re); } });
    if (ST.plat !== 'i') cols.push({ k: 'a', label: 'Android', b: 'var(--in-and)', v: function (r) { return r.s.andIns; }, f: function (r) { return int(r.s.andIns); } });
    cols.push({ k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return ST.plat === 'i' ? r.s.iosUp : ST.plat === 'a' ? r.s.andUp : r.s.up; }, f: function (r) { return int(ST.plat === 'i' ? r.s.iosUp : ST.plat === 'a' ? r.s.andUp : r.s.up); } });
    if (ST.plat !== 'i') cols.push({ k: 'x', label: 'Uninst.<small>Android</small>', title: 'Uninstalls', b: 'var(--in-bad)', v: function (r) { return r.s.un; }, f: function (r) { return int(r.s.un); } },
      { k: 'ac', label: 'Active<small>Android</small>', title: 'Devices with the app installed (latest day)', b: 'var(--in-and)', v: function (r) { return r.s.active; }, f: function (r) { return int(r.s.active); } });
    if (ST.plat !== 'a') cols.push({ k: 'ri', label: 'App Store', title: 'App Store rating (US)', v: function (r) { return r.a.ios.rating; }, f: function (r) { return star(r.a.ios.rating, r.a.ios.ratings); } });
    if (ST.plat !== 'i') cols.push({ k: 'ra', label: 'Play', title: 'Google Play rating', v: function (r) { return r.a.android.rating; }, f: function (r) { return star(r.a.android.rating); } });
    cols.push({ k: 'st', label: 'Get it', v: function (r) { return r.a.k; }, f: function (r) { return (r.a.ios.url ? '<a href="' + esc(r.a.ios.url) + '" target="_blank" rel="noopener">App Store</a>' : '') + (r.a.ios.url ? ' · ' : '') + '<a href="' + esc(r.a.android.url) + '" target="_blank" rel="noopener">Play</a>'; } });
    table('t-apps', cols, rows, { sort: 't' });
  }

  function ccTable() {
    var rows = SUM.countries;
    var cols = [
      { k: 'n', label: 'Country', v: function (r) { return regionName(r.key); }, f: function (r) { return '<span class="in-flag">' + flag(r.key) + '</span>' + esc(regionName(r.key)); } },
      { k: 't', label: 'Installs', v: function (r) { return r.ins; }, segs: function (r) { return [[r.i, 'var(--in-ios)'], [r.a, 'var(--in-and)']]; }, f: function (r) { return int(r.ins); } }
    ];
    if (ST.plat !== 'a') cols.push({ k: 'i', label: 'iPhone', b: 'var(--in-ios)', v: function (r) { return r.i; }, f: function (r) { return int(r.i); } });
    if (ST.plat !== 'i') cols.push({ k: 'a', label: 'Android', b: 'var(--in-and)', v: function (r) { return r.a; }, f: function (r) { return int(r.a); } });
    var tot = rows.reduce(function (s, r) { return s + r.ins; }, 0);
    cols.push({ k: 'p', label: 'Share', b: 'var(--in-muted)', v: function (r) { return r.ins; }, f: function (r) { return tot ? (r.ins / tot * 100).toFixed(r.ins / tot < 0.1 ? 1 : 0) + '%' : '–'; } });
    cols.push({ k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return r.up; }, f: function (r) { return int(r.up); } });
    table('t-cc', cols, rows, { sort: 't', limit: SHOW.cc, more: 'm-cc' });
  }
  function dimTable(k, rows, label) {
    var cols = [
      { k: 'n', label: label, v: function (r) { return r.key; }, f: function (r) { return (ST.plat ? '' : dot(r.plat)) + (k === 'ver' && !ST.app ? '<span class="in-dim">' + esc(appName(r.app).replace(/ Calculators?$/, '')) + '</span> ' : '') + esc(r.key); } },
      { k: 't', label: 'Installs', v: function (r) { return r.ins; }, b: function (r) { return r.plat === 'i' ? 'var(--in-ios)' : 'var(--in-and)'; }, f: function (r) { return int(r.ins); } },
      { k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return r.up; }, f: function (r) { return int(r.up); } }
    ];
    table('t-' + k, cols, rows, { sort: 't', limit: SHOW[k], more: 'm-' + k });
  }

  function panels() {
    if (!window.MESPanel) { setTimeout(panels, 60); return; }
    document.querySelectorAll('#in .in-sec').forEach(function (sec) {
      var head = sec.querySelector('.in-head'); if (!head) return;
      var bar = head.querySelector('.in-hbtns') || head.appendChild(Object.assign(document.createElement('span'), { className: 'in-hbtns' }));
      window.MESPanel.add(sec, { bar: bar, onChange: function () { if (SUM && sec.id === 'in-daysec') drawChart(); } });
    });
  }

  wire(); load(); panels();
})();
