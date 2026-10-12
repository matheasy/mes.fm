/* MES Volume Booster: toolbar popup */
(function () {
  'use strict';
  var V = MESVB, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', active = false, level = 100, timer = 0, busy = false;

  function say(t, err) { $('msg').textContent = t || ' '; $('msg').className = 'msg' + (err ? ' err' : ''); }
  function draw() {
    $('level').textContent = level + '%';
    $('slider').max = S.max; $('slider').value = level;
    $('presets').innerHTML = V.PRESETS.filter(function (p) { return p <= S.max; }).map(function (p) { return '<button data-l="' + p + '"' + (p === level ? ' class="on"' : '') + '>' + p + '%</button>'; }).join('');
    $('off').hidden = !active;
    $('limiter').checked = S.limiter;
  }

  function relay(msg) { return new Promise(function (res) { chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; res(r || null); }); }); }

  async function apply(l) {
    level = V.clampLevel(l, S.max); draw();
    clearTimeout(timer);
    timer = setTimeout(async function () {
      if (!tab || busy) return;
      if (active) {
        await relay({ target: 'offscreen', type: 'set', tabId: tab.id, level: level });
        relay({ target: 'background', type: 'level', tabId: tab.id, level: level });
        say(level === 100 ? 'Normal volume.' : level > 100 ? 'Boosted ' + V.decibels(level) + ' dB.' : 'Quieter than normal.');
      } else if (level !== 100) {
        busy = true; say('Starting…');
        try {
          var streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
          var r = await relay({ target: 'background', type: 'start', tabId: tab.id, streamId: streamId, level: level });
          if (r && r.ok) { active = true; say('Boosted ' + V.decibels(level) + ' dB.'); } else say((r && r.error) || 'Could not start. Close other tools that capture this tab and try again.', true);
        } catch (e) { say('The browser does not allow boosting this page (browser pages and the Web Store are off limits).', true); }
        busy = false; draw();
      }
      if (S.remember && host) chrome.storage.local.get('mesvbSites', function (a) { var m = (a && a.mesvbSites) || {}; if (level === 100) delete m[host]; else m[host] = level; chrome.storage.local.set({ mesvbSites: m }); });
    }, 120);
  }

  $('slider').oninput = function () { apply(Number($('slider').value)); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.l) apply(Number(e.target.dataset.l)); };
  $('limiter').onchange = function () { S.limiter = $('limiter').checked; chrome.storage.sync.set({ mesvb: S }); if (tab && active) relay({ target: 'offscreen', type: 'set', tabId: tab.id, limiter: S.limiter }); };
  $('off').onclick = async function () { await relay({ target: 'offscreen', type: 'stop', tabId: tab.id }); active = false; level = 100; draw(); say('Boost turned off.'); };

  chrome.storage.sync.get('mesvb', function (a) {
    S = V.merge(a && a.mesvb);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname; } catch (e) { host = ''; }
      $('host').textContent = host || 'this tab';
      var st = tab ? await relay({ target: 'offscreen', type: 'get', tabId: tab.id }) : null;
      if (st && st.active) { active = true; level = st.level; }
      draw();
      if (!active && S.remember && host) chrome.storage.local.get('mesvbSites', function (a2) { var l = a2 && a2.mesvbSites && a2.mesvbSites[host]; if (l) say('Last time here: ' + l + '%. Click ' + l + '% to use it.'); });
    });
  });
})();
