#!/usr/bin/env python3
"""Make crisp 512px thumbnails for the legacy calculator sites whose square logo is only 176px.

The Popular / Newest tiles on the homepage, the search results and the "More like this" cards draw each site's
square logo (mes.fm/<site>/img/logo.png, 176x176 for the 2013-2018 sites) at 180-370 CSS px, so the browser
enlarged it 2-4x and it looked blurry next to the 512px logos of the newer tools. The only larger copy of that
artwork is img/logo-big.png (250x250), so this upscales *that* (Lanczos to 1024, unsharp mask, Lanczos down to
512) into <site>/img/logo-512.png. logo.png / logo-big.png are untouched (headers, favicons and og:image keep
their sizes and URLs). The alpha channel is dropped: logo-big has translucent rounded corners, the tile wants the
full colour square (the tile CSS rounds its own corners).

build_search_index.py prefers logo-512.png over logo.png when it exists; re-run it (then build_aside_recs.py) after
this. Idempotent (an existing logo-512.png is left alone unless --force); dry-runs by default, --apply writes.
"""
import os
import sys
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mes.fm")
APPLY = "--apply" in sys.argv
FORCE = "--force" in sys.argv
TARGET = 512
SKIP = {"sjwkeyboard"}   # photographic art: the 512px PNG is ~200 KB, too heavy for a thumbnail on one page


def main():
    made = 0
    for site in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, site, "img")
        small, big, out = (os.path.join(d, n) for n in ("logo.png", "logo-big.png", "logo-512.png"))
        if site in SKIP:
            continue
        if not (os.path.isfile(small) and os.path.isfile(big)):
            continue
        if min(Image.open(small).size) >= 300:
            continue                      # already a large square logo (the newer tools)
        src = Image.open(big)
        if src.size[0] != src.size[1] or src.size[0] >= TARGET:
            print(f"  skip {site}: logo-big is {src.size}, expected a square under {TARGET}px")
            continue
        if os.path.isfile(out) and not FORCE:
            print(f"  ok   {site}: logo-512.png exists")
            continue
        made += 1
        print(f"  {'make' if APPLY else 'would make'} {site}/img/logo-512.png from logo-big {src.size}")
        if APPLY:
            up = src.convert("RGB").resize((TARGET * 2, TARGET * 2), Image.LANCZOS)
            up = up.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2)).resize((TARGET, TARGET), Image.LANCZOS)
            up.save(out, optimize=True)
    print(f"{'Made' if APPLY else 'Would make'} {made} logo(s)" + ("" if APPLY else " (dry run: pass --apply to write)"))


main()
