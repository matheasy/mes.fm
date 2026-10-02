#!/usr/bin/env python3
"""Page-width "Theatre" mode (2026-10-01): the Wide pill on the sidebar pages and the Jump-to pages became a Standard | Wide | Theatre switch
(main_js/aside.js + aside.css for the "More like this" pages, main_js/toc-flip.js + toc-flip.css for the Jump-to pages). The choice is saved as
localStorage "pageMode" (std | wide | theatre) -- theatre also writes pageWide=1, so every older head script keeps working -- and html.page-theatre
is *added on top of* html.page-wide, so all the Wide rules still apply and theatre only adds "use nearly the whole window".

This script only back-fills the tiny inline <head> snippet that restores the saved mode before first paint (no flash of the narrower layout), on
every page carrying the MES-ASIDE-HEAD / TOC-FLIP-HEAD blocks, on the build.mjs generators of the Jump-to pages and in the two scripts that emit
those blocks (add_sidebar.py HEAD_BLOCK, add_toc_flip.py). Without it the JS still restores theatre, just a moment after first paint.
Idempotent; dry-runs by default, --apply writes.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPLY = "--apply" in sys.argv
# (old, new) pairs; each file gets whichever applies
PAIRS = [
    ("try{if(localStorage.getItem('pageWide')==='1')document.documentElement.classList.add('page-wide')}catch(e){}",
     "try{if(localStorage.getItem('pageWide')==='1')document.documentElement.classList.add('page-wide')}catch(e){}"
     "try{if(localStorage.getItem('pageMode')==='theatre')document.documentElement.classList.add('page-theatre')}catch(e){}"),
    ("try{{if(localStorage.getItem('pageWide')==='1')document.documentElement.classList.add('page-wide')}}catch(e){{}}",       # add_sidebar.py (str.format braces)
     "try{{if(localStorage.getItem('pageWide')==='1')document.documentElement.classList.add('page-wide')}}catch(e){{}}"
     "try{{if(localStorage.getItem('pageMode')==='theatre')document.documentElement.classList.add('page-theatre')}}catch(e){{}}"),
    ("if(L.getItem('pageWide')==='1')H.add('page-wide');",
     "if(L.getItem('pageWide')==='1')H.add('page-wide');if(L.getItem('pageMode')==='theatre')H.add('page-theatre');"),
]
# second pass (2026-10-02): the sidebar's "hide" preference is restored in the same head block, on the pages that carry the sidebar (MES-ASIDE-HEAD) and in add_sidebar.py
ASIDE_PAIRS = [
    ("document.documentElement.classList.add('page-theatre')}catch(e){}",
     "document.documentElement.classList.add('page-theatre')}catch(e){}try{if(localStorage.getItem('asideHidden')==='1')document.documentElement.classList.add('aside-hidden')}catch(e){}"),
    ("document.documentElement.classList.add('page-theatre')}}catch(e){{}}",
     "document.documentElement.classList.add('page-theatre')}}catch(e){{}}try{{if(localStorage.getItem('asideHidden')==='1')document.documentElement.classList.add('aside-hidden')}}catch(e){{}}"),
]
changed = 0
for p in list(ROOT.rglob("*.html")) + list(ROOT.rglob("build.mjs")) + [ROOT / "add_sidebar.py", ROOT / "add_toc_flip.py", ROOT / "add_page_wide.py"]:
    if "node_modules" in p.parts or ".claude" in p.parts:
        continue
    try:
        t = p.read_text(encoding="utf-8")
    except Exception:
        continue
    if "pageWide" not in t:
        continue
    n = t
    if "page-theatre" not in n:
        for old, new in PAIRS:
            n = n.replace(old, new)
    if ("MES-ASIDE-HEAD" in n or p.name == "add_sidebar.py") and "asideHidden" not in n:
        for old, new in ASIDE_PAIRS:
            n = n.replace(old, new)
    if n != t:
        changed += 1
        if APPLY:
            p.write_text(n, encoding="utf-8")
print("%d file(s) %s" % (changed, "patched" if APPLY else "would be patched (dry run, pass --apply)"))
