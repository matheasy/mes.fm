#!/usr/bin/env python3
"""Install the "More like this" rail on the Jump-to pages (2026-10-02): cubic-formula, vector-functions-problems-plus and moon (and the build.mjs of the first two).
On screens >= 1500px the sidebar (ad + related cards + "Try it" deep links) sits on the free side of the article, opposite the fixed "Jump to" list, as a fixed
rail that scrolls on its own, with the same hide / show preference as every other page. Files: main_js/jump-aside.js + jump-aside.css (the script builds the markup,
then loads aside.js). Pages that are not listed in jump-aside.js's FAMILY map (the Hutchison / ferrocell / Norman Patricia / Nancy physics reports) are untouched on
purpose: no cross-recommendations make sense there. Idempotent (JUMP-ASIDE marker); dry-runs by default, `--apply` writes.
"""
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
HEAD = '<!-- JUMP-ASIDE --><link rel="stylesheet" href="/main_js/jump-aside.css?v=1"><!-- /JUMP-ASIDE -->'
JS = '<!-- JUMP-ASIDE-JS --><script src="/main_js/jump-aside.js?v=1" defer></script><!-- /JUMP-ASIDE-JS -->'
FILES = ["cubic-formula/index.html", "vector-functions-problems-plus/index.html", "moon/index.html", "cubic-formula/build.mjs", "vector-functions-problems-plus/build.mjs"]
n = 0
for rel in FILES:
    p = SITE / rel
    t = p.read_text(encoding="utf-8")
    if "JUMP-ASIDE" in t:
        continue
    if t.count("</head>") != 1 and rel.endswith(".mjs") or "</head>" not in t or "</body>" not in t:
        print("skipped (head/body markers):", rel)
        continue
    new = t.replace("</head>", HEAD + "</head>", 1)
    i = new.rfind("</body>")
    new = new[:i] + JS + new[i:]
    n += 1
    print(rel)
    if APPLY:
        p.write_text(new, encoding="utf-8")
print("%d file(s) %s" % (n, "patched" if APPLY else "would be patched (dry run, pass --apply)"))
