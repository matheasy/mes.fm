#!/usr/bin/env python3
"""Site-wide footer tweak (matches what mes.fm/math and mes.fm/911 got by hand):

  1. The bottom-row "MES Links" title link (which pointed at /links, or at
     broken relative variants like /memes/links, /puzzles/<slug>/links) becomes
     "MES.fm" pointing at https://mes.fm.
  2. In the copyright line, the company name is plain text instead of a link
     ("Copyright (c) 2026 Math Easy Solutions" -- the anchor to the homepage,
     which appeared as / , https://mes.fm/ or https://mes.fm/index.html, is
     removed and its text kept).

Touches every *.html (and any build.mjs template) that carries the shared
<div id="footer" class="footer"> block, skipping node_modules. Idempotent: a
second run finds nothing to change. Prints a per-bucket count; read it.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()

LINKS_RE = re.compile(
    r'<a class="footer__text footer__text--title" href=["\'][^"\']*["\']>MES Links</a>'
)
LINKS_NEW = '<a class="footer__text footer__text--title" href="https://mes.fm">MES.fm</a>'

COPY_RE = re.compile(
    r'(<span class="footer__text footer__text--copyright">Copyright &copy; '
    r'<span id="copyright-year">[^<]*</span>&nbsp;)</span>'
    r'<a class="footer__text" href=["\'][^"\']*["\']>([^<]*)</a>'
)


def main():
    counts = {"files": 0, "links": 0, "copyright": 0}
    for p in sorted(ROOT.rglob("*")):
        if p.suffix not in (".html", ".mjs") or "node_modules" in p.parts:
            continue
        if p.suffix == ".mjs" and p.name != "build.mjs":
            continue
        raw = p.read_bytes()
        try:
            s = raw.decode("utf-8"); enc = "utf-8"
        except UnicodeDecodeError:
            s = raw.decode("latin-1"); enc = "latin-1"
        if "footer__text" not in s:
            continue
        new, n1 = LINKS_RE.subn(LINKS_NEW, s)
        new, n2 = COPY_RE.subn(r"\1\2</span>", new)
        if n1 or n2:
            p.write_bytes(new.encode(enc))
            counts["files"] += 1
            counts["links"] += n1
            counts["copyright"] += n2
    print(counts)


if __name__ == "__main__":
    main()
