#!/usr/bin/env python3
"""More A- / A+ text-size steps site-wide (2026-10-24).

The header text-size buttons used to stop at 87.5% and 150%. This adds one
smaller step (75%) and three larger ones (162.5, 175, 200%). Every old step
is still in the list, so a saved `articleFontScale` value stays valid.

Rewrites the exact old list wherever it appears: `main_js/display-controls.js`,
`main_js/zoom-text-size.js`, the inline copies in ~300 generated pages, every
`build.mjs` generator, the mirror templates and the Python scripts that emit
the inline block (so rebuilds keep it), and `crypto/src` (SCALE_STEPS).
Skips node_modules, .git, HTTrack `_http*` captures and
`percentagecalculator-app/` (app builds are released on their own schedule).

Idempotent (the new list no longer matches). Dry-runs by default (`-v` lists
files); `--apply` writes.
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PAIRS = [
    ("[87.5, 100, 112.5, 125, 137.5, 150]", "[75, 87.5, 100, 112.5, 125, 137.5, 150, 162.5, 175, 200]"),
    ("[87.5,100,112.5,125,137.5,150]", "[75,87.5,100,112.5,125,137.5,150,162.5,175,200]"),  # head restore one-liners
]
EXTS = (".html", ".js", ".mjs", ".py", ".tsx", ".ts")
SKIP_DIRS = {"node_modules", ".git", ".claude", "percentagecalculator-app", ".next"}


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    changed = []
    for dp, dns, fns in os.walk(ROOT):
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not d.startswith("_http")]
        for fn in fns:
            if not fn.endswith(EXTS):
                continue
            p = os.path.join(dp, fn)
            if os.path.abspath(p) == os.path.abspath(__file__):
                continue
            try:
                with open(p, encoding="utf-8") as f:
                    s = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            new = s
            for old, rep in PAIRS:
                new = new.replace(old, rep)
            if new == s:
                continue
            changed.append(os.path.relpath(p, ROOT))
            if apply:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(new)
    for c in changed if verbose else []:
        print("  " + c)
    print(("Patched" if apply else "Would patch") + " %d files" % len(changed))
    if not apply and changed:
        print("Dry run: pass --apply to write.")


if __name__ == "__main__":
    main()
