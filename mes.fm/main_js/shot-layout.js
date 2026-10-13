/* Screenshot layout switch: every .shot-layout bar sets every .screenshot-grid on the page (Auto / 1 / 2 / 3 columns), remembered in localStorage 'shotCols'
   (the same key mes.fm/hive-crypto-tutorial uses, so the choice carries between pages). Added by add_shot_layout.py. */
(function () {
  var bars = document.querySelectorAll('.shot-layout'), grids = document.querySelectorAll('.screenshot-grid');
  if (!bars.length || !grids.length) return;
  function set(v) {
    Array.prototype.forEach.call(grids, function (g) { g.setAttribute('data-cols', v); });
    Array.prototype.forEach.call(bars, function (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cols') === v ? 'true' : 'false'); });
    });
  }
  try { var s = localStorage.getItem('shotCols'); if (s && /^(auto|1|2|3)$/.test(s)) set(s); } catch (e) {}
  Array.prototype.forEach.call(bars, function (bar) {
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var v = b.getAttribute('data-cols'); set(v);
      try { localStorage.setItem('shotCols', v); } catch (err) {}
    });
  });
})();
