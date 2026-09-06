#!/usr/bin/env python3
"""Point internal links at the clean URL instead of the redirecting .html.

The mes.fm project runs with Vercel `cleanUrls: true`, so every page is
served without its .html extension and a request for `foo.html` 308s to
`foo`. ~7k internal links across the site still carry `.html`, so every
crawl (and every user click) eats a needless redirect hop and Search
Console fills up with "Page with redirect".

This rewrites same-origin `href="...html"` (in <a> and <link> tags) to the
resolved absolute clean path:
  ../tools.html            -> /tools
  bar.html      (in memes/) -> /memes/bar
  links/index.html         -> /links
  index.html / ../index.html / ../../index.html  -> /   (these are the
      footer "Math Easy Solutions" homepage link; the deep ones currently
      resolve to the wrong place, so this also fixes a latent bug)
Fragments and query strings are preserved; external / mailto / tel /
javascript / asset links are left alone; HTTrack's _http_/_https_ mirror
captures are skipped. Idempotent -- a second run finds nothing to do.
"""
import posixpath
import re
import pathlib

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
SKIP_DIRS = ("_http_", "_https_", "node_modules")
HREF_RE = re.compile(r'''(href\s*=\s*)(["'])([^"'>#?]+?\.html)((?:[#?][^"']*)?)(\2)''')
ROOT_BUG_RE = re.compile(r'^(?:\.\./)*index\.html$')
SKIP_PREFIXES = ("http://", "https://", "//", "mailto:", "tel:", "javascript:", "#")


def clean_target(file_rel_dir: str, href_path: str) -> str:
    if ROOT_BUG_RE.match(href_path):
        return "/"
    target = posixpath.normpath(posixpath.join(file_rel_dir, href_path))
    if target == "index.html" or target.endswith("/index.html"):
        base = target[: -len("index.html")].rstrip("/")
        return "/" + base if base else "/"
    if target.startswith("../"):
        # link escapes mes.fm/ (shouldn't happen for real pages) -- leave it
        return ""
    return "/" + target[: -len(".html")]


def process(path: pathlib.Path) -> int:
    rel_dir = path.parent.relative_to(ROOT).as_posix()
    rel_dir = "" if rel_dir == "." else rel_dir
    text = path.read_text(encoding="utf-8", errors="surrogateescape")
    n = 0

    def repl(m):
        nonlocal n
        pre, q, href_path, suffix, q2 = m.groups()
        if href_path.startswith(SKIP_PREFIXES):
            return m.group(0)
        new = clean_target(rel_dir, href_path)
        if not new:  # escaped mes.fm/ or otherwise unresolved -- leave as-is
            return m.group(0)
        n += 1
        return f"{pre}{q}{new}{suffix}{q2}"

    new_text = HREF_RE.sub(repl, text)
    if n:
        path.write_text(new_text, encoding="utf-8", errors="surrogateescape")
    return n


def main():
    files = [p for p in ROOT.rglob("*.html")
             if not any(s in p.parts for s in SKIP_DIRS)]
    total = 0
    touched = 0
    for p in sorted(files):
        c = process(p)
        if c:
            touched += 1
            total += c
    print(f"rewrote {total} internal .html links across {touched} files "
          f"({len(files)} scanned)")


if __name__ == "__main__":
    main()
