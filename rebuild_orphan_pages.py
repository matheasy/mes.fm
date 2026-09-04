#!/usr/bin/env python3
"""Rebuild gallery pages whose image survived but were never linked anywhere.

rebuild_missing_pages.py already fixed the ~317 pages that were missing but
still referenced by an href somewhere in their section (gallery grid or a
prev/next chain). This covers the other case: a full-size image and both
gallery thumbnails exist under img/memes/, but the page itself was dropped
by HTTrack *and* nothing on the current site links to it -- so it never
showed up as "missing" to that script. These are genuinely dead links
(https://mes.fm/mortgagecalculator/dream-homes/giant-kids-place-house is
one) that Google still has indexed from years ago.

Same clone-a-template approach as rebuild_missing_pages.py. The only
difference is there's no gallery `title=` attribute to harvest (nothing
links to these), so the title is the slug, title-cased. Idempotent --
skips any page that already exists.
"""
import html as htmllib
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()

# (site, section to rebuild into, all sections on that site sharing img/memes/)
TARGETS = [
    ("mortgagecalculator", "dream-homes", ["dream-homes"]),
    ("gradecalculator", "memes", ["memes", "study-tips"]),
]

IMG_EXTS = ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG", "gif")
PAGINATION = re.compile(r"^\d+$")


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


def consistent(p):
    s = p.read_text(encoding="utf-8", errors="surrogateescape")
    th = re.search(r'<title>([^<|]*?)\s*\|', s)
    hh = re.search(r'<h1 class="page-title">([^<]*)</h1>', s)
    return th and hh and th.group(1).strip() == hh.group(1).strip()


def main():
    made = 0
    for site, section, all_sections in TARGETS:
        sdir = ROOT / site / section
        imgdir = ROOT / site / "img" / "memes"
        if not sdir.is_dir() or not imgdir.is_dir():
            print(f"skip {site}/{section} (missing dir)")
            continue

        all_pages = set()
        for sec in all_sections:
            d = ROOT / site / sec
            if d.is_dir():
                all_pages |= {p.stem for p in d.glob("*.html")}

        images = {f.stem for f in imgdir.iterdir()
                  if f.is_file() and f.suffix.lstrip(".") in IMG_EXTS}
        missing = sorted(s for s in images
                          if s not in all_pages and not PAGINATION.match(s))
        if not missing:
            print(f"{site}/{section}: nothing missing")
            continue

        cands = [p for p in sorted(sdir.glob("*.html"))
                 if not PAGINATION.match(p.stem)]
        tmpl_path = next((p for p in cands if consistent(p)), cands[0] if cands else None)
        if tmpl_path is None:
            print(f"skip {site}/{section} (no template page)")
            continue
        tmpl = tmpl_path.read_text(encoding="utf-8", errors="surrogateescape")
        t_slug = tmpl_path.stem
        m = re.search(r'og:title" content="([^"]*)"', tmpl)
        t_title = m.group(1) if m else t_slug
        m = re.search(rf'og:image" content="[^"]*/img/memes/{re.escape(t_slug)}\.([A-Za-z]+)"', tmpl)
        t_ext = m.group(1) if m else "jpg"
        m = re.search(r'<meta name="description" content="([^"]*)">', tmpl)
        t_desc = m.group(1) if m else ""

        gallery_url = f"/{site}/{section}"
        section_label = section.replace("-", " ").title()

        for ms in missing:
            m_ext = find_image(ROOT / site, ms)
            if not m_ext:
                continue
            m_title = ms.replace("-", " ").title()
            page = tmpl

            page = sub_attr(page, 'og:title"', t_title, m_title)
            page = sub_attr(page, 'twitter:title"', t_title, m_title)
            page = sub_attr(page, 'twitter:image:alt"', t_title, m_title)
            page = page.replace(
                f"<title>{htmllib.escape(t_title)} | ",
                f"<title>{htmllib.escape(m_title)} | ",
            ).replace(f"<title>{t_title} | ", f"<title>{m_title} | ")

            if t_desc:
                page = page.replace(
                    f'<meta name="description" content="{t_desc}">',
                    f'<meta name="description" content="{htmllib.escape(m_title, quote=True)} &ndash; {section_label} &ndash; {site.replace("calculator"," Calculator").title()}.">',
                )

            page = re.sub(
                r'(<h1 class="page-title">)[^<]*(</h1>)',
                lambda mm: mm.group(1) + htmllib.escape(m_title) + mm.group(2),
                page,
            )
            page = re.sub(
                r'(<p class="page-description">)[^<]*(</p>)', r'\g<1>\g<2>', page
            )

            page = re.sub(rf'/{section}/{re.escape(t_slug)}"', f'/{section}/{ms}"', page)

            page = page.replace(
                f"/img/memes/{t_slug}.{t_ext}", f"/img/memes/{ms}.{m_ext}"
            )
            page = re.sub(
                r'(<img class="single-img lazyload"[^>]*\balt=")[^"]*(">)',
                lambda mm: mm.group(1) + htmllib.escape(m_title, quote=True) + mm.group(2),
                page,
            )

            page = re.sub(
                r'(<a class="btn-link" href=")[^"]*("><div class="button button--small">'
                r'(?:&#9668;&nbsp;&nbsp;Previous|Random|Next&nbsp;&nbsp;&#9658;)</div></a>)',
                rf'\g<1>{gallery_url}\g<2>',
                page,
            )

            (sdir / f"{ms}.html").write_text(page, encoding="utf-8", errors="surrogateescape")
            made += 1
        print(f"{site}/{section}: rebuilt {len(missing)} pages")

    print(f"\ntotal pages rebuilt: {made}")


if __name__ == "__main__":
    main()
