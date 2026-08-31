#!/usr/bin/env python3
"""Rewrite links after a `<slug>.mes.fm` subdomain is moved into
`mes.fm/<slug>/`. Run AFTER `git mv`-ing the files into place.

    python3 migrate_subdomain.py <slug>          # e.g. timer

Two passes:
  1. In-tree: fix every already-moved page under mes.fm/<slug>/ so its
     own asset paths, nav links, canonical and og/twitter URLs work from
     the new location (mes.fm uses cleanUrls, so a page served at
     /<slug>/foo has no trailing slash and bare-relative paths break).
  2. Repo-wide: repoint every inbound reference from the retired
     subdomain (across all sibling sites) at mes.fm/<slug>. Most are
     HTTrack-relative nav links like href="../../<slug>.mes.fm/
     index.html" that never resolved on the live sites anyway.

Idempotent. Skips _http_/_https_ capture folders and .git. The moved
tree itself is only touched by pass 1, the rest of the repo only by
pass 2. Per-site contact.html / privacy-policy.html are assumed already
dropped in favour of the shared mes.fm/contact and mes.fm/privacy-policy.
"""
import os.path
import pathlib
import re
import sys

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm").expanduser()
SKIP_DIRS = {"_http_", "_https_", ".git"}
EXTS = {".html", ".json", ".xml", ".txt"}


def clean_path(rel_to_mesfm: pathlib.PurePosixPath) -> str:
    """mes.fm-relative file path -> the cleanUrls URL path it is served at."""
    parts = list(rel_to_mesfm.parts)
    if parts[-1] == "index.html":
        parts.pop()
    elif parts[-1].endswith(".html"):
        parts[-1] = parts[-1][:-5]
    return "/" + "/".join(parts)


def rewrite_in_tree(text: str, slug: str, page_parts: pathlib.PurePosixPath) -> str:
    tree = f"mes.fm/{slug}/"
    here = (pathlib.PurePosixPath("mes.fm") / page_parts).parent

    # --- canonical + og:url: point at this page's real new URL ---
    my_url = "https://mes.fm" + clean_path(page_parts)
    text = re.sub(r'(<link rel="canonical" href=")[^"]*(")', rf'\g<1>{my_url}\g<2>', text)
    text = re.sub(r'(<meta property="og:url" content=")[^"]*(")', rf'\g<1>{my_url}\g<2>', text)

    # --- defunct Google+ publisher link (its target page is not migrated) ---
    text = re.sub(r'\s*<link rel="publisher"[^>]*>', "", text)

    # --- stale (dead) Universal Analytics cookie-domain arg ---
    text = re.sub(
        r"(ga\('create',\s*'[^']+',\s*)'" + re.escape(slug) + r"\.mes\.fm'",
        r"\1'auto'",
        text,
    )

    # --- absolute refs back at the old subdomain (og:image, hardcoded links) ---
    text = text.replace(f"https://{slug}.mes.fm/", f"https://mes.fm/{slug}/")
    text = text.replace(f"https://{slug}.mes.fm", f"https://mes.fm/{slug}")

    # --- tidy old-style cross-subdomain nav links (HTTrack / pre-cleanUrls) ---
    text = re.sub(r'(https://[a-z0-9-]+\.mes\.fm)/index\.html(["\'])', r'\1/\2', text)

    # --- bare-relative asset dirs at any ../ depth -> absolute /slug/... ---
    text = re.sub(
        r'(src|href|data-src)=(["\'])(?:\.\./)*(img|js|css)/',
        rf'\1=\2/{slug}/\3/',
        text,
    )
    text = re.sub(
        r'(\$\.getScript\(\s*["\'])(?:\.\./)*js/',
        rf'\1/{slug}/js/',
        text,
    )

    # --- footer shared pages: the per-site copies are dropped in the move,
    #     so point at mes.fm's shared ones (before the generic .html pass
    #     below would otherwise map them into /slug/) ---
    text = re.sub(r'href=(["\'])(?:\.\./)*contact\.html\1', r'href=\1/contact\1', text)
    text = re.sub(r'href=(["\'])(?:\.\./)*privacy-policy\.html\1', r'href=\1/privacy-policy\1', text)

    # --- internal .html links: resolve, then map anything inside the moved
    #     tree to /slug/<cleanpath>, and fix HTTrack's broken cross-subdomain
    #     relatives (../../x.mes.fm/...) to absolute https ---
    def fix_link(m):
        q, target = m.group(1), m.group(2)
        # already absolute / non-path (scheme, root-relative, protocol-relative,
        # anchor, mailto:, tel:) -> leave alone
        if re.match(r'[a-z][a-z0-9+.-]*:|//|/|#', target):
            return m.group(0)
        frag = ""
        if "#" in target:
            target, frag = target.split("#", 1)
            frag = "#" + frag
        cross = re.match(r'(?:\.\./)+([a-z0-9-]+)\.mes\.fm/(.*)', target)
        if cross:
            sub, rest = cross.group(1), cross.group(2)
            if rest in ("index.html", ""):
                return f'href={q}https://{sub}.mes.fm/{frag}{q}'
            rest = rest[:-5] if rest.endswith(".html") else rest
            return f'href={q}https://{sub}.mes.fm/{rest}{frag}{q}'
        resolved = pathlib.PurePosixPath(os.path.normpath(str(here / target)))
        try:
            rp = resolved.relative_to("mes.fm")
        except ValueError:
            return m.group(0)
        if str(rp).startswith(f"{slug}/") or str(rp) == slug:
            return f'href={q}{clean_path(rp)}{frag}{q}'
        return m.group(0)

    text = re.sub(r'href=(["\'])([^"\']*\.html(?:#[^"\']*)?)\1', fix_link, text)
    return text


REL_INBOUND = None  # compiled per-slug in main()


def rewrite_inbound(text: str, slug: str) -> str:
    text = REL_INBOUND.sub(f"https://mes.fm/{slug}", text)
    for scheme in ("https://", "http://"):
        b = f"{scheme}{slug}.mes.fm"
        text = text.replace(f"{b}/img/", f"https://mes.fm/{slug}/img/")
        text = text.replace(f"{b}/contact", "https://mes.fm/contact")
        text = text.replace(f"{b}/privacy-policy", "https://mes.fm/privacy-policy")
        text = text.replace(f"{b}/", f"https://mes.fm/{slug}/")
        text = text.replace(b, f"https://mes.fm/{slug}")
    return re.sub(
        r"https://mes\.fm/" + re.escape(slug) + r"/(?=[\"'<)\s])",
        f"https://mes.fm/{slug}",
        text,
    )


def main():
    global REL_INBOUND
    if len(sys.argv) != 2:
        sys.exit("usage: migrate_subdomain.py <slug>")
    slug = sys.argv[1]
    REL_INBOUND = re.compile(r"(?:\.\./)+" + re.escape(slug) + r"\.mes\.fm/index\.html")
    tree = ROOT / "mes.fm" / slug

    if not tree.is_dir():
        sys.exit(f"expected {tree} to exist (git mv the files first)")

    in_tree = inbound = 0
    for path in ROOT.rglob("*"):
        if path.suffix.lower() not in EXTS or not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        original = path.read_text(encoding="utf-8", errors="surrogateescape")
        updated = original

        if str(path).startswith(str(tree) + "/"):
            page_parts = pathlib.PurePosixPath(*path.relative_to(ROOT / "mes.fm").parts)
            updated = rewrite_in_tree(updated, slug, page_parts)
            if updated != original:
                in_tree += 1
        elif str(path).startswith(str(ROOT / f"{slug}.mes.fm")):
            continue  # redirect stub, hand-authored
        elif f"{slug}.mes.fm" in original:
            updated = rewrite_inbound(updated, slug)
            if updated != original:
                inbound += 1

        if updated != original:
            path.write_text(updated, encoding="utf-8", errors="surrogateescape")

    print(f"{slug}: rewrote {in_tree} moved pages, {inbound} inbound-link files")

    leftovers = []
    for p in ROOT.rglob("*"):
        if p.suffix.lower() not in EXTS or not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if str(p).startswith(str(ROOT / f"{slug}.mes.fm")):
            continue
        for line in p.read_text(encoding="utf-8", errors="surrogateescape").splitlines():
            if f"{slug}.mes.fm" in line and "Mirrored from" not in line and "ga('create'" not in line:
                leftovers.append(f"{p.relative_to(ROOT)}: {line.strip()[:110]}")
    if leftovers:
        print(f"\n{len(leftovers)} unexpected '{slug}.mes.fm' refs remain:")
        for line in leftovers[:40]:
            print("  " + line)
    else:
        print(f"no unexpected '{slug}.mes.fm' refs remain")


if __name__ == "__main__":
    main()
