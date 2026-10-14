/* MES Archive background: the keyboard shortcut, the right-click menus and the work for the popup. */
importScripts('engines.js', 'shared.js', 'hive.js');
function load(cb) { chrome.storage.sync.get(null, function (raw) { cb(MESARX.normalise(raw)); }); }
function badge(text, color) { chrome.action.setBadgeText({ text: text }); chrome.action.setBadgeBackgroundColor({ color: color || '#c0392b' }); setTimeout(function () { chrome.action.setBadgeText({ text: '' }); }, 3500); }

/* open every ticked site for pageUrl. When `tab` is given (the page itself, not a link) the Hive option reads the page and hands it to ArcHive; otherwise it opens ArcHive with the address filled in. */
function openFor(pageUrl, tab) {
  load(function (s) {
    var t = MESARX.targets(s, pageUrl);
    if (!t.length) { badge('!'); return; }
    var hive = t.filter(function (x) { return x.engine.id === 'hive'; })[0], others = t.filter(function (x) { return x.engine.id !== 'hive'; });
    others.forEach(function (x, i) { chrome.tabs.create({ url: x.url, active: !s.background && i === 0 && !hive }); });
    if (!hive) return;
    if (!tab) { chrome.tabs.create({ url: hive.url, active: true }); return; }
    MESHIVE.archiveTab(tab).then(function (r) {
      if (r.ok) return;
      badge('!');   // could not read the page (a protected page, say): fall back to ArcHive with the address, which checks whether it is already archived
      if (r.tabId != null) chrome.tabs.update(r.tabId, { url: hive.url, active: true }); else chrome.tabs.create({ url: hive.url, active: true });
    });
  });
}
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === 'archive' && msg.tabId != null) chrome.tabs.get(msg.tabId, function (tab) { if (tab) openFor(tab.url, tab); });
});
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'archive-page') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) openFor(tabs[0].url, tabs[0]); });
});
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: 'mes-archive-page', title: 'Archive this page (MES Archive)', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'mes-archive-link', title: 'Archive this link (MES Archive)', contexts: ['link'] });
});
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'mes-archive-link' && info.linkUrl) openFor(info.linkUrl, null);
  else if (info.menuItemId === 'mes-archive-page') openFor(info.pageUrl, tab);
});
