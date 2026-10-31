/* yt-thumbs.js -- sharper YouTube thumbnails on the long video lists (mes.fm/youtube, mes.fm/experiments-draft; 2026-10-30).
   The pages are built with hqdefault.jpg (480x360, always exists; a 16:9 picture with black bars above and below, cropped
   away by the 16:9 box: background-size:cover on Grid View cards, aspect-ratio + object-fit:cover on List View images).
   Every element with data-yt="<video id>" that comes near the screen is then upgraded to maxresdefault.jpg (1280x720) when
   it is shown wider than hqdefault's 480px picture (after the screen's pixel ratio) -- but only once a probe Image() has
   loaded it at full size: for videos that have no HD thumbnail YouTube answers with a 120x90 grey placeholder, and then
   the hqdefault stays. Elements added later (main_js/list-topup.js's new videos) are picked up by a MutationObserver. */
(function () {
  'use strict';
  if (window.MESYtThumbs) return;
  var css = document.createElement('style');
  css.textContent = '.list-thumb[data-yt]{aspect-ratio:16/9;object-fit:cover}';
  document.head.appendChild(css);
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var ok = {};   // id -> true (HD exists) / false (placeholder) once probed

  function hd(id) { return 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg'; }
  function apply(e, id) {
    if (e.tagName === 'IMG') e.src = hd(id);
    else e.style.backgroundImage = "url('" + hd(id) + "')";
  }
  function upgrade(e) {
    var id = e.getAttribute('data-yt');
    if (!/^[\w-]{6,20}$/.test(id || '')) return;
    var w = e.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    if (w <= 500) return;   // hqdefault's 480px wide picture is already sharp enough here
    if (ok[id] === true) { apply(e, id); return; }
    if (ok[id] === false) return;
    var im = new Image();
    im.onload = function () { ok[id] = im.naturalWidth >= 640; if (ok[id]) apply(e, id); };
    im.onerror = function () { ok[id] = false; };
    im.src = hd(id);
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); upgrade(x.target); } });
  }, { rootMargin: '300px 0px' }) : null;

  function scan(root) {
    var list = (root || document).querySelectorAll ? (root || document).querySelectorAll('[data-yt]') : [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (seen) { if (seen.has(e)) continue; seen.add(e); } else { if (e.__yt) continue; e.__yt = 1; }
      if (io) io.observe(e); else upgrade(e);
    }
    if (root && root.nodeType === 1 && root.hasAttribute('data-yt')) { var r = root; if (!(seen ? seen.has(r) : r.__yt)) { if (seen) seen.add(r); else r.__yt = 1; if (io) io.observe(r); else upgrade(r); } }
  }
  // An element hidden when it was first seen (another tab, a filtered-out card) reports width 0; re-check it when shown.
  var again = function () {
    var list = document.querySelectorAll('[data-yt]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i], id = e.getAttribute('data-yt');
      if (ok[id] === true && (e.src || e.style.backgroundImage).indexOf('maxresdefault') < 0 && e.getClientRects().length) { if (io) { io.unobserve(e); io.observe(e); } }
      else if (ok[id] === undefined && e.getClientRects().length && io) { io.unobserve(e); io.observe(e); }
    }
  };
  var t = null;
  document.addEventListener('click', function () { clearTimeout(t); t = setTimeout(again, 120); }, true);
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(again, 250); });

  function start() {
    scan(document);
    if ('MutationObserver' in window) new MutationObserver(function (ms) {
      ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.MESYtThumbs = { scan: scan };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
