#!/usr/bin/env python3
"""Give the thumbnail-gallery list pages the wide mes.fm/memes look: every page carrying a `<table class="memes">`
(mortgage dream homes, grade / percent / bmi memes, inspirational quotes, interesting facts, health / study tips,
money facts, ...; the hubs memes.html / puzzles.html were done by widen_hub_pages.py) that isn't wide yet.

  * `.outer-container` max-width 50em -> 75em (mes.fm / mes.fm/math width)
  * below 600px the grid is two columns (like mes.fm/memes) instead of four tiny thumbnails
  * the fixed 161px squares become a fluid 4-column grid (>=601px) that fills the page, so the icons are ~2x bigger,
    and each <img> gets a srcset so the bigger tiles use the 432px `-thumbnail.jpeg` instead of upscaling the 161px
    `-thumbnail-2.jpeg` (only when that file exists on disk)

Reuses widen_hub_pages.THUMB_GRID / SIZES. Idempotent (HUB-WIDE-LAYOUT marker); **dry-runs by default, `--apply`
writes.** New gallery pages: run it.
"""
import re
import subprocess
import sys
from pathlib import Path

import widen_hub_pages as w

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv
WIDTH = re.compile(r"(\.outer-container \{ width: auto !important; max-width: )50em;")


def srcset(m):
    tag = m.group(0)
    if "srcset" in tag:
        return tag
    mm = re.search(r'\b(data-)?src="([^"]*-thumbnail-2\.jpe?g)"', tag)
    if not mm:
        return tag
    small = mm.group(2)
    big = re.sub(r"-thumbnail-2(\.jpe?g)$", r"-thumbnail\1", small)
    if not (SITE / big.lstrip("/").split("?")[0]).exists():
        return tag
    return tag[:-1] + ' %ssrcset="%s 161w, %s 432w" sizes="%s">' % (mm.group(1) or "", small, big, w.SIZES)


MOBILE_MARK = "GALLERY-MOBILE-2COL"
# what mes.fm/memes does when shrunk: two big tiles per row instead of four tiny ones
MOBILE_GRID = """
@media (max-width: 600px) {
  table.memes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75em; width: 100%; margin: 0; }
  table.memes > tbody { display: contents; }
  .memes__row { display: contents; border-bottom: none; }
  .memes__img-container { display: block; border-right: none !important; }
  .memes__img { width: 100% !important; height: auto !important; }
}"""


def patch(text):
    if '<table class="memes">' not in text:
        return text
    if w.WIDE_MARK not in text:
        text = WIDTH.sub(r"\g<1>75em;", text)
        text = text.replace("</head>", "<style>\n/* %s: fluid 4-col thumbnails on the wider page */%s\n</style>\n</head>" % (w.WIDE_MARK, w.THUMB_GRID), 1)
        text = w.IMG.sub(srcset, text)
    if MOBILE_MARK not in text and "repeat(2, 1fr)" not in text:
        text = text.replace("</head>", "<style>\n/* %s: two tiles per row on phones, like mes.fm/memes */%s\n</style>\n</head>" % (MOBILE_MARK, MOBILE_GRID), 1)
    return text


def main():
    files = subprocess.run(["git", "ls-files", "mes.fm/*.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    n = 0
    for rel in files:
        if "/_http" in rel:
            continue
        p = ROOT / rel
        t = p.read_text(encoding="utf-8", errors="surrogateescape")
        new = patch(t)
        if new != t:
            n += 1
            if APPLY:
                p.write_text(new, encoding="utf-8", errors="surrogateescape")
    print("%d gallery pages %s" % (n, "widened" if APPLY else "would be widened (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
