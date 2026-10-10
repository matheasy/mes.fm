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

Started on gradecalculator (2026-09-25), then rolled out to the other calculator sites (percentage, gpa, bmi, mortgage,
inflation, timer quotes); add a family to FAMILIES to roll it out further. The slot id is the AdSense unit "Bottom 300x250" created for this; --ad-slot overrides it.
Idempotent; **dry-runs by default (-v lists every page), --apply writes.**  --remove strips it again.
"""
import argparse
import glob
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
SITE = os.path.join(ROOT, "mes.fm")
ASSET_V = "1"  # bump when main_js/bottom-ad.js changes
DEFAULT_SLOT = "8852646945"  # AdSense display unit "Bottom 300x250" (fixed 300x250)
# AdSense display unit "Bottom Square Responsive" (responsive; bottom-ad.js asks for the rectangle shape, so it serves rectangles that fit the
# column instead of banners). Tried on the core calculators first; the narrow calculator / tool families keep the fixed unit so the two can be
# compared in AdSense. "math" (2026-09-26) = the article pages in the wide math-hub shell (Problems Plus, Math Q/A, Hive mirrors, troubleshooting,
# livestream pages): a fixed 300x250 looked lost in that column, so they use the responsive unit too.
RESPONSIVE_SLOT = "1532113018"
# 2026-09-28: the user chose the responsive unit everywhere (every family below + "tools" + "math"), matching mes.fm/percentagecalculator.
# The fixed "Bottom 300x250" unit (DEFAULT_SLOT) is now only used via --ad-slot.
RESPONSIVE_FAMILIES = {"percentagecalculator", "gradecalculator", "gpacalculator", "bmicalculator", "mortgagecalculator", "inflationcalculator",
                       "timer", "vatcalculator", "pokemongocalculator", "memes", "puzzles", "tools", "math"}
# stand-alone tool / rebuilt-calculator pages (tool shell, one index.html per folder): included on purpose, unlike the timer etc. skip below
TOOL_DIRS = ["emoji", "latex", "timezone", "symbols", "stats", "speedreader", "timer", "clock", "enigma", "countdown-timer", "stopwatch", "alarm-clock", "pomodoro-timer", "interval-timer", "countdown-to-date", "youtube-thumbnail", "unit-conversion",
             "gematria", "impermanent-loss-calculator", "earth-curvature-calculator", "share", "search", "calendar", "copy-text", "typing-test", "typing-test-transcribe", "3d-fluid-simulator", "photoelectric-effect-simulator", "fluid-simulator", "atomic-clock-simulator", "sum-of-integers-calculator", "reynolds-number-calculator", "solar-system-today", "search-engines", "calculator", "2d-graphing-calculator", "3d-graphing-calculator", "days-between-dates-calculator", "cas-calculator", "derivative-calculator", "integral-calculator", "vatcalculator", "mortgagecalculator", "gradecalculator", "gpacalculator", "bmicalculator", "weighted-average-calculator.html"]
FAMILIES = ["percentagecalculator", "gradecalculator", "gpacalculator", "bmicalculator", "mortgagecalculator",
            "inflationcalculator", "timer", "pokemongocalculator", "memes", "puzzles"]

LOADER = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
NUMERIC_STUB = re.compile(r"^\d+\.html$")  # 1.html, 2.html ... are "Page Not Found" pagination stubs

BLOCK_RE = re.compile(r"\n?<!-- MES-BOTTOM-AD -->.*?<!-- /MES-BOTTOM-AD -->\n?", re.S)  # exactly what block() inserted
JS_RE = re.compile(r"<!-- MES-BOTTOM-AD-JS -->.*?<!-- /MES-BOTTOM-AD-JS -->", re.S)
COMMENTS_RE = re.compile(r'<div id="comments-box"[^>]*>\s*<div id="fastcomments-widget"></div>\s*</div>')

JS_BLOCK = '<!-- MES-BOTTOM-AD-JS --><script src="/main_js/bottom-ad.js?v={v}" defer></script><!-- /MES-BOTTOM-AD-JS -->'


def block(slot, responsive=False):
    if responsive:  # rectangle-shaped responsive unit: seen ~810x308 live, so 310px is reserved (+20 for the label) and the footer doesn't jump
        attrs, outer_h, holder = ' data-ad-mode="rect"', "330", "width:100%;min-height:310px;margin:0 auto;"
    else:
        attrs, outer_h, holder = "", "270", "width:300px;height:250px;margin:0 auto;"
    return (
        "\n<!-- MES-BOTTOM-AD -->\n"
        '<div class="mes-bottom-ad" data-ad-slot="{slot}"{attrs} style="clear:both;text-align:center;margin:1.5em auto 1.75em;'
        'min-height:{oh}px;">'
        '<span style="display:block;font-size:11px;line-height:16px;color:#777777;margin-bottom:4px;">Advertisement</span>'
        '<div class="mes-bottom-ad__slot" style="{holder}"></div></div>\n'
        "<!-- /MES-BOTTOM-AD -->\n"
    ).format(slot=html.escape(slot, quote=True), attrs=attrs, oh=outer_h, holder=holder)


def read(path):
    with open(path, encoding="utf-8", newline="") as f:  # newline="": keep CRLF pages byte-for-byte
        return f.read()


def patch(text, slot, remove, responsive=False, allow_tool=False):
    """(new_text, reason). new_text is None when the page is skipped; reason says why."""
    text = BLOCK_RE.sub("", text)
    text = JS_RE.sub("", text)
    if remove:
        return text, None
    if LOADER not in text:
        return None, "no AdSense loader (ad-free page)"
    if "data-tool" in text and not allow_tool:
        return None, "tool-shell page"
    if "</body>" not in text:
        return None, "no </body>"
    m = COMMENTS_RE.search(text)
    if not m:
        return None, "no comments block to anchor on"
    new = text[: m.end()] + block(slot, responsive) + text[m.end():]
    return new.replace("</body>", JS_BLOCK.format(v=ASSET_V) + "</body>", 1), None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every page")
    ap.add_argument("--family", action="append", help="only this family (repeatable); default all in FAMILIES")
    ap.add_argument("--ad-slot", default=None, help="AdSense data-ad-slot for every family (default: the responsive unit for RESPONSIVE_FAMILIES, else the fixed Bottom 300x250 unit)")
    ap.add_argument("--remove", action="store_true", help="strip the bottom ad from the selected families")
    args = ap.parse_args()

    total = changed = 0
    skipped = {}
    jobs = []  # (path, family, allow_tool) -- tool pages first, so timer/index.html is taken as a tool page, not skipped as one
    if not args.family or "tools" in args.family:
        for d in TOOL_DIRS:
            jobs.append((os.path.join(SITE, d) if d.endswith(".html") else os.path.join(SITE, d, "index.html"), "tools", True))   # "<folder>/<page>.html" = a tool page inside another site's folder
    for family in FAMILIES:
        if args.family and family not in args.family:
            continue
        for path in sorted(glob.glob(os.path.join(SITE, family, "**", "*.html"), recursive=True)):
            jobs.append((path, family, False))
    if not args.family or "math" in args.family:  # article pages in the math-hub shell (same page set as add_sidebar_math.py)
        import add_sidebar_math
        for it in add_sidebar_math.catalog()[0]:
            jobs.append((it["path"], "math", False))
    seen = set()
    for path, family, allow_tool in jobs:
        if path in seen:
            continue
        seen.add(path)
        if NUMERIC_STUB.match(os.path.basename(path)):
            skipped.setdefault("pagination stub", []).append(path)
            continue
        total += 1
        old = read(path)
        resp = family in RESPONSIVE_FAMILIES and args.ad_slot is None
        slot = args.ad_slot or (RESPONSIVE_SLOT if resp else DEFAULT_SLOT)
        new, reason = patch(old, slot, args.remove, resp, allow_tool)
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
