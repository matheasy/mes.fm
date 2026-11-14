#!/usr/bin/env python3
"""Move the image-lightbox zoom code into one shared file.

add_lightbox_zoom.py used to paste a ~100-line zoom script (+/- buttons with
fixed 1x-4x steps, no zoom out, no wheel) into every page with a lightbox and
into the build.mjs generators. This swaps each copy for a two-line loader of
mes.fm/main_js/lightbox-zoom.js (zoom 10%-800%, mouse wheel / trackpad pinch
/ touch pinch towards the pointer, 10% button steps), so later changes are made
in that one file. add_lightbox_zoom.py is patched too, so new pages get the
loader.

Idempotent (a file already loading lightbox-zoom.js has no old block left).
Dry-runs by default; -v lists files; --apply writes.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {".git", ".claude", "node_modules"}

OLD = re.compile(
    r"(?P<ind>[ \t]*)// lightbox-zoom: adds \+/- zoom and drag-to-pan.*?\n[ \t]*\}\)\(\);",
    re.S,
)

LOADER = (
    "{ind}// lightbox-zoom: zoom 10%-800%, mouse wheel / pinch / drag. The code is\n"
    "{ind}// shared by every page with an image lightbox: /main_js/lightbox-zoom.js\n"
    "{ind}(function () {{ var s = document.createElement('script'); "
    "s.src = '/main_js/lightbox-zoom.js'; document.head.appendChild(s); }})();"
)


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    changed = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if not f.endswith((".html", ".mjs", ".py")) or f == os.path.basename(__file__):
                continue
            p = os.path.join(d, f)
            try:
                s = open(p, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            if "lightbox-zoom: adds" not in s:
                continue
            n = OLD.sub(lambda m: LOADER.format(ind=m.group("ind")), s)
            if n != s:
                changed.append(os.path.relpath(p, ROOT))
                if apply:
                    open(p, "w", encoding="utf-8").write(n)
    print(("Updated" if apply else "Would update") + f" {len(changed)} files")
    if verbose:
        for p in changed:
            print("  " + p)
    if not apply:
        print("Dry run: pass --apply to write.")


if __name__ == "__main__":
    main()
