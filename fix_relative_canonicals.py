#!/usr/bin/env python3
"""Make every root-relative <link rel="canonical" href="/path"> absolute (https://mes.fm/path).

Found by build_site_index.py's "Canonical is not absolute" issue (211 pages, 2026-10-03: all 60 puzzles, the
gallery items under memes/, the card hubs, contact / donate / privacy-policy and the homepage). A relative canonical is
valid HTML but Google documents absolute URLs as the safe form, and the Search Console report showed thousands of
"duplicate / alternate" pages. Only the href is rewritten (the path is kept exactly, "/" stays "https://mes.fm/");
pages that are already absolute, have no canonical, or live in the HTTrack `_http*` capture folders are left alone.
Idempotent; **dry-runs by default (-v lists pages), --apply writes.**
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
TAG = re.compile(r'(<link\b[^>]*\brel="canonical"[^>]*\bhref=")(/[^"]*)(")')
TAG_REV = re.compile(r'(<link\b[^>]*\bhref=")(/[^"]*)("[^>]*\brel="canonical")')


def main():
    n = 0
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).parts
        if any(x.startswith("_http") or x == "node_modules" for x in rel):
            continue
        s = p.read_text(encoding="utf-8", errors="ignore")
        new = TAG.sub(lambda m: m.group(1) + "https://mes.fm" + m.group(2) + m.group(3), s, count=1)
        if new == s:
            new = TAG_REV.sub(lambda m: m.group(1) + "https://mes.fm" + m.group(2) + m.group(3), s, count=1)
        if new != s:
            n += 1
            if VERBOSE:
                print("  " + "/".join(rel))
            if APPLY:
                p.write_text(new, encoding="utf-8")
    print("%d pages %s" % (n, "fixed" if APPLY else "would change (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
