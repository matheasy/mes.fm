/* MES Archive: hand the page you are on to ArcHive (https://dhenz14.github.io/archive/, a third-party Hive-blockchain archiver by dhenz14).
 * ArcHive has no server, so on a computer it can only read a page through its own bookmarklet: the bookmarklet reads the page, opens ArcHive in a popup and posts
 * it the content (ARCHIVE_READY / ARCHIVE_EXTRACT). This does the same without a bookmarklet: collectPage() runs in the page (main world, so YouTube's player data is
 * visible), ArcHive is opened in a normal tab, and sendToArchive() posts the content to it with ArcHive's own session nonce and current bookmarklet version (both
 * read from the ArcHive page itself, so ArcHive updates do not break it). Needs the "scripting" permission and host access to dhenz14.github.io. */
var MESHIVE = (function () {
  'use strict';
  var ARCHIVE_ORIGIN = 'https://dhenz14.github.io/archive';

  /* Runs INSIDE the page being archived (injected, so it must be self-contained). Returns what the ArcHive bookmarklet would send. */
  async function collectPage() {
    var url = location.href, out = { url: url, title: document.title, source: location.hostname, html: '', mode: 'normal', tweetOnlyHTML: '', repliesHTML: [], waybackMeta: null, youtubeData: null };
    if (/^https?:\/\/dhenz14\.github\.io\//.test(url) || /replit|repl\.co/.test(location.hostname)) { out.error = 'self'; return out; }
    out.html = document.documentElement.outerHTML;
    var isTwitter = /(^|\.)(twitter|x)\.com$/.test(location.hostname);
    if (isTwitter) {
      var withReplies = false; try { withReplies = localStorage.getItem('archiveIncludeReplies') === 'true'; } catch (e) {}
      var main = document.querySelector('article[data-testid="tweet"]');
      if (main) { out.tweetOnlyHTML = main.outerHTML; out.mode = withReplies ? 'with-replies' : 'tweet-only'; if (withReplies) document.querySelectorAll('div[data-testid="cellInnerDiv"]').forEach(function (cell, i) { if (i > 0 && cell.querySelector('article[data-testid="tweet"]')) out.repliesHTML.push(cell.outerHTML); }); }
    }
    if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\//.test(url)) {
      try {
        var pr = null, mp = document.getElementById('movie_player');
        if (mp && typeof mp.getPlayerResponse === 'function') { try { pr = mp.getPlayerResponse(); } catch (e) {} }
        if (!pr && typeof ytcfg !== 'undefined') { try { pr = (ytcfg.get && ytcfg.get('PLAYER_RESPONSE')) || (ytcfg.data_ && ytcfg.data_.PLAYER_RESPONSE); } catch (e) {} }
        if (!pr) pr = window.ytInitialPlayerResponse;
        if (pr) {
          var vd = pr.videoDetails || {}, tracks = (pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
          var ct = tracks.find(function (t) { return t.languageCode === 'en' && t.kind !== 'asr'; }) || tracks.find(function (t) { return t.languageCode === 'en'; }) || tracks.find(function (t) { return t.kind !== 'asr'; }) || tracks[0];
          if (ct && ct.baseUrl) {
            var xml = await (await fetch(ct.baseUrl)).text(), tr = '';
            Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).forEach(function (x) { var t = x[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#\d+;/g, '').replace(/\n/g, ' ').trim(); if (t) tr += t + ' '; });
            out.youtubeData = { videoId: vd.videoId, title: vd.title, author: vd.author, transcript: tr.trim(), captionLang: ct.languageCode };
          } else out.youtubeData = { videoId: vd.videoId, title: vd.title, author: vd.author, error: 'no_captions' };
        } else out.youtubeData = { error: 'no_player_response' };
      } catch (e) { out.youtubeData = { error: e.message }; }
    }
    if (location.hostname === 'web.archive.org') {
      var wb = url.match(/web\.archive\.org\/web\/(\d{14})\/(.+)/);
      if (wb) { var ts = wb[1]; out.waybackMeta = { timestamp: ts, snapshotDate: ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8), originalUrl: /^http/.test(wb[2]) ? wb[2] : 'http://' + wb[2] }; out.mode = 'wayback'; }
    }
    return out;
  }

  /* Runs INSIDE the ArcHive tab (main world): waits until ArcHive's message handler and session nonce exist, then posts the page to it. */
  async function sendToArchive(payload) {
    for (var i = 0; i < 80 && !(window._archiveSessionNonce && window.CURRENT_BOOKMARKLET_VERSION && document.getElementById('contentInput')); i++) await new Promise(function (r) { setTimeout(r, 250); });
    if (!window._archiveSessionNonce) return { ok: false, error: 'ArcHive did not finish loading' };
    var msg = Object.assign({ type: 'ARCHIVE_EXTRACT', bookmarkletVersion: window.CURRENT_BOOKMARKLET_VERSION, nonce: window._archiveSessionNonce, extractedData: { title: payload.title } }, payload);
    window.postMessage(msg, location.origin);
    return { ok: true };
  }

  function whenLoaded(tabId) {
    return new Promise(function (resolve) {
      function done() { chrome.tabs.onUpdated.removeListener(on); resolve(); }
      function on(id, info) { if (id === tabId && info.status === 'complete') done(); }
      chrome.tabs.onUpdated.addListener(on);
      chrome.tabs.get(tabId, function (t) { if (t && t.status === 'complete') done(); });
      setTimeout(done, 20000);
    });
  }

  /* Reads the page in `tab` and sends it to a new ArcHive tab. Resolves { ok } or { ok:false, error } (the caller can then open ArcHive with ?url= instead). */
  async function archiveTab(tab) {
    if (!tab || tab.id == null || !/^https?:/.test(tab.url || '')) return { ok: false, error: 'not an ordinary web page' };
    var res;
    try { res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: collectPage }); }
    catch (e) { return { ok: false, error: 'this page cannot be read (' + (e && e.message || e) + ')' }; }
    var page = res && res[0] && res[0].result;
    if (!page || page.error === 'self' || !page.html) return { ok: false, error: page && page.error === 'self' ? 'this is the ArcHive page itself' : 'the page returned nothing' };
    var created = await chrome.tabs.create({ url: ARCHIVE_ORIGIN + '/index.html?v=' + Date.now(), active: true });
    await whenLoaded(created.id);
    var sent;
    try { sent = await chrome.scripting.executeScript({ target: { tabId: created.id }, world: 'MAIN', func: sendToArchive, args: [page] }); }
    catch (e) { return { ok: false, error: 'could not reach ArcHive (' + (e && e.message || e) + ')', tabId: created.id }; }
    var r = sent && sent[0] && sent[0].result;
    return r && r.ok ? { ok: true, tabId: created.id } : { ok: false, error: (r && r.error) || 'ArcHive did not respond', tabId: created.id };
  }

  return { ARCHIVE_ORIGIN: ARCHIVE_ORIGIN, collectPage: collectPage, sendToArchive: sendToArchive, archiveTab: archiveTab };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESHIVE;
