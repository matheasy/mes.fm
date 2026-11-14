#!/usr/bin/env python3
"""Add zoom in/out + drag-to-pan to every page's image lightbox.

Purely additive: it never touches a page's existing lightbox HTML/CSS/JS
(which has accumulated small byte-level variations across pages over time --
verified via length checks before writing this script, so a text-replace
against the "canonical" version isn't safe repo-wide). Instead it anchors on
two elements that ARE byte-identical across every lightbox page (checked
directly): the `<div class="lightbox-overlay" id="lightboxOverlay" ...>`
opening tag and `</style>`. A new, self-contained script finds
#lightboxOverlay / #lightboxImage at runtime and adds its own zoom controls
into the DOM, so it works regardless of what that page's own open/show/close
logic looks like.

Zoom controls sit top-left (mirroring the existing close button's top-right
position) rather than inside the existing bottom `.lightbox-controls` bar,
so this never has to touch that bar's markup either, and the bottom bar
doesn't get overcrowded on narrow phones. Zoom resets automatically on
prev/next navigation or reopening (watched via MutationObserver on
#lightboxImage's src and #lightboxOverlay's class, so it doesn't need to
know how any given page's prev/next logic runs). Double-click / double-tap
the enlarged image also toggles 1x <-> 2x.

Idempotent: guarded by a LIGHTBOX-ZOOM-INSERTED marker. Safe to re-run after
add_image_lightbox.py adds lightboxes to new pages.

Usage: python3 add_lightbox_zoom.py
"""
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

MARKER = "LIGHTBOX-ZOOM-INSERTED"

CSS_BLOCK = """    /* LIGHTBOX-ZOOM-INSERTED */
    .lightbox-zoom-controls {
      position: fixed;
      top: 16px;
      left: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 2147483647;
    }

    .lightbox-zoom-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      border: 0;
      cursor: pointer;
      font-size: 1.2em;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-zoom-btn:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .lightbox-zoom-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .lightbox-zoom-level {
      min-width: 3.4em;
      text-align: center;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 0.8em;
      padding: 5px 8px;
      border-radius: 999px;
    }

    #lightboxImage {
      transition: transform 0.15s ease;
    }

    #lightboxImage.zoomed {
      cursor: grab;
    }

    #lightboxImage.dragging {
      cursor: grabbing;
      transition: none;
    }

    @media (max-width: 600px) {
      .lightbox-zoom-btn { width: 36px; height: 36px; font-size: 1.05em; }
    }
</style>"""

OLD_OVERLAY_OPEN_TAG = (
    '<div class="lightbox-overlay" id="lightboxOverlay" google-side-rail-overlap="false" '
    'role="dialog" aria-modal="true" aria-label="Image viewer">'
)

NEW_OVERLAY_OPEN_TAG = OLD_OVERLAY_OPEN_TAG + """
    <div class="lightbox-zoom-controls" id="lightboxZoomControls">
      <button class="lightbox-zoom-btn" id="lightboxZoomOut" type="button" aria-label="Zoom out">&minus;</button>
      <span class="lightbox-zoom-level" id="lightboxZoomLevel">100%</span>
      <button class="lightbox-zoom-btn" id="lightboxZoomIn" type="button" aria-label="Zoom in">+</button>
    </div>"""

OLD_TRACKING_MARKER = "<!-- PAGEVIEW-TRACKING-INSERTED -->"

JS_BLOCK = """<script>
    // lightbox-zoom: zoom 10%-800%, mouse wheel / pinch / drag. The code is
    // shared by every page with an image lightbox: /main_js/lightbox-zoom.js
    (function () { var s = document.createElement('script'); s.src = '/main_js/lightbox-zoom.js'; document.head.appendChild(s); })();
  </script><!-- PAGEVIEW-TRACKING-INSERTED -->"""


def process(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()

    if MARKER in content:
        return False
    if OLD_OVERLAY_OPEN_TAG not in content:
        return False
    if "</style>" not in content or OLD_TRACKING_MARKER not in content:
        return False

    content = content.replace("</style>", CSS_BLOCK, 1)
    content = content.replace(OLD_OVERLAY_OPEN_TAG, NEW_OVERLAY_OPEN_TAG, 1)
    content = content.replace(OLD_TRACKING_MARKER, JS_BLOCK, 1)

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
    print(f"Added lightbox zoom to {len(fixed)} files:")
    for p in fixed:
        print(" ", p)


if __name__ == "__main__":
    main()
