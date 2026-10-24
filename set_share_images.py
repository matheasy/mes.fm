#!/usr/bin/env python3
"""Point og:image / twitter:image of the old calculator sites at a 1200x630 share image (2026-10-24).

The classic sites (percentage, grade, gpa, bmi, inflation, timer, pokemongo) used their small square logo
(`<site>/img/logo-big.png`, 250 px) as og:image, which link previews crop badly. Each of them now has
`<site>/img/share.jpg` (1200 x 630; interim PIL art from make_interim_share_images.py until Grok art lands:
`python3 import_grok_art.py --share-only <site> --apply`). For every page under mes.fm/ whose og:image is that
square logo (logo.png / logo-big.png of a site in SITES) this script:
  - swaps og:image and twitter:image to `https://mes.fm/<site>/img/share.jpg`,
  - adds og:image:width / og:image:height (1200 / 630) right after og:image when missing,
  - sets twitter:card to summary_large_image.
Pages whose og:image is anything else (meme pictures, articles) are left alone. `PAGE_SHARE` gives a page its
own image (the Weighted Average Calculator). The translated BMI pages are skipped (the card text is English).

`apply_share(html, url)` is also used by build_tool_apps.py (APPS option `share_img`), so generated pages and
this script produce the same tags. Idempotent; dry-runs by default (-v lists pages), --apply writes.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
SITES = ["percentagecalculator", "gradecalculator", "gpacalculator", "bmicalculator", "inflationcalculator",
         "timer", "pokemongocalculator"]
PAGE_SHARE = {"weighted-average-calculator.html": "gradecalculator/img/weighted-average-share.jpg"}
SKIP_DIRS = {"calculadora-imc", "calculadora-imc-pt", "kalkulator-bmi", "calcul-imc", "bmi-rechner", "calcolo-bmi",
             "vucut-kitle-indeksi", "tinh-chi-so-bmi", "kalkulator-bmi-pl", "hasibat-kutlat-al-jism", "bmi-calculator-hindi"}

OG_RE = re.compile(r'(<meta property="og:image" content=")([^"]*)("\s*/?>)')
TW_RE = re.compile(r'(<meta name="twitter:image" content=")([^"]*)("\s*/?>)')
CARD_RE = re.compile(r'(<meta name="twitter:card" content=")summary(")')


def apply_share(html, url, w=1200, h=630):
    """Return html with og:image / twitter:image = url, og:image:width/height, twitter:card summary_large_image."""
    m = OG_RE.search(html)
    if not m:
        return html
    html = html[:m.start(2)] + url + html[m.end(2):]
    m = OG_RE.search(html)
    if 'property="og:image:width"' not in html:
        html = html[:m.end()] + '        <meta property="og:image:width" content="%d" />        <meta property="og:image:height" content="%d" />' % (w, h) + html[m.end():]
    html = TW_RE.sub(lambda t: t.group(1) + url + t.group(3), html, count=1)
    html = CARD_RE.sub(r"\1summary_large_image\2", html, count=1)
    return html


def target_for(rel, og):
    if rel in PAGE_SHARE:
        sq = re.fullmatch(r"https://mes\.fm/([a-z]+)/img/logo(-big)?\.png", og or "")
        return "https://mes.fm/" + PAGE_SHARE[rel] if sq else None
    m = re.fullmatch(r"https://mes\.fm/([a-z]+)/img/logo(-big)?\.png", og or "")
    if not m or m.group(1) not in SITES:
        return None
    if not (SITE / m.group(1) / "img" / "share.jpg").exists():
        return None
    return "https://mes.fm/%s/img/share.jpg" % m.group(1)


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    changed = 0
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).as_posix()
        if "_http" in rel or "/extension/" in rel or rel.split("/")[0] in SKIP_DIRS or "node_modules" in rel:
            continue
        html = p.read_text(encoding="utf-8")
        m = OG_RE.search(html)
        if not m:
            continue
        url = target_for(rel, m.group(2))
        if not url:
            continue
        new = apply_share(html, url)
        if new != html:
            changed += 1
            if verbose:
                print("  %s -> %s" % (rel, url))
            if apply:
                p.write_text(new, encoding="utf-8")
    print("%s %d page(s)" % ("Updated" if apply else "Would update", changed))


if __name__ == "__main__":
    main()
