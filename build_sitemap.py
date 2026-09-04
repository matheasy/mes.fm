#!/usr/bin/env python3
"""Generate mes.fm/sitemap.xml (and mes.fm/robots.txt if absent).

The mes.fm Vercel project now serves every calculator/tool site under one
domain, and none of the old per-subdomain sitemaps survived the move -- they
point at URLs that 301-redirect and Google is about to start erroring on
them. This emits one fresh sitemap for the whole deploy.

One <url> per real, indexable page under mes.fm/, using the same clean URL
(no .html, no /index, no trailing slash) that the page's rel="canonical"
already declares. <lastmod> comes from each file's newest git commit date.

Excluded:
  - _http_ / _https_  (HTTrack's captures of external links)
  - node_modules, 404.html
  - <section>/1.html  (pagination page 1 == the /<section> gallery it dups)
  - anything carrying <meta name="robots" content="noindex">

Re-run by hand (python3 build_sitemap.py) whenever pages are added or
removed -- there is no build step in this repo and this is not one.
"""
import datetime
import pathlib
import re
import subprocess
import xml.sax.saxutils as sx

REPO = pathlib.Path("~/Documents/GitHub/mes.fm").expanduser()
SITE = REPO / "mes.fm"
ORIGIN = "https://mes.fm"
SKIP_DIRS = ("_http_", "_https_", "node_modules")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def clean_url(path: pathlib.Path) -> str:
    rel = path.relative_to(SITE).as_posix()
    rel = re.sub(r"\.html$", "", rel)
    rel = re.sub(r"(^|/)index$", "", rel)
    return f"{ORIGIN}/{rel}" if rel else f"{ORIGIN}/"


def git_lastmod() -> dict:
    """path (relative to REPO, posix) -> newest commit date (YYYY-MM-DD)."""
    out = subprocess.run(
        ["git", "log", "--format=%cd", "--date=short", "--name-only", "--", "mes.fm"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout
    seen, cur = {}, None
    for line in out.splitlines():
        if not line:
            continue
        if DATE_RE.match(line):
            cur = line
        elif cur and line not in seen:
            seen[line] = cur
    return seen


def main():
    lastmod = git_lastmod()
    today = datetime.date.today().isoformat()
    by_url = {}
    for path in sorted(SITE.rglob("*.html")):
        if any(p in SKIP_DIRS for p in path.parts):
            continue
        if path.name in ("404.html", "1.html"):
            continue
        html = path.read_text(encoding="utf-8", errors="surrogateescape")
        if re.search(r'<meta\s+name="robots"\s+content="[^"]*noindex', html):
            continue
        url = clean_url(path)
        rel = path.relative_to(REPO).as_posix()
        # foo.html and foo/index.html both serve /foo -- keep the flat file,
        # which is the one the canonical tags point at
        if url in by_url and path.name == "index.html":
            continue
        by_url[url] = lastmod.get(rel, today)
    rows = sorted(by_url.items())

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, mod in rows:
        lines.append(
            f"  <url><loc>{sx.escape(loc)}</loc><lastmod>{mod}</lastmod></url>"
        )
    lines.append("</urlset>\n")
    (SITE / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"sitemap.xml: {len(rows)} urls")

    robots = SITE / "robots.txt"
    if not robots.exists():
        robots.write_text(
            "User-agent: *\nAllow: /\n\nSitemap: https://mes.fm/sitemap.xml\n",
            encoding="utf-8",
        )
        print("robots.txt: created")
    else:
        print("robots.txt: left as-is")


if __name__ == "__main__":
    main()
