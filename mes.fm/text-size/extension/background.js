/* MES Text Size: service worker. Only the keyboard shortcuts live here: they change the level stored for the active tab's site, and every open
   page of that site (or of every site) follows through storage. */
'use strict';
importScripts('shared.js');
var T = MESTS;

chrome.commands.onCommand.addListener(function (cmd) {
  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    var tab = tabs && tabs[0]; if (!tab || !tab.url) return;
    var host; try { host = new URL(tab.url).hostname; } catch (e) { return; }
    var a = await chrome.storage.sync.get('mests'), S = T.merge(a && a.mests), cur = T.levelFor(S, host);
    var next = cmd === 'larger' ? T.stepLevel(cur, 1, S.step, S.min, S.max) : cmd === 'smaller' ? T.stepLevel(cur, -1, S.step, S.min, S.max) : 100;
    chrome.storage.sync.set({ mests: T.withLevel(S, host, next) });
  });
});
