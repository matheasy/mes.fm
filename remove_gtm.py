#!/usr/bin/env python3
"""Removes the dead Google Tag Manager container (GTM-T7H6J87) from the pages that still load it (140 pages, all under
mes.fm/percentagecalculator -- the rest of the site lost it in earlier clean-ups).

Why: the container (fetched from googletagmanager.com/gtm.js?id=GTM-T7H6J87) holds only a Universal Analytics event tag
(UA-18189318-5, stopped processing in 2023), a scroll-depth listener and a custom-HTML tag that pushes a `calculation` event
to the dataLayer -- both of which only fed that dead UA tag. It cost a ~390 KB gtm.js download per page (plus a "tracker" flag in
Brave / uBlock) for no data. Page views are counted by main_js/track.js, which does not use it.

Removes the head snippet (<!-- Google Tag Manager --> ... <!-- End Google Tag Manager -->) and the body <noscript> iframe. The
"Legacy Universal Analytics removed" comment that follows the head snippet stays: percentagecalculator-app/build-www.py now
anchors on it (its "(+ GTM)" mention is dropped). Idempotent; **dry-runs by default (-v lists pages), --apply writes.**
"""
import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
HEAD_RE = re.compile(r"[ \t]*<!-- Google Tag Manager -->.*?<!-- End Google Tag Manager -->[ \t]*\n?", re.S)
BODY_RE = re.compile(r"[ \t]*<!-- Google Tag Manager \(noscript\) -->.*?<!-- End Google Tag Manager \(noscript\) -->[ \t]*\n?", re.S)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    changed = total = 0
    for path in sorted(glob.glob(os.path.join(SITE, "**", "*.html"), recursive=True)):
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
        if "GTM-T7H6J87" not in text:
            continue
        total += 1
        new = BODY_RE.sub("", HEAD_RE.sub("", text)).replace("main_js/track.js (+ GTM)", "main_js/track.js")
        if "GTM-T7H6J87" in new:
            print("  LEFTOVER (unexpected markup): " + os.path.relpath(path, ROOT))
            continue
        if new != text:
            changed += 1
            if args.verbose:
                print("  %s %s" % ("write" if args.apply else "would write", os.path.relpath(path, ROOT)))
            if args.apply:
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(new)
    print("%s: %d of %d GTM pages %s" % ("APPLIED" if args.apply else "DRY RUN", changed, total, "changed" if args.apply else "would change"))
    if not args.apply:
        print("(dry run -- pass --apply to write)")


if __name__ == "__main__":
    sys.exit(main())
