#!/usr/bin/env python3
"""Adds a "Posts" link (mes.fm/crypto-posts) after "MES Crypto" in the "Part of ..." box of every mirror page listed in the Posts section of
mes.fm/crypto/sections.mjs. Re-run after adding a post there. Idempotent; dry-runs by default, --apply writes."""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
src = (ROOT / "crypto" / "sections.mjs").read_text(encoding="utf-8")
block = re.search(r'id: "crypto-posts".*?items: \[(.*?)\n    \],', src, re.S).group(1)
LINK = '<a href="https://mes.fm/crypto">MES Crypto</a>'
n = 0
for slug in re.findall(r'"https://mes\.fm/([^"/]+)"', block):
    p = ROOT / slug / "index.html"
    if not p.exists():
        print("missing", slug); continue
    s = p.read_text(encoding="utf-8")
    m = re.search(r'<div class="part-of">Part of .*?</div>', s)
    if not m or LINK not in m.group(0):
        print("no crypto part-of box:", slug); continue
    if "mes.fm/crypto-posts" in m.group(0):
        continue
    # info bar: Posts + Tutorials tabs right after the Crypto tab (it is the first item, so the active-tab index is unaffected)
    tab = re.search(r'<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="/crypto">MES Crypto</a></li>', s)
    if tab and 'href="/crypto-posts"' not in s:
        mk = lambda h, t: '<li class="info-bar__item"><a class="info-bar__item__text" href="%s">%s</a></li>' % (h, t)
        s = s.replace(tab.group(0), tab.group(0) + mk("/crypto-posts", "Posts") + mk("/blockchain-tutorials", "Tutorials"), 1)
    new = m.group(0).replace(LINK, LINK + ' &middot; <a href="https://mes.fm/crypto-posts">Posts</a>', 1)
    s = s.replace(m.group(0), new, 1)
    n += 1
    print("patched" if APPLY else "would patch", slug)
    if APPLY: p.write_text(s, encoding="utf-8")
print(("patched" if APPLY else "would patch"), n, "pages")
