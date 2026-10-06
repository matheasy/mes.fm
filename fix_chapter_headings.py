#!/usr/bin/env python3
"""Chapter headers of the long collapsible articles are <h2>, not extra <h1>s.

The Problems Plus / cubic formula / ferrocell / Tom Sky / Norman-Patricia / Nancy physics pages (all clones of the
vector-functions-problems-plus shell) marked every top-level chapter fold as `<h1 class="chapter-toggle-header">`, so
a page had 4 to 20 <h1>s beside its real title (Site Index "More than one h1"; bad for outline / screen readers /
search engines). They become `<h2 class="chapter-toggle-header chapter-top">`, and the look is unchanged: the shell's
`.post-body h1 { text-align:center; font-size:1.5em; margin:1.8em 0 .8em }` is copied to `.post-body h2.chapter-top`
(an extra class, not just `h2.chapter-toggle-header`, because the *sub*-section folds are already
`<h2 class="chapter-toggle-header">` with their own `.post-body h2` look and must keep it).

Patches the generated pages *and* their generators / sources so a rebuild keeps it: each `build.mjs`,
`nancy_physics_src/content.html` + `pdf_to_content.py`. (`build_nancy_physics_article.py` copies the shell CSS from
`vector-functions-problems-plus/index.html` at build time, so it inherits the rule.)

Idempotent (the `chapter-top` class marks done files); dry-runs by default, --apply writes.
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
SLUGS = ["vector-functions-problems-plus", "cubic-formula", "ferrocell-specular-reflection", "hutchison-tom-sky",
         "norman-patricia-ai-email", "hutchison-nancy-physics-system"]
FILES = [f"mes.fm/{s}/index.html" for s in SLUGS] + [f"mes.fm/{s}/build.mjs" for s in SLUGS if s != "hutchison-nancy-physics-system"] \
        + ["nancy_physics_src/content.html"]

OPEN = re.compile(r'<h1 class="chapter-toggle-header"([^>]*)>(.*?)</h1>', re.S)
RULE = re.compile(r'(?P<ind>[ \t]*)\.post-body h1 \{(?P<body>[^}]*)\}')


def patch(path):
    s = open(path, encoding="utf-8").read()
    o = s
    s, n = OPEN.subn(lambda m: f'<h2 class="chapter-toggle-header chapter-top"{m.group(1)}>{m.group(2)}</h2>', s)
    css = 0
    if n or "chapter-toggle-header" in s:
        m = RULE.search(s)
        if m and ".post-body h2.chapter-top" not in s:
            twin = f'\n\n{m.group("ind")}.post-body h2.chapter-top {{{m.group("body")}}}'
            s = s[:m.end()] + twin + s[m.end():]
            css = 1
    if s != o:
        print(f"  {'patched' if APPLY else 'would patch'} {path}: {n} headers h1 -> h2, {css} css rule")
        if APPLY:
            open(path, "w", encoding="utf-8").write(s)
    return n


def patch_pdf_to_content():
    p = os.path.join(REPO, "nancy_physics_src/pdf_to_content.py")
    s = open(p, encoding="utf-8").read()
    a = '("h2", "chapter-toggle chapter-sub") if sub else ("h1", "chapter-toggle")'
    b = '("h2", "chapter-toggle chapter-sub") if sub else ("h2", "chapter-toggle")'
    if a in s:
        s = s.replace(a, b)
        s = s.replace('class="chapter-toggle-header" onclick', 'class="chapter-toggle-header{" chapter-top" if not sub else ""}" onclick')
        print(f"  {'patched' if APPLY else 'would patch'} nancy_physics_src/pdf_to_content.py (top-level chapters emit <h2 ... chapter-top>)")
        if APPLY:
            open(p, "w", encoding="utf-8").write(s)


def main():
    total = 0
    for f in FILES:
        total += patch(os.path.join(REPO, f))
    patch_pdf_to_content()
    print(f"{'Converted' if APPLY else 'Would convert'} {total} chapter headers" + ("" if APPLY else " (dry run: pass --apply to write)"))


main()
