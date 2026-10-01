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
V = "4"
RESTORE = ("try{var L=localStorage,H=document.documentElement.classList;if(L.getItem('asideSide')==='left')H.add('aside-left');"
           "if(L.getItem('pageWide')==='1')H.add('page-wide');if(L.getItem('tocHidden')==='1')H.add('toc-hidden')}catch(e){}")
HEAD = ('<!-- TOC-FLIP-HEAD --><link rel="stylesheet" href="/main_js/toc-flip.css?v=' + V + '"><script>' + RESTORE + '</script><!-- /TOC-FLIP-HEAD -->\n')
TAIL = '<script src="/main_js/toc-flip.js?v=' + V + '" defer></script>'

HEAD_RE = re.compile(r"<!-- TOC-FLIP-HEAD -->.*?<!-- /TOC-FLIP-HEAD -->\n?", re.S)
TAIL_RE = re.compile(r'<script src="/main_js/toc-flip\.js\?v=\d+" defer></script>')

def patch(text):
    """(re)writes the head block and script tag; stripping any earlier version first makes upgrades idempotent."""
    if '<nav class="toc-sidebar"' not in text:
        return text
    text = TAIL_RE.sub("", HEAD_RE.sub("", text))
    i = text.find("</head>")
    j = text.rfind("</body>")  # templates keep these literally inside a JS template string; first/last is the page's own
    if i < 0 or j < 0:
        return text
    return text[:i] + HEAD + text[i:j] + TAIL + text[j:]

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
