#!/usr/bin/env python3
"""Adds "Bob Greenyer" and "Posts" links (mes.fm/bg, mes.fm/bg-posts) to the "Part of ..." box of every mirror page listed in the Posts
section of mes.fm/bg/sections.mjs, next to the hub links the page already has (a mirror linked from several hubs back-links to all of them).
Re-run after adding a post to bg/sections.mjs. Idempotent; dry-runs by default, --apply writes."""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
src = (ROOT / "bg" / "sections.mjs").read_text(encoding="utf-8")
block = re.search(r'id: "bg-posts".*?items: \[(.*?)\n    \],', src, re.S).group(1)
n = 0
for slug in re.findall(r'"https://mes\.fm/([^"/]+)"', block):
    p = ROOT / slug / "index.html"
    if not p.exists():
        print("missing", slug); continue
    s = p.read_text(encoding="utf-8")
    m = re.search(r'(<div class="part-of">Part of .*?)(</div>)', s)
    if not m:
        print("no part-of box:", slug); continue
    if 'href="https://mes.fm/bg"' in m.group(1):
        continue
    add = ' &middot; <a href="https://mes.fm/bg">Bob Greenyer</a> &middot; <a href="https://mes.fm/bg-posts">Posts</a>'
    s = s.replace(m.group(0), m.group(1) + add + m.group(2), 1)
    n += 1
    print("patched" if APPLY else "would patch", slug)
    if APPLY: p.write_text(s, encoding="utf-8")
print(("patched" if APPLY else "would patch"), n, "pages")
