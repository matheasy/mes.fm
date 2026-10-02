/* "Adjust it for inflation" box on the Money Facts pages (added by add_inflation_fact_links.py).
   Fills in what the page's old price is worth today from the calculator's own data file, so the number
   stays current; the link opens the Inflation Calculator with the same country, year and amount. */
(function () {
  'use strict';
  var box = document.querySelector('.ifc');
  if (!box) return;
  var country = box.getAttribute('data-c'), src = box.getAttribute('data-s'), year = +box.getAttribute('data-y'), amt = +box.getAttribute('data-a');
  var out = box.querySelector('.ifc__now');
  fetch('/inflationcalculator/data/inflation-data.json').then(function (r) { return r.json(); }).then(function (d) {
    var e = d.sources[src].countries[country];
    var base = e.a.v[year - e.a.s], last = null, lastY = '';
    for (var i = e.m.v.length - 1; i >= 0; i--) if (e.m.v[i] != null) { last = e.m.v[i]; lastY = e.m.s; break; }
    if (!base || last == null) return;
    var m = /^(\d+)-(\d+)$/.exec(e.m.s), k = +m[1] * 12 + (+m[2] - 1) + i;
    var money = function (v) {
      try { return new Intl.NumberFormat('en', { style: 'currency', currency: e.cur, maximumFractionDigits: v < 10 ? 2 : 0 }).format(v); } catch (x) { return v.toFixed(2); }
    };
    var when = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k % 12] + ' ' + Math.floor(k / 12);
    out.innerHTML = '<b>' + money(amt) + '</b> in ' + year + ' has the buying power of about <b class="ifc__big">' + money(amt * last / base) + '</b> in ' + when + ' (latest CPI data).';
  }).catch(function () { /* the link still works */ });
})();
