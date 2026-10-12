#!/usr/bin/env python3
"""Adds an "Extensions" link (-> /browser) to the horizontal info bar (the Math Tutorials | Calculators | Tools | Mobile Apps | Puzzles | Memes row)
of every page that carries that row, between Mobile Apps and Puzzles (2026-10-12):

    <li class="info-bar__item"><a ... href='/mobile-apps'>Mobile Apps</a></li>
    <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a ... href='/browser'>Extensions</a></li>   <- inserted
    <li class="info-bar__item"><a ... href='/puzzles'>Puzzles</a></li>

It is tagged `info-bar__item--utility`, so main_js/info-bar-fit.js hides it first and reveals it only when it fits without adding a second row (it comes
before the other utilities in the markup, so it has priority over Subscribe / Store / Donate / Contact Us, and sits right after Mobile Apps when shown).
main.js highlights the active tab by position (:eq(N)), which this link would shift, so main.js now skips any /browser link when it counts (both the
info bar and the burger navbar from add_browser_extensions_nav.py) -- no per-page info_bar_tab / current_tab edits are needed.

Patches every .html under mes.fm/ and the repo root templates (tool_page_template.html, hive_mirror_template.html, ...) plus every build.mjs that
emits the row, so rebuilds keep it. percentagecalculator-app/build-www.py already strips the whole info bar of the app. Skips HTTrack _http* captures
and node_modules. Idempotent. Dry-runs by default (-v lists files); --apply writes.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
SITE = REPO / "mes.fm"
LI = '<li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" href=\'/browser\'>Extensions</a></li>'
ROW = re.compile(r"""(<li class="info-bar__item"><a[^>]*href=['"](?:https://mes\.fm)?/mobile-apps['"][^>]*>Mobile Apps</a></li>)(\s*)(<li class="info-bar__item"><a[^>]*href=['"](?:https://mes\.fm)?/puzzles['"])""")


def patch(text):
    if "href='/browser'>Extensions</a>" in text:
        return text, "already"
    if not ROW.search(text):
        return text, "norow"
    return ROW.sub(lambda m: m.group(1) + m.group(2) + LI + m.group(2) + m.group(3), text), "done"


def files():
    for p in sorted(SITE.rglob("*.html")):
        if any(x == "node_modules" or x.startswith("_http") for x in p.relative_to(SITE).parts):
            continue
        yield p
    for p in sorted(REPO.glob("*.html")):
        yield p
    for p in sorted(SITE.glob("*/build.mjs")):
        yield p


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    counts = {"done": 0, "already": 0, "norow": 0}
    for p in files():
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new, st = patch(text)
        counts[st] += 1
        if st == "done":
            if verbose:
                print("  ", p.relative_to(REPO))
            if apply:
                p.write_text(new, encoding="utf-8")
    print(f"{'applied' if apply else 'dry run'}: {counts['done']} patched, {counts['already']} already, {counts['norow']} without the row")
    if not apply and counts["done"]:
        print("re-run with --apply to write")


if __name__ == "__main__":
    main()
