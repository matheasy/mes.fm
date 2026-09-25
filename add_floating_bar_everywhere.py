#!/usr/bin/env python3
"""Load main_js/display-controls.js on every classic-shell page that doesn't have the floating header bar yet
(~1,000 calculator / meme / quote / dream-home / tip / puzzle pages).

That single script builds the floating compact bar at runtime (title from .calculator-title, logo from #logo,
colour from the computed #info-bar background) and adds the A- / A+ / moon controls -- see the header comment in
mes.fm/main_js/display-controls.js. `data-scale="main"` also makes A-/A+ scale the page's #main-content; `data-dark="derive"` derives the dark theme from the page's own stylesheets at runtime.

Pages that already carry an inline #compact-nav (the hubs, mes.fm/math, the tool pages patched by
add_tool_page_controls.py) or the script are skipped. Skips HTTrack `_http_`/`_https_` captures.
Bump VERSION when display-controls.js changes so cached copies refresh (also update add_tool_page_controls.py's
DC_TAG); `--refresh` rewrites the tag on pages that already have it.

**Dry-runs by default; `--apply` writes.**
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPLY = "--apply" in sys.argv
REFRESH = "--refresh" in sys.argv
VERSION = "1.6"
ANCHOR = '<script src="/main_js/info-bar-fit.js" defer></script>'
TAG = '<script src="/main_js/display-controls.js?v=%s" data-scale="main" data-dark="derive" defer></script>' % VERSION
TAG_RE = re.compile(r'<script src="/main_js/display-controls\.js[^"]*"[^>]*data-scale="main"[^>]*></script>')


def main():
    files = subprocess.run(["git", "ls-files", "mes.fm/*.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    added = refreshed = skipped = 0
    for rel in files:
        if "/_http" in rel:
            continue
        p = ROOT / rel
        t = p.read_text(encoding="utf-8", errors="surrogateescape")
        if 'id="info-bar"' not in t or t.count(ANCHOR) != 1:
            continue
        if TAG_RE.search(t):
            if REFRESH and TAG not in t:
                refreshed += 1
                if APPLY:
                    p.write_text(TAG_RE.sub(TAG, t, count=1), encoding="utf-8", errors="surrogateescape")
            continue
        if "compact-nav" in t or "display-controls.js" in t:
            skipped += 1
            continue
        added += 1
        if APPLY:
            p.write_text(t.replace(ANCHOR, ANCHOR + TAG, 1), encoding="utf-8", errors="surrogateescape")
    print("%d pages %s, %d refreshed, %d already had a bar/controls" % (added, "patched" if APPLY else "would be patched (dry run -- pass --apply)", refreshed, skipped))


if __name__ == "__main__":
    main()
