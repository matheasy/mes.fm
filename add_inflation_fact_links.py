#!/usr/bin/env python3
"""Adds an "Adjust it for inflation" box to the Money Facts pages that state an old price
(mes.fm/inflationcalculator/money-facts/<slug>.html).

The box shows what that price is worth today (filled in by js/fact-cta.js from the calculator's own data
file, so it stays current) and links to the Inflation Calculator with the same country / year / amount
pre-filled (?c=&s=&from=&amt=). Inserted just before the "(Responsive) Rectangle Ad" comment, i.e. right after
#main-content. Facts that are not a then-vs-now price (debt, bailout, Iraq war, Clinton speeches, penny,
tuition -- already inflation-adjusted in the text -- Bezos, Jordan/LeBron) get no box. Add a page to FACTS to
extend it. Idempotent (IFC-BOX marker); dry-runs by default, --apply writes."""
import sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent / "mes.fm" / "inflationcalculator" / "money-facts"
APPLY = "--apply" in sys.argv

# slug -> (country, data source key, year, amount in that year's currency, "what it was")
FACTS = {
    "a-loaf-of-bread-100-years-ago": ("United States", "FRED", 1915, 0.07, "a loaf of bread"),
    "average-household-income-in-1915": ("United States", "FRED", 1915, 687, "the average household income"),
    "campbells-soup-can-in-1957": ("United States", "FRED", 1957, 0.10, "a can of Campbell's soup"),
    "cost-to-fill-up-gasoline-in-1915": ("United States", "FRED", 1915, 0.15, "a gallon of gasoline"),
    "the-cost-of-the-first-cell-phone": ("United States", "FRED", 1983, 3995, "the first cell phone"),
    "the-cost-of-the-first-personal-computer": ("United States", "FRED", 1957, 55000, "the first personal computer"),
    "median-house-price-in-1970-vs-2010": ("United States", "FRED", 1970, 23000, "the median house price"),
    "the-first-speeding-ticket-cost-1-shilling-in-1896": ("United Kingdom", "UK ONS", 1896, 0.05, "the first speeding ticket (1 shilling = £0.05)"),
}
STYLE = ("<style>.ifc{margin:1.4em 0;padding:1em 1.2em;border:1px solid #e1e1e1;border-left:0.4em solid #da3b10;border-radius:0.4em;background:#fff7f4;line-height:1.5}"
         ".ifc__t{font-weight:700;margin-bottom:0.3em;color:#222}.ifc__now{color:#222;margin:0.2em 0 0.7em}.ifc__big{color:#da3b10;font-size:1.15em}"
         ".ifc a.ifc__btn{display:inline-block;padding:0.55em 1.2em;border:0.125em solid #da3b10;border-radius:0.3em;background:#da3b10;color:#fff !important;font-weight:700}"
         ".ifc a.ifc__btn:hover{background:#ae3a12;border-color:#ae3a12;text-decoration:none}</style>")


def box(country, src, year, amt, what):
    q = urlencode({"c": country, "s": src, "from": year, "amt": amt})
    return ('<!-- IFC-BOX -->%s<div class="ifc" data-c="%s" data-s="%s" data-y="%d" data-a="%s">'
            '<div class="ifc__t">Adjust it for inflation</div>'
            '<p class="ifc__now">See what %s from %d is worth in today\'s money.</p>'
            '<a class="ifc__btn" href="/inflationcalculator?%s">Open in the Inflation Calculator &rarr;</a></div>'
            '<script src="/inflationcalculator/js/fact-cta.js?v=1" defer></script><!-- /IFC-BOX -->\n'
            % (STYLE, country, src, year, amt, what, year, q))


def main():
    n = 0
    for slug, spec in FACTS.items():
        p = ROOT / (slug + ".html")
        h = p.read_text(encoding="utf-8")
        if "IFC-BOX" in h:
            print("already:", slug)
            continue
        anchor = "<!-- (Responsive) Rectangle Ad -->"
        if h.count(anchor) < 1:
            print("NO ANCHOR:", slug)
            continue
        i = h.index(anchor)
        line_start = h.rfind("\n", 0, i) + 1
        h = h[:line_start] + box(*spec) + h[line_start:]
        n += 1
        print("%s: %s" % ("patched" if APPLY else "would patch", slug))
        if APPLY:
            p.write_text(h, encoding="utf-8")
    print("%d page(s)%s" % (n, "" if APPLY else " (dry run, pass --apply)"))


if __name__ == "__main__":
    main()
