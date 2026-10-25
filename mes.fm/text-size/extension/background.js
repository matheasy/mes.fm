/* MES Text Size: service worker. The keyboard shortcuts, each tab's own size (kept here as well as in the page, see shared.js) and the
   one-time move of 1.0.x settings to the 1.1.0 defaults. */
'use strict';
importScripts('shared.js');
var T = MESTS;

// ---- each tab's own size: { tabId: { h: host, l: level } } in chrome.storage.session (gone when the browser closes) ---------
var memTabs = {}, tabQ = Promise.resolve();
function withTabs(fn) {   // one read-modify-write at a time
  var area = chrome.storage.session;
  tabQ = tabQ.then(function () {
    return new Promise(function (ok) {
      if (!area) { ok(fn(memTabs)); return; }
      area.get('mestsTabs', function (a) {
        var t = (a && a.mestsTabs) || {}, before = JSON.stringify(t), out = fn(t);
        if (JSON.stringify(t) !== before) area.set({ mestsTabs: t }, function () { ok(out); }); else ok(out);
      });
    });
  }).catch(function (e) { console.error('MES Text Size:', e); });
  return tabQ;
}
chrome.tabs.onRemoved.addListener(function (id) { withTabs(function (t) { delete t[id]; }); });
chrome.tabs.onReplaced.addListener(function (added, removed) { withTabs(function (t) { if (t[removed]) { t[added] = t[removed]; delete t[removed]; } }); });

chrome.runtime.onMessage.addListener(function (m, sender, reply) {
  if (!m || !m.mests || sender.id !== chrome.runtime.id || !sender.tab) return;
  var tab = String(sender.tab.id), pre = sender.documentLifecycle === 'prerender', h = String(m.h || '');
  if (m.mests === 'hello') {   // frames (and prerendered pages) only read; the top page of a tab that moved to another site drops the record
    withTabs(function (t) { return T.bgHello(t, tab, h, pre || !h || !!m.frame || sender.frameId !== 0); }).then(function (l) { reply({ l: typeof l === 'number' ? l : null }); });
    return true;
  }
  if (m.mests === 'tabset' && sender.frameId === 0 && !pre) {
    withTabs(function (t) { T.bgSet(t, tab, h, m.l); }).then(function () { reply({ ok: true }); });
    return true;
  }
});

// 1.0.x -> 1.1.0: "this site" stops being the default (now "this tab only"); stray 100% site entries go. Done once, then saved with v: 2.
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get('mests', function (a) {
    if (a && a.mests && a.mests.v !== 2) chrome.storage.sync.set({ mests: T.merge(a.mests) });
  });
});

// ---- keyboard shortcuts: Alt+Shift+Up / Down / 0 -----------------------------------------------------------------------------
function ask(tabId, msg) {
  return new Promise(function (ok) {
    try { chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, function (r) { void chrome.runtime.lastError; ok(r || null); }); } catch (e) { ok(null); }
  });
}
chrome.commands.onCommand.addListener(function (cmd) {
  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    var tab = tabs && tabs[0]; if (!tab) return;
    var a = await chrome.storage.sync.get('mests'), S = T.merge(a && a.mests);
    var st = await ask(tab.id, { mests: 'get' });
    var host = st && st.host; if (!host) { try { host = new URL(tab.url).hostname; } catch (e) { return; } }
    var cur = st ? st.level : T.levelFor(S, host);
    var next = cmd === 'larger' ? T.stepLevel(cur, 1, S.step, S.min, S.max) : cmd === 'smaller' ? T.stepLevel(cur, -1, S.step, S.min, S.max) : 100;
    if (S.applyTo === 'tab') { chrome.tabs.sendMessage(tab.id, { mests: 'settab', l: next }, function () { void chrome.runtime.lastError; }); return; }
    await chrome.storage.sync.set({ mests: T.withLevel(S, host, next, S.applyTo) });
    if (st && st.tab != null) chrome.tabs.sendMessage(tab.id, { mests: 'settab', l: null }, function () { void chrome.runtime.lastError; });   // the new site / all size shows here too
  });
});
