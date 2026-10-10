#!/usr/bin/env python3
"""Standard | Theatre switch on the sidebar-less hub pages (2026-10-01): calculators.html, tools.html, mobile-apps.html, puzzles.html, memes.html and the
thumbnail-gallery list pages (every page carrying the HUB-WIDE-LAYOUT marker from widen_hub_pages.py / widen_gallery_pages.py that has no "More like this"
sidebar). Adds the stylesheet + early restore snippet to <head> (HUB-THEATRE-HEAD) and the script before </body> (HUB-THEATRE-JS); behaviour and the shared
saved preference are described in main_js/hub-theatre.css / .js and add_page_theatre.py. Also the math-hub family (math, 911, hutchison, science, conspiracy, livestreams and their section pages: tile/card hubs with `.icon-grid` / `.card-grid`),
the mes.fm homepage, and those six `build.mjs` generators. Idempotent; dry-runs by default, `--apply` writes.
"""
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
HEAD = ('<!-- HUB-THEATRE-HEAD --><link rel="stylesheet" href="/main_js/hub-theatre.css?v=1"><script>try{if(localStorage.getItem(\'pageMode\')===\'theatre\')'
        'document.documentElement.classList.add(\'page-theatre\')}catch(e){}</script><!-- /HUB-THEATRE-HEAD -->')
JS = '<!-- HUB-THEATRE-JS --><script src="/main_js/hub-theatre.js?v=1" defer></script><!-- /HUB-THEATRE-JS -->'
# build.mjs generators of the math-hub family: patched too, so a rebuild keeps the switch (their pages carry the markers, so this is idempotent)
GENERATORS = ["math", "hutchison", "911", "conspiracy", "mh370", "bg", "pg", "experiments", "antigravity", "free-energy", "crypto", "science", "livestreams"]
# bare `.container` shells (hub_swap pages from convert_mirror_pages.py): listed by slug; their build.mjs re-run this script after converting
EXTRA = ["mathiew", "djw",
         # math-shell Hive mirrors that have no "More like this" sidebar (ad-free graphic 9/11 clips + a donate page), so no Standard | Wide | Theatre switch from aside.js
         "911-coat-jumper", "911-jumper-launched", "stanley-praimnath-jumpers", "eyesiswatchin-donate"]


def is_hub_family(t):
    """tile/card hub pages of the math-hub shell and the homepage: same .outer-page-content/.page-content frame as calculators.html"""
    return ('class="outer-page-content"' in t and 'class="page-title"' in t and ("icon-grid" in t or "card-grid" in t)
            and '<nav class="toc-sidebar' not in t)


n = 0
for g in GENERATORS:
    p = SITE / g / "build.mjs"
    t = p.read_text(encoding="utf-8")
    if "HUB-THEATRE-HEAD" in t or t.count("</head>") != 1 or t.count("</body>") != 1:
        continue
    new = t.replace("</head>", HEAD + "</head>", 1)
    i = new.rfind("</body>")
    new = new[:i] + JS + new[i:]
    n += 1
    print(p.relative_to(SITE))
    if APPLY:
        p.write_text(new, encoding="utf-8")
for p in sorted(SITE.rglob("*.html")):
    if "_http" in str(p) or "node_modules" in p.parts:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    if ("HUB-WIDE-LAYOUT" not in t and not is_hub_family(t) and p.relative_to(SITE).as_posix() not in [e + "/index.html" for e in EXTRA]) or "MES-ASIDE-HEAD" in t or "HUB-THEATRE-HEAD" in t or "</head>" not in t or "</body>" not in t:
        continue
    new = t.replace("</head>", HEAD + "</head>", 1)
    i = new.rfind("</body>")
    new = new[:i] + JS + new[i:]
    n += 1
    print(p.relative_to(SITE))
    if APPLY:
        p.write_text(new, encoding="utf-8")
print("%d page(s) %s" % (n, "patched" if APPLY else "would be patched (dry run, pass --apply)"))
