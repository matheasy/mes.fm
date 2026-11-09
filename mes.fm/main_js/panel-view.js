/* "Fill window" and "Full screen" buttons for a chart or table card (the private /search-console and /ads pages).
   MESPanel.add(section, { bar: element for the buttons (default: the section's first heading row), onChange: fn }).
   Fill window = the card covers the browser window (position: fixed), Esc or the button closes it; Full screen = the browser's own
   full screen on the card (hidden where the browser has none, e.g. iPhone Safari). Both add .mes-pfill to the card, so a page styles
   one state; onChange (and a window resize event) let charts redraw at the new size.
   Phone held sideways / wide window (the backgammon layout): pass opts.stage (the board / picture element, a direct child of the
   section) and, while open and landscape, everything else moves into a side column and the stage gets the whole height
   (.mes-pside; the page reads stage.clientHeight in onChange to size itself). "Hide panel" leaves only the stage plus a small
   floating strip (.mes-pmini), "⇄" moves the panel to the other side. Shared choice: localStorage mes-panel:side = {r, m}.
   Pages with their own Fill window can use the same layout: MESPanel.side(section, {stage, open: fn, onChange, close}). */
(function () {
  'use strict';
  if (window.MESPanel) return;
  var css = '.mes-pbtns{display:inline-flex;gap:.35em;flex-wrap:wrap}' +
    '.mes-pbtn,.mes-ptb{font:inherit;font-size:.82em;line-height:1.2;padding:.3em .7em;border-radius:999px;border:1px solid #b9c2cc;background:transparent;color:inherit;cursor:pointer;white-space:nowrap}' +
    '.mes-pbtn:hover,.mes-ptb:hover{background:rgba(128,128,128,.12)}' +
    '.mes-pbtn[aria-pressed="true"]{background:#1d6fd1;border-color:#1d6fd1;color:#fff}' +
    'body.dark-mode .mes-pbtn,body.dark-mode .mes-ptb{border-color:#555;color:#e3e7ec}' +
    'body.dark-mode .mes-pbtn[aria-pressed="true"]{background:#6ea8fe;border-color:#6ea8fe;color:#111}' +
    '.mes-pfill{position:fixed!important;inset:0!important;z-index:2147483000!important;margin:0!important;max-width:none!important;width:auto!important;height:auto!important;' +
    'border-radius:0!important;overflow:auto!important;box-sizing:border-box!important;padding:12px 16px!important;background:#fff!important;display:flex!important;flex-direction:column}' +
    'body.dark-mode .mes-pfill{background:#1a1a1a!important}' +
    '.mes-pfill:fullscreen{padding:16px 20px!important}' +
    'html.mes-pfill-on,html.mes-pfill-on body{overflow:hidden!important}' +
    '@media (max-width:600px){.mes-pbtn{font-size:.78em;padding:.3em .55em}}' +
    '@media (max-height:520px){.mes-pfill{padding:6px 10px!important}.mes-pfill:fullscreen{padding:8px 12px!important}}' +
    '.mes-ptools{display:none}' +
    '.mes-pside{display:grid!important;grid-template-columns:var(--mes-pw,240px) minmax(0,1fr);grid-template-rows:repeat(40,min-content) 1fr;row-gap:0;column-gap:12px;align-content:start}' +
    '.mes-pside>*{grid-column:1;min-width:0;max-width:100%;margin-left:0!important;margin-right:0!important;box-sizing:border-box}' +
    '.mes-pside>[data-mes-stage]{grid-column:2;grid-row:1/-1;align-self:start;position:sticky;top:0;max-height:none!important;overflow:auto;margin:0!important}' +
    '.mes-pside.mes-pright{grid-template-columns:minmax(0,1fr) var(--mes-pw,240px)}' +
    '.mes-pside.mes-pright>*{grid-column:2}.mes-pside.mes-pright>[data-mes-stage]{grid-column:1}' +
    '.mes-pside>.mes-ptools{display:flex;flex-wrap:wrap;gap:.35em;margin:0 0 .45em!important}' +
    /* hidden panel = the stage gets everything; only a small tab on the panel's edge (and its X) is left */
    '.mes-pside.mes-pmini{grid-template-columns:minmax(0,1fr)!important;padding:0!important}' +
    '.mes-pmini>*:not([data-mes-stage]):not(.mes-ptools){display:none!important}' +
    '.mes-pside.mes-pmini>[data-mes-stage]{grid-column:1!important}' +
    '.mes-pside.mes-pmini>.mes-ptools{position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:30;flex-direction:column;flex-wrap:nowrap;gap:4px;margin:0!important;opacity:.55;transition:opacity .2s}' +
    '.mes-pside.mes-pmini.mes-pright>.mes-ptools{left:auto;right:0;align-items:flex-end}' +
    '.mes-pside.mes-pmini>.mes-ptools:hover,.mes-pside.mes-pmini>.mes-ptools:focus-within{opacity:1}' +
    '.mes-pmini>.mes-ptools>.mes-pflip,.mes-pmini>.mes-ptools>.mes-pclose{display:none}' +
    '.mes-pmini>.mes-ptools .mes-ptb{min-height:0;padding:0;width:26px;font-size:15px;line-height:1;border-radius:0 9px 9px 0;border-left:0}' +
    '.mes-pmini>.mes-ptools .mes-phide{height:46px}.mes-pmini>.mes-ptools .mes-pgo{height:26px;font-size:13px}' +
    '.mes-pmini.mes-pright>.mes-ptools .mes-ptb{border-radius:9px 0 0 9px;border-left:1px solid #b9c2cc;border-right:0}' +
    '.mes-ptools>.mes-pgo{display:none}.mes-pmini>.mes-ptools>.mes-pgo{display:block}' +
    '.mes-pgone>.mes-ptools{display:none!important}' +
    '.mes-ptools .mes-ptb{background:rgba(255,255,255,.92);min-height:34px}' +
    'body.dark-mode .mes-ptools .mes-ptb{background:rgba(30,32,36,.92);color:#e3e7ec;border-color:#555}';
  var st = document.createElement('style'); st.id = 'mes-panel-css'; st.textContent = css; document.head.appendChild(st);
  var open = null; // the card in Fill window / full screen
  var fsEl = function () { return document.fullscreenElement || document.webkitFullscreenElement || null; };
  var canFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  /* ---- side panel layout ---- */
  var SKEY = 'mes-panel:side', SP = { r: false, m: false };
  try { var sp0 = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (sp0) { SP.r = !!sp0.r; SP.m = !!sp0.m; } } catch (e) {}
  var sides = [];
  function side(sec, o) {
    if (!sec || !o || !o.stage || sec.__mesSide) return sec && sec.__mesSide;
    var stage = o.stage; stage.setAttribute('data-mes-stage', '');
    var tools = document.createElement('div'); tools.className = 'mes-ptools';
    function mk(txt, title, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'mes-ptb'; b.textContent = txt; b.title = title; b.addEventListener('click', fn); tools.appendChild(b); return b; }
    var q = { sec: sec, o: o, on: false };
    q.hide = mk('‹ Hide panel', 'Hide the controls: only the board stays', function () { SP.m = !SP.m; save(); sides.forEach(apply); });
    q.hide.classList.add('mes-phide');
    q.flip = mk('⇄', 'Put the panel on the other side', function () { SP.r = !SP.r; save(); sides.forEach(apply); });
    q.flip.classList.add('mes-pflip');
    if (o.close) { q.close = mk('✕', 'Close (Esc)', function () { o.close(); }); q.close.classList.add('mes-pclose'); }
    // the X on the small tab hides even the tab, until this full screen / Fill window is closed and opened again
    // (or the very edge of the picture is tapped, so a phone without Esc can always get back)
    q.go = mk('×', 'Hide this tab too (comes back next time, or tap the very edge)', function () { q.gone = true; q.apply(); });
    q.go.classList.add('mes-pgo');
    sec.addEventListener('pointerdown', function (e) {
      if (!q.gone || !sec.classList.contains('mes-pmini')) return;
      var r = sec.getBoundingClientRect(), d = SP.r ? r.right - e.clientX : e.clientX - r.left;
      if (d >= 0 && d < 36) { q.gone = false; q.apply(); }
    }, true);
    sec.insertBefore(tools, sec.firstChild === stage ? stage : sec.firstChild);
    function save() { try { localStorage.setItem(SKEY, JSON.stringify(SP)); } catch (e) {} }
    q.apply = function () {
      var open = !!(o.open && o.open()), w = sec.clientWidth, h = sec.clientHeight;
      var want = open && w >= 480 && w >= h * 1.2;
      var was = q.on + '|' + sec.classList.contains('mes-pmini') + '|' + sec.classList.contains('mes-pright');
      sec.classList.toggle('mes-pside', want);
      sec.classList.toggle('mes-pmini', want && SP.m);
      sec.classList.toggle('mes-pright', want && SP.r);
      if (!open) q.gone = false;
      sec.classList.toggle('mes-pgone', want && SP.m && !!q.gone);
      q.hide.textContent = SP.m ? (SP.r ? '‹' : '›') : '‹ Hide panel';
      q.hide.title = SP.m ? 'Show the panel' : 'Hide the controls: only the board stays';
      q.hide.setAttribute('aria-pressed', SP.m ? 'true' : 'false');
      if (want) {
        var cs = getComputedStyle(sec), padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        sec.style.setProperty('--mes-pw', Math.round(Math.max(190, Math.min(320, w * 0.3))) + 'px');
        stage.style.height = Math.max(120, h - padV) + 'px';
        sec.style.setProperty('--mes-sh', Math.max(120, h - padV) + 'px');
      } else { stage.style.height = ''; sec.style.removeProperty('--mes-pw'); sec.style.removeProperty('--mes-sh'); }
      q.on = want;
      var now = q.on + '|' + sec.classList.contains('mes-pmini') + '|' + sec.classList.contains('mes-pright');
      if (now !== was && o.onChange) { try { o.onChange(want); } catch (e) {} }
    };
    function apply2() { q.apply(); }
    sides.push(q);
    window.addEventListener('resize', apply2);
    document.addEventListener('fullscreenchange', function () { setTimeout(apply2, 60); setTimeout(apply2, 400); });
    if (window.ResizeObserver) new ResizeObserver(apply2).observe(sec);
    sec.__mesSide = q;
    q.apply();
    return q;
  }
  function apply(q) { q.apply(); }
  function changed(p) {
    if (p.sec.__mesSide) p.sec.__mesSide.apply(); try { if (p.opts.onChange) p.opts.onChange(p.sec.classList.contains('mes-pfill')); } catch (e) {} try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
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
    if (opts.stage) side(sec, { stage: opts.stage, open: function () { return sec.classList.contains('mes-pfill'); },
      onChange: function (on) { try { if (opts.onChange) opts.onChange(true, on); } catch (e) {} try { window.dispatchEvent(new Event('resize')); } catch (e) {} },
      close: function () { if (fsEl() === sec) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else setFill(p, false); } });
    return p;
  }
  window.MESPanel = { add: add, side: side, close: function () { if (open) setFill(open, false); } };
})();
