/* "Fill window" and "Full screen" buttons for a chart or table card (the private /search-console and /ads pages).
   MESPanel.add(section, { bar: element for the buttons (default: the section's first heading row), onChange: fn }).
   Fill window = the card covers the browser window (position: fixed), Esc or the button closes it; Full screen = the browser's own
   full screen on the card (hidden where the browser has none, e.g. iPhone Safari). Both add .mes-pfill to the card, so a page styles
   one state; onChange (and a window resize event) let charts redraw at the new size. */
(function () {
  'use strict';
  if (window.MESPanel) return;
  var css = '.mes-pbtns{display:inline-flex;gap:.35em;flex-wrap:wrap}' +
    '.mes-pbtn{font:inherit;font-size:.82em;line-height:1.2;padding:.3em .7em;border-radius:999px;border:1px solid #b9c2cc;background:transparent;color:inherit;cursor:pointer;white-space:nowrap}' +
    '.mes-pbtn:hover{background:rgba(128,128,128,.12)}' +
    '.mes-pbtn[aria-pressed="true"]{background:#1d6fd1;border-color:#1d6fd1;color:#fff}' +
    'body.dark-mode .mes-pbtn{border-color:#555;color:#e3e7ec}' +
    'body.dark-mode .mes-pbtn[aria-pressed="true"]{background:#6ea8fe;border-color:#6ea8fe;color:#111}' +
    '.mes-pfill{position:fixed!important;inset:0!important;z-index:2147483000!important;margin:0!important;max-width:none!important;width:auto!important;height:auto!important;' +
    'border-radius:0!important;overflow:auto!important;box-sizing:border-box!important;padding:12px 16px!important;background:#fff!important;display:flex!important;flex-direction:column}' +
    'body.dark-mode .mes-pfill{background:#1a1a1a!important}' +
    '.mes-pfill:fullscreen{padding:16px 20px!important}' +
    'html.mes-pfill-on,html.mes-pfill-on body{overflow:hidden!important}' +
    '@media (max-width:600px){.mes-pbtn{font-size:.78em;padding:.3em .55em}}';
  var st = document.createElement('style'); st.id = 'mes-panel-css'; st.textContent = css; document.head.appendChild(st);
  var open = null; // the card in Fill window / full screen
  var fsEl = function () { return document.fullscreenElement || document.webkitFullscreenElement || null; };
  var canFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  function changed(p) { try { if (p.opts.onChange) p.opts.onChange(p.sec.classList.contains('mes-pfill')); } catch (e) {} try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
  function paint(p) {
    var on = p.sec.classList.contains('mes-pfill'), fs = fsEl() === p.sec;
    p.fill.setAttribute('aria-pressed', on && !fs ? 'true' : 'false');
    p.fill.textContent = on && !fs ? '✕ Close' : '⤢ Fill window';
    p.fill.title = on && !fs ? 'Back to the page (Esc)' : 'Cover the browser window with this card (Esc closes)';
    if (p.fs) { p.fs.setAttribute('aria-pressed', fs ? 'true' : 'false'); p.fs.textContent = fs ? '✕ Exit full screen' : '⛶ Full screen'; }
  }
  function setFill(p, on) {
    if (on && open && open !== p) setFill(open, false);
    p.sec.classList.toggle('mes-pfill', on);
    document.documentElement.classList.toggle('mes-pfill-on', on);
    open = on ? p : null;
    paint(p); changed(p);
    if (on) { try { p.sec.focus({ preventScroll: true }); } catch (e) {} }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open && !fsEl()) { e.preventDefault(); var p = open; setFill(p, false); try { p.fill.focus({ preventScroll: true }); } catch (x) {} }
  });
  function onFs() {
    var el = fsEl();
    if (open && el !== open.sec) { var p = open; open = null; p.sec.classList.remove('mes-pfill'); document.documentElement.classList.remove('mes-pfill-on'); paint(p); changed(p); }
    if (el && el.__mesPanel) { var q = el.__mesPanel; q.sec.classList.add('mes-pfill'); open = q; paint(q); changed(q); }
  }
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  function add(sec, opts) {
    if (!sec || sec.__mesPanel) return;
    opts = opts || {};
    var bar = opts.bar || sec.querySelector('h2') && sec.querySelector('h2').parentNode || sec;
    var g = document.createElement('span'); g.className = 'mes-pbtns';
    var p = { sec: sec, opts: opts };
    p.fill = document.createElement('button'); p.fill.type = 'button'; p.fill.className = 'mes-pbtn';
    p.fill.addEventListener('click', function () {
      if (fsEl() === sec) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      setFill(p, !sec.classList.contains('mes-pfill'));
    });
    g.appendChild(p.fill);
    if (canFs) {
      p.fs = document.createElement('button'); p.fs.type = 'button'; p.fs.className = 'mes-pbtn'; p.fs.title = 'Show this card on the whole screen';
      p.fs.addEventListener('click', function () {
        if (fsEl() === sec) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        if (open === p) { sec.classList.remove('mes-pfill'); document.documentElement.classList.remove('mes-pfill-on'); open = null; }
        var r = (sec.requestFullscreen || sec.webkitRequestFullscreen).call(sec);
        if (r && r.catch) r.catch(function () { setFill(p, true); });
      });
      g.appendChild(p.fs);
    }
    if (!sec.hasAttribute('tabindex')) sec.setAttribute('tabindex', '-1');
    sec.__mesPanel = p;
    bar.appendChild(g);
    paint(p);
    return p;
  }
  window.MESPanel = { add: add, close: function () { if (open) setFill(open, false); } };
})();
