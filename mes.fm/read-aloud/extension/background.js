/* MES Read Aloud: service worker. The reader is only injected into a page when you ask for it (toolbar popup, shortcut or context menu),
   which is why the extension needs no "read all your data on all websites" permission. */
'use strict';
importScripts('shared.js');
var FILES = ['srlib.js', 'shared.js', 'reader.js'];

async function ensure(tabId, frameId) {
  var opt = { frameId: frameId || 0 };
  try { await chrome.tabs.sendMessage(tabId, { mesra: 'ping' }, opt); return true; }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: tabId, frameIds: [opt.frameId] }, files: FILES });
    return true;
  }
}

var DOC_PAGE = chrome.runtime.getURL('doc.html');
async function send(tabId, msg, frameId, url) {
  if (url && (MESRA.isPdfUrl(url) || MESRA.isDocxUrl(url))) { openDoc(url); return; }   // the browser's PDF viewer cannot be scripted: read it in our file reader page
  if (url && url.indexOf(DOC_PAGE) === 0) { msg.toTab = tabId; try { await chrome.runtime.sendMessage(msg); } catch (e) { /* ignore */ } return; }   // our own file reader page: the reader is already in it
  try { await ensure(tabId, frameId); await chrome.tabs.sendMessage(tabId, msg, { frameId: frameId || 0 }); }
  catch (e) { /* a page the browser does not let extensions touch (chrome://, the Web Store ...) */ }
}

function openDoc(src, tab) {
  chrome.tabs.create({ url: DOC_PAGE + (src ? '?src=' + encodeURIComponent(src) : ''), index: tab ? tab.index + 1 : undefined });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: 'mesra-link', title: 'Read this PDF / Word file aloud', contexts: ['link'], targetUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.PDF', '*://*/*.docx', '*://*/*.docx?*', 'file:///*.pdf', 'file:///*.docx'] });
    chrome.contextMenus.create({ id: 'mesra-selection', title: 'Read selection aloud', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'mesra-page', title: 'Read this page aloud', contexts: ['page'] });
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'mesra-link') { openDoc(info.linkUrl, tab); return; }
  if (!tab) return;
  send(tab.id, { mesra: 'read', mode: info.menuItemId === 'mesra-selection' ? 'selection' : 'page' }, info.menuItemId === 'mesra-selection' ? info.frameId : 0, tab.url);
});

chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) send(tabs[0].id, { mesra: 'toggle' }, 0, tabs[0].url); });
});

var DOCS_ORIGINS = ['https://docs.google.com/*', 'https://*.googleusercontent.com/*'];
chrome.runtime.onMessage.addListener(function (m, sender, reply) {
  if (!m) return;
  if (m.mesra === 'options') chrome.runtime.openOptionsPage();
  if (m.mesra === 'openDoc') { openDoc(m.src || '', sender && sender.tab); return; }
  /* Google Docs: the plain-text export redirects to *.googleusercontent.com, and a page script cannot read that answer (its CORS header is
     "*" with credentials). The service worker can, once the person has allowed the two Google hosts (optional permission, asked in the popup
     or the settings page). The request goes with the person's own Google login, straight to Google: nothing passes through mes.fm. */
  if (m.mesra === 'docsFetch') {
    var url = String(m.url || '');
    if (!/^https:\/\/docs\.google\.com\/document\/(u\/\d+\/)?d\/[\w-]{10,}\/export\?format=txt$/.test(url)) { reply({ ok: false, why: 'bad url' }); return; }
    chrome.permissions.contains({ origins: DOCS_ORIGINS }, function (has) {
      if (!has) { reply({ ok: false, why: 'no permission' }); return; }
      fetch(url, { credentials: 'include', redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); if (/text\/html/i.test(r.headers.get('content-type') || '')) throw new Error('sign-in page'); return r.text(); })
        .then(function (t) { reply({ ok: true, text: t }); }, function (e) { reply({ ok: false, why: String(e && e.message || e) }); });
    });
    return true;
  }
});
