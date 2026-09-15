#!/usr/bin/env python3
"""Fix MES_Vars.current_tab / info_bar_tab indices left stale by the 2026-09-15
main-nav reorder (reorder_main_nav.py, commit c9058aa2): Puzzles, Memes, Math
Tutorials, Calculators, Tools, Mobile Apps -> Math Tutorials, Calculators,
Tools, Mobile Apps, Puzzles, Memes.

main_js/main.js highlights the current page's own nav item using two 0-based
indices set per-page in a `MES_Vars = {...}` block:
  - current_tab: indexes #navbar's top-level <li>s (0 = Home, which the
    reorder didn't touch; 1-5 = the reordered "core 5" -- Mobile Apps has no
    navbar entry at all, removed repo-wide for dead app-store links; 6+ =
    Store/Subscribe/Donate/Contact Us, also untouched by the reorder).
  - info_bar_tab (optional; falls back to current_tab if absent): indexes
    #info-bar's items. No Home item here, so it's the reordered "core 6"
    directly at 0-5 (Mobile Apps included), then 6+ again untouched.

Reordering the <li>s without updating these indices left every page's active-
tab highlight pointing at the wrong nav item (reported on mes.fm/tools, which
was hand-fixed and is excluded here -- this script covers the rest).

Only touches pages that already carry BOTH JS-space types of index (current_tab
always; info_bar_tab only when the file already sets it explicitly then remap
that field's value using its own space's permutation) -- values outside the
reordered range (0/Home, 6+/utility, -1/none) are left untouched. Idempotent
against ITS OWN prior run in the sense that re-running finds nothing left to
do only if every touched value now falls outside the remap domain, which is
not guaranteed in general -- this is a one-time companion to the nav reorder,
not meant to be re-run casually.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
EXCLUDE = {"tools.html"}  # hand-fixed and verified already

# old index (this field's own space) -> new index, for the reordered items only
NAVBAR_REMAP = {1: 4, 2: 5, 3: 1, 4: 2, 5: 3}       # Home=0 untouched, no Mobile Apps entry
INFO_BAR_REMAP = {0: 4, 1: 5, 2: 0, 3: 1, 4: 2, 5: 3}  # no Home item, Mobile Apps=5 included

CUR_RE = re.compile(r"(current_tab\s*:\s*)(-?\d+)")
INFO_RE = re.compile(r"(info_bar_tab\s*:\s*)(-?\d+)")


def fix_current_tab(m):
    old = int(m.group(2))
    new = NAVBAR_REMAP.get(old, old)
    return m.group(1) + str(new)


def fix_info_bar_tab(m):
    old = int(m.group(2))
    new = INFO_BAR_REMAP.get(old, old)
    return m.group(1) + str(new)


def process(path):
    s = path.read_text(encoding="utf-8", errors="surrogateescape")
    orig = s
    s, n1 = CUR_RE.subn(fix_current_tab, s, count=1)
    s, n2 = INFO_RE.subn(fix_info_bar_tab, s, count=1)
    if not n1:
        return "SKIP: no current_tab"
    if s == orig:
        return "no-op (values outside remap range)"
    path.write_text(s, encoding="utf-8", errors="surrogateescape")
    return "fixed" + (" (+info_bar_tab)" if n2 else "")


def main():
    results = {}
    for p in sorted(ROOT.rglob("*.html")):
        if "node_modules" in p.parts or "_http_" in p.parts or "_https_" in p.parts:
            continue
        if p.name in EXCLUDE and p.parent == ROOT:
            results.setdefault("excluded (hand-fixed)", []).append(str(p.relative_to(ROOT)))
            continue
        s = p.read_text(encoding="utf-8", errors="surrogateescape")
        if "info-bar__item\">" not in s or "Puzzles</a>" not in s:
            continue  # not a "full nav" page
        status = process(p)
        results.setdefault(status, []).append(str(p.relative_to(ROOT)))

    for status in sorted(results):
        files = results[status]
        print(f"{status}: {len(files)}")
        if status.startswith("SKIP") or status == "no-op (values outside remap range)":
            for f in files:
                print("   ", f)


if __name__ == "__main__":
    main()
