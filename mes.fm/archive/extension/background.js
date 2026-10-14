/* MES Archive background: the keyboard shortcut and the right-click menus. */
importScripts('engines.js', 'shared.js');
function load(cb) { chrome.storage.sync.get(null, function (raw) { cb(MESARX.normalise(raw)); }); }
function openFor(pageUrl) {
  load(function (s) {
    var t = MESARX.targets(s, pageUrl);
    if (!t.length) { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#c0392b' }); setTimeout(function () { chrome.action.setBadgeText({ text: '' }); }, 2500); return; }
    t.forEach(function (x, i) { chrome.tabs.create({ url: x.url, active: !s.background && i === 0 }); });
  });
}
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'archive-page') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) openFor(tabs[0].url); });
});
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: 'mes-archive-page', title: 'Archive this page (MES Archive)', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'mes-archive-link', title: 'Archive this link (MES Archive)', contexts: ['link'] });
});
chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'mes-archive-link' && info.linkUrl) openFor(info.linkUrl);
  else if (info.menuItemId === 'mes-archive-page') openFor(info.pageUrl);
});
