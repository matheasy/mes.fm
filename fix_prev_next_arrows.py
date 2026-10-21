#!/usr/bin/env python3
"""Fix the Previous / Next arrows on the mes.fm puzzle and meme gallery pages.

The mes.fm/puzzles/* and mes.fm/memes/* item pages (and the paginated list
pages memes.html, puzzles.html, memes/N.html) drew the arrow of the
Previous / Next buttons as an absolutely positioned span 0.75em from the
button edge.  On a phone the buttons are only ~110px wide and the centred
word "Previous" reaches the arrow, so the arrow sat on top of the "P".

This script:
  1. rewrites each button so the arrow is an inline span next to the word,
     with a real gap (``<span class="btn-arrow btn-arrow--prev">&#9668;</span>Previous``,
     ``Next<span class="btn-arrow btn-arrow--next">&#9658;</span>``),
  2. adds a small CSS block (marker ``PREV-NEXT-ARROWS``) to the page's style
     block: arrow size / gap, no wrapping inside the buttons, and
     a flex row (equal ``flex: 1 1 0`` cells) so Previous / Random / Next are equal widths.

The other galleries (gradecalculator memes, dream homes, quotes, ...) already
use ``&#9668;&nbsp;&nbsp;Previous`` inline text and are left alone.

Idempotent.  Dry-runs by default (-v lists files), --apply writes.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.expanduser("~/Documents/GitHub/mes.fm"), "mes.fm")
MARK = "/* PREV-NEXT-ARROWS */"

PREV_RE = re.compile(
    r' style="position:relative;">Previous<span class="btn-arrow" '
    r'style="position:absolute;left:0\.75em;top:50%;transform:translateY\(-50%\);">'
    r'&#9668;</span>')
NEXT_RE = re.compile(
    r' style="position:relative;">Next<span class="btn-arrow" '
    r'style="position:absolute;right:0\.75em;top:50%;transform:translateY\(-50%\);">'
    r'&#9658;</span>')
PREV_NEW = '><span class="btn-arrow btn-arrow--prev" aria-hidden="true">&#9668;</span>Previous'
NEXT_NEW = '>Next<span class="btn-arrow btn-arrow--next" aria-hidden="true">&#9658;</span>'

CSS = (
    "\n\t" + MARK + "\n"
    "\t.button-container {display: flex; gap: 0.4em;}\n\t.button-container .btn-link {display: block; flex: 1 1 0; min-width: 0; width: auto; border-right: 0;}\n"
    
    "\t.button-container .button, .btn-container > .btn-link {white-space: nowrap;}\n"
    "\t.btn-arrow {display: inline-block; font-size: 0.75em; vertical-align: 0.1em;}\n"
    "\t.btn-arrow--prev {margin-right: 0.5em;}\n"
    "\t.btn-arrow--next {margin-left: 0.5em;}\n"
    "\t@media (max-width: 360px) {.btn-arrow--prev {margin-right: 0.3em;} .btn-arrow--next {margin-left: 0.3em;}"
    " .button-container .button {font-size: 0.94em;}}\n"
)


def patch(text):
    new, n1 = PREV_RE.subn(PREV_NEW, text)
    new, n2 = NEXT_RE.subn(NEXT_NEW, new)
    uses = 'class="btn-arrow btn-arrow--' in new
    if uses and MARK not in new:
        i = new.find(".btn-link {")
        j = new.find("</style>", i if i >= 0 else 0)
        if j < 0:
            return text, 0, False
        new = new[:j] + CSS + new[j:]
        return new, n1 + n2, True
    return new, n1 + n2, False


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    files = changed = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if not d.startswith("_http") and d != "node_modules"]
        for f in fn:
            if not f.endswith(".html"):
                continue
            p = os.path.join(dp, f)
            with open(p, encoding="utf-8", errors="surrogateescape") as fh:
                text = fh.read()
            if "btn-arrow" not in text:
                continue
            files += 1
            new, n, css = patch(text)
            if new != text:
                changed += 1
                if verbose:
                    print(f"{os.path.relpath(p, ROOT)}: {n} buttons{' + css' if css else ''}")
                if apply:
                    with open(p, "w", encoding="utf-8", errors="surrogateescape") as fh:
                        fh.write(new)
    print(f"{files} pages with arrows, {changed} {'patched' if apply else 'would change'}"
          + ("" if apply else " (dry run; --apply writes)"))


if __name__ == "__main__":
    main()
