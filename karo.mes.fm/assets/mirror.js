/* alpinewestcreative static mirror: small vanilla replacements for the Wix runtime.
   Menus, testimonial slideshow, gallery sliders + lightbox, video boxes, contact form. */
(function () {
  'use strict';
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* scrollbar width (Wix centres the desktop layout with it) */
  try {
    var d = document.createElement('div');
    d.style.cssText = 'overflow-y:scroll;width:50px;height:50px;visibility:hidden;position:absolute';
    document.body.appendChild(d);
    var sw = d.offsetWidth - d.clientWidth; d.remove();
    if (sw > 0) document.body.style.setProperty('--scrollbar-width', sw + 'px');
  } catch (e) {}

  /* skip-to-content button */
  var skip = document.getElementById('SKIP_TO_CONTENT_BTN');
  if (skip) skip.addEventListener('click', function () {
    var m = document.getElementById('PAGES_CONTAINER') || document.querySelector('main');
    if (m) { m.setAttribute('tabindex', '-1'); m.focus(); }
  });

  /* ---------- desktop menu: Portfolio dropdown ---------- */
  $$('li[data-item-depth="0"]').forEach(function (li) {
    var root = li.querySelector('[aria-haspopup="true"]');
    if (!root) return;
    var base = (root.className.match(/(\S+)__root\b/) || [])[1];
    var btn = li.querySelector('button[aria-label^="Toggle"]');
    var bbase = btn && (btn.className.match(/(\S+)__accessibilityIcon\b/) || [])[1];
    var t;
    function set(open) {
      clearTimeout(t);
      if (open) { li.setAttribute('data-hovered', 'true'); li.setAttribute('data-shown', 'true'); }
      else { li.removeAttribute('data-hovered'); li.removeAttribute('data-shown'); }
      var pb = li.querySelector('[data-testid="positionBox"]'); if (pb) pb.style.marginTop = open ? '-4px' : '';
      root.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (base) root.classList.toggle(base + '--isHovered', open);
      if (btn && bbase) btn.classList.toggle(bbase + '--isOpen', open);
    }
    li.addEventListener('mouseenter', function () { set(true); });
    li.addEventListener('mouseleave', function () { t = setTimeout(function () { set(false); }, 150); });
    li.addEventListener('focusin', function () { set(true); });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) set(false); });
    if (btn) btn.addEventListener('click', function () { set(li.getAttribute('data-hovered') !== 'true'); });
    root.addEventListener('click', function () { set(li.getAttribute('data-hovered') !== 'true'); });
  });

  /* ---------- mobile menu (hamburger) ---------- */
  var tog = document.getElementById('MENU_AS_CONTAINER_TOGGLE');
  var menu = document.getElementById('MENU_AS_CONTAINER');
  if (tog && menu) {
    var overlay = document.getElementById('overlay-MENU_AS_CONTAINER');
    var cont = document.getElementById('container-MENU_AS_CONTAINER');
    var inner = document.getElementById('inlineContentParent-MENU_AS_CONTAINER');
    var open = false;
    var hideT;
    var setMenu = function (o) {
      open = o;
      clearTimeout(hideT);
      if (o) menu.removeAttribute('data-undisplayed');
      else hideT = setTimeout(function () { if (!open) menu.setAttribute('data-undisplayed', 'true'); }, 400);
      tog.classList.toggle('d0L2ow', o);
      if (tog.firstElementChild) tog.firstElementChild.classList.toggle('d0L2ow', o);
      var bars = tog.querySelector('.D_1muR'); if (bars) bars.classList.toggle('DJyiS4', o);
      menu.classList.toggle('I_VSKP', o);
      document.body.classList.toggle('siteScrollingBlockedIOSFix', o);
      if (overlay) overlay.style.cssText = o ? 'opacity: 1; visibility: inherit;' : '';
      if (cont) cont.style.cssText = o ? 'visibility: inherit;' : '';
      if (inner) inner.style.cssText = o ? 'overscroll-behavior-y: contain;' : '';
      tog.setAttribute('aria-expanded', o ? 'true' : 'false');
      tog.setAttribute('aria-label', o ? 'Close navigation menu' : 'Open navigation menu');
    };
    tog.setAttribute('role', 'button'); tog.setAttribute('tabindex', '0');
    tog.addEventListener('click', function () { setMenu(!open); });
    tog.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenu(!open); } });
    if (overlay) overlay.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setMenu(false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    $$('[data-testid="expandablemenu-toggle"]', menu).forEach(function (b) {
      var li = b.closest('li');
      var go = function (e) { e.preventDefault(); var o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', o ? 'true' : 'false'); li.classList.toggle('rErQ82', o); };
      b.addEventListener('click', go);
      var label = li.querySelector('div[data-testid="linkElement"]');
      if (label) { label.style.cursor = 'pointer'; label.addEventListener('click', go); }
    });
  }

  /* ---------- testimonial slideshow ---------- */
  $$('[data-mslideshow]').forEach(function (show) {
    var slides = $$('[data-mslide]', show);
    var dots = $$('nav a', show);
    if (slides.length < 2) return;
    var cur = 0, timer;
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { if (j === cur) s.removeAttribute('data-mslide-hidden'); else s.setAttribute('data-mslide-hidden', ''); });
      dots.forEach(function (a, j) {
        a.classList.toggle('JPnvZO', j === cur);
        if (j === cur) a.parentNode.setAttribute('aria-current', 'true'); else a.parentNode.removeAttribute('aria-current');
      });
    }
    function play() { clearInterval(timer); timer = setInterval(function () { go(cur + 1); }, 5000); }
    dots.forEach(function (a, j) { a.addEventListener('click', function (e) { e.preventDefault(); go(j); play(); }); });
    show.addEventListener('mouseenter', function () { clearInterval(timer); });
    show.addEventListener('mouseleave', play);
    // swipe
    var x0 = null;
    show.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    show.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) { go(cur + (dx < 0 ? 1 : -1)); play(); }
    });
    go(0); play();
  });

  /* ---------- Pro Gallery sliders: next / back arrows ---------- */
  $$('.gallery-horizontal-scroll').forEach(function (sc) {
    var gal = sc.closest('.pro-gallery') || sc.parentNode;
    // Wix sized the slider for the window with JS: follow the wrapper width instead
    var gw = sc.closest('[id^="gallery-wrapper"]'), pc = sc.closest('.pro-gallery-parent-container');
    var W0 = parseFloat(sc.style.width);
    if (gw && W0 && !document.body.classList.contains('device-mobile-optimized')) {
      var fit = function () {
        var W = gw.clientWidth; if (!W) return;
        var d = W - W0;
        sc.style.width = W + 'px';
        if (gal !== sc && gal.style.width) gal.style.width = W + 'px';
        if (pc && pc.style.width) pc.style.width = (W0 - 20 + d) + 'px';
      };
      fit(); window.addEventListener('resize', fit);
    }
    var next = gal.querySelector('[data-hook="nav-arrow-next"]');
    if (!next) return;
    var back = next.cloneNode(true);
    back.setAttribute('data-hook', 'nav-arrow-back');
    back.setAttribute('aria-label', 'Previous Item');
    back.style.right = ''; back.style.left = next.style.right || '33px';
    var svg = back.querySelector('svg'); if (svg) svg.style.transform = (svg.style.transform || '').replace('scaleX(1)', 'scaleX(-1)');
    next.parentNode.insertBefore(back, next);
    function step() {
      var g = sc.querySelector('[data-hook="group-view"]');
      var w = g ? parseFloat(getComputedStyle(g).getPropertyValue('--group-width')) || g.offsetWidth : sc.clientWidth / 2;
      return w || sc.clientWidth / 2;
    }
    function upd() {
      back.classList.toggle('mirror-hidden', sc.scrollLeft < 5);
      next.classList.toggle('mirror-hidden', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 5);
    }
    next.addEventListener('click', function (e) { e.stopPropagation(); sc.scrollBy({ left: step(), behavior: 'smooth' }); });
    back.addEventListener('click', function (e) { e.stopPropagation(); sc.scrollBy({ left: -step(), behavior: 'smooth' }); });
    sc.addEventListener('scroll', function () { gal.classList.add('m-scrolled'); upd(); }, { passive: true });
    window.addEventListener('resize', upd);
    upd();
    // mobile: thumbnail strip under the slide
    var outer = sc.closest('[id^="pro-gallery-comp"]') || gal;
    var col = outer.querySelector('[data-hook="gallery-thumbnails-column"]');
    if (col) {
      var thumbs = $$('.thumbnailItem', col);
      var box = col.parentNode;
      var cur = -1;
      var mark = function () {
        var w = sc.clientWidth || 1, i = Math.max(0, Math.min(thumbs.length - 1, Math.round(sc.scrollLeft / w)));
        if (i === cur) return; cur = i;
        thumbs.forEach(function (t, j) { t.classList.toggle('pro-gallery-highlight', j === i); });
        var tw = thumbs[0].offsetWidth || 90, vw = box.clientWidth || 313;
        var left = Math.min(0, Math.max(vw - thumbs.length * tw, vw / 2 - tw / 2 - i * tw));
        col.style.transition = 'left .3s'; col.style.left = left + 'px';
      };
      thumbs.forEach(function (t, j) { t.addEventListener('click', function () { sc.scrollTo({ left: j * sc.clientWidth, behavior: 'smooth' }); }); });
      sc.addEventListener('scroll', function () { clearTimeout(sc._mt); sc._mt = setTimeout(mark, 60); }, { passive: true });
    }
  });

  /* ---------- Pro Gallery masonry (hotels page): re-flow for the window width ----------
     Wix lays it out with JS: columns = round(width / 520), 5px gaps, each image in the shortest column. */
  if (!document.body.classList.contains('device-mobile-optimized')) {
    $$('.pro-gallery-margin-container').forEach(function (mc) {
      var outer = mc.parentNode, wrap = mc.closest('[id^="gallery-wrapper"]') || outer.parentNode;
      var items = $$('[data-hook="item-container"]', mc);
      if (!items.length || mc.closest('.gallery-horizontal-scroll')) return;
      items.forEach(function (it) {
        var im = it.querySelector('img[data-ratio]');
        it._r = im ? parseFloat(im.getAttribute('data-ratio')) : (parseFloat(it.style.height) || 1) / (parseFloat(it.style.width) || 1);
        it._orig = [it.style.inset, it.style.width, it.style.height];
        it._sized = $$('[style]', it).filter(function (el) { return /width:\s*[\d.]+px/.test(el.getAttribute('style')); });
      });
      var lastW = 0, W0 = parseFloat(mc.style.width), H0 = mc.style.height;
      function flow() {
        var W = wrap.clientWidth; if (!W || W === lastW) return; lastW = W;
        if (Math.abs(W - W0) < 1) { // the width Wix laid it out for: keep its exact positions
          items.forEach(function (it) {
            it.style.inset = it._orig[0]; it.style.width = it._orig[1]; it.style.height = it._orig[2];
            it._sized.forEach(function (el) { el.style.width = it._orig[1]; el.style.height = it._orig[2]; });
          });
          mc.style.width = W0 + 'px'; mc.style.height = H0; outer.style.height = H0; return;
        }
        var m = 5, cols = Math.max(1, Math.round(W / 520)), cw = (W - (cols - 1) * m) / cols, hs = [];
        for (var c = 0; c < cols; c++) hs.push(0);
        items.forEach(function (it) {
          var c = 0; for (var k = 1; k < cols; k++) if (hs[k] < hs[c] - 0.5) c = k;
          var x0 = Math.round(c * (cw + m)), wc = Math.round((c + 1) * (cw + m) - m) - x0;
          var h = wc * it._r;
          it.style.inset = Math.round(hs[c]) + 'px auto auto ' + x0 + 'px';
          var hp = Math.round(hs[c] + h) - Math.round(hs[c]) + 'px';
          it.style.width = wc + 'px'; it.style.height = hp;
          it._sized.forEach(function (el) { el.style.width = wc + 'px'; el.style.height = hp; });
          hs[c] += h + m;
        });
        var H = Math.round(Math.max.apply(null, hs) - m);
        mc.style.width = W + 'px'; mc.style.height = H + 'px'; outer.style.height = H + 'px';
      }
      flow();
      var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(flow, 100); });
    });
  }

  /* ---------- gallery lightbox ---------- */
  var lb, lbImg, lbCount, lbList = [], lbIdx = 0, lastFocus;
  function buildLb() {
    lb = document.createElement('div');
    lb.className = 'mlb'; lb.hidden = true;
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
    var arrow = function (dir) { return '<svg width="26" height="46" viewBox="0 0 26 46" fill="none" stroke="currentColor" stroke-width="2"><path d="' + (dir < 0 ? 'M24 2L3 23l21 21' : 'M2 2l21 21L2 44') + '"/></svg>'; };
    lb.innerHTML = '<img alt=""><button class="mlb-x" aria-label="Close"><svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" stroke-width="2"><path d="M1 1l20 20M21 1L1 21"/></svg></button>' +
      '<button class="mlb-p" aria-label="Previous">' + arrow(-1) + '</button><button class="mlb-n" aria-label="Next">' + arrow(1) + '</button><div class="mlb-c"></div>';
    document.body.appendChild(lb);
    lbImg = lb.querySelector('img'); lbCount = lb.querySelector('.mlb-c');
    lb.querySelector('.mlb-x').onclick = closeLb;
    lb.querySelector('.mlb-p').onclick = function () { showLb(lbIdx - 1); };
    lb.querySelector('.mlb-n').onclick = function () { showLb(lbIdx + 1); };
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') showLb(lbIdx - 1);
      else if (e.key === 'ArrowRight') showLb(lbIdx + 1);
    });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) showLb(lbIdx + (dx < 0 ? 1 : -1));
    });
  }
  function showLb(i) {
    lbIdx = (i + lbList.length) % lbList.length;
    var it = lbList[lbIdx];
    lbImg.src = it.src; lbImg.alt = it.alt || '';
    lbCount.textContent = (lbIdx + 1) + ' / ' + lbList.length;
    var nb = lbList[(lbIdx + 1) % lbList.length]; if (nb) (new Image()).src = nb.src;
  }
  function closeLb() { lb.hidden = true; document.documentElement.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  $$('[id^="pro-gallery-comp"]').forEach(function (g) {
    var imgs = $$('img[data-full]', g);
    if (!imgs.length) return;
    var list = imgs.map(function (im) { return { src: im.getAttribute('data-full'), alt: im.alt }; });
    imgs.forEach(function (im, i) {
      var box = im.closest('[data-hook="item-container"]') || im;
      var act = box.querySelector('[data-hook="item-action"]');
      var open = function (e) {
        if (e.target.closest && e.target.closest('[data-hook^="nav-arrow"]')) return;
        e.preventDefault();
        if (!lb) buildLb();
        lastFocus = document.activeElement; lbList = list; showLb(i);
        lb.hidden = false; document.documentElement.style.overflow = 'hidden';
        lb.querySelector('.mlb-x').focus();
      };
      box.addEventListener('click', open);
      if (act) act.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
    });
  });

  /* ---------- video boxes: play on hover (desktop) / tap, mute toggle ---------- */
  $$('.wixui-video-box').forEach(function (box) {
    var v = box.querySelector('video'), poster = box.querySelector('img.bgVideoposter, wix-video img');
    var btn = box.querySelector('[role="button"]:not([data-testid="vb-audio"])');
    var audio = box.querySelector('[data-testid="vb-audio"]');
    if (!v) return;
    var userMuted = false;
    function shown() { v.style.opacity = '1'; if (poster) poster.style.opacity = '0'; }
    function play() {
      v.muted = userMuted;
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); syncAudio(); });
      shown(); syncAudio();
      box.setAttribute('data-show-audio', '');
      if (btn) btn.setAttribute('aria-pressed', 'true');
    }
    function pause() { v.pause(); if (btn) btn.setAttribute('aria-pressed', 'false'); }
    function syncAudio() {
      box.setAttribute('data-audio', v.muted ? 'off' : 'on');
      if (audio) audio.setAttribute('aria-pressed', v.muted ? 'true' : 'false');
    }
    var hoverable = window.matchMedia('(hover: hover)').matches;
    if (hoverable) {
      box.addEventListener('mouseenter', play);
      box.addEventListener('mouseleave', pause);
    }
    if (btn) {
      box.addEventListener('click', function (e) { if (audio && audio.contains(e.target)) return; if (v.paused) play(); else if (!hoverable) pause(); });
      btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (v.paused) play(); else pause(); } });
    }
    if (audio) {
      var t = function (e) { e.stopPropagation(); e.preventDefault(); userMuted = !v.muted; v.muted = userMuted; syncAudio(); };
      audio.addEventListener('click', t);
      audio.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') t(e); });
    }
  });

  /* ---------- contact forms ----------
     TODO(owner): Wix Forms does not work outside Wix. For now the form opens the visitor's
     email app with the message filled in (mailto:). Replace with a form service
     (e.g. Web3Forms, Formspree, Basin) by pointing the <form> at its endpoint. */
  var TO = 'info@alpinewestcreative.com';
  $$('form.wixui-form').forEach(function (f) {
    var btn = f.querySelector('button');
    if (btn) btn.setAttribute('type', 'submit');
    f.setAttribute('novalidate', '');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = $$('input, textarea', f), ok = true, name = '', email = '', msg = '';
      fields.forEach(function (el) {
        var empty = !el.value.trim();
        var bad = (el.required && empty) || (el.type === 'email' && !empty && !/^.+@.+\.[a-zA-Z]{2,63}$/.test(el.value.trim()));
        el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad) ok = false;
        if (el.tagName === 'TEXTAREA') msg = el.value.trim();
        else if (el.type === 'email') email = el.value.trim();
        else name = el.value.trim();
      });
      if (!ok) { var first = f.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
      var body = msg + '\n\n' + name + (email ? ' <' + email + '>' : '');
      location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent('Website enquiry' + (name ? ' from ' + name : '')) + '&body=' + encodeURIComponent(body);
    });
    $$('input, textarea', f).forEach(function (el) {
      // Wix showed textareas as invalid only after interaction
      if (el.tagName === 'TEXTAREA') el.setAttribute('aria-invalid', 'false');
      el.addEventListener('input', function () { el.setAttribute('aria-invalid', 'false'); });
    });
  });
})();
