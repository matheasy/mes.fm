"""
remove_dead_appstore_links.py — strip links to the dead App Store / Play Store
listings (BMI Calculator, Grade/Fail-Safe Calculator, Percentage Calculator,
Mortgage Calculator, Hashtag Everything) from every page on the site.

Why: the Apple Developer account these iOS apps were published under has been
expired for years (all apps removed from sale / never released), and the
matching Android package IDs 404 on the Play Store too -- confirmed directly,
not assumed. Every one of these apps is being rebuilt from scratch (see
percentagecalculator-app/) and republished under a new account, one at a
time, so the dead links come down now and get added back individually as
each app relaunches.

Idempotent: the regexes only match the *original* markup, so a second run is
a no-op. Re-run after adding a fixed app's real link back by hand -- this
script only ever removes, never re-adds.
"""

import glob
import os
import re

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

DROPDOWN_MARKER = (
    "<!-- MOBILE-APPS-DROPDOWN-REMOVED: every linked app was a dead App "
    "Store / Play Store listing (lapsed developer account) -- add an entry "
    "back here for each app once it is relaunched -->"
)

# the shared "Mobile Apps" side-nav dropdown, present on ~every page
DROPDOWN_RE = re.compile(
    r'<li class="navbar__item"><span class="navbar__link '
    r'navbar__link--dropdown">Mobile Apps.*?</ul>\s*</li>',
    re.S,
)

# mes.fm/mobile-apps.html: the dedicated app-directory page's card table
HUB_TABLE_RE = re.compile(r'<table class="tbl tbl--stack">.*?</table>', re.S)
HUB_PLACEHOLDER = (
    '<p class="calc-container" style="padding:2em 1em;text-align:center;">'
    "Our mobile apps are being rebuilt from scratch and are temporarily "
    "unavailable. Check back soon — they'll be added back here one at "
    "a time as each is relaunched.</p>"
)

# each calculator's own top nav also carries "iPhone App" / "Android App"
# links to its own (also dead) listing
OWN_APP_LINK_RE = re.compile(
    r'<li class="navbar__item"><a target="_blank" class="navbar__link" '
    r'href="https://(?:itunes|apps)\.apple\.com/[^"]*">iPhone App</a></li>'
    r'|'
    r'<li class="navbar__item"><a target="_blank" class="navbar__link" '
    r'href="https://play\.google\.com/store/apps/details\?[^"]*">'
    r'Android App</a></li>'
)

# mes.fm/links/index.html: hand-curated dead entries -- one in the "Mobile
# Apps" section, plus an indented "Android App" sub-entry under several
# calculators (the mes.fm/mobile-apps and mes.fm/<calc> links themselves
# stay -- those pages still exist)
LINKS_PAGE_DEAD_ENTRY_RE = re.compile(
    r'\s*<li(?: style="margin-left: 20px;")?>'
    r'<a href="https://play\.google\.com/store/apps/details\?'
    r'id=com\.mike\.[^"]*">[^<]*</a></li>'
)


def fix_content(content: str, rel_path: str) -> tuple[str, bool]:
    original = content

    content = DROPDOWN_RE.sub(DROPDOWN_MARKER, content)
    content = OWN_APP_LINK_RE.sub("", content)

    if rel_path == "mes.fm/mobile-apps.html":
        content = HUB_TABLE_RE.sub(HUB_PLACEHOLDER, content, count=1)

    if rel_path == "mes.fm/links/index.html":
        content = LINKS_PAGE_DEAD_ENTRY_RE.sub("", content)

    return content, content != original


def main() -> None:
    html_files = glob.glob(os.path.join(REPO_ROOT, "**", "*.html"), recursive=True)

    fixed = 0
    for path in html_files:
        rel = os.path.relpath(path, REPO_ROOT)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        new_content, changed = fix_content(content, rel)

        if changed:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            fixed += 1
            print(f"Fixed: {rel}")

    print(f"\nDone. Fixed {fixed} files out of {len(html_files)} total.")


if __name__ == "__main__":
    main()
