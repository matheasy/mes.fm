#!/usr/bin/env python3
"""Cross-family recommendations for the "More like this" sidebar (2026-10-02): writes mes.fm/main_js/aside-recs.json from mes.fm/search/index.json.

  math -> shown on calculator / meme / puzzle / tool / timer pages, under the heading "Free math video tutorials" (send calculator users to the videos)
  calc -> shown on the math-hub article pages (Problems Plus, Math Q/A, cubic formula, ...), under "Free calculators" (and send video viewers to the tools)

main_js/aside.js picks the pool from the page's data-aside-family, shuffles it, skips the current page and fills the column up to the height of the content
(or four cards when the sidebar is below the content). Titles and thumbnails come from the search index, so **run build_search_index.py first**; edit the
curated slug lists below to change what is recommended (newest first). Idempotent; dry-runs by default, `--apply` writes.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv

MATH = ["/problems-plus-6-cable-wound-spool", "/problems-plus-5-projectile-total-distance", "/problems-plus-4-curvature-parametric-integrals",
        "/problems-plus-3-ball-rolls-table", "/problems-plus-2-projectile-inclined-plane", "/problems-plus-1-projectile-origin",
        "/cubic-formula", "/quadratic-formula-complete-square", "/quadratic-formula-pq-substitution", "/cube-root-unity", "/vector-functions-problems-plus",
        "/math-qa", "/vectors", "/sequences-series", "/spherical-harmonics", "/vector-functions", "/math"]
CALC = ["/calculator", "/derivative-calculator", "/integral-calculator", "/cas-calculator", "/2d-graphing-calculator", "/3d-graphing-calculator",
        "/percentagecalculator", "/gradecalculator", "/gpacalculator", "/unit-conversion", "/days-between-dates-calculator", "/mortgagecalculator",
        "/latex", "/symbols", "/calendar", "/inflationcalculator", "/bmicalculator"]
KIND = {"/math": "Math tutorials", "/math-qa": "Livestreams", "/vectors": "Math tutorials", "/sequences-series": "Math tutorials",
        "/spherical-harmonics": "Math tutorials", "/vector-functions": "Math tutorials"}


def main():
    idx = json.loads((SITE / "search" / "index.json").read_text(encoding="utf-8"))
    by = {x[0]: x for x in idx["p"]}
    out = {}
    for name, slugs, default_kind in (("math", MATH, "Math video"), ("calc", CALC, "Calculator")):
        items = []
        for u in slugs:
            x = by.get(u)
            if not x:
                print("missing from the search index (run build_search_index.py?):", u)
                continue
            title = x[1]
            img = x[5] if len(x) > 5 else ""
            if name == "calc" and not img:
                img = u + "/img/logo.png"
            items.append({"u": u, "t": title, "i": img, "k": KIND.get(u, default_kind)})
        out[name] = items
        print("%-5s %d items" % (name, len(items)))
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    if APPLY:
        (SITE / "main_js" / "aside-recs.json").write_text(text, encoding="utf-8")
    print("%d bytes %s" % (len(text), "written" if APPLY else "(dry run, pass --apply)"))


if __name__ == "__main__":
    main()
