#!/usr/bin/env python3
"""Writes mes.fm/api/_rating-pages.json: the pages that can be rated with the "Rate this page" stars (main_js/rating.js,
api/rating.js). The list = every page of the site search index (mes.fm/search/index.json, written by build_search_index.py
from sitemap.xml) minus private / utility pages, so a vote can only ever be stored for a real, public mes.fm page: a bot
cannot fill Redis with made-up paths.

Re-run it after build_search_index.py when pages are added or removed (a new page cannot be rated until it is listed here).
Dry-runs by default; --apply writes. Idempotent.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mes.fm")
INDEX = os.path.join(ROOT, "search", "index.json")
OUT = os.path.join(ROOT, "api", "_rating-pages.json")

# Same rule as EXCLUDE in main_js/rating.js: never offer or accept ratings here.
EXCLUDE = re.compile(r"^/(ads|search-console|earnings|contact|privacy-policy|donate|ratings|feedback|portfolio|taxes|sov|lp|assets|random-wallets|finance|ai|mfa|404|f|r|ri)(/|$)|_https?_|/1$")


def main():
    apply = "--apply" in sys.argv
    with open(INDEX, encoding="utf-8") as fh:
        idx = json.load(fh)
    paths = sorted({p[0] for p in idx["p"] if isinstance(p, list) and p and isinstance(p[0], str) and p[0].startswith("/")})
    keep = [p for p in paths if not EXCLUDE.search(p)]
    dropped = [p for p in paths if EXCLUDE.search(p)]
    data = {"v": idx.get("v", ""), "p": keep}
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n"
    old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    print(f"{len(keep)} rateable pages ({len(dropped)} left out: {', '.join(dropped[:12])}{' ...' if len(dropped) > 12 else ''})")
    if old == text:
        print("Already up to date.")
        return
    if not apply:
        print(f"Dry run: would write {OUT} ({len(text)} bytes). Pass --apply to write.")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"Wrote {OUT} ({len(text)} bytes).")


if __name__ == "__main__":
    main()
