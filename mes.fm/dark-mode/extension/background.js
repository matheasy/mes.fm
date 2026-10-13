/* MES Dark Mode: service worker. The toolbar button either switches the current site between dark and light with one click (default) or opens the panel; the keyboard shortcut and
   the right-click menu live here too. The popup is attached to the button only in "menu" mode (chrome.action.setPopup), so there is no flash of a panel in "toggle" mode. */
'use strict';
function applyPopup() {
  chrome.storage.sync.get('mesdm', function (a) {
    var menu = !!(a && a.mesdm && a.mesdm.toolbar === 'menu');
    chrome.action.setPopup({ popup: menu ? 'popup.html' : '' });
  });
}
applyPopup();
chrome.runtime.onStartup.addListener(applyPopup);
chrome.runtime.onInstalled.addListener(function () {
  applyPopup();
  try { chrome.contextMenus.removeAll(function () { chrome.contextMenus.create({ id: 'panel', title: 'Open the Dark Mode panel for this site', contexts: ['action'] }); }); } catch (e) { /* ignore */ }
});
chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'sync' && ch.mesdm) applyPopup(); });

// ---- toolbar icon: a moon while the site is dark, a sun while it is light ------------------------------------------------
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
function setIcon(tabId, kind, title) {
  try {
    chrome.action.setIcon({ tabId: tabId, imageData: { 16: drawIcon(kind, 16), 32: drawIcon(kind, 32) } });
    chrome.action.setTitle({ tabId: tabId, title: title });
  } catch (e) { /* ignore */ }
}
function showState(tabId, r) {
  var dark = !!(r && !r.off && r.want);
  setIcon(tabId, dark ? 'moon' : 'sun', dark ? 'MES Dark Mode: this site is dark. Click for light.' : 'MES Dark Mode: this site is light. Click for dark.');
}
function status(tabId, cb) {
  chrome.tabs.sendMessage(tabId, { mesdm: 'status' }, { frameId: 0 }, function (r) { if (chrome.runtime.lastError || !r) cb(null); else cb(r); });
}
function refresh(tabId) { status(tabId, function (r) { if (r) showState(tabId, r); }); }
chrome.tabs.onActivated.addListener(function (i) { refresh(i.tabId); });
chrome.tabs.onUpdated.addListener(function (id, ch) { if (ch.status === 'complete') setTimeout(function () { refresh(id); }, 150); });

// ---- the click --------------------------------------------------------------------------------------------------------------
function send(tab, done) {
  chrome.tabs.sendMessage(tab.id, { mesdm: 'toggle' }, { frameId: 0 }, function () { done(!chrome.runtime.lastError); });
}
function flip(tab) {
  if (!tab || tab.id == null) return;
  function after() { setTimeout(function () { status(tab.id, function (r) { if (r) showState(tab.id, r); }); }, 200); }
  send(tab, function (ok) {
    if (ok) { after(); return; }
    // the page was open before the extension was installed or reloaded, so it has no content script yet: add it now (the click grants access to this tab)
    try {
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['shared.js', 'content.js'] }, function () {
        if (chrome.runtime.lastError) { badge(tab.id, '\u2715', '#777'); chrome.action.setTitle({ tabId: tab.id, title: 'MES Dark Mode cannot change this page (browser pages and the Chrome Web Store are off limits).' }); return; }
        setTimeout(function () { send(tab, function (ok2) { if (ok2) after(); else badge(tab.id, '\u2715', '#777'); }); }, 250);
      });
    } catch (e) { badge(tab.id, '\u2715', '#777'); }
  });
}
function badge(tabId, text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: color });
    chrome.action.setBadgeText({ tabId: tabId, text: text });
    setTimeout(function () { chrome.action.setBadgeText({ tabId: tabId, text: '' }); }, 1600);
  } catch (e) { /* ignore */ }
}
chrome.action.onClicked.addListener(flip);   // only fires while no popup is attached ("toggle" mode)
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle-site') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) flip(tabs[0]); });
});
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'panel' && tab) chrome.windows.create({ url: chrome.runtime.getURL('popup.html') + '?tab=' + tab.id, type: 'popup', width: 340, height: 560 });
});
