#!/usr/bin/env python3
"""Page titles (`h1.page-title`) were font-weight 100 (Thin), which renders hair-thin on Android / dark pages (2026-10-16, "the font is a bit thin").
Sets the `.page-title { ... font-weight: 100 ... }` rule to 400 in every page, build.mjs generator and template that carries it (1,190 files).
Only the font-weight inside that one rule changes. Idempotent; dry-runs by default, --apply writes.   python3 fix_title_weight.py [--apply] [--weight 400]"""
import re, sys
from pathlib import Path
R = Path(__file__).resolve().parent
apply = "--apply" in sys.argv; W = sys.argv[sys.argv.index("--weight") + 1] if "--weight" in sys.argv else "400"
RULE = re.compile(r"(\.page-title\s*\{[^}]*?font-weight:\s*)100(\s*[;}])")
n = 0
for p in list(R.glob("mes.fm/**/*.html")) + list(R.glob("mes.fm/**/*.mjs")) + list(R.glob("*.html")) + list(R.glob("mes.fm/**/*.css")):
    if "node_modules" in p.parts: continue
    try: s = p.read_text(encoding="utf-8")
    except Exception: continue
    t, k = RULE.subn(lambda m: m.group(1) + W + m.group(2), s)
    if k:
        n += 1
        if apply: p.write_text(t, encoding="utf-8")
print(("changed" if apply else "would change") + " %d files" % n)
