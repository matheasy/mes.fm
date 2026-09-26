#!/usr/bin/env python3
"""Adds a 300x250 AdSense unit ("Bottom 300x250") after the Comments block, just above the footer, on individual pages.

Per page, marker-delimited so a re-run replaces rather than duplicates:
  * <!-- MES-BOTTOM-AD -->     the container: an "Advertisement" label + a reserved 250px holder (no layout shift), placed
                               right after <div id="comments-box"> inside .page-content
  * <!-- MES-BOTTOM-AD-JS -->  main_js/bottom-ad.js, which injects the <ins> and requests the ad only when the box is
                               within ~300px of the viewport (an unseen bottom-of-page ad would only hurt viewability)

Only pages that already carry the AdSense loader are touched -- pages that must stay ad-free (youtubemoney, contact /
privacy / donate, the graphic 9/11 mirrors) don't have it, so they are skipped automatically; "Page Not Found" pagination
stubs (1.html, 2.html ...) are skipped too. Comment-less pages (no #comments-box) are skipped and reported.

Pilot family: gradecalculator (2026-09-25), to be compared against the percentagecalculator sidebar pilot; add a family to
FAMILIES to roll it out. The slot id is the AdSense unit "Bottom 300x250" created for this; --ad-slot overrides it.
Idempotent; **dry-runs by default (-v lists every page), --apply writes.**  --remove strips it again.
"""
import argparse
import glob
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "mes.fm")
ASSET_V = "1"  # bump when main_js/bottom-ad.js changes
DEFAULT_SLOT = "8852646945"  # AdSense display unit "Bottom 300x250" (fixed 300x250)
FAMILIES = ["gradecalculator"]

LOADER = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
NUMERIC_STUB = re.compile(r"^\d+\.html$")  # 1.html, 2.html ... are "Page Not Found" pagination stubs

BLOCK_RE = re.compile(r"\n?<!-- MES-BOTTOM-AD -->.*?<!-- /MES-BOTTOM-AD -->\n?", re.S)  # exactly what block() inserted
JS_RE = re.compile(r"<!-- MES-BOTTOM-AD-JS -->.*?<!-- /MES-BOTTOM-AD-JS -->", re.S)
COMMENTS_RE = re.compile(r'<div id="comments-box"[^>]*>\s*<div id="fastcomments-widget"></div>\s*</div>')

JS_BLOCK = '<!-- MES-BOTTOM-AD-JS --><script src="/main_js/bottom-ad.js?v={v}" defer></script><!-- /MES-BOTTOM-AD-JS -->'


def block(slot):
    return (
        "\n<!-- MES-BOTTOM-AD -->\n"
        '<div class="mes-bottom-ad" data-ad-slot="{slot}" style="clear:both;text-align:center;margin:1.5em auto 1.75em;'
        'min-height:270px;">'
        '<span style="display:block;font-size:11px;line-height:16px;color:#777777;margin-bottom:4px;">Advertisement</span>'
        '<div class="mes-bottom-ad__slot" style="width:300px;height:250px;margin:0 auto;"></div></div>\n'
        "<!-- /MES-BOTTOM-AD -->\n"
    ).format(slot=html.escape(slot, quote=True))


def read(path):
    with open(path, encoding="utf-8", newline="") as f:  # newline="": keep CRLF pages byte-for-byte
        return f.read()


def patch(text, slot, remove):
    """(new_text, reason). new_text is None when the page is skipped; reason says why."""
    text = BLOCK_RE.sub("", text)
    text = JS_RE.sub("", text)
    if remove:
        return text, None
    if LOADER not in text:
        return None, "no AdSense loader (ad-free page)"
    if "</body>" not in text:
        return None, "no </body>"
    m = COMMENTS_RE.search(text)
    if not m:
        return None, "no comments block to anchor on"
    new = text[: m.end()] + block(slot) + text[m.end():]
    return new.replace("</body>", JS_BLOCK.format(v=ASSET_V) + "</body>", 1), None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every page")
    ap.add_argument("--family", action="append", help="only this family (repeatable); default all in FAMILIES")
    ap.add_argument("--ad-slot", default=DEFAULT_SLOT, help="AdSense data-ad-slot (default: the Bottom 300x250 unit)")
    ap.add_argument("--remove", action="store_true", help="strip the bottom ad from the selected families")
    args = ap.parse_args()

    total = changed = 0
    skipped = {}
    for family in FAMILIES:
        if args.family and family not in args.family:
            continue
        pages = sorted(glob.glob(os.path.join(SITE, family, "**", "*.html"), recursive=True))
        for path in pages:
            if NUMERIC_STUB.match(os.path.basename(path)):
                skipped.setdefault("pagination stub", []).append(path)
                continue
            total += 1
            old = read(path)
            new, reason = patch(old, args.ad_slot, args.remove)
            if new is None:
                skipped.setdefault(reason, []).append(path)
                continue
            if new != old:
                changed += 1
                if args.verbose:
                    print("  %s %s" % ("write" if args.apply else "would write", os.path.relpath(path, ROOT)))
                if args.apply:
                    with open(path, "w", encoding="utf-8", newline="") as f:
                        f.write(new)
    print("%s: %d of %d pages %s" % ("APPLIED" if args.apply else "DRY RUN", changed, total,
                                     "changed" if args.apply else "would change"))
    for reason, paths in skipped.items():
        print("Skipped (%s): %d" % (reason, len(paths)))
        for p in paths[:8]:
            print("  " + os.path.relpath(p, ROOT))
    if not args.apply:
        print("(dry run -- pass --apply to write)")


if __name__ == "__main__":
    sys.exit(main())
