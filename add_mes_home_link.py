#!/usr/bin/env python3
"""Add an always-visible "MES.fm" link as the right-most item of the header
"info-bar" (the blue horizontal nav) on every page except the mes.fm
homepage, so visitors on mes.fm/math, mes.fm/calculators, the calculator
mini-sites, etc. have an obvious one-click way back to https://mes.fm/.

Why the info-bar and not just the burger menu: the burger's "Home" was the
only link back, and on the calculator mini-sites the info-bar's own "Home"
tab goes to that calculator's home, not to mes.fm.

The new <li> is appended after every other item (incl. the "utility" items
that main_js/info-bar-fit.js hides/shows to keep the bar on one row). It is
deliberately NOT tagged info-bar__item--utility, so the fit script never
hides it, and it comes after the existing items so main.js's
".info-bar__item__text:eq(N)" active-tab highlighting is unaffected.

Also patches the JS template builders that emit this markup (math and
vector-functions-problems-plus build.mjs) so a rebuild keeps the link.

Idempotent: a page/template that already has info-bar__item--mes is left
alone. Skips node_modules and the homepage (mes.fm/index.html). Prints a
per-bucket report; read it rather than assuming success.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
HOMEPAGE = ROOT / "index.html"
MARK = "info-bar__item--mes"
LI = ('<li class="info-bar__item ' + MARK + '"><a class="info-bar__item__text" '
      'href="/" style="font-weight:bold;">MES.fm</a></li>')

BLOCK = re.compile(r'(<ul id="info-bar"[^>]*>)(.*?)(</ul>)', re.S)


def patch(text):
    m = BLOCK.search(text)
    if not m:
        return None, "no-info-bar"
    if MARK in m.group(2):
        return None, "already"
    inner = m.group(2)
    # Reuse the indentation of the last existing <li> so the source stays tidy.
    last = inner.rstrip()
    lines = inner.split("\n")
    indent = ""
    for ln in reversed(lines):
        if ln.strip().startswith("<li"):
            indent = ln[: len(ln) - len(ln.lstrip())]
            break
    if "\n" in inner and indent:
        new_inner = last + "\n" + indent + LI + "\n" + inner[len(inner.rstrip()):].lstrip("\n").rstrip(" ") 
        # keep whatever whitespace preceded </ul> in the original
        trailing = inner[len(inner.rstrip()):]
        new_inner = last + "\n" + indent + LI + trailing
    else:
        new_inner = inner + LI
    return text[: m.start(2)] + new_inner + text[m.end(2):], "patched"


def main():
    counts = {"patched": 0, "already": 0, "no-info-bar": 0}
    skipped_home = 0
    files = [p for p in ROOT.rglob("*")
             if p.suffix in (".html", ".mjs") and "node_modules" not in p.parts]
    for p in sorted(files):
        if p == HOMEPAGE:
            skipped_home += 1
            continue
        if p.suffix == ".mjs" and p.name != "build.mjs":
            continue
        try:
            s = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            s = p.read_text(encoding="latin-1")
            enc = "latin-1"
        else:
            enc = "utf-8"
        if 'id="info-bar"' not in s:
            continue
        new, status = patch(s)
        counts[status] += 1
        if new is not None:
            p.write_text(new, encoding=enc)
    print(f"patched: {counts['patched']}, already: {counts['already']}, "
          f"no-info-bar: {counts['no-info-bar']}, homepage skipped: {skipped_home}")


if __name__ == "__main__":
    main()
