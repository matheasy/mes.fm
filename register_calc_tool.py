#!/usr/bin/env python3
"""Register a new standalone calculator/tool page built by build_tool_apps.py in every list bmicalculator / bmr-calculator is in:
add_tool_page_controls TOOLS, add_sidebar tools collection, add_bottom_ad TOOL_DIRS, add_cross_links + build_search_index CALC_DIRS,
organize_hub_cards (calculators.html 'everyday' category), build_aside_recs, a hub card in calculators.html, and main_js/track.js (private query strings).
It does NOT write the APPS entry or the source folder. Dry-runs by default, --apply writes. Idempotent (skips lists that already name the slug).
  python3 register_calc_tool.py --slug body-fat-calculator --title "Body Fat Calculator" --desc "..." [--private] [--kind Calculator|Tool]"""
import argparse, re, sys
from pathlib import Path
R = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(); ap.add_argument("--slug", required=True); ap.add_argument("--title", required=True); ap.add_argument("--desc", required=True)
ap.add_argument("--kind", default="Calculator"); ap.add_argument("--private", action="store_true"); ap.add_argument("--apply", action="store_true")
a = ap.parse_args(); slug = a.slug
def patch(path, old, new, label):
    p = R / path; s = p.read_text()
    if re.search(r'["\']%s["\']|/%s["\']' % (re.escape(slug), re.escape(slug)), s) and label != "card":
        print("  already:", path); return
    if old not in s: print("  ANCHOR MISSING:", path, old[:50]); return
    print("  patch:", path)
    if a.apply: p.write_text(s.replace(old, new, 1))
patch("add_tool_page_controls.py", '    ("bmr-calculator", "BMR Calculator"),', '    ("bmr-calculator", "BMR Calculator"),\n    ("%s", "%s"),   # also built by build_tool_apps.py' % (slug, a.title), "controls")
patch("add_sidebar.py", '("bmr-calculator", "Calculator"),', '("bmr-calculator", "Calculator"), ("%s", "%s"),' % (slug, a.kind), "sidebar")
patch("add_bottom_ad.py", '"bmr-calculator", "weighted-average-calculator.html"]', '"%s", "bmr-calculator", "weighted-average-calculator.html"]' % slug, "ad")
patch("add_cross_links.py", '"bmr-calculator", "gradecalculator"', '"%s", "bmr-calculator", "gradecalculator"' % slug, "cross")
patch("build_search_index.py", '"bmr-calculator", "gradecalculator"', '"%s", "bmr-calculator", "gradecalculator"' % slug, "search")
patch("organize_hub_cards.py", '"contraction-timer", "bmr-calculator",', '"contraction-timer", "%s", "bmr-calculator",' % slug, "hub")
patch("build_aside_recs.py", '    "/bmr-calculator": ("Calculator", ["health", "everyday"]),', '    "/bmr-calculator": ("Calculator", ["health", "everyday"]),\n    "/%s": ("%s", ["health", "everyday"]),' % (slug, a.kind), "recs")
if a.private:
    patch("mes.fm/main_js/track.js", "|bmr-calculator)", "|bmr-calculator|%s)" % slug, "track")
p = R / "mes.fm/calculators.html"; s = p.read_text()
if 'https://mes.fm/%s"' % slug in s: print("  already: calculators.html card")
else:
    m = re.search(r'\t\t\t\t<td class="calc-container[^"]*"><a class="calc-link" href="https://mes.fm/bmr-calculator">', s)
    card = ('\t\t\t\t<td class="calc-container"><a class="calc-link" href="https://mes.fm/%s">\n\t\t\t\t\t<div class="calc__img-container"><img class="calc__img" src="img/%s-logo.png?v=1" alt="MES %s logo" width="88" height="88"></div>\n'
            '\t\t\t\t\t<div class="calc__text">\n\t\t\t\t\t\t<span class="calc__text--title">%s</span>\n\t\t\t\t\t\t<span class="calc__text--desc">%s</span>\n\t\t\t\t\t</div></a>\n\t\t        </td>\n') % (slug, slug, a.title, a.title, a.desc)
    if not m: print("  ANCHOR MISSING: calculators.html")
    else:
        print("  patch: calculators.html card")
        if a.apply: p.write_text(s[:m.start()] + card + s[m.start():])
print("applied" if a.apply else "dry run (use --apply)")
