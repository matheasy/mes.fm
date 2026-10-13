/* Click-to-copy for browser-internal addresses (chrome://extensions, brave://extensions, edge://...) written in <code>.
   Web pages are not allowed to link to those, and double-clicking selects the whole sentence, so one click copies the address. */
(function () {
  var RX = /^(chrome|brave|edge):\/\/[\w\-\/]+$/i, tip;
  var css = document.createElement('style');
  css.textContent = 'code.copy-addr{cursor:copy;text-decoration:underline dotted;text-underline-offset:3px}code.copy-addr:hover,code.copy-addr:focus-visible{outline:2px solid currentColor;outline-offset:1px}.copy-tip{position:fixed;z-index:99999;background:#222;color:#fff;font:13px system-ui,sans-serif;padding:5px 9px;border-radius:6px;pointer-events:none}';
  document.head.appendChild(css);
  function copy(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, no) {
      var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); } a.remove();
    });
  }
  function show(el, msg) {
    if (tip) tip.remove();
    tip = document.createElement('div'); tip.className = 'copy-tip'; tip.textContent = msg;
    var r = el.getBoundingClientRect(); tip.style.left = Math.max(8, r.left) + 'px'; tip.style.top = Math.max(8, r.top - 34) + 'px';
    document.body.appendChild(tip); var t = tip; setTimeout(function () { t.remove(); }, 1800);
  }
  Array.prototype.forEach.call(document.querySelectorAll('code'), function (c) {
    var t = c.textContent.trim();
    if (!RX.test(t)) return;
    c.classList.add('copy-addr'); c.tabIndex = 0; c.setAttribute('role', 'button'); c.title = 'Click to copy, then paste it into the address bar';
    function go() { try { var r = document.createRange(); r.selectNodeContents(c); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ } copy(t).then(function () { show(c, 'Copied ' + t + ': paste it into the address bar'); }, function () { show(c, 'Could not copy: select it and press Ctrl/Cmd+C'); }); }
    c.addEventListener('click', go);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
})();
