#!/usr/bin/env python3
"""Fix the floating compact-nav bar hiding its own text-size / theme buttons and hamburger.

When a page's header scrolls away, a slim fixed bar (#compact-nav, z-index: 15) slides in and
the header-controls (A- / A+ / sun-moon) and the hamburger are re-positioned (position: fixed)
into its right end.  Pages in the mes.fm/911 family (class-based `.header-controls`) declared
those pinned rules without a z-index, so the bar painted OVER them and the bar showed no
controls.  mes.fm/911, hutchison and science were fixed by hand (commit 73948b3a); this applies
the same `z-index: 20` to every other page and generator template that still carries the old
rules:

    body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; }
    body.is-stuck #navbar-button   { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; }

(The math-hub family uses `#header-controls`, whose base rule already has z-index: 20.)

Patches, under mes.fm/: every <slug>/index.html, plus the generators' build.mjs and
cubic-formula/child-template.html, so a rebuild doesn't bring the bug back.  Idempotent.
Dry-runs by default -- pass --apply to write.
"""
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm"

FIXES = [
    (
        "body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; }",
        "body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; z-index: 20; }",
    ),
    (
        "body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; }",
        "body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; z-index: 20; }",
    ),
]


def targets():
    for path in sorted(SITE.glob("*/index.html")):
        yield path
    for path in sorted(SITE.glob("*/build.mjs")):
        yield path
    yield SITE / "cubic-formula" / "child-template.html"


def main():
    apply = "--apply" in sys.argv
    changed = 0
    for path in targets():
        if not path.exists():
            continue
        text = path.read_text(encoding="utf8")
        new = text
        for old, fixed in FIXES:
            new = new.replace(old, fixed)
        if new != text:
            changed += 1
            print("%s %s" % ("patched" if apply else "would patch", path.relative_to(SITE)))
            if apply:
                path.write_text(new, encoding="utf8")
    print("%d file(s) %s%s" % (changed, "patched" if apply else "to patch", "" if apply else "  (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
