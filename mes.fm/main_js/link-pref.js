/* "Open in:" preferred-site switch (built by shared/link-pref.mjs). Every a[data-lp-def] carries data-l-<site> links;
   the chosen site (localStorage mes-linkpref, shared by every page with the switch) is used where the item has it,
   else the item's own default. Updates the link, its new-tab behaviour, the site icon and the "View on ..." caption. */
(function () {
  var KEY = 'mes-linkpref';
  var switches = Array.prototype.slice.call(document.querySelectorAll('[data-lp]'));
  if (!switches.length) return;
  var labels = {};
  switches.forEach(function (sw) {
    Array.prototype.forEach.call(sw.querySelectorAll('button[data-s]'), function (b) {
      if (b.getAttribute('data-label')) labels[b.getAttribute('data-s')] = b.getAttribute('data-label');
    });
  });
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function set(v) { try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) {} }
  var MES = /^https?:\/\/(?:www\.)?mes\.fm\//;

  function apply() {
    var pref = get();
    if (!labels[pref]) pref = 'auto'; // a site this page does not offer (chosen on another page): show Auto here
    switches.forEach(function (sw) {
      Array.prototype.forEach.call(sw.querySelectorAll('button[data-s]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-s') === pref ? 'true' : 'false');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[data-lp-def]'), function (a) {
      var def = a.getAttribute('data-lp-def');
      var s = pref !== 'auto' && a.hasAttribute('data-l-' + pref) ? pref : def;
      var url = a.getAttribute('data-l-' + s);
      if (!url) return;
      a.setAttribute('href', url);
      if (MES.test(url)) { a.removeAttribute('target'); a.removeAttribute('rel'); }
      else { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
      var ic = a.querySelector('.lp-ic');
      if (ic) ic.setAttribute('data-s', s);
      var nm = a.querySelector('.lp-name');
      if (nm && labels[s]) nm.textContent = 'View on ' + labels[s];
    });
  }

  switches.forEach(function (sw) {
    sw.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-s]');
      if (!b) return;
      var s = b.getAttribute('data-s');
      // Clicking the site that is already chosen goes back to Auto.
      set(s !== 'auto' && b.getAttribute('aria-pressed') === 'true' ? 'auto' : s);
      apply();
    });
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
  apply();
})();
