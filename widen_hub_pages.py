#!/usr/bin/env python3
"""Widen the five classic hub pages to the mes.fm / mes.fm/math page width and give them (and the homepage) the
text-size / dark-mode controls. Idempotent; DRY-RUNS by default (`--apply` writes).

  calculators.html, tools.html, mobile-apps.html, puzzles.html, memes.html
    * `.outer-container` max-width 50em -> 75em (what mes.fm/index.html and mes.fm/math already use)
    * calculators / tools / mobile-apps: on >=900px the card grid is 3 columns of taller, stacked cards
      (icon on top, title + description below) instead of 2 wide-and-short rows
    * puzzles / memes: still 4 columns, but the thumbnails now fill the wider page (fluid grid instead of fixed
      161px squares); each <img> also gets a srcset so the wider tiles use the 432px `-thumbnail.jpeg` instead of
      upscaling the 161px `-thumbnail-2.jpeg`
  the five pages + index.html
    * `<script src="/main_js/display-controls.js" defer>` -- injects the A-/A+/moon controls (left of the hamburger,
      and pinned into the floating compact bar), plus page-scoped dark mode. See that file for details.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
SCRIPT_TAG = '<script src="/main_js/display-controls.js?v=1.6" defer></script>'
WIDE_MARK = "HUB-WIDE-LAYOUT"

CARD_GRID = """
@media (min-width: 900px) {
  .tbl { grid-template-columns: repeat(3, 1fr); gap: 0.9em; }
  .calc-container:not(:last-child) { border-right: 0; }
  .calc-link { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 1.4em 1em 1.2em; }
  .calc__img-container { display: block; }
  .calc__img { width: 120px; height: 120px; margin: 0 0 1em; }
  .calc__text { display: block; }
  .calc__text--title { margin-bottom: 0.5em; }
}"""

THUMB_GRID = """
@media (min-width: 601px) {
  table.memes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1em; width: 100%; margin: 0; }
  table.memes > tbody { display: contents; }
  .memes__row { display: contents; border-bottom: none; }
  .memes__img-container { display: block; border-right: none !important; }
  .memes__img { width: 100%; height: auto; aspect-ratio: 1 / 1; }
}"""

PAGES = {"calculators.html": CARD_GRID, "tools.html": CARD_GRID, "mobile-apps.html": CARD_GRID,
         "puzzles.html": THUMB_GRID, "memes.html": THUMB_GRID}

IMG = re.compile(r'<img\b[^>]*class="memes__img[^"]*"[^>]*>')
SIZES = "(max-width: 600px) 46vw, (max-width: 1240px) 22vw, 272px"


def add_srcset(m):
    tag = m.group(0)
    if "srcset" in tag:
        return tag
    mm = re.search(r'\b(data-)?src="([^"]*-thumbnail-2\.jpe?g)"', tag)
    if not mm:
        return tag
    small = mm.group(2)
    big = re.sub(r"-thumbnail-2(\.jpe?g)$", r"-thumbnail\1", small)
    lazy = mm.group(1) or ""
    return tag[:-1] + ' %ssrcset="%s 161w, %s 432w" sizes="%s">' % (lazy, small, big, SIZES)


def patch(name, text):
    if name in PAGES:
        text = re.sub(r"(\.outer-container \{ width: auto !important; max-width: )50em;", r"\g<1>75em;", text)
        if WIDE_MARK not in text:
            text = text.replace("</head>", "<style>\n/* %s: 3-col cards / fluid 4-col thumbnails on the wider page */%s\n</style>\n</head>" % (WIDE_MARK, PAGES[name]), 1)
        if PAGES[name] is THUMB_GRID:
            text = IMG.sub(add_srcset, text)
    if "main_js/display-controls.js" not in text:
        text = text.replace("</body>", SCRIPT_TAG + "\n</body>", 1)
    return text


def main():
    for name in list(PAGES) + ["index.html"]:
        p = SITE / name
        old = p.read_text(encoding="utf-8")
        new = patch(name, old)
        print("%-18s %s" % (name, "changed" if new != old else "already up to date"))
        if APPLY and new != old:
            p.write_text(new, encoding="utf-8")
    if not APPLY:
        print("(dry run -- pass --apply to write)")


if __name__ == "__main__":
    main()
