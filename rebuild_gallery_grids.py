#!/usr/bin/env python3
"""Rebuild every gallery's grid + pagination so every page is browsable.

Generalizes rebuild_dream_homes_gallery.py across all seven gallery
sections. Same root cause everywhere: HTTrack captured page 1's
<table class="memes"> grid in full (~20 items) but the grid on pages 2+
came back almost empty -- shell, nav and pagination footer intact, just
not the item cards. Not a curation choice, a capture gap.

Regenerates <site>/<section>.html + <site>/<section>/<n>.html from
scratch: every slug that has a page in that section, sorted
alphabetically, 20 per page, full Previous/page-numbers/Next footer.
Titles come from each item's own og:title (already escaped, reused
verbatim). Not idempotent-additive like the other repo scripts -- it
fully regenerates the grid+pagination every run, so re-run any time a
section gets new pages.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
IMG_EXTS = ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG", "gif")
PER_PAGE = 20

TARGETS = [
    ("mortgagecalculator", "dream-homes"),
    ("gradecalculator", "memes"),
    ("timer", "inspirational-quotes"),
    ("percentagecalculator", "memes"),
    ("percentagecalculator", "interesting-facts"),
    ("bmicalculator", "memes"),
    ("bmicalculator", "health-tips"),
]


def thumb_ext(site, slug):
    for e in IMG_EXTS:
        if (ROOT / site / "img" / "memes-thumbnail" / f"{slug}-thumbnail-2.{e}").exists():
            return e
    return None


def title_of(site, section, slug):
    t = (ROOT / site / section / f"{slug}.html").read_text(encoding="utf-8", errors="surrogateescape")
    m = re.search(r'og:title" content="([^"]*)"', t)
    return m.group(1) if m else slug.replace("-", " ").title()


def table_html(site, section, items):
    rows = []
    for i in range(0, len(items), 4):
        cells = []
        for slug, title, ext in items[i:i + 4]:
            cells.append(
                f'<td class="memes__img-container"><a class="memes__link" '
                f'href="/{site}/{section}/{slug}" title="{title}">'
                f'<img height="161" width="161" class="memes__img lazyload" '
                f'data-src="/{site}/img/memes-thumbnail/{slug}-thumbnail-2.{ext}" '
                f'alt="{title}"></a></td>'
            )
        rows.append('<tr class="memes__row">' + "".join(cells) + "</tr>")
    return '<table class="memes">\n\t\t\t' + "\n\t\t\t".join(rows) + "\n\t\t</table>"


def footer_html(site, section, n, total):
    parts = []
    if n > 1:
        parts.append(
            f'<a class="button btn-link" href="/{site}/{section}/{n - 1}">'
            f'&#9668;&nbsp;&nbsp;Previous</a>'
        )
    nums = "".join(
        f'<a class="page-link" href="/{site}/{section}/{i}">{i}</a>'
        for i in range(1, total + 1)
    )
    parts.append(f'<div class="page-numbers">{nums}</div>')
    if n < total:
        parts.append(
            f'<a class="button btn-link" href="/{site}/{section}/{n + 1}">'
            f'Next&nbsp;&nbsp;&#9658;</a>'
        )
    return '<div class="btn-container">' + "".join(parts) + "</div>"


def rebuild(site, section):
    sroot = ROOT / site
    sdir = sroot / section
    if not sdir.is_dir():
        print(f"skip {site}/{section} (no dir)")
        return

    slugs = sorted(p.stem for p in sdir.glob("*.html") if not re.fullmatch(r"\d+", p.stem))
    items = []
    for s in slugs:
        ext = thumb_ext(site, s)
        if not ext:
            print(f"  {site}/{section}/{s}: SKIP, no -thumbnail-2 image")
            continue
        items.append((s, title_of(site, section, s), ext))

    pages = [items[i:i + PER_PAGE] for i in range(0, len(items), PER_PAGE)]
    total = len(pages)

    one_html = sdir / "1.html"
    if not one_html.exists():
        print(f"skip {site}/{section} (no 1.html template)")
        return
    base = one_html.read_text(encoding="utf-8", errors="surrogateescape")
    table_re = re.compile(r'<table class="memes">.*?</table>', re.S)
    footer_re = re.compile(r'<div class="btn-container">.*?</div>\s*</div>', re.S)
    old_href = f'href="https://mes.fm/{site}/{section}/1" />'
    old_ogurl = f'og:url" content="https://mes.fm/{site}/{section}/1"'

    for n, page_items in enumerate(pages, start=1):
        page = table_re.sub(lambda m: table_html(site, section, page_items), base, count=1)
        page = footer_re.sub(lambda m: footer_html(site, section, n, total) + "\n\t</div>", page, count=1)
        page = page.replace(old_href, f'href="https://mes.fm/{site}/{section}/{n}" />')
        page = page.replace(old_ogurl, f'og:url" content="https://mes.fm/{site}/{section}/{n}"')
        (sdir / f"{n}.html").write_text(page, encoding="utf-8", errors="surrogateescape")

        if n == 1:
            root_page = page.replace(
                f'href="https://mes.fm/{site}/{section}/1" />',
                f'href="https://mes.fm/{site}/{section}" />',
            ).replace(
                f'og:url" content="https://mes.fm/{site}/{section}/1"',
                f'og:url" content="https://mes.fm/{site}/{section}"',
            )
            (sroot / f"{section}.html").write_text(root_page, encoding="utf-8", errors="surrogateescape")

    n = total + 1
    while (sdir / f"{n}.html").exists():
        (sdir / f"{n}.html").unlink()
        print(f"  removed stale {site}/{section}/{n}.html")
        n += 1

    print(f"{site}/{section}: {len(items)} items -> {total} pages")


def main():
    for site, section in TARGETS:
        rebuild(site, section)


if __name__ == "__main__":
    main()
