#!/usr/bin/env python3
"""Pre-paint restore for the "Wide page" option (aside.js 2b / aside.css): extends the inline <head> script of every page
that carries the "More like this" sidebar (<!-- MES-ASIDE-HEAD -->) so a saved choice (localStorage "pageWide" = "1") adds
html.page-wide before first paint -- no layout jump on load. add_sidebar.py's HEAD_BLOCK already emits the extended script
for new pages, so this only back-fills the ~1,100 existing ones. Idempotent; dry-runs by default, --apply writes."""
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent
OLD = "classList.add('aside-left')}catch(e){}</script><!-- /MES-ASIDE-HEAD -->"
NEW = ("classList.add('aside-left')}catch(e){}try{if(localStorage.getItem('pageWide')==='1')"
       "document.documentElement.classList.add('page-wide')}catch(e){}</script><!-- /MES-ASIDE-HEAD -->")
apply = "--apply" in sys.argv
n = skipped = 0
for p in sorted(ROOT.glob("mes.fm/**/*.html")):
    if "node_modules" in p.parts:
        continue
    t = p.read_text(encoding="utf-8", errors="surrogateescape")
    if "MES-ASIDE-HEAD" not in t:
        continue
    if "pageWide" in t:
        skipped += 1
        continue
    if OLD not in t:
        print("unexpected head block:", p.relative_to(ROOT)); continue
    n += 1
    if apply:
        p.write_text(t.replace(OLD, NEW, 1), encoding="utf-8", errors="surrogateescape")
print(f"{n} page(s) {'patched' if apply else 'would be patched'}, {skipped} already done" + ("" if apply else " (dry run; pass --apply to write)"))
