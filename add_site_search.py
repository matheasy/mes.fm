#!/usr/bin/env python3
"""Load main_js/site-search.js (header magnifier + quick-search overlay, see mes.fm/search) on the pages whose
A-/A+/moon controls are written into the HTML instead of coming from main_js/display-controls.js.

display-controls.js loads site-search.js by itself, which covers the ~1,000 classic / tool / hub pages. The rest --
the math-hub shell (mes.fm/math and its section pages, the 9/11 / Hutchison / livestreams hubs, Problems Plus, the
Math Q/A and Hive mirrors, cubic formula ...; `#header-controls` or `.header-controls` in the markup) -- get
    <script src="/main_js/site-search.js?v=1" defer></script>
right before </body>. The same tag goes into every generator/template that emits that shell, so a rebuild keeps it;
pages rebuilt by a generator that isn't patched (convert_mirror_pages.py's chrome/hub swaps) just need this script
re-run. Idempotent (skips anything already loading site-search.js); **dry-runs by default (-v lists files),
--apply writes.** Bump VERSION here and in display-controls.js / build_tool_apps.py when site-search.js changes.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv
VERBOSE = "-v" in sys.argv
VERSION = "1"
TAG = '<script src="/main_js/site-search.js?v=%s" defer></script>' % VERSION
CONTROLS = re.compile(r'id="header-controls"|class="header-controls"')
GENERATORS = ["hive_mirror_template.html", "math_qa_mirror_template.html", "mes.fm/cubic-formula/build.mjs",
              "mes.fm/cubic-formula/child-template.html", "mes.fm/science/build.mjs", "mes.fm/hutchison/build.mjs",
              "mes.fm/math/build.mjs", "mes.fm/livestreams/build.mjs", "mes.fm/911/build.mjs",
              "mes.fm/vector-functions-problems-plus/build.mjs"]


def patch(text):
    if "site-search.js" in text:
        return None
    i = text.rfind("</body>")
    if i < 0:
        return None
    return text[:i] + TAG + text[i:]


def main():
    files = [ROOT / g for g in GENERATORS]
    for p in sorted(SITE.rglob("*.html")):
        if "_http" in p.as_posix() or "node_modules" in p.parts or p in files:
            continue
        files.append(p)
    changed = skipped = 0
    for p in files:
        text = p.read_text(encoding="utf-8")
        if p.suffix == ".html" and p.parent != ROOT and "template" not in p.name:
            if not CONTROLS.search(text) or "display-controls.js" in text:
                continue
        new = patch(text)
        rel = p.relative_to(ROOT)
        if new is None:
            skipped += 1
            continue
        changed += 1
        if VERBOSE:
            print(("patched  " if APPLY else "would patch  ") + str(rel))
        if APPLY:
            p.write_text(new, encoding="utf-8")
    print("%d file(s) %s, %d already had it" % (changed, "patched" if APPLY else "would change", skipped))
    if not APPLY:
        print("(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
