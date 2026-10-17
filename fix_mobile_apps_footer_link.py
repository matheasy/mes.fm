#!/usr/bin/env python3
"""Footer "Mobile Apps" link: https://mes.fm/mobile-apps.html -> https://mes.fm/mobile-apps.

The HTTrack-era footer linked the `.html` address on ~930 pages (the classic calculator / meme / quote pages and
`tool_page_template.html`, so every page built from it). Vercel's cleanUrls 308-redirects `.html` to `/mobile-apps`,
so nothing was broken, but every footer click paid a redirect hop and Google discovered and crawled the `.html`
address (Search Console's only "Soft 404" was `/mobile-apps.html`, 2026-10-16). Only the href changes.
Covers every *.html / *.mjs / *.py under the repo except HTTrack `_http*` captures, node_modules, `.git` and
`percentagecalculator-app/` (the Capacitor app is built by its own build-www.py from the live site).
Idempotent; **dry-runs by default (-v lists files), --apply writes.**
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
OLD = 'href="https://mes.fm/mobile-apps.html"'
NEW = 'href="https://mes.fm/mobile-apps"'
SKIP = {".git", "node_modules", "percentagecalculator-app", "__pycache__"}


def main():
    n = 0
    for p in sorted(ROOT.rglob("*")):
        if p.suffix not in (".html", ".mjs") or not p.is_file():
            continue
        rel = p.relative_to(ROOT).parts
        if any(x in SKIP or x.startswith("_http") for x in rel):
            continue
        s = p.read_text(encoding="utf-8", errors="ignore")
        if OLD not in s:
            continue
        n += 1
        if VERBOSE:
            print("  " + "/".join(rel))
        if APPLY:
            p.write_text(s.replace(OLD, NEW), encoding="utf-8")
    print("%d files %s" % (n, "fixed" if APPLY else "would change (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
