#!/usr/bin/env python3
"""Organise the card hub pages (mes.fm/calculators.html, mes.fm/tools.html) into categories with a search box.

Each page's cards (`<td class="calc-container">`) are pulled out of the existing table, grouped into the categories
defined in PAGES (alphabetical by title inside a category), and re-emitted as one <section class="hub-cat"> per category
(heading + its own `.tbl` grid), preceded by a search input and category chips. `main_js/hub-filter.js` does the live
filtering. A card whose href isn't in the mapping lands in a trailing "More" section and is reported -- add it to PAGES.

Idempotent: run it again after adding a card (put the new <td> anywhere in the page, e.g. at the end of the last table)
and it is re-sorted into place. **Dry-runs by default; `--apply` writes.**
"""
import html
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
TAG = '<script src="/main_js/hub-filter.js?v=2" defer></script>'

# "popular": slugs shown first, in this order, as a duplicate "Popular" section (only while no search / category is active).
# Picked from mes.fm/stats (curl "https://mes.fm/api/stats?range=30d"): 30-day views Grade 4.8k, Percentage 3.7k,
# Weighted Average 2.4k (then GPA 1.7k, BMI 1.6k); tools: Timer (45 views/7d) clearly ahead, then Speed Reader and Moon.
PAGES = {
    "calculators.html": dict(noun="calculators", popular=["gradecalculator", "percentagecalculator", "gradecalculator/weighted-average-calculator"], cats=[
        ("school", "School &amp; Grades", ["gradecalculator", "gpacalculator", "gradecalculator/weighted-average-calculator", "gradecalculator/br"]),
        ("money", "Money &amp; Finance", ["mortgagecalculator", "inflationcalculator", "vatcalculator", "youtubemoney/index.html", "impermanent-loss-calculator"]),
        ("everyday", "Everyday Math &amp; Health", ["percentagecalculator", "unit-conversion", "bmicalculator"]),
        ("fun", "Science &amp; Fun", ["earth-curvature-calculator", "gematria", "pokemongocalculator"]),
    ]),
    "tools.html": dict(noun="tools", popular=["timer", "speedreader", "moon"], cats=[
        ("text", "Text &amp; Symbols", ["emoji", "latex", "symbols"]),
        ("time", "Time &amp; Focus", ["speedreader", "timer", "timezone"]),
        ("media", "Media &amp; Web", ["youtube-thumbnail", "stats"]),
        ("sky", "Sky &amp; Space", ["moon"]),
    ]),
}
TD = re.compile(r'[ \t]*<td class="calc-container[^"]*"><a class="calc-link" href="([^"]*)">.*?</td>\n?', re.S)


def slug_of(href):
    return re.sub(r"^https://mes\.fm/", "", href).rstrip("/")


def title_of(td):
    m = re.search(r'<span class="calc__text--title">(.*?)</span>', td, re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip().lower() if m else ""


def pairs(tds):
    """<tr class="calc-row"> pairs (kept so the two-column layout still pairs cards up)"""
    rows = []
    for i in range(0, len(tds), 2):
        chunk = tds[i:i + 2]
        cells = []
        for j, td in enumerate(chunk):
            td = re.sub(r'class="calc-container[^"]*"', 'class="calc-container%s"' % (" calc-container--last" if j == 1 else ""), td, count=1)
            cells.append(td if td.endswith("\n") else td + "\n")
        rows.append('\t\t\t<tr class="calc-row">\n' + "".join(cells) + "\t\t\t</tr>\n")
    return "".join(rows)


def build(text, cfg):
    m = re.search(r'([ \t]*)<table class="tbl tbl--stack">.*</table>\n?', text, re.S)
    if not m:
        m = re.search(r'(\t*)<section class="hub-cat".*?(?=\t*</div>\s*<!-- \(Responsive\))', text, re.S)
    region_start = text.index('<div class="hub-filter">') if '<div class="hub-filter">' in text else m.start()
    while region_start > 0 and text[region_start - 1] in " \t":
        region_start -= 1
    # gather every card in the region (old table, or previously generated sections)
    region_end = text.index("</table>", text.rindex('<table class="tbl tbl--stack">')) + len("</table>")
    if '</section>' in text[region_end:region_end + 40]:
        region_end = text.index("</section>", region_end) + len("</section>")
    while re.match(r"\s*<p id=\"hub-empty\"", text[region_end:]):
        region_end = text.index("</p>", region_end) + 4
    while text[region_end:region_end + 1] == "\n":       # swallow the newline(s) after the region so re-runs don't add blank lines
        region_end += 1
    region = text[region_start:region_end]
    cards = {slug_of(h): td for td in [mm.group(0) for mm in TD.finditer(region)] for h in [TD.match(td).group(1)]}
    known = {s for _, _, slugs in cfg["cats"] for s in slugs}
    extra = sorted(set(cards) - known)
    cats = list(cfg["cats"]) + ([("more", "More", extra)] if extra else [])
    missing = [s for s in known if s not in cards]
    out, chips, total = [], ['<button type="button" data-c="all" aria-pressed="true">All (%d)</button>' % len(cards)], 0
    pop = [cards[s] for s in cfg.get("popular", []) if s in cards]
    if pop:
        chips.append('<button type="button" data-c="popular" aria-pressed="false">&#9733; Popular (%d)</button>' % len(pop))
        out.append('\t\t<section class="hub-cat hub-cat--popular" data-cat="popular" id="popular">\n\t\t\t<h2 class="hub-cat__title">&#9733; Popular</h2>\n\t\t<table class="tbl tbl--stack">\n%s\t\t</table>\n\t\t</section>\n' % pairs(pop))
    for cid, name, slugs in cats:
        tds = sorted([cards[s] for s in slugs if s in cards], key=title_of)
        if not tds:
            continue
        total += len(tds)
        chips.append('<button type="button" data-c="%s" aria-pressed="false">%s (%d)</button>' % (cid, name, len(tds)))
        out.append('\t\t<section class="hub-cat" data-cat="%s" id="%s">\n\t\t\t<h2 class="hub-cat__title">%s</h2>\n\t\t<table class="tbl tbl--stack">\n%s\t\t</table>\n\t\t</section>\n'
                   % (cid, cid, name, pairs(tds)))
    ui = ('\t\t<div class="hub-filter">\n\t\t\t<input type="search" id="hub-search" placeholder="Search %s&hellip;" aria-label="Search %s" autocomplete="off">\n'
          '\t\t\t<div class="hub-chips" id="hub-chips">%s</div>\n\t\t</div>\n') % (cfg["noun"], cfg["noun"], "".join(chips))
    tail = '\t\t<p id="hub-empty" hidden>Nothing matches that search &mdash; try a shorter word.</p>\n'
    new = text[:region_start] + ui + "".join(out) + tail + text[region_end:]
    if "hub-filter.js" not in new:
        new = new.replace('<script src="/main_js/display-controls.js', TAG + '<script src="/main_js/display-controls.js', 1) if False else new
        anchor = re.search(r'<script src="/main_js/display-controls\.js[^"]*" defer></script>', new)
        new = new[:anchor.end()] + TAG + new[anchor.end():]
    return new, len(cards), extra, missing


def main():
    for name, cfg in PAGES.items():
        p = SITE / name
        old = p.read_text(encoding="utf-8")
        new, n, extra, missing = build(old, cfg)
        print("%-16s %d cards%s%s -> %s" % (name, n, ("  UNMAPPED: %s" % extra) if extra else "", ("  MISSING: %s" % missing) if missing else "",
                                            "changed" if new != old else "no change"))
        if APPLY and new != old:
            p.write_text(new, encoding="utf-8")
    if not APPLY:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
