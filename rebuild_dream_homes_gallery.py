#!/usr/bin/env python3
"""Rebuild the mortgagecalculator/dream-homes gallery grid + pagination.

181 house pages exist, but the gallery only linked to 27 of them: HTTrack
captured page 1's <table class="memes"> grid in full (20 items) but the
grid table on pages 2-5 came back almost empty (6, 0, 1, 0 items) -- the
page shell, nav and pagination footer were captured fine, just not the
grid content. This isn't a curation choice, it's the same category of
capture gap as the missing pages themselves; the 71 pages
rebuild_orphan_pages.py just added made the gap far more visible.

This regenerates dream-homes.html + dream-homes/<n>.html from scratch:
one <table class="memes"> row of 4 per page, 20 items/page, all 181
slugs sorted alphabetically, full Previous/page-numbers/Next footer.
Titles come from each item's own og:title (already escaped -- reused
verbatim, not re-escaped). Not idempotent by design: re-run any time
dream-homes gets new pages and it regenerates the whole gallery fresh.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm/mortgagecalculator").expanduser()
DIR = ROOT / "dream-homes"
IMG_EXTS = ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG", "gif")
PER_PAGE = 20


def thumb_ext(slug):
    for e in IMG_EXTS:
        if (ROOT / "img" / "memes-thumbnail" / f"{slug}-thumbnail-2.{e}").exists():
            return e
    return None


def title_of(slug):
    t = (DIR / f"{slug}.html").read_text(encoding="utf-8", errors="surrogateescape")
    m = re.search(r'og:title" content="([^"]*)"', t)
    return m.group(1) if m else slug.replace("-", " ").title()


def table_html(items):
    rows = []
    for i in range(0, len(items), 4):
        cells = []
        for slug, title, ext in items[i:i + 4]:
            cells.append(
                f'<td class="memes__img-container"><a class="memes__link" '
                f'href="/mortgagecalculator/dream-homes/{slug}" title="{title}">'
                f'<img height="161" width="161" class="memes__img lazyload" '
                f'data-src="/mortgagecalculator/img/memes-thumbnail/{slug}-thumbnail-2.{ext}" '
                f'alt="{title}"></a></td>'
            )
        rows.append('<tr class="memes__row">' + "".join(cells) + "</tr>")
    return '<table class="memes">\n\t\t\t' + "\n\t\t\t".join(rows) + "\n\t\t</table>"


def footer_html(n, total):
    parts = []
    if n > 1:
        parts.append(
            f'<a class="button btn-link" href="/mortgagecalculator/dream-homes/{n - 1}">'
            f'&#9668;&nbsp;&nbsp;Previous</a>'
        )
    nums = "".join(
        f'<a class="page-link" href="/mortgagecalculator/dream-homes/{i}">{i}</a>'
        for i in range(1, total + 1)
    )
    parts.append(f'<div class="page-numbers">{nums}</div>')
    if n < total:
        parts.append(
            f'<a class="button btn-link" href="/mortgagecalculator/dream-homes/{n + 1}">'
            f'Next&nbsp;&nbsp;&#9658;</a>'
        )
    return '<div class="btn-container">' + "".join(parts) + "</div>"


def main():
    slugs = sorted(p.stem for p in DIR.glob("*.html") if not re.fullmatch(r"\d+", p.stem))
    items = []
    for s in slugs:
        ext = thumb_ext(s)
        if not ext:
            print(f"SKIP {s}: no -thumbnail-2 image")
            continue
        items.append((s, title_of(s), ext))

    pages = [items[i:i + PER_PAGE] for i in range(0, len(items), PER_PAGE)]
    total = len(pages)
    print(f"{len(items)} items -> {total} pages")

    base = (DIR / "1.html").read_text(encoding="utf-8", errors="surrogateescape")
    table_re = re.compile(r'<table class="memes">.*?</table>', re.S)
    footer_re = re.compile(r'<div class="btn-container">.*?</div>\s*</div>', re.S)
    old_href = 'href="https://mes.fm/mortgagecalculator/dream-homes/1" />'
    old_ogurl = 'og:url" content="https://mes.fm/mortgagecalculator/dream-homes/1"'

    for n, page_items in enumerate(pages, start=1):
        page = table_re.sub(lambda m: table_html(page_items), base, count=1)
        page = footer_re.sub(lambda m: footer_html(n, total) + "\n\t</div>", page, count=1)
        page = page.replace(old_href, f'href="https://mes.fm/mortgagecalculator/dream-homes/{n}" />')
        page = page.replace(old_ogurl, f'og:url" content="https://mes.fm/mortgagecalculator/dream-homes/{n}"')
        (DIR / f"{n}.html").write_text(page, encoding="utf-8", errors="surrogateescape")

        if n == 1:
            root_page = page.replace(
                'href="https://mes.fm/mortgagecalculator/dream-homes/1" />',
                'href="https://mes.fm/mortgagecalculator/dream-homes" />',
            ).replace(
                'og:url" content="https://mes.fm/mortgagecalculator/dream-homes/1"',
                'og:url" content="https://mes.fm/mortgagecalculator/dream-homes"',
            )
            (ROOT / "dream-homes.html").write_text(root_page, encoding="utf-8", errors="surrogateescape")

    n = total + 1
    while (DIR / f"{n}.html").exists():
        (DIR / f"{n}.html").unlink()
        print(f"removed stale {n}.html")
        n += 1


if __name__ == "__main__":
    main()
