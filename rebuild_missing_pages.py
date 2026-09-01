#!/usr/bin/env python3
"""Rebuild the article pages HTTrack never captured.

Across the migrated calculator sites, many gallery items (memes,
inspirational-quotes, interesting-facts, dream-homes) link to a slug
whose page HTML was never saved -- only its full-size image and gallery
thumbnail exist. On the old subdomains these were 0-byte files that
served a blank page; after the consolidation they 404.

For each (slug, section) below, clone a real sibling page as a template
and swap in the missing item's title (from the gallery `title=` attr),
image, canonical/OG URLs, and neutralise the prev/next/random links to
point back at the section gallery. Idempotent -- skips any page that
already exists.
"""
import html as htmllib
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()

SECTIONS = [
    ("gradecalculator", "memes"),
    ("timer", "inspirational-quotes"),
    ("percentagecalculator", "memes"),
    ("percentagecalculator", "interesting-facts"),
    ("mortgagecalculator", "dream-homes"),
    ("bmicalculator", "memes"),
    ("bmicalculator", "health-tips"),
]

IMG_EXTS = ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG", "gif")
PAGINATION = re.compile(r"^\d+$")


def gallery_titles(section_dir: pathlib.Path):
    """slug -> title, harvested from every `href="slug" ... title="X"` in the
    section (gallery + pagination pages, both attr orders)."""
    out = {}
    pat_a = re.compile(r'href="([a-z0-9][a-z0-9-]*)"[^>]*\btitle="([^"]*)"')
    pat_b = re.compile(r'\btitle="([^"]*)"[^>]*href="([a-z0-9][a-z0-9-]*)"')
    for p in list(section_dir.glob("*.html")) + [section_dir.parent / f"{section_dir.name}.html"]:
        if not p.exists():
            continue
        t = p.read_text(encoding="utf-8", errors="surrogateescape")
        for s, title in pat_a.findall(t):
            out.setdefault(s, title)
        for title, s in pat_b.findall(t):
            out.setdefault(s, title)
    return out


def find_image(base: pathlib.Path, name: str):
    for ext in IMG_EXTS:
        if (base / "img" / "memes" / f"{name}.{ext}").exists():
            return ext
    return None


def sub_attr(text, key, old, new):
    return re.sub(
        rf'({re.escape(key)}\s*content=")({re.escape(old)})(")',
        lambda m: m.group(1) + htmllib.escape(new, quote=True) + m.group(3),
        text,
    )


def main():
    made = 0
    for slug, section in SECTIONS:
        sdir = ROOT / slug / section
        if not sdir.is_dir():
            print(f"skip {slug}/{section} (no dir)")
            continue
        real = {p.stem for p in sdir.glob("*.html")}
        titles = gallery_titles(sdir)

        # template: a real, non-pagination page whose visible <h1> matches its
        # own <title> (some HTTrack captures have a mismatched page-title)
        def consistent(p):
            s = p.read_text(encoding="utf-8", errors="surrogateescape")
            th = re.search(r'<title>([^<|]*?)\s*\|', s)
            hh = re.search(r'<h1 class="page-title">([^<]*)</h1>', s)
            return th and hh and th.group(1).strip() == hh.group(1).strip()

        cands = [p for p in sorted(sdir.glob("*.html"))
                 if not PAGINATION.match(p.stem)]
        tmpl_path = next((p for p in cands if consistent(p)), cands[0] if cands else None)
        if tmpl_path is None:
            print(f"skip {slug}/{section} (no template page)")
            continue
        tmpl = tmpl_path.read_text(encoding="utf-8", errors="surrogateescape")
        t_slug = tmpl_path.stem
        m = re.search(r'og:title" content="([^"]*)"', tmpl)
        t_title = m.group(1) if m else t_slug
        m = re.search(rf'og:image" content="[^"]*/img/memes/{re.escape(t_slug)}\.([A-Za-z]+)"', tmpl)
        t_ext = m.group(1) if m else "jpg"
        m = re.search(r'<meta name="description" content="([^"]*)">', tmpl)
        t_desc = m.group(1) if m else ""

        # every same-section slug referenced by ANY link (gallery grid or a
        # prev/next chain), that has no page but does have an image
        referenced = set(titles)
        linkpat = re.compile(rf'href="(?:/{slug}/{section}/|)([a-z0-9][a-z0-9-]*)"')
        for p in sdir.glob("*.html"):
            referenced.update(linkpat.findall(
                p.read_text(encoding="utf-8", errors="surrogateescape")))
        missing = sorted(
            s for s in referenced
            if s not in real and not PAGINATION.match(s) and s != section
        )
        gallery_url = f"/{slug}/{section}"
        section_label = section.replace("-", " ").title()

        for ms in missing:
            m_ext = find_image(ROOT / slug, ms)
            if not m_ext:
                print(f"  {slug}/{section}/{ms}: no image, left as 404")
                continue
            # gallery title= values may carry HTML entities (&#039; etc);
            # decode to plain text, re-escape per context below
            m_title = htmllib.unescape(titles.get(ms, ms.replace("-", " ").title()))
            page = tmpl

            # titles
            page = sub_attr(page, 'og:title"', t_title, m_title)
            page = sub_attr(page, 'twitter:title"', t_title, m_title)
            page = sub_attr(page, 'twitter:image:alt"', t_title, m_title)
            page = page.replace(
                f"<title>{htmllib.escape(t_title)} | ",
                f"<title>{htmllib.escape(m_title)} | ",
            ).replace(f"<title>{t_title} | ", f"<title>{m_title} | ")

            # description -> generic (template's is item-specific)
            if t_desc:
                page = page.replace(
                    f'<meta name="description" content="{t_desc}">',
                    f'<meta name="description" content="{htmllib.escape(m_title, quote=True)} &ndash; {section_label} &ndash; {slug.replace("calculator"," Calculator").title()}.">',
                )

            # visible heading + description paragraph
            page = re.sub(
                r'(<h1 class="page-title">)[^<]*(</h1>)',
                lambda mm: mm.group(1) + htmllib.escape(m_title) + mm.group(2),
                page,
            )
            page = re.sub(
                r'(<p class="page-description">)[^<]*(</p>)', r'\g<1>\g<2>', page
            )

            # canonical + og:url slug
            page = re.sub(rf'/{section}/{re.escape(t_slug)}"', f'/{section}/{ms}"', page)

            # image (og:image, twitter:image, the <img class="single-img"> data-src)
            page = page.replace(
                f"/img/memes/{t_slug}.{t_ext}", f"/img/memes/{ms}.{m_ext}"
            )
            # single-img alt
            page = re.sub(
                r'(<img class="single-img lazyload"[^>]*\balt=")[^"]*(">)',
                lambda mm: mm.group(1) + htmllib.escape(m_title, quote=True) + mm.group(2),
                page,
            )

            # prev / next / random -> back to the section gallery
            page = re.sub(
                r'(<a class="btn-link" href=")[^"]*("><div class="button button--small">'
                r'(?:&#9668;&nbsp;&nbsp;Previous|Random|Next&nbsp;&nbsp;&#9658;)</div></a>)',
                rf'\g<1>{gallery_url}\g<2>',
                page,
            )

            (sdir / f"{ms}.html").write_text(page, encoding="utf-8", errors="surrogateescape")
            made += 1
        done = len([s for s in missing if find_image(ROOT / slug, s)])
        print(f"{slug}/{section}: rebuilt {done} pages (of {len(missing)} missing)")

    print(f"\ntotal pages rebuilt: {made}")


if __name__ == "__main__":
    main()
