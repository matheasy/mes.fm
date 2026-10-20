/* MES Dark Mode: service worker. The toolbar button either switches the current tab between dark and light with one click (default) or opens the panel; the keyboard
   shortcut and the right-click menu live here too. The popup is attached to the button only in "menu" mode (chrome.action.setPopup), so there is no flash of a panel in
   "toggle" mode. It also keeps each tab's own switch (chrome.storage.session, so a browser restart forgets them) and runs the one-time clean-up of old settings. */
'use strict';
importScripts('shared.js');
var V = self.MESDM;

function applyPopup() {
  V.loadStored(chrome, function (s) { chrome.action.setPopup({ popup: s && s.toolbar === 'menu' ? 'popup.html' : '' }); });
}
// settings saved by a version before 1.5.0: clean them up once (shared.js migrate) and leave a note for the options page
function migrateStored() {
  V.loadStored(chrome, function (stored) {
    if (!stored || (Number(stored.v) || 1) >= 3) return;
    var r = V.migrate(stored);
    var note = V.anyReset(r.reset) ? { mesdmReset: { at: Date.now(), sites: r.reset.sites, scope: r.reset.scope, setup: r.reset.setup, kept: r.reset.kept } } : null;
    function save() { try { chrome.storage.sync.set({ mesdm: r.S }); } catch (e) { /* ignore */ } try { chrome.storage.local.set({ mesdm: r.S }); } catch (e) { /* ignore */ } }
    if (note) chrome.storage.local.set(note, save); else save();
  });
}
applyPopup();
migrateStored();
chrome.runtime.onStartup.addListener(applyPopup);
chrome.runtime.onInstalled.addListener(function (d) {
  applyPopup();
  try { chrome.contextMenus.removeAll(function () { chrome.contextMenus.create({ id: 'panel', title: 'Open the Dark Mode panel for this site', contexts: ['action'] }); }); } catch (e) { /* ignore */ }
  if (d && (d.reason === 'install' || d.reason === 'update')) adoptOpenTabs();
});
// After an update the pages already open still run the old copy of the content script, which cannot be reached any more; before 1.5.0 it also kept putting its
// stylesheet back, so a page stayed dark until it was reloaded. Add the new copy to every open tab: it empties the old stylesheet and takes over, so open tabs
// are back to normal (a click switches them again) and work straight away. Tabs the extension may not touch (browser pages, discarded tabs) just fail quietly.
function adoptOpenTabs() {
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (t) {
      if (t.discarded) return;
      var target = { tabId: t.id, allFrames: true };
      chrome.scripting.executeScript({ target: target, func: function () { window.__mesdmAdopted = true; } }, function () {
        if (chrome.runtime.lastError) return;
        chrome.scripting.executeScript({ target: target, files: ['shared.js', 'content.js'] }, function () { void chrome.runtime.lastError; });
      });
    });
  });
}
chrome.storage.onChanged.addListener(function (ch, area) { if ((area === 'sync' || area === 'local') && ch.mesdm) applyPopup(); });

// ---- each tab's own switch: { tabId: { h: host, m: 'dark' | 'light' } } ---------------------------------------------------
// Kept here as well as in the page, because the page's sessionStorage is copied into duplicated, restored and opened tabs; a tab id is not.
var memTabs = {}, tabQ = Promise.resolve();
function withTabs(fn) {   // one read-modify-write at a time
  var area = chrome.storage.session;
  tabQ = tabQ.then(function () {
    return new Promise(function (ok) {
      if (!area) { ok(fn(memTabs)); return; }
      area.get('mesdmTabs', function (a) {
        var t = (a && a.mesdmTabs) || {}, before = JSON.stringify(t), out = fn(t);
        if (JSON.stringify(t) !== before) area.set({ mesdmTabs: t }, function () { ok(out); }); else ok(out);
      });
    });
  }).catch(function (e) { console.error('MES Dark Mode:', e); });
  return tabQ;
}
chrome.tabs.onRemoved.addListener(function (id) { withTabs(function (t) { delete t[id]; }); });
chrome.tabs.onReplaced.addListener(function (added, removed) { withTabs(function (t) { if (t[removed]) { t[added] = t[removed]; delete t[removed]; } }); });

chrome.runtime.onMessage.addListener(function (m, sender, reply) {
  if (!m || !m.mesdm || sender.id !== chrome.runtime.id) return;
  var tab = sender.tab && sender.tab.id, page = tab != null && sender.frameId === 0 && !/^chrome-extension:/.test(sender.url || ''), pre = sender.documentLifecycle === 'prerender';
  if (m.mesdm === 'hello' && page) {
    var h = String(m.h || '');
    withTabs(function (t) { return V.bgHello(t, String(tab), h, pre || !h); }).then(function (mode) { reply({ m: mode || '' }); });
    return true;
  }
  if (m.mesdm === 'tabset' && page && !pre) {
    withTabs(function (t) { V.bgSet(t, String(tab), String(m.h || ''), m.m); }).then(function () { reply({ ok: true }); });
    return true;
  }
  if (m.mesdm === 'state' && page && !pre) { showState(tab, m.st); return; }
  if (m.mesdm === 'flip' && /^chrome-extension:/.test(sender.url || '') && typeof m.tabId === 'number') {   // the "Switch" button in the panel
    flip({ id: m.tabId }, function (ok) { reply({ ok: ok }); });
    return true;
  }
});

// ---- toolbar icon: a moon while this tab is made dark, a sun otherwise; the tooltip says why ---------------------------------
function drawIcon(kind, size) {
  var c = new OffscreenCanvas(size, size), g = c.getContext('2d'), r = size / 2;
  if (kind === 'moon') {
    g.fillStyle = '#1f2a44'; g.beginPath(); g.arc(r, r, r * 0.96, 0, 7); g.fill();
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(r, r, r * 0.62, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(r * 1.32, r * 0.78, r * 0.55, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#1f2a44'; g.beginPath(); g.arc(r * 1.32, r * 0.78, r * 0.55, 0, 7); g.fill();
  } else {
    g.fillStyle = '#f5b301'; g.beginPath(); g.arc(r, r, r * 0.44, 0, 7); g.fill();
    g.strokeStyle = '#f5b301'; g.lineWidth = Math.max(1.4, size / 11); g.lineCap = 'round';
    for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; g.beginPath(); g.moveTo(r + Math.cos(a) * r * 0.66, r + Math.sin(a) * r * 0.66); g.lineTo(r + Math.cos(a) * r * 0.92, r + Math.sin(a) * r * 0.92); g.stroke(); }
  }
  return g.getImageData(0, 0, size, size);
}
var icons = {};
function iconData(kind) { return icons[kind] || (icons[kind] = { 16: drawIcon(kind, 16), 32: drawIcon(kind, 32) }); }
function showState(tabId, st) {
  if (!st || tabId == null) return;
  var e = V.explain(st);
  try {
    chrome.action.setIcon({ tabId: tabId, imageData: iconData(e.on ? 'moon' : 'sun') }, function () { void chrome.runtime.lastError; });
    chrome.action.setTitle({ tabId: tabId, title: 'MES Dark Mode: ' + e.text + ' ' + e.click }, function () { void chrome.runtime.lastError; });
  } catch (err) { /* the tab is gone */ }
}
function status(tabId, cb) {
  chrome.tabs.sendMessage(tabId, { mesdm: 'status' }, { frameId: 0 }, function (r) { if (chrome.runtime.lastError || !r) cb(null); else cb(r); });
}
function refresh(tabId, clear) {
  status(tabId, function (r) {
    if (r) { showState(tabId, r); return; }
    if (!clear) return;   // a page the extension cannot change (browser pages): back to the plain icon, so a moon from the page before does not stay
    try {
      chrome.action.setIcon({ tabId: tabId, path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } }, function () { void chrome.runtime.lastError; });
      chrome.action.setTitle({ tabId: tabId, title: 'MES Dark Mode: it cannot change this page.' }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* the tab is gone */ }
  });
}
chrome.tabs.onActivated.addListener(function (i) { refresh(i.tabId); });
chrome.tabs.onUpdated.addListener(function (id, ch) { if (ch.status === 'complete') setTimeout(function () { refresh(id, true); }, 150); });

// ---- the click --------------------------------------------------------------------------------------------------------------
function send(tab, done) {
  chrome.tabs.sendMessage(tab.id, { mesdm: 'toggle' }, { frameId: 0 }, function () { done(!chrome.runtime.lastError); });
}
function flip(tab, cb) {
  cb = cb || function () {};
  if (!tab || tab.id == null) { cb(false); return; }
  function after() { cb(true); setTimeout(function () { refresh(tab.id); }, 200); }
  send(tab, function (ok) {
    if (ok) { after(); return; }
    // the page was open before the extension was installed, reloaded or updated, so it has no working content script: add it now (the click grants access to this tab)
    try {
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['shared.js', 'content.js'] }, function () {
        if (chrome.runtime.lastError) { var why = chrome.runtime.lastError.message; console.error('MES Dark Mode:', why); badge(tab.id, '✕', '#777'); chrome.action.setTitle({ tabId: tab.id, title: 'MES Dark Mode cannot change this page: ' + why }); cb(false); return; }
        setTimeout(function () { send(tab, function (ok2) { if (ok2) after(); else { badge(tab.id, '✕', '#777'); cb(false); } }); }, 250);
      });
    } catch (e) { badge(tab.id, '✕', '#777'); cb(false); }
  });
}
function badge(tabId, text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: color });
    chrome.action.setBadgeText({ tabId: tabId, text: text });
    setTimeout(function () { chrome.action.setBadgeText({ tabId: tabId, text: '' }); }, 1600);
  } catch (e) { /* ignore */ }
}
chrome.action.onClicked.addListener(function (tab) { flip(tab); });   // only fires while no popup is attached ("toggle" mode)
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle-site') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) flip(tabs[0]); });
});
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'panel' && tab) chrome.windows.create({ url: chrome.runtime.getURL('popup.html') + '?tab=' + tab.id, type: 'popup', width: 360, height: 600 });
});
