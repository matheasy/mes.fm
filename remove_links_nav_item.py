"""
remove_links_nav_item.py — strip the "Links" nav item from mes.fm's own top
info-bar and side/burger navbar, repo-wide.

Two nav variants exist across the site (same content, different generations
of the shared header template):
  - Newer "responsive-fit" pages (index.html, calculators.html, puzzles.html,
    contact.html, memes/*, etc.): the info-bar's utility items (Links,
    Subscribe, Store, Donate, Contact Us) start hidden in markup and are
    revealed one at a time by main_js/info-bar-fit.js as they fit. Links is
    first in priority order.
  - Older pages (youtubemoney/*, timezone/*, most calculator subdomain
    mirrors, etc.): Links is a plain always-visible info-bar item, no
    utility-fit script involved.
Both variants also carry an identical "Links" entry in the side/burger
navbar (#navbar), which is always visible regardless of nav generation.

This only touches the mes.fm/ site tree (the "Links" hub link makes sense on
other subdomains' own nav-to-mes.fm and is left alone there).

Idempotent: the regexes only match the item as it exists today, so a second
run is a no-op.
"""

import glob
import os
import re

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")
SITE_ROOT = os.path.join(REPO_ROOT, "mes.fm")

# Info-bar (top nav): the two markup generations described above.
INFO_BAR_LINKS_RE = re.compile(
    r'<li class="info-bar__item info-bar__item--utility" style="display:none !important;">'
    r"<a class=\"info-bar__item__text\" href='https://mes\.fm/links'>Links</a></li>"
    r"|"
    r'<li class="info-bar__item">'
    r"<a class=\"info-bar__item__text\" href='https://mes\.fm/links'>Links</a></li>"
)

# Side/burger navbar (#navbar): one consistent markup shape site-wide.
NAVBAR_LINKS_RE = re.compile(
    r'<li class="navbar__item"><a class="navbar__link" href="https://mes\.fm/links">Links</a></li>'
)


def fix_content(content: str) -> tuple[str, bool]:
    original = content
    content = INFO_BAR_LINKS_RE.sub("", content)
    content = NAVBAR_LINKS_RE.sub("", content)
    return content, content != original


def main() -> None:
    html_files = glob.glob(os.path.join(SITE_ROOT, "**", "*.html"), recursive=True)

    fixed = 0
    for path in html_files:
        rel = os.path.relpath(path, REPO_ROOT)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        new_content, changed = fix_content(content)

        if changed:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            fixed += 1

    print(f"Done. Fixed {fixed} files out of {len(html_files)} total under mes.fm/.")


if __name__ == "__main__":
    main()
