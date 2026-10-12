#!/usr/bin/env python3
"""Adds an "iPhone App" link (a phone icon + text -> the App Store listing) to the nav of every mes.fm/percentagecalculator page (2026-10-12):

  * horizontal info bar: a hide-able item right after Tools (class info-bar__item--utility, so info-bar-fit.js shows it only when the row has room);
  * burger / side menu: an item right BEFORE "Browser Extensions" (app links rank above the extensions link).

Both carry the class `pc-applink`, which percentagecalculator-app/build-www.py strips from the app build. The App Store notification above the calculator is separate
(`#android-testers-banner`); it is meant to go away after Android has been public for a few weeks, while these nav links stay. When the Android app is public,
add a Google Play entry next to the iPhone one (same pattern, `pc-applink`).
Idempotent (`pc-applink` marker). Dry-runs by default (-v lists files); --apply writes.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / "mes.fm" / "percentagecalculator"
APP = "https://apps.apple.com/us/app/mes-percentage-calculator/id6809222891"
ICON = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="width:1.1em;height:1.1em;vertical-align:-0.2em;margin-right:0.4em;" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"></rect><path d="M11 18.5h2"></path></svg>')   # a phone: the page is already the Percentage Calculator, so its own logo would be redundant
INFO = ('<li class="info-bar__item info-bar__item--utility pc-applink" style="display:none !important;"><a class="info-bar__item__text" href="' + APP +
        '" target="_blank" rel="noopener" title="Get the free Percentage Calculator app on the App Store">' + ICON + 'iPhone App</a></li>')
NAV = ('<li class="navbar__item pc-applink"><a class="navbar__link" href="' + APP + '" target="_blank" rel="noopener" title="Get the free Percentage Calculator app on the App Store">' +
       ICON + 'iPhone App</a></li>')
TOOLS_INFO = re.compile(r"""(<li class="info-bar__item"><a[^>]*href=['"](?:https://mes\.fm)?/tools['"][^>]*>Tools</a></li>)""")
BE_NAV = re.compile(r"""(<li class="navbar__item"><a class="navbar__link" href="/browser">Browser Extensions</a></li>)""")


OLD_ICON = re.compile(r'<img src="/percentagecalculator/img/logo\.png"[^>]*>')   # the first version used the app's logo; swapped for a phone glyph


def patch(text):
    if "pc-applink" in text:
        if OLD_ICON.search(text):
            return OLD_ICON.sub(lambda m: ICON, text), "done"
        return text, "already"
    new, a = TOOLS_INFO.subn(lambda m: m.group(1) + INFO, text, count=1)
    new, b = BE_NAV.subn(lambda m: NAV + "\n    " + m.group(1), new, count=1)
    return (new, "done") if (a or b) else (text, "nonav")


def main():
    apply, verbose = "--apply" in sys.argv, "-v" in sys.argv
    counts = {"done": 0, "already": 0, "nonav": 0}
    for p in sorted(SITE.rglob("*.html")):
        if any(x.startswith("_http") for x in p.parts):
            continue
        text = p.read_text(encoding="utf-8")
        new, st = patch(text)
        counts[st] += 1
        if st == "done":
            if verbose:
                print("  ", p.relative_to(SITE.parent.parent))
            if apply:
                p.write_text(new, encoding="utf-8")
    print(f"{'applied' if apply else 'dry run'}: {counts}")


if __name__ == "__main__":
    main()
