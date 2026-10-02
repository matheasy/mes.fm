#!/usr/bin/env python3
"""Standard | Theatre switch on the sidebar-less hub pages (2026-10-01): calculators.html, tools.html, mobile-apps.html, puzzles.html, memes.html and the
thumbnail-gallery list pages (every page carrying the HUB-WIDE-LAYOUT marker from widen_hub_pages.py / widen_gallery_pages.py that has no "More like this"
sidebar). Adds the stylesheet + early restore snippet to <head> (HUB-THEATRE-HEAD) and the script before </body> (HUB-THEATRE-JS); behaviour and the shared
saved preference are described in main_js/hub-theatre.css / .js and add_page_theatre.py. Idempotent; dry-runs by default, `--apply` writes.
"""
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
HEAD = ('<!-- HUB-THEATRE-HEAD --><link rel="stylesheet" href="/main_js/hub-theatre.css?v=1"><script>try{if(localStorage.getItem(\'pageMode\')===\'theatre\')'
        'document.documentElement.classList.add(\'page-theatre\')}catch(e){}</script><!-- /HUB-THEATRE-HEAD -->')
JS = '<!-- HUB-THEATRE-JS --><script src="/main_js/hub-theatre.js?v=1" defer></script><!-- /HUB-THEATRE-JS -->'
n = 0
for p in sorted(SITE.rglob("*.html")):
    if "_http" in str(p) or "node_modules" in p.parts:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    if "HUB-WIDE-LAYOUT" not in t or "MES-ASIDE-HEAD" in t or "HUB-THEATRE-HEAD" in t or "</head>" not in t or "</body>" not in t:
        continue
    new = t.replace("</head>", HEAD + "</head>", 1)
    i = new.rfind("</body>")
    new = new[:i] + JS + new[i:]
    n += 1
    print(p.relative_to(SITE))
    if APPLY:
        p.write_text(new, encoding="utf-8")
print("%d page(s) %s" % (n, "patched" if APPLY else "would be patched (dry run, pass --apply)"))
