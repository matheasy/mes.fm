#!/usr/bin/env python3
"""Add the standard click-to-expand image lightbox (full-width popup, prev/
next navigation via on-screen arrows and keyboard arrows) to article pages
that display photos inline but don't have it yet -- e.g. mes.fm/911-alchemy,
which only had plain <img> tags with no way to view them full-size.

Targets any page with an <img> inside <article> or a `.post-body` wrapper
that doesn't already have a lightbox-overlay, isn't a card-grid hub page
(link-card thumbnails already have their own treatment) and isn't a
chapter-toggle "topic homepage" page (those all already have a lightbox).
Uses a slightly broader image selector than the original hand-authored
template ('article img, .post-body img') since a couple of target pages
(mes.fm/bg, mes.fm/djw) use a bare `.post-body` div with no <article> tag.

Idempotent: guarded by a LIGHTBOX-INSERTED marker.

Run add_lightbox_zoom.py afterward to add zoom in/out + drag-to-pan on top
of every page's lightbox, this script's newly-added ones included.

Usage: python3 add_image_lightbox.py
"""
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

MARKER = "LIGHTBOX-INSERTED"

CSS_BLOCK = """    /* LIGHTBOX-INSERTED */
    .post-body img,
    article img {
      cursor: zoom-in;
    }

    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.96);
      z-index: 2147483647;
      align-items: center;
      justify-content: center;
      padding-bottom: 120px;
    }

    .lightbox-overlay.open {
      display: flex;
    }

    .lightbox-image {
      width: 100vw;
      max-width: 100vw;
      max-height: calc(100vh - 120px);
      object-fit: contain;
      display: block;
    }

    .lightbox-controls {
      position: fixed;
      left: 50%;
      bottom: 40px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .lightbox-counter {
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 0.85em;
      padding: 5px 12px;
      border-radius: 999px;
    }

    .lightbox-close,
    .lightbox-prev,
    .lightbox-next {
      position: fixed;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      border: 0;
      cursor: pointer;
    }

    .lightbox-close:hover,
    .lightbox-prev:hover,
    .lightbox-next:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .lightbox-close {
      top: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.3em;
      z-index: 2147483647;
    }

    .lightbox-prev,
    .lightbox-next {
      position: static;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      font-size: 1.4em;
    }

    @media (max-width: 600px) {
      .lightbox-overlay { padding-bottom: 100px; }
      .lightbox-image { max-height: calc(100vh - 100px); }
      .lightbox-controls { bottom: 32px; }
      .lightbox-prev, .lightbox-next { width: 38px; height: 38px; font-size: 1.2em; }
      .lightbox-close { width: 36px; height: 36px; }
    }
</style>"""

OLD_TRACKING_MARKER = "<!-- PAGEVIEW-TRACKING-INSERTED -->"

HTML_AND_JS_BLOCK = """<div class="lightbox-overlay" id="lightboxOverlay" google-side-rail-overlap="false" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-close" id="lightboxClose" type="button" aria-label="Close image viewer">&times;</button>
    <img class="lightbox-image" id="lightboxImage" src="" alt="">
    <div class="lightbox-controls" id="lightboxControls">
      <button class="lightbox-prev" id="lightboxPrev" type="button" aria-label="Previous image">&#8249;</button>
      <div class="lightbox-counter" id="lightboxCounter"></div>
      <button class="lightbox-next" id="lightboxNext" type="button" aria-label="Next image">&#8250;</button>
    </div>
  </div>

  <script>
    // image-lightbox: click any article image to pop it out spanning the full browser
    // width, with prev/next navigation via on-screen arrows and keyboard arrow keys.
    (function () {
      var images = Array.prototype.slice.call(document.querySelectorAll('article img, .post-body img'));
      if (!images.length) return;

      var overlay = document.getElementById('lightboxOverlay');
      var imageEl = document.getElementById('lightboxImage');
      var controlsEl = document.getElementById('lightboxControls');
      var counterEl = document.getElementById('lightboxCounter');
      var closeBtn = document.getElementById('lightboxClose');
      var prevBtn = document.getElementById('lightboxPrev');
      var nextBtn = document.getElementById('lightboxNext');
      var currentIndex = 0;

      if (images.length < 2) {
        controlsEl.style.display = 'none';
      }

      function show(index) {
        currentIndex = (index + images.length) % images.length;
        var img = images[currentIndex];
        imageEl.src = img.currentSrc || img.src;
        imageEl.alt = img.alt || '';
        counterEl.textContent = (currentIndex + 1) + ' / ' + images.length;
      }

      function open(index) {
        show(index);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      }

      function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }

      images.forEach(function (img, index) {
        img.addEventListener('click', function () { open(index); });
      });

      closeBtn.addEventListener('click', close);
      prevBtn.addEventListener('click', function () { show(currentIndex - 1); });
      nextBtn.addEventListener('click', function () { show(currentIndex + 1); });

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(currentIndex - 1);
        else if (e.key === 'ArrowRight') show(currentIndex + 1);
      });
    })();
  </script><!-- PAGEVIEW-TRACKING-INSERTED -->"""


def process(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()

    if MARKER in content:
        return False
    if "class=\"lightbox-overlay\"" in content:
        return False
    if "link-card" in content or "chapter-toggle" in content:
        return False
    if "<img" not in content:
        return False
    if "<article" not in content and 'class="post-body"' not in content:
        return False
    if "</style>" not in content or OLD_TRACKING_MARKER not in content:
        return False

    content = content.replace("</style>", CSS_BLOCK, 1)
    content = content.replace(OLD_TRACKING_MARKER, HTML_AND_JS_BLOCK, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def main():
    fixed = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [
            d for d in dirnames if d not in {".git", "node_modules", "hts-cache", "__pycache__"}
        ]
        for fname in filenames:
            if fname == "index.html":
                path = os.path.join(dirpath, fname)
                if process(path):
                    fixed.append(os.path.relpath(path, ROOT))
    print(f"Added image lightbox to {len(fixed)} files:")
    for p in fixed:
        print(" ", p)


if __name__ == "__main__":
    main()
