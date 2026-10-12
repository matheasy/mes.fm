#!/usr/bin/env python3
"""Adds a "Browser Extensions" link (-> /browser) to the burger / side navbar of every mes.fm page, right after the Tools item:

    <li class="navbar__item"><a class="navbar__link" href="/tools">Tools</a></li>
    <li class="navbar__item"><a class="navbar__link" href="/browser">Browser Extensions</a></li>      <- inserted

The horizontal info bar and the floating compact bar are deliberately NOT touched: they are crowded, and main.js highlights the active info-bar
tab by position (:eq(N)), so inserting there would shift every page's highlight.

Also patches the generators / templates that emit the navbar (tool_page_template.html, hive_mirror_template.html, math_qa_mirror_template.html,
cubic-formula/child-template.html and every build.mjs carrying the Tools item) so a rebuild keeps the link, and teaches
percentagecalculator-app/build-www.py to strip the new item from the app build (like the Tools item).

Skips HTTrack's _http_ / _https_ captures and node_modules. A navbar without a flat Tools item (a dropdown, or none) is reported and left alone.
Idempotent (pages that already link /browser in their navbar are skipped). Dry-runs by default (-v lists every file); --apply writes.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
SITE = REPO / "mes.fm"
LI = '<li class="navbar__item"><a class="navbar__link" href="/browser">Browser Extensions</a></li>'
# one flat Tools item of the navbar: no nested <li>, optional extra attributes / quote style
TOOLS = re.compile(r"""(<li class="navbar__item[^"]*"><a[^>]*href=['"](?:https://mes\.fm)?/tools['"][^>]*>Tools</a></li>)""")
HAS = re.compile(r"""<li class="navbar__item[^"]*"><a[^>]*href=['"](?:https://mes\.fm)?/browser['"][^>]*>Browser Extensions</a></li>""")


def patch(text):
    """-> (new_text, status) with status 'done' | 'already' | 'notools'. Every copy of the navbar on a page (the side menu and the burger overlay) is patched."""
    items = TOOLS.findall(text)
    if not items:
        return text, "notools"
    todo = re.compile(TOOLS.pattern + r"(?!\s*" + re.escape(LI) + ")")
    if not todo.search(text):
        return text, "already"

    def add(m):
        after = text[m.end():m.end() + 40]
        ws = re.match(r"\s*", after).group(0)
        sep = ws if "\n" in ws else ""     # keep line-per-item lists tidy
        return m.group(1) + sep + LI
    return todo.sub(add, text), "done"


def files():
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).parts
        if any(x in ("node_modules",) or x.startswith("_http") for x in rel):
            continue
        yield p
    for p in sorted(list(SITE.glob("*/build.mjs")) + [REPO / "tool_page_template.html", REPO / "hive_mirror_template.html", REPO / "math_qa_mirror_template.html",
                                                       SITE / "cubic-formula" / "child-template.html"]):
        if p.exists():
            yield p


def patch_app_builder(apply):
    p = REPO / "percentagecalculator-app" / "build-www.py"
    s = p.read_text(encoding="utf-8")
    if "Browser Extensions" in s:
        return "already"
    anchor = '    html = re.sub(r\'<li class="info-bar__item"><a class="info-bar__item__text" href=\\\'https://mes\\.fm/tools\\\'>Tools</a></li>\\s*\', "", html)\n'
    if anchor not in s:
        return "anchor not found"
    add = anchor + '    html = re.sub(r\'<li class="navbar__item"><a class="navbar__link" href="/browser">Browser Extensions</a></li>\\s*\', "", html)   # the site menu\'s Browser Extensions link (add_browser_extensions_nav.py)\n'
    if apply:
        p.write_text(s.replace(anchor, add, 1), encoding="utf-8")
    return "patched"


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    counts = {"done": 0, "already": 0, "notools": 0}
    notools = []
    for p in files():
        t = p.read_text(encoding="utf-8", errors="ignore")
        if p.suffix == ".html" and "navbar__item" not in t:
            continue
        if p.suffix == ".mjs" and "navbar__item" not in t:
            continue
        if p.name.endswith("template.html") and "navbar__item" not in t:
            continue
        new, st = patch(t)
        counts[st] += 1
        if st == "notools":
            notools.append(str(p.relative_to(REPO)))
        if st == "done":
            if verbose:
                print("  ", p.relative_to(REPO))
            if apply:
                p.write_text(new, encoding="utf-8")
    print("patched %d, already %d, no flat Tools item %d" % (counts["done"], counts["already"], counts["notools"]))
    for n in notools[:25]:
        print("  no Tools item:", n)
    print("percentagecalculator-app/build-www.py:", patch_app_builder(apply))
    if not apply:
        print("dry run: pass --apply to write")


if __name__ == "__main__":
    main()
