#!/usr/bin/env python3
"""Make the FastComments block start COLLAPSED on every page (site-wide decision, 2026-09-24).

Before: every page that carried the Comments bar (`add_fastcomments.py`) rendered it open -- a filled blue bar
with the FastComments widget showing (and loading, once it neared the viewport). Now the bar starts as the
outlined/collapsed variant and `#comments-box` starts `hide`-den:

    <div id="comments-button" class="hide-div-button button">Comments</div>        (was "... button selected")
    <div id="comments-button" class="mes-comments-toggle">Comments</div>          (was "... toggle selected")
    <div id="comments-box" class="hide">...</div>                                  (was no class)

Why collapsed: the third-party embed (embed.min.js + iframe) only loads on the first click of the bar, because the
IntersectionObserver in main.js / comments.js can never fire on a `display:none` target -- so pages stop pulling
FastComments for readers who never comment, there is no layout shift when the widget renders near the footer, and
the page ends on a tidy footer instead of a wall of comments. The bar stays visible, so it is still discoverable.
Toggling is unchanged (main.js `.hide-div-button` handler / comments.js), it just starts in the other state.

Touches every tracked *.html under mes.fm/, the generators' `build.mjs`, `cubic-formula/child-template.html` and
`math_qa_mirror_template.html` (so a rebuild keeps it). `add_fastcomments.py`'s block() emits the collapsed form
for new pages. Idempotent (an already-collapsed page no longer matches); **dry-runs by default, `--apply` writes.**
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPLY = "--apply" in sys.argv

SWAPS = [
    ('<div id="comments-button" class="hide-div-button button selected">',
     '<div id="comments-button" class="hide-div-button button">'),
    ('<div id="comments-button" class="mes-comments-toggle selected">',
     '<div id="comments-button" class="mes-comments-toggle">'),
    ('<div id="comments-box">', '<div id="comments-box" class="hide">'),
]


def targets():
    out = subprocess.run(["git", "ls-files", "mes.fm/*.html", "mes.fm/*/build.mjs"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    files = [ROOT / l for l in out.splitlines() if l]
    files += [ROOT / "mes.fm/cubic-formula/child-template.html", ROOT / "math_qa_mirror_template.html"]
    return [p for p in dict.fromkeys(files) if p.exists()]


def main():
    changed = 0
    for p in targets():
        t = p.read_text(encoding="utf-8")
        if 'id="comments-button"' not in t:
            continue
        new = t
        for old, repl in SWAPS:
            new = new.replace(old, repl)
        if new != t:
            changed += 1
            if APPLY:
                p.write_text(new, encoding="utf-8")
    print("%d files %s" % (changed, "collapsed" if APPLY else "would change (dry run)"))


if __name__ == "__main__":
    main()
