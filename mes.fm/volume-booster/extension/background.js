/* MES Volume Booster: service worker. Creates the offscreen audio document, relays start / set / stop to it, keeps the toolbar badge in step
   and handles the keyboard shortcuts (which, like the popup, count as the click that lets us capture the tab's audio). */
'use strict';
importScripts('shared.js');
var V = MESVB;

async function ensureOffscreen() {
  var ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!ctxs.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Boost the volume of a tab with the Web Audio API' });
}

function offscreen(msg) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(Object.assign({ target: 'offscreen' }, msg), function (r) { void chrome.runtime.lastError; resolve(r || null); });
  });
}

async function settings() {
  var a = await chrome.storage.sync.get('mesvb');
  return V.merge(a && a.mesvb);
}

function paintBadge(tabId, level) {
  var text = V.badge(level);
  chrome.action.setBadgeText({ tabId: tabId, text: text });
  if (text) chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: level > 100 ? '#b45309' : '#475569' });
}

async function start(tabId, streamId, level) {
  var S = await settings();
  await ensureOffscreen();
  var r = await offscreen({ type: 'start', tabId: tabId, streamId: streamId, level: level, limiter: S.limiter });
  if (r && r.ok) paintBadge(tabId, level);
  return r || { ok: false, error: 'The audio helper did not answer.' };
}

chrome.runtime.onMessage.addListener(function (m, sender, send) {
  if (!m || m.target !== 'background') return;
  if (m.type === 'start') { start(m.tabId, m.streamId, m.level).then(send); return true; }
  if (m.type === 'level') { paintBadge(m.tabId, m.level); }
  if (m.type === 'stopped') { chrome.action.setBadgeText({ tabId: m.tabId, text: '' }); }
});

chrome.tabs.onRemoved.addListener(function (tabId) { offscreen({ type: 'stop', tabId: tabId }); });

// keyboard shortcuts: in video mode they inject the booster into the active tab's frames (the shortcut counts as the click that allows it) and
// step the level; in whole-tab mode they use tab capture as before
async function nudgeVideo(tab, dir, S) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['shared.js', 'content.js'] });
  var st = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: function () { return window.__mesvb ? window.__mesvb.status() : null; } });
  var boosted = (st || []).filter(function (r) { return r.result && r.result.boosted; });
  var cur = boosted.length ? Math.max.apply(null, boosted.map(function (r) { return r.result.level; })) : 100;
  var level = V.stepLevel(cur, dir, S.step, S.max);
  var res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: function (l, lim) { return window.__mesvb ? window.__mesvb.set(l, lim) : null; }, args: [level, S.limiter] });
  var ok = (res || []).some(function (r) { return r.result && r.result.applied; });
  if (ok) paintBadge(tab.id, level);
}

async function nudge(dir) {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs && tabs[0]; if (!tab) return;
  var S = await settings();
  try {
    if (S.mode === 'video') { await nudgeVideo(tab, dir, S); return; }
    var st = await offscreen({ type: 'get', tabId: tab.id }) || { active: false, level: 100 };
    var level = V.stepLevel(st.active ? st.level : 100, dir, S.step, S.max);
    if (st.active) { await offscreen({ type: 'set', tabId: tab.id, level: level }); paintBadge(tab.id, level); return; }
    var streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await start(tab.id, streamId, level);
  } catch (e) { /* a page the browser does not let us touch */ }
}
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd === 'boost-up') nudge(1);
  else if (cmd === 'boost-down') nudge(-1);
  else if (cmd === 'boost-off') chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    var tab = tabs && tabs[0]; if (!tab) return;
    offscreen({ type: 'stop', tabId: tab.id });
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: function () { if (window.__mesvb) window.__mesvb.set(100); } }); } catch (e) { /* ignore */ }
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  });
});
