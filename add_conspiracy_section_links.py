#!/usr/bin/env python3
"""Adds "Posts" / "Videos" links to the "Part of ..." box of every mirror page listed in mes.fm/conspiracy/sections.mjs (conspiracy and science),
pointing at mes.fm/conspiracy-posts / mes.fm/conspiracy-videos (same pattern as the 9/11 mirrors' "Posts" link).
Idempotent; dry-runs by default, --apply writes."""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent / "mes.fm"
APPLY = "--apply" in sys.argv
n = 0
for hub, sid, label in (("conspiracy", "conspiracy-posts", "Posts"), ("conspiracy", "conspiracy-videos", "Videos"),
                        ("science", "science-posts", "Posts"), ("science", "science-videos", "Videos")):
    src = (ROOT / hub / "sections.mjs").read_text(encoding="utf-8")
    block = re.search(r'id: "%s".*?items: \[(.*?)\n    \],' % sid, src, re.S).group(1)
    for slug in re.findall(r'href: "https://mes\.fm/([^"/]+)"', block):
        p = ROOT / slug / "index.html"
        if not p.exists():
            print("missing", slug); continue
        s = p.read_text(encoding="utf-8")
        link = '<a href="https://mes.fm/%s">%s</a>' % (sid, label)
        m = re.search(r'(<div class="part-of">Part of .*?)(</div>)', s)
        if not m or link in s or "https://mes.fm/%s" % hub not in m.group(1):
            if not m or "https://mes.fm/%s" % hub not in m.group(1): print("no %s part-of:" % hub, slug)
            continue
        s = s.replace(m.group(0), m.group(1) + " &middot; " + link + m.group(2), 1)
        n += 1
        if APPLY: p.write_text(s, encoding="utf-8")
print(("patched" if APPLY else "would patch"), n, "pages")
