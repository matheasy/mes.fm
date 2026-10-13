/* MES Read Aloud: settings page */
(function () {
  'use strict';
  var R = MESRA, $ = function (id) { return document.getElementById(id); };
  var S = R.merge(null), cur = 'default', timer = 0, voices = [];

  function prof() { return R.profileById(S, cur); }
  function cfg() { return prof().config; }
  function save() {
    chrome.storage.sync.set({ mesra: S }, function () {
      $('saved').textContent = chrome.runtime.lastError ? 'Not saved' : 'Saved';
      clearTimeout(timer); timer = setTimeout(function () { $('saved').textContent = ''; }, 2000);
    });
  }

  var RANGES = ['rate', 'pitch', 'volume'], CHECKS = ['highlightWord', 'highlightSentence', 'autoScroll', 'doubleClickToJump', 'skipCode', 'skipTables', 'readTitle', 'closeWhenDone'];
  var SELECTS = ['scope', 'playerPosition', 'textPanel'], COLORS = ['wordColor', 'sentenceColor'];

  function fillVoices() {
    voices = speechSynthesis.getVoices().slice().sort(function (a, b) { return (a.lang + a.name).localeCompare(b.lang + b.name); });
    $('voice').innerHTML = '';
    var auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Automatic (best for the text)'; $('voice').appendChild(auto);
    voices.forEach(function (v) { var o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' online'); $('voice').appendChild(o); });
    $('voice').value = cfg().voice;
  }

  function sample() {
    var c = cfg(), sp = $('sample').querySelector('.s'), w = $('sample').querySelector('.w');
    sp.style.background = c.highlightSentence ? c.sentenceColor : 'transparent'; sp.style.color = c.highlightSentence ? R.contrastText(c.sentenceColor) : '';
    w.style.background = c.highlightWord ? c.wordColor : 'transparent'; w.style.color = c.highlightWord ? R.contrastText(c.wordColor) : '';
  }

  function drawProfiles() {
    $('profile').innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.id === S.active ? '  (in use)' : ''); $('profile').appendChild(o); });
    $('profile').value = cur; $('del').disabled = S.profiles.length < 2;
  }
  function drawFields() {
    var c = cfg();
    RANGES.forEach(function (k) { $(k).value = c[k]; $(k + 'out').textContent = Math.round(c[k] * 100) / 100 + (k === 'volume' ? '' : '×'); });
    CHECKS.forEach(function (k) { $(k).checked = c[k]; });
    SELECTS.forEach(function (k) { $(k).value = c[k]; });
    COLORS.forEach(function (k) { $(k).value = c[k]; });
    fillVoices(); sample();
  }
  function drawSites() {
    var box = $('sitemap'); box.innerHTML = '';
    var hosts = Object.keys(S.siteProfiles);
    if (!hosts.length) box.innerHTML = '<p class="hint">None yet. In the toolbar popup pick a setup and tick "Always use this setup on this site".</p>';
    hosts.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'sm';
      d.appendChild(document.createTextNode(h + ' → ' + R.profileById(S, S.siteProfiles[h]).name + ' '));
      var b = document.createElement('button'); b.textContent = 'Remove';
      b.onclick = function () { delete S.siteProfiles[h]; drawSites(); save(); };
      d.appendChild(b); box.appendChild(d);
    });
  }
  function draw() { drawProfiles(); drawFields(); drawSites(); }

  RANGES.forEach(function (k) { $(k).addEventListener('input', function () { cfg()[k] = Number($(k).value); $(k + 'out').textContent = Math.round(cfg()[k] * 100) / 100 + (k === 'volume' ? '' : '×'); save(); }); });
  CHECKS.forEach(function (k) { $(k).addEventListener('change', function () { cfg()[k] = $(k).checked; sample(); save(); }); });
  SELECTS.forEach(function (k) { $(k).addEventListener('change', function () { cfg()[k] = $(k).value; save(); }); });
  COLORS.forEach(function (k) { $(k).addEventListener('input', function () { cfg()[k] = $(k).value; sample(); save(); }); });
  $('voice').addEventListener('change', function () { cfg().voice = $('voice').value; save(); });
  $('test').addEventListener('click', function () {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance('This is how MES Read Aloud sounds with the voice you picked.'), c = cfg(), v = null;
    voices.forEach(function (x) { if (x.voiceURI === c.voice) v = x; });
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = c.rate; u.pitch = c.pitch; u.volume = c.volume;
    speechSynthesis.speak(u);
  });

  $('profile').addEventListener('change', function () { cur = $('profile').value; S.active = cur; draw(); save(); });
  function add(name, config) {
    if (S.profiles.length >= 30) { alert('That is plenty of setups (30). Delete one first.'); return; }
    var p = { id: R.uid(), name: name, config: R.normConfig(config) };
    S.profiles.push(p); cur = p.id; S.active = p.id; draw(); save();
  }
  $('new').onclick = function () { var n = prompt('Name for the new setup (it starts as a copy of the standard one):', 'My setup'); if (n) add(n.slice(0, 40), R.defaultConfig()); };
  $('dup').onclick = function () { add((prof().name + ' copy').slice(0, 40), JSON.parse(JSON.stringify(cfg()))); };
  $('ren').onclick = function () { var n = prompt('New name:', prof().name); if (n) { prof().name = n.slice(0, 40); draw(); save(); } };
  $('del').onclick = function () {
    if (S.profiles.length < 2 || !confirm('Delete the setup "' + prof().name + '"?')) return;
    S.profiles = S.profiles.filter(function (p) { return p.id !== cur; });
    for (var h in S.siteProfiles) if (S.siteProfiles[h] === cur) delete S.siteProfiles[h];
    cur = S.profiles[0].id; if (!S.profiles.some(function (p) { return p.id === S.active; })) S.active = cur;
    draw(); save();
  };
  $('exp').onclick = function () {
    var text = JSON.stringify({ mesraSetup: 1, name: prof().name, config: cfg() });
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { $('saved').textContent = 'Copied'; }, function () { prompt('Copy this text:', text); });
  };
  $('imp').onclick = function () {
    var t = prompt('Paste a setup exported from this extension:'); if (!t) return;
    try { var o = JSON.parse(t); if (!o || !o.config) throw 0; add(String(o.name || 'Imported setup').slice(0, 40), o.config); } catch (e) { alert('That does not look like an exported setup.'); }
  };
  $('factory').onclick = function () {
    R.builtins().forEach(function (b) {
      var have = S.profiles.filter(function (p) { return p.id === b.id; })[0];
      if (have) { have.name = b.name; have.config = b.config; } else S.profiles.push(b);
    });
    draw(); save();
  };

  speechSynthesis.addEventListener('voiceschanged', fillVoices);
  chrome.storage.sync.get('mesra', function (a) {
    var had = !!(a && a.mesra);
    S = R.merge(a && a.mesra); cur = S.active; draw();
    if (!had) save();
  });
})();
