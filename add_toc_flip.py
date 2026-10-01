#!/usr/bin/env python3
"""Adds the left/right switch to the fixed "Jump to" sidebar (.toc-sidebar) on every page that has one.

Each page gets (1) in <head>, a stylesheet link plus a one-line inline script that restores the saved side before
first paint (shared with the "More like this" column: localStorage "asideSide" -> html.aside-left) and (2) a
deferred main_js/toc-flip.js before </body> that puts the button next to the "Jump to" title. Generators that emit
a toc-sidebar (build.mjs, templates) are patched the same way so a rebuild keeps it; pages cloned from the
vector-functions-problems-plus shell (build_nancy_physics_article.py) inherit it from that template.

    python3 add_toc_flip.py            # dry run
    python3 add_toc_flip.py --apply    # write
Idempotent (TOC-FLIP-HEAD marker)."""
import sys, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent
HEAD = ('<!-- TOC-FLIP-HEAD --><link rel="stylesheet" href="/main_js/toc-flip.css?v=1">'
        "<script>try{if(localStorage.getItem('asideSide')==='left')document.documentElement.classList.add('aside-left')}catch(e){}</script>"
        '<!-- /TOC-FLIP-HEAD -->\n')
HEAD_NOSCRIPT = '<!-- TOC-FLIP-HEAD --><link rel="stylesheet" href="/main_js/toc-flip.css?v=1"><!-- /TOC-FLIP-HEAD -->\n'
TAIL = '<script src="/main_js/toc-flip.js?v=1" defer></script>'

def patch(text):
    if "TOC-FLIP-HEAD" in text or "<nav class=\"toc-sidebar\"" not in text:
        return text
    head = HEAD_NOSCRIPT if "MES-ASIDE-HEAD" in text else HEAD
    # templates keep </head> / </body> literally inside a JS template string; first/last occurrence is the page's own
    i = text.find("</head>")
    j = text.rfind("</body>")
    if i < 0 or j < 0:
        return text
    return text[:i] + head + text[i:j] + TAIL + text[j:]

def main():
    apply = "--apply" in sys.argv
    n = 0
    for p in sorted(ROOT.glob("mes.fm/**/*")):
        if p.suffix not in (".html", ".mjs") or "node_modules" in p.parts:
            continue
        try:
            t = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new = patch(t)
        if new != t:
            n += 1
            print(("patched " if apply else "would patch ") + str(p.relative_to(ROOT)))
            if apply:
                p.write_text(new, encoding="utf-8")
    print(f"{n} file(s)" + ("" if apply else " (dry run; pass --apply to write)"))
main()
