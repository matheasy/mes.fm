/* MESSplitView: the "power layout" of a text-in / text-out tool (first made for mes.fm/copy-text).
   Fill window / Full screen of the whole tool (main_js/panel-view.js, load it too) and, while it is on, the input part (a) and
   the results part (b) share the window: b Below / Right / Left / Hidden (the page picks which of these it offers), with a grip
   between them that resizes the split (drag, arrow keys, Shift = bigger steps, double-click / Enter / Home = back to normal).
   Choices are saved in localStorage opts.key as {lay, b, s} (b = input share when stacked, s = when side by side).

   MESSplitView.add({
     root,            // the element that fills the window (gets .mes-pfill from MESPanel)
     area,            // the parent of a and b (default root); it is laid out as a flex row / column while filling
     a, b,            // input part and results part (children of area)
     gripAfter,       // the grip goes right after this child of area (default a)
     bar,             // where the Fill window / Full screen buttons and the layout switch go
     key,             // localStorage key
     lays,            // e.g. ["b", "r", "l", "h"] (default all four)
     labels,          // {b: "Below", r: "Right", l: "Left", h: "Hidden"} overrides
     title,           // text in front of the switch, e.g. "Results:"
     def,             // default layout (default lays[0])
     hide,            // elements hidden while filling (e.g. the explanation text)
     onChange(on),    // after every change (redraw grids etc.)
     panel            // false = no Fill window buttons: the page turns the layout on itself with root.classList.add('msv-on') + api.apply()
   }) -> {apply(), set(lay)} or null (no MESPanel / no root) */
(function () {
  if (window.MESSplitView) return;
  var CSS = '.msv-lay{display:none;align-items:center;font-size:.85em;margin-right:auto;flex-wrap:wrap;gap:0}' +
    '.msv-lay>span{opacity:.8;margin-right:.45em}' +
    '.msv-lay button{cursor:pointer;border:1px solid #c3c9d2;background:#fff;color:#444;padding:.3em .7em;font:inherit;margin-left:-1px;min-height:30px}' +
    '.msv-lay button:first-of-type{border-radius:.4em 0 0 .4em;margin-left:0}.msv-lay button:last-of-type{border-radius:0 .4em .4em 0}' +
    '.msv-lay button[aria-pressed="true"]{background:var(--accent,#1d6fd1);border-color:var(--accent,#1d6fd1);color:#fff;font-weight:700}' +
    'body.dark-mode .msv-lay button{background:#262626;border-color:#4a4a4a;color:#d8dde3}' +
    'body.dark-mode .msv-lay button[aria-pressed="true"]{background:var(--accent,#6ea8fe);border-color:var(--accent,#6ea8fe);color:#111}' +
    '.msv-grip{display:none}' +
    ':is(.mes-pfill,.msv-on) .msv-x{display:none!important}' +
    ':is(.mes-pfill,.msv-on) .msv-area{display:flex!important;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;gap:0!important}' +
    ':is(.mes-pfill,.msv-on) .msv-area>.msv-a{flex:0 0 var(--msv-f,50%);min-height:5em;min-width:12em;overflow:auto;box-sizing:border-box;margin:0!important}' +
    ':is(.mes-pfill,.msv-on) .msv-area>.msv-b{flex:1 1 0;min-height:0;min-width:0;overflow:auto;box-sizing:border-box;margin:0!important}' +
    ':is(.mes-pfill,.msv-on) .msv-grip{display:flex;flex:0 0 12px;align-items:center;justify-content:center;cursor:row-resize;touch-action:none;outline:none}' +
    ':is(.mes-pfill,.msv-on) .msv-grip::before{content:"";width:3.5em;height:4px;border-radius:2px;background:#9aa3af;opacity:.7}' +
    ':is(.mes-pfill,.msv-on) .msv-grip:hover::before,:is(.mes-pfill,.msv-on) .msv-grip:focus-visible::before,:is(.mes-pfill,.msv-on) .msv-grip.is-drag::before{background:var(--accent,#1d6fd1);opacity:1}' +
    ':is(.mes-pfill,.msv-on).msv-r .msv-area,:is(.mes-pfill,.msv-on).msv-l .msv-area{flex-direction:row}' +
    ':is(.mes-pfill,.msv-on).msv-r .msv-grip,:is(.mes-pfill,.msv-on).msv-l .msv-grip{cursor:col-resize}' +
    ':is(.mes-pfill,.msv-on).msv-r .msv-grip::before,:is(.mes-pfill,.msv-on).msv-l .msv-grip::before{width:4px;height:3.5em}' +
    ':is(.mes-pfill,.msv-on).msv-l .msv-area>.msv-b{order:-2}:is(.mes-pfill,.msv-on).msv-l .msv-grip{order:-1}' +
    ':is(.mes-pfill,.msv-on).msv-h .msv-area>.msv-a{flex:1 1 auto}:is(.mes-pfill,.msv-on).msv-h .msv-area>.msv-b,:is(.mes-pfill,.msv-on).msv-h .msv-grip{display:none!important}' +
    '@media (max-width:700px){:is(.mes-pfill,.msv-on).msv-r .msv-area,:is(.mes-pfill,.msv-on).msv-l .msv-area{flex-direction:column}' +
    ':is(.mes-pfill,.msv-on).msv-l .msv-area>.msv-b,:is(.mes-pfill,.msv-on).msv-l .msv-grip{order:0}' +
    ':is(.mes-pfill,.msv-on).msv-r .msv-grip,:is(.mes-pfill,.msv-on).msv-l .msv-grip{cursor:row-resize}' +
    ':is(.mes-pfill,.msv-on).msv-r .msv-grip::before,:is(.mes-pfill,.msv-on).msv-l .msv-grip::before{width:3.5em;height:4px}}';
  var NAMES = { b: 'Below', r: 'Right', l: 'Left', h: 'Hidden' };

  function add(o) {
    if (!o || !o.root || !o.a || !o.b) return null;
    if (o.panel !== false && !window.MESPanel) { var n = 0; (function wait() { if (window.MESPanel) add(o); else if (++n < 100) setTimeout(wait, 60); })(); return null; }
    if (!document.getElementById('msv-css')) { var st = document.createElement('style'); st.id = 'msv-css'; st.textContent = CSS; document.head.appendChild(st); }
    var root = o.root, area = o.area || root, lays = o.lays || ['b', 'r', 'l', 'h'], labels = o.labels || {};
    var PW = { lay: o.def || lays[0], b: 0.45, s: 0.5 };
    try { var sv = JSON.parse(localStorage.getItem(o.key) || 'null'); if (sv && lays.indexOf(sv.lay) > -1) PW.lay = sv.lay; if (sv && sv.b > 0.1 && sv.b < 0.9) PW.b = +sv.b; if (sv && sv.s > 0.1 && sv.s < 0.9) PW.s = +sv.s; } catch (e) {}
    var save = function () { try { localStorage.setItem(o.key, JSON.stringify(PW)); } catch (e) {} };
    area.classList.add('msv-area'); o.a.classList.add('msv-a'); o.b.classList.add('msv-b');
    (o.hide || []).forEach(function (el) { if (el) el.classList.add('msv-x'); });
    var grip = document.createElement('div'); grip.className = 'msv-grip'; grip.tabIndex = 0; grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', 'Drag to change the size of the two parts'); grip.title = 'Drag to resize · double-click: back to the normal size';
    var after = o.gripAfter || o.a; after.parentNode.insertBefore(grip, after.nextSibling);
    var bar = o.bar || root, lay = null;
    if (lays.length > 1) {
      lay = document.createElement('div'); lay.className = 'msv-lay'; lay.setAttribute('role', 'group'); lay.setAttribute('aria-label', o.title || 'Layout');
      if (o.title) { var sp = document.createElement('span'); sp.textContent = o.title; lay.appendChild(sp); }
      lays.forEach(function (k) { var b = document.createElement('button'); b.type = 'button'; b.dataset.lay = k; b.textContent = labels[k] || NAMES[k]; lay.appendChild(b); });
      bar.insertBefore(lay, bar.firstChild);
      lay.addEventListener('click', function (e) { var b = e.target.closest('button[data-lay]'); if (b) set(b.dataset.lay); });
    }
    var side = function () { return (PW.lay === 'r' || PW.lay === 'l') && window.innerWidth > 700; };
    var changed = function () { if (o.onChange) { try { o.onChange(root.classList.contains('mes-pfill') || root.classList.contains('msv-on')); } catch (e) {} } };
    function apply() {
      ['b', 'r', 'l', 'h'].forEach(function (k) { root.classList.toggle('msv-' + k, PW.lay === k); });
      if (lay) lay.style.display = root.classList.contains('mes-pfill') || root.classList.contains('msv-on') ? 'inline-flex' : 'none';
      if (lay) Array.prototype.forEach.call(lay.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.lay === PW.lay ? 'true' : 'false'); });
      var f = side() ? PW.s : PW.b;
      area.style.setProperty('--msv-f', (f * 100).toFixed(1) + '%');
      grip.setAttribute('aria-orientation', side() ? 'vertical' : 'horizontal'); grip.setAttribute('aria-valuenow', Math.round(f * 100));
      grip.setAttribute('aria-valuemin', '15'); grip.setAttribute('aria-valuemax', '85');
    }
    function set(k) { if (lays.indexOf(k) < 0) return; PW.lay = k; save(); apply(); changed(); }
    function setFrac(f) { f = Math.max(0.15, Math.min(0.85, f)); if (side()) PW.s = f; else PW.b = f; apply(); }
    grip.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return; e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (x) {}
      grip.classList.add('is-drag');
      var r = area.getBoundingClientRect();
      var mv = function (ev) {
        if (side()) { var x = (ev.clientX - r.left) / r.width; setFrac(PW.lay === 'l' ? 1 - x : x); }
        else setFrac((ev.clientY - r.top) / r.height);
      };
      var up = function () { grip.classList.remove('is-drag'); grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); save(); changed(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    var reset = function () { if (side()) PW.s = 0.5; else PW.b = 0.45; apply(); save(); changed(); };
    grip.addEventListener('dblclick', reset);
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Home') { e.preventDefault(); reset(); return; }
      var stp = e.shiftKey ? 0.1 : 0.03, d = 0;
      if (side()) { if (e.key === 'ArrowLeft') d = PW.lay === 'l' ? stp : -stp; else if (e.key === 'ArrowRight') d = PW.lay === 'l' ? -stp : stp; }
      else { if (e.key === 'ArrowUp') d = -stp; else if (e.key === 'ArrowDown') d = stp; }
      if (!d) return; e.preventDefault(); setFrac((side() ? PW.s : PW.b) + d); save(); changed();
    });
    window.addEventListener('resize', apply);
    apply();
    if (o.panel !== false) MESPanel.add(root, { bar: bar, onChange: function (on) { apply(); changed(); if (on && o.focus) { try { o.focus.focus({ preventScroll: true }); } catch (e) {} } } });
    return { apply: apply, set: set };
  }
  window.MESSplitView = { add: add };
})();
