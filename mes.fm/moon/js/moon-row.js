// "My Row": choose which moon/sun data points to copy, in what order, as one
// tab-separated line (optionally with a header line) for pasting into Excel.
// Values come from window.MES_MOON_RAW, filled by index.html's refresh().
(function () {
  var KEY = 'moon-row';
  // id -> [header, raw key]. Times are "7:06 AM" and durations "11:53" so Excel
  // reads real times; numbers carry no thousands commas or unicode minus.
  var COLS = {
    date: ['Date', 'date'],
    tempNowC: ['Outside Temperature (°C)', 'tempNowC'],
    tempNowF: ['Outside Temperature (°F)', 'tempNowF'],
    temp9C: ['Temperature at 9 AM (°C)', 'temp9C'],
    temp9F: ['Temperature at 9 AM (°F)', 'temp9F'],
    tempHiC: ['Today’s High (°C)', 'tempHiC'],
    tempLoC: ['Today’s Low (°C)', 'tempLoC'],
    moonPhasePct: ['Moon Phase (%)', 'moonPhasePct'],
    moonPhaseName: ['Moon Phase Name', 'moonPhaseName'],
    sunrise: ['Sunrise', 'sunrise'],
    sunset: ['Sunset', 'sunset'],
    sunDuration: ['Sun Duration', 'sunDuration'],
    moonDuration: ['Moon Duration', 'moonDuration'],
    moonrise: ['Moonrise', 'moonrise'],
    moonset: ['Moonset', 'moonset'],
    sunRa: ['Sun Right Ascension (hh:mm:ss)', 'sunRa'],
    sunDec: ['Sun Declination (°)', 'sunDec'],
    sunMag: ['Sun Magnitude', 'sunMag'],
    sunDistKm: ['Sun distance from Earth (km)', 'sunDistKm'],
    sunDistAu: ['Sun distance from Earth (AU)', 'sunDistAu'],
    sunConst: ['Sun Constellation', 'sunConst'],
    moonRa: ['Moon Right Ascension (hh:mm:ss)', 'moonRa'],
    moonDec: ['Moon Declination (°)', 'moonDec'],
    moonMag: ['Moon Magnitude', 'moonMag'],
    moonDistKm: ['Moon Distance from Earth (km)', 'moonDistKm'],
    moonDistAu: ['Moon Distance from Earth (AU)', 'moonDistAu'],
    moonConst: ['Moon Constellation', 'moonConst'],
    aqiUs: ['US AQI', 'aqiUs'],
    uvMax: ['Max UV Index', 'uvMax']
  };
  var DEFAULT = ['tempNowC', 'moonPhasePct', 'sunrise', 'sunset', 'moonrise', 'moonset',
    'sunRa', 'sunDec', 'sunMag', 'sunDistKm', 'moonMag', 'moonDistKm'];

  var $ = function (id) { return document.getElementById(id); };
  var box = $('rowBuilder'); if (!box) return;
  var order = DEFAULT.slice(), header = false, dragId = null;

  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.order)) {
      var ok = s.order.filter(function (id) { return COLS[id]; });
      if (ok.length) order = ok;
    }
    if (s && s.header) header = true;
  } catch (e) {}
  $('rowHdrOn').checked = header;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ order: order, header: header })); } catch (e) {}
  }
  function raw() { return window.MES_MOON_RAW || {}; }
  function headerLine() { return order.map(function (id) { return COLS[id][0]; }).join('\t'); }
  function valueLine() {
    var r = raw();
    return order.map(function (id) { var v = r[COLS[id][1]]; return v == null ? '' : v; }).join('\t');
  }
  function msg(t) {
    $('rowMsg').textContent = t;
    clearTimeout(msg.t); msg.t = setTimeout(function () { $('rowMsg').textContent = ''; }, 3000);
  }

  function move(i, d) {
    var j = i + d; if (j < 0 || j >= order.length) return;
    var t = order[i]; order[i] = order[j]; order[j] = t; save(); render();
  }

  function render() {
    var cols = $('rowCols'); cols.innerHTML = '';
    order.forEach(function (id, i) {
      var chip = document.createElement('span');
      chip.className = 'row-chip'; chip.draggable = true;
      chip.appendChild(document.createTextNode(COLS[id][0]));
      [['←', 'Move earlier', function () { move(i, -1); }],
       ['→', 'Move later', function () { move(i, 1); }],
       ['×', 'Remove', function () { order.splice(i, 1); save(); render(); }]
      ].forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = b[0]; btn.title = b[1];
        btn.setAttribute('aria-label', b[1] + ': ' + COLS[id][0]);
        btn.addEventListener('click', b[2]); chip.appendChild(btn);
      });
      chip.addEventListener('dragstart', function (e) {
        dragId = i; try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) {}
      });
      chip.addEventListener('dragover', function (e) { e.preventDefault(); chip.classList.add('drag-over'); });
      chip.addEventListener('dragleave', function () { chip.classList.remove('drag-over'); });
      chip.addEventListener('drop', function (e) {
        e.preventDefault(); chip.classList.remove('drag-over');
        if (dragId == null || dragId === i) return;
        var m = order.splice(dragId, 1)[0]; order.splice(i, 0, m); dragId = null; save(); render();
      });
      cols.appendChild(chip);
    });

    var sel = $('rowAdd');
    sel.innerHTML = '<option value="">Choose…</option>';
    Object.keys(COLS).forEach(function (id) {
      if (order.indexOf(id) !== -1) return;
      var o = document.createElement('option'); o.value = id; o.textContent = COLS[id][0]; sel.appendChild(o);
    });
    renderPreview();
  }

  function renderPreview() {
    var r = raw(), t = $('rowPreview');
    var h = '<thead><tr>' + order.map(function (id) { return '<th>' + esc(COLS[id][0]) + '</th>'; }).join('') + '</tr></thead>';
    var b = '<tbody><tr>' + order.map(function (id) {
      var v = r[COLS[id][1]]; return '<td>' + esc(v == null || v === '' ? '—' : v) + '</td>';
    }).join('') + '</tr></tbody>';
    t.innerHTML = h + b;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function copy(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
      ta.select(); var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); msg(ok ? okMsg : 'Copy failed — select the table above and copy it by hand.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { msg(okMsg); }, fallback);
    } else fallback();
  }

  $('rowAdd').addEventListener('change', function () {
    if (this.value) { order.push(this.value); save(); render(); }
  });
  $('rowHdrOn').addEventListener('change', function () { header = this.checked; save(); });
  $('rowReset').addEventListener('click', function () { order = DEFAULT.slice(); save(); render(); });
  $('rowCopyHdr').addEventListener('click', function () { copy(headerLine(), 'Header row copied'); });
  $('rowCopy').addEventListener('click', function () {
    if (!window.MES_MOON_RAW) { msg('Still loading… try again in a moment.'); return; }
    copy((header ? headerLine() + '\n' : '') + valueLine(), header ? 'Header + row copied' : 'Row copied');
  });
  document.addEventListener('moon-data', renderPreview);
  render();

  // view mode: Default / Wide / Theater -- breaks the box out of the normal column width so
  // more of the preview table's columns fit without horizontal scrolling. Not persisted
  // (matches the video embeds' Wide/Theater toggle elsewhere on the site).
  var viewMode = 'default';
  var defBtn = $('rowDefaultToggle'), wideBtn = $('rowWideToggle'), theaterBtn = $('rowTheaterToggle');
  function applyView() {
    box.classList.toggle('row-wide', viewMode === 'wide');
    box.classList.toggle('row-theater', viewMode === 'theater');
    [[defBtn, 'default'], [wideBtn, 'wide'], [theaterBtn, 'theater']].forEach(function (p) {
      p[0].setAttribute('aria-pressed', viewMode === p[1] ? 'true' : 'false');
    });
  }
  if (defBtn && wideBtn && theaterBtn) {
    defBtn.addEventListener('click', function () { viewMode = 'default'; applyView(); });
    wideBtn.addEventListener('click', function () { viewMode = viewMode === 'wide' ? 'default' : 'wide'; applyView(); });
    theaterBtn.addEventListener('click', function () { viewMode = viewMode === 'theater' ? 'default' : 'theater'; applyView(); });
    applyView();
  }
})();
