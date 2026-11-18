#!/usr/bin/env python3
"""Cross-link the 9/11 Truth and 9/11 Spooks families in the blue info bar (2026-10-29).

Every page whose info bar has the "9/11 Truth" tab (the 9/11 hub, its section pages, the 9/11-branded mirrors,
the generators that emit them) gets a "Spooks" tab (-> /911spooks) right after it, and the hamburger menu's
"9/11 Truth" item gets a "9/11 Spooks" item after it. Since 2026-11-17 it also adds a "Hutchison" tab
(after Conspiracy) and a "Hutchison Effect" menu item (after 9/11 Spooks), so every 9/11 page has the hub's nav. The 9/11 Spooks pages already link back with a
"9/11 Truth" tab. Inserted after the active tab, so main.js's :eq(N) highlight is unchanged.
Idempotent; dry-runs by default (-v lists files), --apply writes.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TAB = re.compile(r'''(([ \t]*)<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href=(["'])/911\3>9/11 Truth</a></li>)''')
NAV = re.compile(r'''(([ \t]*)<li class="navbar__item"><a target="_self" class="navbar__link" href=(["'])/911\3>9/11 Truth</a></li>)''')


HUT_TAB = re.compile(r'''info-bar__item__text" href=["']/hutchison["']>Hutchison<''')
HUT_NAV = re.compile(r'''navbar__link" href=["']/hutchison["']>Hutchison Effect<''')


def _after(rx, s, html):
    """Insert html (same indent and quote style) on a new line after the first match of rx."""
    return rx.sub(lambda m: m.group(1) + '\n' + m.group(2) + html.replace('"', m.group(3)), s, count=1)


def patch(s):
    if not TAB.search(s):
        return s  # not a 9/11 Truth page
    # 1. "Spooks" tab after "9/11 Truth" in the info bar
    if not re.search(r'''info-bar__item__text" href=["']/911spooks["']>Spooks<''', s):
        s = _after(TAB, s, '<li class="info-bar__item"><a class="info-bar__item__text" href="/911spooks">Spooks</a></li>')
    # 2. "9/11 Spooks" after "9/11 Truth" in the hamburger menu
    if not re.search(r'''navbar__link" href=["']/911spooks["']>9/11 Spooks<''', s):
        s = _after(NAV, s, '<li class="navbar__item"><a class="navbar__link" href="/911spooks">9/11 Spooks</a></li>')
    # 3. "Hutchison" tab after "Conspiracy" (else after "Spooks") in the info bar (2026-11-17)
    if not HUT_TAB.search(s):
        for rx in (r'''(([ \t]*)<li class="info-bar__item"><a class="info-bar__item__text" href=(["'])/conspiracy\3>Conspiracy</a></li>)''',
                   r'''(([ \t]*)<li class="info-bar__item"><a class="info-bar__item__text" href=(["'])/911spooks\3>Spooks</a></li>)'''):
            t = _after(re.compile(rx), s, '<li class="info-bar__item"><a class="info-bar__item__text" href="/hutchison">Hutchison</a></li>')
            if t != s:
                s = t
                break
    # 4. "Hutchison Effect" after "9/11 Spooks" in the hamburger menu
    if not HUT_NAV.search(s):
        s = _after(re.compile(r'''(([ \t]*)<li class="navbar__item"><a class="navbar__link" href=(["'])/911spooks\3>9/11 Spooks</a></li>)'''), s,
                   '<li class="navbar__item"><a class="navbar__link" href="/hutchison">Hutchison Effect</a></li>')
    return s


def main():
    apply, verbose = "--apply" in sys.argv, "-v" in sys.argv
    files = glob.glob(os.path.join(ROOT, "mes.fm", "*", "index.html")) + glob.glob(os.path.join(ROOT, "mes.fm", "*", "build.mjs")) \
        + [os.path.join(ROOT, f) for f in ("hive_mirror_template.html",)]
    n = 0
    for f in sorted(files):
        if "/911spooks" in f or "/youtube-mestruth/" in f or not os.path.exists(f):  # youtube-mestruth = MES Truth brand, built by math/build.mjs
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
