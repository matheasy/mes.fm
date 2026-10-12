/* MES Volume Booster: toolbar popup. Video mode (default) injects the booster into the page's frames and routes the videos through a gain node;
   Whole tab mode captures the tab's sound (chrome.tabCapture) and plays it back louder in an offscreen document. */
(function () {
  'use strict';
  var V = MESVB, $ = function (id) { return document.getElementById(id); };
  var S = V.merge(null), tab = null, host = '', active = false, level = 100, timer = 0, busy = false;
  var FILES = ['shared.js', 'content.js'];

  function say(t, err) { $('msg').textContent = t || ' '; $('msg').className = 'msg' + (err ? ' err' : ''); }
  function draw() {
    $('level').textContent = level + '%';
    $('slider').max = S.max; $('slider').value = level;
    $('presets').innerHTML = V.PRESETS.filter(function (p) { return p <= S.max; }).map(function (p) { return '<button data-l="' + p + '"' + (p === level ? ' class="on"' : '') + '>' + p + '%</button>'; }).join('');
    $('off').hidden = !(S.mode === 'tab' && active);
    $('limiter').checked = S.limiter;
    Array.prototype.forEach.call($('mode').children, function (b) { b.classList.toggle('on', b.dataset.m === S.mode); });
    $('foot').textContent = S.mode === 'tab' ? 'Shortcuts: Alt+Shift+Up / Down. Chrome shows a recording dot on a boosted tab: that is the browser sharing the tab’s sound with this extension; nothing is recorded or sent anywhere.' : 'Shortcuts: Alt+Shift+Up / Down. The site’s own volume control still works; the boost is added on top.';
  }
  function relay(msg) { return new Promise(function (res) { chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; res(r || null); }); }); }
  function badge() { if (tab) chrome.action.setBadgeText({ tabId: tab.id, text: V.badge(level) }); if (tab && level !== 100) chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: level > 100 ? '#b45309' : '#475569' }); }

  // ---- video mode ----
  async function inject() { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: FILES }); }
  async function run(func, args) {
    var r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: func, args: args || [] });
    return (r || []).map(function (x) { return x.result; }).filter(Boolean);
  }
  function sum(list) { return list.reduce(function (a, r) { a.media += r.media || 0; a.applied += r.applied || 0; a.boosted += r.boosted || 0; a.unsafe += r.unsafe || 0; a.suspended = a.suspended || !!r.suspended; a.level = Math.max(a.level, r.level || 100); return a; }, { media: 0, applied: 0, boosted: 0, unsafe: 0, suspended: false, level: 100 }); }

  async function videoStatus() {
    try {
      await inject();
      var s = sum(await run(function () { return window.__mesvb ? window.__mesvb.status() : null; }));
      if (s.boosted) { level = s.level; active = true; }
      if (!s.media) say('No video found on this page yet. Start the video, or try Whole tab for other sound.');
      else if (s.unsafe && !s.boosted) say('This video comes from another site that does not allow boosting here. Try Whole tab.', true);
      draw();
    } catch (e) { say('The browser does not allow boosting this page (browser pages and the Web Store are off limits).', true); }
  }
  async function videoSet() {
    try {
      await inject();
      var s = sum(await run(function (l, lim) { return window.__mesvb ? window.__mesvb.set(l, lim) : null; }, [level, S.limiter]));
      if (!s.media) { say('No video found on this page yet. Start the video, or try Whole tab for other sound.', true); return; }
      if (s.suspended) { say('The page has not been clicked yet, so the browser keeps its audio paused. Click anywhere on the page once, then move the slider again.', true); return; }
      if (!s.applied && s.unsafe) { say('This video comes from another site that does not allow boosting here. Try Whole tab.', true); return; }
      active = s.applied > 0 || active; badge();
      say(level === 100 ? 'Normal volume.' : level > 100 ? 'Boosted ' + V.decibels(level) + ' dB.' : 'Quieter than normal.');
    } catch (e) { say('The browser does not allow boosting this page (browser pages and the Web Store are off limits).', true); }
  }

  // ---- whole tab mode ----
  async function tabSet() {
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
  }

  async function apply(l) {
    level = V.clampLevel(l, S.max); draw();
    clearTimeout(timer);
    timer = setTimeout(async function () {
      if (!tab || busy) return;
      if (S.mode === 'video') await videoSet(); else await tabSet();
      draw();
      if (S.remember && host) chrome.storage.local.get('mesvbSites', function (a) { var m = (a && a.mesvbSites) || {}; if (level === 100) delete m[host]; else m[host] = level; chrome.storage.local.set({ mesvbSites: m }); });
    }, 120);
  }

  $('slider').oninput = function () { apply(Number($('slider').value)); };
  $('presets').onclick = function (e) { if (e.target.dataset && e.target.dataset.l) apply(Number(e.target.dataset.l)); };
  $('limiter').onchange = function () {
    S.limiter = $('limiter').checked; chrome.storage.sync.set({ mesvb: S });
    if (tab && active) { if (S.mode === 'video') videoSet(); else relay({ target: 'offscreen', type: 'set', tabId: tab.id, limiter: S.limiter }); }
  };
  $('off').onclick = async function () { await relay({ target: 'offscreen', type: 'stop', tabId: tab.id }); active = false; level = 100; badge(); draw(); say('Boost turned off.'); };
  $('mode').onclick = async function (e) {
    if (!e.target.dataset || !e.target.dataset.m || e.target.dataset.m === S.mode) return;
    S.mode = e.target.dataset.m; chrome.storage.sync.set({ mesvb: S });
    active = false; level = 100; say(); draw();
    if (S.mode === 'video') videoStatus(); else { var st = await relay({ target: 'offscreen', type: 'get', tabId: tab.id }); if (st && st.active) { active = true; level = st.level; } draw(); }
  };

  chrome.storage.sync.get('mesvb', function (a) {
    S = V.merge(a && a.mesvb);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
      tab = tabs && tabs[0];
      try { host = new URL(tab.url).hostname; } catch (e) { host = ''; }
      $('host').textContent = host || 'this tab';
      draw();
      if (S.mode === 'video') await videoStatus();
      else { var st = tab ? await relay({ target: 'offscreen', type: 'get', tabId: tab.id }) : null; if (st && st.active) { active = true; level = st.level; } draw(); }
      if (!active && S.remember && host) chrome.storage.local.get('mesvbSites', function (a2) { var l = a2 && a2.mesvbSites && a2.mesvbSites[host]; if (l && !$('msg').textContent.trim()) say('Last time here: ' + l + '%. Click ' + l + '% to use it.'); });
    });
  });
})();
