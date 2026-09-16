#!/usr/bin/env python3
"""Add an A-/A+ text-size control to the standalone article/image-post mirror
template (the one used by e.g. mes.fm/melissa-doi-voices-bleeped,
mes.fm/hughes-911-spammer-ryan-spooks, mes.fm/911-spook-ryan-bannister): a
single `<article>` wrapping post-image/lightbox content, with a
retrieved-note footer and a `<div class="top-bar">` holding one
`#themeToggle` button.

Deliberately does NOT touch: the chapter-toggle "topic homepage" pages (911,
hutchison, vector-functions-problems-plus, ...); the standalone theater-mode
video-page template (livestream trailers, math-qa, etc.); older post-body-
only mirrors with no `<article>` wrapper (mes.fm/bg, mes.fm/djw) where the
scaling JS would find nothing to scale; interactive tool pages that just
happen to reuse the same top-bar markup (mes.fm/moon); or multi-entry
build-log pages with more than one `<article>` (mes.fm/ufo) where only the
first entry would scale. Those are either structurally different templates
or would silently misbehave with this feature.

Adds two circular buttons (A-/A+) next to the theme toggle that scale the
`<article>` element's font-size through a fixed set of steps, persisted in
localStorage under 'articleFontScale' and shared across every page using
this template (same convention as the 'theme' key already used for dark/
light mode).

Idempotent: guarded by a TEXT-SIZE-CONTROL-INSERTED marker, safe to re-run
(only touches files with the template signature that haven't been converted
yet).

Usage: python3 add_text_size_control.py
"""
import os

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

MARKER = "TEXT-SIZE-CONTROL-INSERTED"

OLD_BUTTON = '      <button id="themeToggle" class="theme-toggle-btn">Loading...</button>'

NEW_BUTTON = """      <div class="top-bar-controls">
        <div class="text-size-controls">
          <button id="textSizeDown" class="text-size-btn" type="button" aria-label="Decrease text size">A&minus;</button>
          <button id="textSizeUp" class="text-size-btn" type="button" aria-label="Increase text size">A+</button>
        </div>
        <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
      </div>"""

CSS_BLOCK = """    /* TEXT-SIZE-CONTROL-INSERTED */
    .top-bar-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .text-size-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .text-size-btn {
      flex: 0 0 auto;
      width: 2em;
      height: 2em;
      padding: 0;
      border: 1.5px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.8em;
      font-weight: 700;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .text-size-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    body.light .text-size-btn { background-color: #3a3d52; color: #ffffff; border-color: rgba(255, 255, 255, 0.35); }
    body.dark .text-size-btn { background-color: #2e2e2e; color: #eeeeee; border-color: rgba(255, 255, 255, 0.25); }
</style>"""

JS_BLOCK = """<script>
    // text-size-control: A-/A+ buttons step the article body through a fixed
    // set of font-size scales, remembered per-visitor (shared across every
    // mirror page using this template, same convention as the theme toggle).
    (function () {
      var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
      var article = document.querySelector('article');
      var downBtn = document.getElementById('textSizeDown');
      var upBtn = document.getElementById('textSizeUp');
      if (!article || !downBtn || !upBtn) return;

      function clampIndex(i) {
        return Math.max(0, Math.min(STEPS.length - 1, i));
      }

      var index;
      try {
        index = STEPS.indexOf(parseFloat(localStorage.getItem('articleFontScale')));
      } catch (e) {
        index = -1;
      }
      if (index === -1) index = STEPS.indexOf(100);

      function apply() {
        article.style.fontSize = STEPS[index] + '%';
        downBtn.disabled = index === 0;
        upBtn.disabled = index === STEPS.length - 1;
        try { localStorage.setItem('articleFontScale', String(STEPS[index])); } catch (e) {}
      }

      downBtn.addEventListener('click', function () {
        index = clampIndex(index - 1);
        apply();
      });
      upBtn.addEventListener('click', function () {
        index = clampIndex(index + 1);
        apply();
      });

      apply();
    })();
  </script><!-- PAGEVIEW-TRACKING-INSERTED -->"""

OLD_TRACKING_MARKER = "<!-- PAGEVIEW-TRACKING-INSERTED -->"


def process(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()

    if MARKER in content:
        return False
    if OLD_BUTTON not in content:
        return False
    if "chapter-toggle" in content or "theater-toggle-btn" in content:
        return False
    if "</style>" not in content or OLD_TRACKING_MARKER not in content:
        return False
    # Restrict to the standalone article/image-post mirror template: a single
    # <article> wrapping post-image/lightbox content with a retrieved-note
    # footer. Excludes older post-body-only mirrors with no <article> wrapper
    # (mes.fm/bg, mes.fm/djw), interactive tool pages that just happen to
    # reuse the same top-bar markup (mes.fm/moon), and multi-entry build-log
    # pages with more than one <article> (mes.fm/ufo).
    if 'class="retrieved-note"' not in content:
        return False
    if 'class="lightbox-overlay"' not in content:
        return False
    if content.count("<article>") != 1:
        return False

    content = content.replace("</style>", CSS_BLOCK, 1)
    content = content.replace(OLD_BUTTON, NEW_BUTTON, 1)
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
    print(f"Added text-size control to {len(fixed)} files:")
    for p in fixed:
        print(" ", p)


if __name__ == "__main__":
    main()
