#!/usr/bin/env python3
"""Fix Previous / Next Page buttons that point at pages that don't exist.

The paginated "Top 10 ... Player BMI" articles (bmicalculator/sports/top-10-*/N.html) came out of HTTrack with a pager
on every page: the last page still offers "Next Page" (-> /4 or /3, never captured / never existed) and the
"Previous Page" of page 2 points at `<article>/1`, but page 1 is the article page itself (`<article>.html`), so `/1` 404s.
(found by check_external_links.py: the pages carry absolute https://mes.fm/... links.)

For every `<div class="button-container">` Previous / Next anchor whose target is missing on disk (Vercel cleanUrls aware):
  * Previous -> `<article>/1`  becomes `<article>` when that page exists;
  * any other missing target: the whole `<a>...</a>` button is removed;
and a `<link rel="next|prev" href=...>` pointing at a missing page (or at the page itself) is removed.
Idempotent; dry-runs by default (-v lists every change), --apply writes.
"""
import os
import re
import sys
from urllib.parse import urlparse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mes.fm")
APPLY, VERBOSE = "--apply" in sys.argv, "-v" in sys.argv

BTN = re.compile(r'(?P<ind>[ \t]*)<a href="(?P<href>[^"]+)">\s*<div class="[^"]*\b(?P<kind>left|right)-button\b[^"]*">(?P<label>[^<]*)</div>\s*</a>[ \t]*\n?', re.S)
LINK = re.compile(r'[ \t]*<link rel="(?:next|prev)" href="(?P<href>[^"]+)"\s*/?>[ \t]*')


def exists(href):
    p = urlparse(href)
    if p.netloc and p.netloc.lower().removeprefix("www.") != "mes.fm":
        return True
    path = p.path.strip("/")
    return any(os.path.isfile(os.path.join(ROOT, c)) for c in ([path, path + ".html", path + "/index.html"] if path else ["index.html"]))


def self_path(rel):
    return "/" + re.sub(r"(/index)?\.html$", "", rel)


def patch(path):
    rel = os.path.relpath(path, ROOT)
    me = self_path(rel)
    s = open(path, encoding="utf-8").read()
    if "button-container" not in s and 'rel="next"' not in s and 'rel="prev"' not in s:
        return 0
    changes = []

    def btn(m):
        href = m.group("href")
        if exists(href):
            return m.group(0)
        if m.group("kind") == "left" and re.search(r"/1$", href):
            parent = re.sub(r"/1$", "", href)
            if exists(parent):
                changes.append(f"Previous {href} -> {parent}")
                return m.group(0).replace(f'href="{href}"', f'href="{parent}"')
        changes.append(f"removed {m.group('label').strip()!r} -> {href}")
        return ""

    def link(m):
        href = m.group("href")
        p = urlparse(href).path.rstrip("/")
        if not exists(href) or p == me:
            changes.append(f"removed <link> -> {href}")
            return ""
        return m.group(0)

    out = BTN.sub(btn, s)
    out = LINK.sub(link, out)
    if changes:
        print(f"  {rel}: " + "; ".join(changes) if VERBOSE else f"  {rel}: {len(changes)} change(s)")
        if APPLY:
            open(path, "w", encoding="utf-8").write(out)
    return len(changes)


def main():
    pages = total = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in ("node_modules", ".git") and not d.startswith("_http")]
        for f in fn:
            if f.endswith(".html"):
                n = patch(os.path.join(dp, f))
                if n:
                    pages += 1
                    total += n
    print(f"{'Fixed' if APPLY else 'Would fix'} {total} dead pager link(s) on {pages} page(s)" + ("" if APPLY else " (dry run: pass --apply to write)"))


main()
