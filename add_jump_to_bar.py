#!/usr/bin/env python3
"""Two small header-bar features for long pages (mes.fm/moon, /911, /hutchison, the ferrocell / tom-sky / norman pages,
the Problems Plus and cubic-formula pages ...):

  1. "Jump to" in the floating compact bar -- `main_js/jump-to.js` adds a list-icon "Jump to" button to #compact-nav
     (below the 1300px width where the sidebar TOC is hidden) that opens the page's own table of contents as a dropdown
     under the bar, so on a phone you can jump between sections without scrolling back to the top. The script tag is
     added to every page that has a `.toc-mobile .toc-links` list, and to the `build.mjs` templates that emit their own
     shell (911, hutchison, vector-functions-problems-plus, cubic-formula). The mirror pages built by
     convert_mirror_pages.py get it from that script (it adds the tag whenever the source page has a TOC).
  2. A- / A+ on the custom-layout mirror pages (moon, ferrocell, hutchison-tom-sky, norman-patricia, djw, ufo): the
     two buttons go back into the header (and so into the floating bar), scaling the page through
     `main_js/zoom-text-size.js`.

Idempotent; **dry-runs by default, `--apply` writes.**
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
APPLY = "--apply" in sys.argv
FIT = '<script src="/main_js/info-bar-fit.js" defer></script>'
JUMP = '<script src="/main_js/jump-to.js?v=2" defer></script>'
ZOOM = '<script src="/main_js/zoom-text-size.js?v=1" defer></script>'
BUTTONS = ('        <button id="textSizeDown" class="header-icon-btn" type="button" aria-label="Decrease text size" title="Decrease text size">A&minus;</button>\n'
           '        <button id="textSizeUp" class="header-icon-btn" type="button" aria-label="Increase text size" title="Increase text size">A+</button>\n')
OWN_SHELL_BUILDS = ["911", "hutchison", "vector-functions-problems-plus", "cubic-formula"]
CUSTOM_LAYOUT = ["moon", "ferrocell-specular-reflection", "hutchison-tom-sky", "norman-patricia-ai-email", "djw", "ufo"]


def write(p, text):
    if APPLY:
        p.write_text(text, encoding="utf-8")


def main():
    n_jump = n_build = n_zoom = 0
    files = subprocess.run(["git", "ls-files", "mes.fm/*/index.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    for rel in files:
        p = ROOT / rel
        slug = rel.split("/")[1]
        t = p.read_text(encoding="utf-8")
        new = t
        if re.search(r'<div class="toc-mobile"|<details class="toc-mobile"', t) and re.search(r'class="toc-links"', t) \
                and 'id="compact-nav"' in t and "jump-to.js" not in t and t.count(FIT) == 1:
            new = new.replace(FIT, FIT + JUMP, 1)
            n_jump += 1
        if slug in CUSTOM_LAYOUT and 'id="textSizeDown"' not in new and 'id="themeToggle" class="header-icon-btn"' in new:
            new = re.sub(r'(\s*)(<button id="themeToggle" class="header-icon-btn")',
                         lambda m: "\n" + BUTTONS.rstrip("\n") + m.group(1) + m.group(2), new, count=1)
            n_zoom += 1
        if slug in CUSTOM_LAYOUT and "zoom-text-size.js" not in new and new.count(FIT) == 1:
            new = new.replace(FIT, FIT + ZOOM, 1)
        if new != t:
            write(p, new)
    for slug in OWN_SHELL_BUILDS:
        p = SITE / slug / "build.mjs"
        t = p.read_text(encoding="utf-8")
        if "jump-to.js" in t or FIT not in t:
            continue
        n_build += 1
        write(p, t.replace(FIT, FIT + JUMP))
    print("%d pages got the Jump-to script, %d build.mjs templates patched, %d pages got A-/A+ back%s"
          % (n_jump, n_build, n_zoom, "" if APPLY else "  (dry run -- pass --apply)"))


if __name__ == "__main__":
    main()
