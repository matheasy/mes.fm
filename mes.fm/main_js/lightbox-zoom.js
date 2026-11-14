/* MES image lightbox zoom (shared by every page that has #lightboxOverlay).
 * Pages load this through a tiny loader left where the old inline zoom script
 * was (add_lightbox_zoom.py), so changes here reach every page at once.
 *
 * - Zoom 10% .. 800%: buttons / + and - keys step 10% up to 200%, 25% up to
 *   400%, 50% above; click the % label (or press 0) to go back to 100%.
 * - Mouse wheel (or trackpad pinch / Ctrl+wheel) zooms towards the pointer;
 *   two-finger pinch on touch screens.
 * - Drag to move the picture when it is bigger than the screen; double-click
 *   switches 100% <-> 200% at that point.
 * - A drag that ends outside the picture never closes the viewer.
 */
(function () {
  if (window.__mesLightboxZoom) return;
  window.__mesLightboxZoom = 1;

  function init() {
    var overlay = document.getElementById('lightboxOverlay');
    var img = document.getElementById('lightboxImage');
    var outBtn = document.getElementById('lightboxZoomOut');
    var inBtn = document.getElementById('lightboxZoomIn');
    var label = document.getElementById('lightboxZoomLevel');
    if (!overlay || !img || !outBtn || !inBtn || !label) return;

    var MIN = 0.1, MAX = 8;
    var z = 1, px = 0, py = 0;
    var anim = false;

    var css = document.createElement('style');
    css.textContent =
      '#lightboxImage{transform-origin:50% 50%;will-change:transform;touch-action:none;}' +
      '#lightboxImage.lbz-anim{transition:transform .14s ease;}' +
      '#lightboxImage:not(.lbz-anim){transition:none!important;}' +
      '#lightboxImage.zoomed{cursor:grab;}#lightboxImage.dragging{cursor:grabbing;}' +
      '#lightboxZoomLevel{cursor:pointer;user-select:none;}' +
      '#lightboxOverlay.open{overscroll-behavior:contain;}';
    document.head.appendChild(css);
    label.title = 'Back to 100% (0)';
    outBtn.title = 'Zoom out (-, or scroll the mouse wheel)';
    inBtn.title = 'Zoom in (+, or scroll the mouse wheel)';

    function clamp(v) { return Math.max(MIN, Math.min(MAX, v)); }
    function round(v) { return Math.round(v * 1000) / 1000; }

    function apply() {
      img.classList.toggle('lbz-anim', anim);
      img.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + z + ')';
      img.classList.toggle('zoomed', z > 1.001 || px || py);
      label.textContent = Math.round(z * 100) + '%';
      outBtn.disabled = z <= MIN + 1e-6;
      inBtn.disabled = z >= MAX - 1e-6;
    }

    /* Centre of the picture before our transform (screen coords). */
    function origin() {
      // layout box, unaffected by our transform (or one still animating)
      var p = img.offsetParent;
      if (p) {
        var r0 = p.getBoundingClientRect();
        return { x: r0.left + p.clientLeft + img.offsetLeft + img.offsetWidth / 2,
                 y: r0.top + p.clientTop + img.offsetTop + img.offsetHeight / 2 };
      }
      var r = img.getBoundingClientRect();
      return { x: r.left + r.width / 2 - px, y: r.top + r.height / 2 - py };
    }

    /* Zoom to nz keeping the screen point (sx, sy) still. */
    function zoomTo(nz, sx, sy, animate) {
      nz = round(clamp(nz));
      if (sx == null) { var o0 = origin(); sx = o0.x + px; sy = o0.y + py; }
      var o = origin();
      var k = nz / z;
      px = sx - o.x - k * (sx - o.x - px);
      py = sy - o.y - k * (sy - o.y - py);
      z = nz;
      if (z <= 1.0005) { // at or below fit size the picture stays centred
        if (z > 0.9995) z = 1;
        px = 0; py = 0;
      }
      anim = !!animate;
      apply();
    }

    function stepSize(v, up) {
      if (up ? v < 2 - 1e-6 : v <= 2 + 1e-6) return 0.1;
      if (up ? v < 4 - 1e-6 : v <= 4 + 1e-6) return 0.25;
      return 0.5;
    }
    function step(dir) {
      var s = stepSize(z, dir > 0);
      var n = dir > 0 ? Math.floor(z / s + 1e-6) * s + s : Math.ceil(z / s - 1e-6) * s - s;
      zoomTo(n, null, null, true);
    }

    function reset() { z = 1; px = 0; py = 0; drag = null; pinch = null; img.classList.remove('dragging'); anim = false; apply(); }

    outBtn.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    inBtn.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    label.addEventListener('click', function (e) { e.stopPropagation(); zoomTo(1, null, null, true); });

    /* Wheel: mouse wheel and trackpad pinch (ctrlKey) both zoom. */
    overlay.addEventListener('wheel', function (e) {
      if (!overlay.classList.contains('open')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 400;
      var f = Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0022));
      f = Math.max(0.5, Math.min(2, f));
      zoomTo(z * f, e.clientX, e.clientY, false);
    }, { passive: false, capture: true });

    /* Double-click toggles 100% <-> 200% at the pointer. */
    img.addEventListener('dblclick', function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (Math.abs(z - 1) > 0.01) zoomTo(1, null, null, true);
      else zoomTo(2, e.clientX, e.clientY, true);
    }, true);

    /* Drag to pan (mouse / pen / one finger). */
    var drag = null, moved = false, pinch = null;
    function canPan() { return z > 1.001; }

    img.addEventListener('mousedown', function (e) {
      e.preventDefault(); // no native image drag
      e.stopImmediatePropagation();
      if (e.button !== 0 || !canPan()) return;
      drag = { x: e.clientX, y: e.clientY, px: px, py: py };
      moved = false;
      img.classList.add('dragging');
    }, true);
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      px = drag.px + dx; py = drag.py + dy; anim = false; apply();
    }, true);
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null; img.classList.remove('dragging');
    }, true);

    /* A click that ends a drag must not close the viewer or change picture. */
    /* The <img> box is bigger than the picture (object-fit: contain), so a
       click on the empty bars beside it counts as "outside" and closes. */
    function picRect() {
      var r = img.getBoundingClientRect();
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh || !r.width || !r.height) return r;
      var k = Math.min(r.width / nw, r.height / nh);
      var w = nw * k, h = nh * k;
      return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, right: r.left + (r.width + w) / 2, bottom: r.top + (r.height + h) / 2 };
    }
    function closeViewer() {
      var b = document.getElementById('lightboxClose');
      if (b) b.click();
      else { overlay.classList.remove('open'); document.body.style.overflow = ''; }
    }
    overlay.addEventListener('click', function (e) {
      if (moved) { moved = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (e.target === img) {
        var p = picRect();
        if (e.clientX < p.left || e.clientX > p.right || e.clientY < p.top || e.clientY > p.bottom) {
          e.stopImmediatePropagation(); e.preventDefault();
          closeViewer();
        }
      }
    }, true);
    /* Arrow cursor over the empty bars, so it is clear a click there closes. */
    img.addEventListener('mousemove', function (e) {
      if (drag) return;
      var p = picRect();
      var out = e.clientX < p.left || e.clientX > p.right || e.clientY < p.top || e.clientY > p.bottom;
      img.style.cursor = out ? 'default' : '';
    });

    function dist(t) { var a = t[0], b = t[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function mid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

    img.addEventListener('touchstart', function (e) {
      e.stopImmediatePropagation();
      if (e.touches.length === 2) {
        var m = mid(e.touches);
        pinch = { d: dist(e.touches), z: z, x: m.x, y: m.y };
        drag = null;
      } else if (e.touches.length === 1 && canPan()) {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: px, py: py };
        moved = false;
      }
    }, { passive: true, capture: true });
    img.addEventListener('touchmove', function (e) {
      e.stopImmediatePropagation();
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        var m = mid(e.touches);
        // pan with the fingers' midpoint, then zoom about it
        if (z > 1.001) { px += m.x - pinch.x; py += m.y - pinch.y; }
        pinch.x = m.x; pinch.y = m.y;
        zoomTo(pinch.z * dist(e.touches) / pinch.d, m.x, m.y, false);
      } else if (drag && e.touches.length === 1) {
        e.preventDefault();
        var dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        px = drag.px + dx; py = drag.py + dy; anim = false; apply();
      }
    }, { passive: false, capture: true });
    img.addEventListener('touchend', function (e) {
      e.stopImmediatePropagation();
      if (e.touches.length < 2) pinch = null;
      if (!e.touches.length) drag = null;
    }, { capture: true });

    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open') || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-' || e.key === '_') step(-1);
      else if (e.key === '0') zoomTo(1, null, null, true);
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);

    new MutationObserver(reset).observe(img, { attributes: true, attributeFilter: ['src'] });
    new MutationObserver(function () {
      if (overlay.classList.contains('open')) reset();
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    reset();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
