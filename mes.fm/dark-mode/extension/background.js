/* MES Dark Mode: service worker. Only the keyboard shortcut lives here: it asks the page in the active tab to flip between dark and light. */
'use strict';
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle-site') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs && tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { mesdm: 'toggle' }, { frameId: 0 }, function () { void chrome.runtime.lastError; });
  });
});
