#!/usr/bin/env python3
"""Keep the header info-bar on a single row on the calculator mini-sites.

The mes.fm homepage already tags its low-priority links (Subscribe, Donate,
Contact Us) with info-bar__item--utility and loads main_js/info-bar-fit.js,
which reveals as many of them as fit without wrapping. The mini-site pages
(percentagecalculator, mortgagecalculator, ...) never got that treatment, so
their bar wrapped to two rows. This tags those three links as utility items
(hidden until the script fits them) and adds the script to every page that
has an #info-bar but no fit script yet. The "MES.fm" item stays untagged, so
it is always shown. Idempotent.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
SCRIPT = '<script src="/main_js/info-bar-fit.js" defer></script>'
UTIL_TEXT = {"Subscribe", "Donate", "Contact Us"}
BLOCK = re.compile(r'(<ul id="info-bar"[^>]*>)(.*?)(</ul>)', re.S)
LI = re.compile(r'<li class="info-bar__item"([^>]*)>(.*?)</li>', re.S)


def tag(m):
    text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
    if text not in UTIL_TEXT:
        return m.group(0)
    return ('<li class="info-bar__item info-bar__item--utility" '
            'style="display:none !important;"%s>%s</li>' % (m.group(1), m.group(2)))


changed = skipped = 0
for f in ROOT.rglob("*.html"):
    if "node_modules" in f.parts:
        continue
    t = f.read_text(encoding="utf-8", errors="surrogateescape")
    if "info-bar-fit" in t or "</body>" not in t:
        continue
    m = BLOCK.search(t)
    if not m:
        continue
    inner = LI.sub(tag, m.group(2))
    t = t[:m.start(2)] + inner + t[m.end(2):]
    t = t.replace("</body>", SCRIPT + "</body>", 1)
    f.write_text(t, encoding="utf-8", errors="surrogateescape")
    changed += 1
print("patched", changed)
