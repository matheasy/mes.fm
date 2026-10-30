#!/usr/bin/env python3
"""Cross-link the 9/11 Truth and 9/11 Spooks families in the blue info bar (2026-10-29).

Every page whose info bar has the "9/11 Truth" tab (the 9/11 hub, its section pages, the 9/11-branded mirrors,
the generators that emit them) gets a "Spooks" tab (-> /911spooks) right after it, and the hamburger menu's
"9/11 Truth" item gets a "9/11 Spooks" item after it. The 9/11 Spooks pages already link back with a
"9/11 Truth" tab. Inserted after the active tab, so main.js's :eq(N) highlight is unchanged.
Idempotent; dry-runs by default (-v lists files), --apply writes.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TAB = re.compile(r'''(([ \t]*)<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href=(["'])/911\3>9/11 Truth</a></li>)''')
NAV = re.compile(r'''(([ \t]*)<li class="navbar__item"><a target="_self" class="navbar__link" href=(["'])/911\3>9/11 Truth</a></li>)''')


def patch(s):
    if "/911spooks" in s and re.search(r'''href=["']/911spooks["']>Spooks<''', s):
        return s  # a Spooks-family page or already done
    s2 = TAB.sub(lambda m: m.group(1) + '\n' + m.group(2) + '<li class="info-bar__item"><a class="info-bar__item__text" href=%s/911spooks%s>Spooks</a></li>' % (m.group(3), m.group(3)), s, count=1)
    if s2 == s:
        return s
    s2 = NAV.sub(lambda m: m.group(1) + '\n' + m.group(2) + '<li class="navbar__item"><a class="navbar__link" href=%s/911spooks%s>9/11 Spooks</a></li>' % (m.group(3), m.group(3)), s2, count=1)
    return s2


def main():
    apply, verbose = "--apply" in sys.argv, "-v" in sys.argv
    files = glob.glob(os.path.join(ROOT, "mes.fm", "*", "index.html")) + glob.glob(os.path.join(ROOT, "mes.fm", "*", "build.mjs")) \
        + [os.path.join(ROOT, f) for f in ("hive_mirror_template.html",)]
    n = 0
    for f in sorted(files):
        if "/911spooks" in f or not os.path.exists(f):
            continue
        s = open(f, encoding="utf-8").read()
        t = patch(s)
        if t != s:
            n += 1
            if verbose: print("  ", os.path.relpath(f, ROOT))
            if apply: open(f, "w", encoding="utf-8").write(t)
    print(("Patched" if apply else "Would patch"), n, "files")


if __name__ == "__main__":
    main()
