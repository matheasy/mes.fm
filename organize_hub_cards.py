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
TAG = '<script src="/main_js/hub-filter.js?v=5" defer></script><script src="/main_js/newest.js" defer></script>'

# "popular": slugs shown first, in this order, as a duplicate "Popular" section (only while no search / category is active).
# Four cards on purpose: two columns (601-899px) fill two full rows, and the 4th carries `hub-pop-extra`, which
# hub-filter.js hides from 900px up where the grid is three columns wide -- so neither layout leaves a hole.
# Picked from mes.fm/stats (curl "https://mes.fm/api/stats?range=30d"): 30-day views Grade 4.8k, Percentage 3.7k,
# Weighted Average 2.4k (then GPA 1.7k, BMI 1.6k); tools: Timer (45 views/7d) clearly ahead, then Speed Reader and Moon.
PAGES = {
    "calculators.html": dict(noun="calculators", popular=["percentagecalculator", "gradecalculator", "bmicalculator", "gpacalculator", "weighted-average-calculator", "inflationcalculator", "vatcalculator", "mortgagecalculator"], cats=[
        ("school", "School &amp; Grades", ["gradecalculator", "gpacalculator", "weighted-average-calculator", "gradecalculator/br"]),
        ("money", "Money &amp; Finance", ["loan-calculator", "compound-interest-calculator", "mortgagecalculator", "inflationcalculator", "vatcalculator", "youtubemoney/index.html", "impermanent-loss-calculator"]),
        ("algebra", "Algebra &amp; Calculus", ["statistics-calculator", "sum-of-integers-calculator", "matrix-calculator", "calculator", "cas-calculator", "derivative-calculator", "integral-calculator", "2d-graphing-calculator", "3d-graphing-calculator"]),
        ("everyday", "Everyday Math &amp; Health", ["fuel-cost-calculator", "time-calculator", "tip-calculator", "age-calculator", "days-between-dates-calculator", "ovulation-calculator", "period-calculator", "due-date-calculator", "baby-growth-percentile-calculator", "baby-feeding-log", "contraction-timer", "body-fat-calculator", "bmr-calculator", "pregnancy-test-calculator", "conception-date-calculator", "weeks-pregnant-calculator", "percentagecalculator", "unit-conversion", "bmi-calculator-kids", "trigonometry", "geometry", "shapes-calculator", "pregnancy-calorie-calculator", "body-surface-area-calculator", "one-rep-max-calculator", "sleep-calculator", "calories-burned-calculator", "protein-intake-calculator", "pace-calculator", "waist-to-hip-ratio-calculator", "heart-rate-zone-calculator", "tdee-calculator", "water-intake-calculator", "ideal-weight-calculator", "macro-calculator", "bmicalculator"]),
        ("physics", "Physics &amp; Science", ["materials", "youngs-modulus-calculator", "tensile-test-simulator", "shear-stress-calculator", "bending-stress-calculator", "reynolds-number-calculator", "photoelectric-effect-simulator", "atomic-clock-simulator", "michelson-morley-experiment", "faster-than-light-shadow-simulator", "time-dilation", "earth-curvature-calculator"]),   # photoelectric-effect-simulator is listed on tools.html (Simulations) too
        ("fun", "Fun", ["gematria", "pokemongocalculator"]),
    ]),
    "tools.html": dict(noun="tools", popular=["timer", "typing-test", "speedreader", "moon", "emoji", "calendar", "clock", "timezone"], cats=[
        ("text", "Text &amp; Symbols", ["translate", "emoji", "latex", "fonts", "symbols", "copy-text", "pronounce", "define", "enigma"]),
        ("time", "Time &amp; Focus", ["birthday-personality", "speedreader", "typing-test", "typing-test-transcribe", "typing-test-voice", "timer", "countdown-timer", "stopwatch", "alarm-clock", "pomodoro-timer", "interval-timer", "countdown-to-date", "clock", "timezone", "calendar", "reminder", "workout-planner", "birthday"]),
        ("media", "Media &amp; Web", ["seo", "youtube-thumbnail", "stats", "fav", "share", "search", "search-engines", "reverse-image-search", "domain-lookup", "site-traffic", "database", "ping", "mic-test", "file-check", "storage", "archive", "site-index", "go", "browser", "videospeed", "read-aloud", "dark-mode", "volume-booster", "text-size"]),
        ("money", "Money &amp; Markets", ["signals", "debt-clock", "elections"]),
        ("home", "Home &amp; Car", ["jump-start"]),
        ("kids", "Kids &amp; Toddlers", ["kids"]),
        ("games", "Games &amp; Chance", ["poker", "backgammon", "nba-picks", "nfl-picks", "mlb-picks", "nhl-picks", "la-liga-picks", "premier-league-picks", "march-madness", "random-number-generator", "dice-roller"]),
        ("photos", "Photos &amp; Images", ["photo", "audio", "compress", "compress-video", "convert-video", "video", "pdf", "pdf-tools", "docx", "excel", "merge-pdf", "image-converter", "exif-viewer"]),
        ("sky", "Sky &amp; Space", ["moon", "solar-system-today", "zodiac"]),
        ("sim", "Simulations", ["neural-network-playground", "letter-recognition", "llm-simulator", "redshift-simulator", "grounding-rod-simulator", "fluid-simulator", "light-in-a-medium", "black-hole-simulator", "mandelbrot", "julia-set-explorer", "buddhabrot", "time-dilation", "metric-tensor", "orbit-simulator", "double-pendulum", "hutchison-effect-simulator", "electromagnetic-fields-simulator", "magnetic-isopotentials", "3d-fluid-simulator", "photoelectric-effect-simulator", "atomic-clock-simulator", "fountain-clock", "michelson-morley-experiment", "faster-than-light-shadow-simulator"]),
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
    # thin rows (icon + title pills) instead of full cards: "Newest" is filled from /newest.json by main_js/newest.js,
    # "Popular" is static (the `popular` list above)
    out.append('\t\t<section class="hub-cat hub-cat--mini hub-cat--newest" data-cat="newest" id="newest">\n\t\t\t<h2 class="hub-cat__title">New %s</h2>\n'
               '\t\t\t<div class="mini-row mini-fit" data-newest="%s" data-count="12"></div>\n\t\t</section>\n' % (cfg["noun"], cfg["noun"]))
    if pop:
        chips.append('<button type="button" data-c="popular" aria-pressed="false">&#9733; Popular (%d)</button>' % len(pop))
        pills = "".join('\t\t\t\t<a class="mini" href="%s"><img class="mini__img" src="%s" alt="" width="28" height="28" loading="lazy"><span>%s</span></a>\n'
                        % (re.search(r'href="([^"]*)"', td).group(1), re.search(r'<img[^>]*src="([^"?]*)', td).group(1), html.escape(html.unescape(re.search(r'calc__text--title">(.*?)</span>', td, re.S).group(1).strip())))
                        for td in pop)
        out.append('\t\t<section class="hub-cat hub-cat--mini hub-cat--popular" data-cat="popular" id="popular">\n\t\t\t<h2 class="hub-cat__title">&#9733; Popular</h2>\n\t\t\t<div class="mini-row mini-fit" data-min="4">\n%s\t\t\t</div>\n\t\t</section>\n' % pills)
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
    new = re.sub(r'<script src="/main_js/hub-filter\.js[^"]*" defer></script>(<script src="/main_js/newest\.js" defer></script>)?', TAG, new)
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
    if APPLY:
        import subprocess
        subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "build_newest.py"), "--apply"])
        subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "build_hub_meta.py"), "--apply"])
    else:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
