/* MES Read Aloud: service worker. The reader is only injected into a page when you ask for it (toolbar popup, shortcut or context menu),
   which is why the extension needs no "read all your data on all websites" permission. */
'use strict';
var FILES = ['srlib.js', 'shared.js', 'reader.js'];

async function ensure(tabId, frameId) {
  var opt = { frameId: frameId || 0 };
  try { await chrome.tabs.sendMessage(tabId, { mesra: 'ping' }, opt); return true; }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: tabId, frameIds: [opt.frameId] }, files: FILES });
    return true;
  }
}

async function send(tabId, msg, frameId) {
  try { await ensure(tabId, frameId); await chrome.tabs.sendMessage(tabId, msg, { frameId: frameId || 0 }); }
  catch (e) { /* a page the browser does not let extensions touch (chrome://, the Web Store ...) */ }
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: 'mesra-selection', title: 'Read selection aloud', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'mesra-page', title: 'Read this page aloud', contexts: ['page'] });
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!tab) return;
  send(tab.id, { mesra: 'read', mode: info.menuItemId === 'mesra-selection' ? 'selection' : 'page' }, info.menuItemId === 'mesra-selection' ? info.frameId : 0);
});

chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) send(tabs[0].id, { mesra: 'toggle' }); });
});

chrome.runtime.onMessage.addListener(function (m) {
  if (m && m.mesra === 'options') chrome.runtime.openOptionsPage();
});
