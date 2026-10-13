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

function flip(tab) {
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { mesdm: 'toggle' }, { frameId: 0 }, function () {
    if (chrome.runtime.lastError) { badge(tab.id, '\u2715', '#777'); return; }   // browser pages and the web store cannot be changed
    setTimeout(function () {
      chrome.tabs.sendMessage(tab.id, { mesdm: 'status' }, { frameId: 0 }, function (r) {
        if (chrome.runtime.lastError || !r) return;
        badge(tab.id, r.off ? 'OFF' : (r.want ? 'DARK' : 'LIGHT'), r.off ? '#777' : (r.want ? '#1f2a44' : '#c98a00'));
      });
    }, 200);
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
