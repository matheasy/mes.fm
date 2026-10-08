#!/usr/bin/env python3
"""Self-check for build_site_index.py (the classifier behind mes.fm/site-index).

    python3 tool_apps_src/site-index-tests.py

Scans the real site (a few seconds), then asserts that a hand-picked set of known pages (one or more per page family)
is classified as expected: template, generator and section; that pages.json (if built) stays within the size budget,
agrees with the live scan and has the shape the page's app.js reads; and that the taxonomy tables are consistent.
Exit status 1 on any failure. When a family genuinely changes shell, update EXPECT here and say why in the commit.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bsi", ROOT / "build_site_index.py")
bsi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bsi)

# url -> (template id, generator label, section key)
HUB = "hand-built hub / math-hub page"
HAND = "hand-built classic page"
MIRROR = "convert_mirror_pages.py / hive_mirror_template.html"
EXPECT = {
    "/": ("hub-tiles", HUB, "site"),
    "/contact": ("classic-info", HAND, "site"),
    "/privacy-policy": ("classic-info", HAND, "site"),
    "/sjwkeyboard": ("classic-info", HAND, "other"),
    "/calculators": ("hub-cards", "organize_hub_cards.py", "site"),
    "/tools": ("hub-cards", "organize_hub_cards.py", "site"),
    "/gradecalculator": ("classic-calc", HAND, "grade"),
    "/weighted-average-calculator": ("classic-calc", HAND, "grade"),
    "/gradecalculator/memes": ("gallery-list", HAND, "grade"),
    "/gradecalculator/memes/2": ("gallery-page", HAND, "grade"),
    "/percentagecalculator": ("classic-calc", HAND, "percentage"),
    "/percentagecalculator/interesting-facts": ("gallery-list", HAND, "percentage"),
    "/bmicalculator/sports/top-10-nba-player-bmi": ("classic-calc", HAND, "bmi"),
    "/mortgagecalculator": ("tool-shell", "build_tool_apps.py", "mortgage"),
    "/mortgagecalculator/formulas": ("classic-calc", HAND, "mortgage"),
    "/mortgagecalculator/dream-homes": ("gallery-list", HAND, "mortgage"),
    "/memes": ("gallery-list", HAND, "memes"),
    "/memes/2-wrongs-make-right": ("gallery-item", HAND, "memes"),
    "/puzzles": ("gallery-list", HAND, "puzzles"),
    "/puzzles/brain-teaser": ("puzzle-item", HAND, "puzzles"),
    "/puzzles/brain-teaser/solution": ("puzzle-item", HAND, "puzzles"),
    "/timer": ("tool-shell", "hand-built tool shell", "tools"),
    "/timer/inspirational-quotes": ("gallery-list", HAND, "tools"),
    "/emoji": ("tool-shell", "hand-built tool shell", "tools"),
    "/search-engines": ("tool-shell", "build_tool_apps.py", "tools"),
    "/site-index": ("tool-shell", "build_tool_apps.py", "tools"),
    "/calculator": ("tool-shell", "build_tool_apps.py", "calculators"),
    "/cas-calculator": ("tool-shell", "build_tool_apps.py", "calculators"),
    "/math": ("hub-tiles", "build.mjs", "math"),
    "/math-qa": ("hub-section", "build.mjs", "math-qa"),
    "/math-qa-10-gravity": ("qa-mirror", "build_math_qa_mirrors.py", "math-qa"),
    "/math-qa-71-conservation-angular-momentum": ("qa-mirror", HUB, "math-qa"),
    "/cubic-formula": ("jump-to", "build.mjs", "math"),
    "/cube-root-unity": ("mirror-article", "build.mjs", "math"),
    "/vector-functions-problems-plus": ("jump-to", "build.mjs", "math"),
    "/problems-plus-5-projectile-total-distance": ("mirror-article", MIRROR, "math"),
    "/hutchison": ("hub-tiles", "build.mjs", "hutchison"),
    "/hutchison-posts": ("hub-section", "build.mjs", "hutchison"),
    "/hutchison-nancy-physics-system": ("jump-to", "build_nancy_physics_article.py", "hutchison"),
    "/hutchison-cancer-treatment": ("mirror-article", MIRROR, "hutchison"),
    "/911": ("hub-tiles", "build.mjs", "911"),
    "/911-posts": ("hub-section", "build.mjs", "911"),
    "/911-coat-jumper": ("mirror-article", MIRROR, "911"),
    "/conspiracy": ("hub-tiles", "build.mjs", "conspiracy"),
    "/science": ("hub-tiles", "build.mjs", "science"),
    "/crypto": ("hub-links", "build.mjs", "crypto"),
    "/livestreams": ("hub-section", "build.mjs", "livestreams"),
    "/livestream-140-stats": ("mirror-article", MIRROR, "livestreams"),
    "/links": ("legacy-bare", HAND, "other"),
    "/bg": ("legacy-bare", HAND, "911"),
    "/moon": ("jump-to", HUB, "tools"),
}


def main():
    fails = []

    def check(cond, msg):
        if not cond:
            fails.append(msg)

    rows, bad, roots = bsi.scan()
    by = {r[0]: r for r in rows}
    T, G, S = bsi.TEMPLATES, bsi.GENERATORS, bsi.SECTIONS
    for url, (tpl, gen, sec) in EXPECT.items():
        r = by.get(url)
        if not r:
            check(False, "%s: page not found" % url)
            continue
        got = (T[r[3]][0], G[r[4]], S[r[2]][0])
        check(got == (tpl, gen, sec), "%s: expected %s, got %s" % (url, (tpl, gen, sec), got))
    # taxonomy tables
    check(len({t[0] for t in T}) == len(T), "duplicate template ids")
    check(T[-1][0] == "unclassified", "the last template must be 'unclassified'")
    check(len(bsi.GEN) == len(G), "duplicate generator labels")
    check(len(bsi.ISSUES) <= 31 and len(bsi.FEATURES) <= 31, "too many bit flags for a JS 32-bit mask")
    check(all(g in G for g in bsi.EXPECTS), "EXPECTS names an unknown generator: %s" % [g for g in bsi.EXPECTS if g not in G])
    # every row is well-formed
    check(all(len(r) == len(bsi.COLS) for r in rows), "row length differs from COLS")
    check(all(0 <= r[3] < len(T) and 0 <= r[4] < len(G) and 0 <= r[2] < len(S) for r in rows), "row index out of range")
    check(len({(r[0], r[12]) for r in rows}) == len(rows), "duplicate (url, kind) rows")
    check(len(rows) > 1100, "suspiciously few pages: %d" % len(rows))
    # the unclassified bucket is meant to stay tiny; a jump means a family changed shell
    un = [r[0] for r in rows if r[3] == bsi.UNCLASSIFIED]
    check(len(un) <= 10, "%d unclassified pages (a family probably changed shell): %s" % (len(un), un[:10]))
    # built file: size budget, same shape, and not stale against the scan
    out = bsi.OUT
    if out.is_file():
        data = json.loads(out.read_text(encoding="utf-8"))
        size = out.stat().st_size
        check(size <= bsi.SIZE_BUDGET, "pages.json is %d KB, over the %d KB budget" % (size // 1024, bsi.SIZE_BUDGET // 1024))
        check(data.get("cols") == bsi.COLS, "pages.json cols differ from build_site_index.COLS (re-run --apply)")
        check(len(data["templates"]) == len(T) and len(data["generators"]) == len(G), "pages.json taxonomy is stale (re-run --apply)")
        check(abs(len(data["p"]) - len(rows)) <= 3, "pages.json has %d pages but the scan finds %d (re-run --apply)" % (len(data["p"]), len(rows)))
        for key in ("generated", "sections", "features", "issues", "bad"):
            check(key in data, "pages.json lacks %r" % key)
    else:
        print("note: pages.json not built yet")
    if fails:
        print("FAILED (%d):" % len(fails))
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("ok: %d expectations, %d pages, %d unclassified%s" % (len(EXPECT), len(rows), len(un), (" (%s)" % ", ".join(un)) if un else ""))


if __name__ == "__main__":
    main()
