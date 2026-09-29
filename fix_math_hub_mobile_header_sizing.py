#!/usr/bin/env python3
"""
Bring the math-hub tile-family's (mes.fm/math, /hutchison, /911, /livestreams
and their generated section pages) mobile header sizing in line with the
much larger site-brand-* family (the ~374 Hive-mirror / math-qa / cubic-formula
pages, cubic-formula/child-template.html, hive_mirror_template.html,
math_qa_mirror_template.html) -- reported live via phone screenshots: the
title/tagline/logo visibly render smaller on a math-hub page than on an
individual article page, at the same phone width.

Root cause: two independently-authored mobile header CSS blocks (both under
the same @media (max-width: 480px) "own row" breakpoint from
fix_mobile_header_controls.py -- that part already matches) drifted apart on
the .calculator-title/.tag-line/.logo VALUES at their respective mid-range
breakpoints (768px for the math-hub family, 600px for site-brand-*), which is
what actually carries through to a real phone width since nothing overrides
these three properties again at 480px in either family. site-brand-*'s
values (1.3em / 0.95em / 64px) are the ones already used almost everywhere
else on the site, so they're the canonical target here, not the math-hub
family's smaller ones.

Patches both the source (the 4 build.mjs generators, so a rebuild doesn't
regress it) and the already-generated output *.html for the same 3 rules, so
no npm run build / regeneration is needed -- this is a narrow, purely
cosmetic 3-value change, not a structural one.

Idempotent (a file whose values already match the target doesn't match the
search patterns any more); dry-runs by default, --apply writes.
"""

import argparse
import os
import re
import sys

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")
SKIP_DIRS = {"_http_", "_https_", ".git", "node_modules", "__pycache__",
             "percentagecalculator-app"}

REPLACEMENTS = [
    (re.compile(r"\.calculator-title \{ font-size: 1\.05em; \}"),
     ".calculator-title { font-size: 1.3em; }"),
    (re.compile(r"\.tag-line \{ font-size: 0\.8em; \}"),
     ".tag-line { font-size: 0.95em; }"),
    (re.compile(r"\.logo \{ height: 48px !important; width: 48px !important; \}"),
     ".logo { height: 64px !important; width: 64px !important; }"),
]


def patch(text):
    n = 0
    for pattern, repl in REPLACEMENTS:
        text, count = pattern.subn(repl, text)
        n += count
    return text, n


def iter_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name.endswith((".html", ".mjs")):
                yield os.path.join(dirpath, name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-v", action="store_true")
    args = ap.parse_args()

    changed = 0
    total_hits = 0
    for path in sorted(iter_files()):
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, IsADirectoryError):
            continue
        new_text, n = patch(text)
        if n == 0:
            continue
        changed += 1
        total_hits += n
        if args.v:
            print("  %s: %d rule(s)" % (os.path.relpath(path, ROOT), n))
        if args.apply:
            open(path, "w", encoding="utf-8").write(new_text)

    print("%s%d files %s (%d rule replacements)"
          % ("" if args.apply else "[dry run] ", changed,
             "changed" if args.apply else "would change", total_hits))
    if not args.apply:
        print("Re-run with --apply to write.")


if __name__ == "__main__":
    sys.exit(main())
