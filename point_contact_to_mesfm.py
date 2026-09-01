#!/usr/bin/env python3
"""Point every calculator's "Contact Us" / "Privacy Policy" link at the
single shared mes.fm/contact and mes.fm/privacy-policy pages.

Only one contact inbox is used now, so the per-site contact.html /
privacy-policy.html copies are being retired.

- Not-yet-migrated subdomains (<sub>.mes.fm/) still deploy separately, so
  their links must be ABSOLUTE https://mes.fm/... to reach the shared
  page cross-origin.
- Already-migrated dirs (mes.fm/<slug>/) mostly point at "/contact"
  already; only fix the dangling https://mes.fm/<slug>/contact form the
  migration's contact.html-only regex left behind. Bare "/contact" is
  correct there and is left alone.

Idempotent. Scoped to the calculator slugs below; never the main
mes.fm/*.html pages or HTTrack capture folders.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm").expanduser()
SLUGS = [
    "bmicalculator", "gpacalculator", "gradecalculator", "inflationcalculator",
    "mortgagecalculator", "percentagecalculator", "pokemongocalculator",
    "sjwkeyboard", "speedreader", "timer", "vatcalculator", "youtubemoney",
]
SKIP = {"_http_", "_https_"}
PAGES = {"contact": "/contact", "privacy-policy": "/privacy-policy"}


def fix(text: str, migrated: bool) -> str:
    for page, target in PAGES.items():
        dest = f"https://mes.fm{target}"
        if not migrated:
            # relative per-site link: contact.html / ../contact.html / /contact.html
            text = re.sub(
                rf'href=(["\'])(?:\.\./)*/?{page}\.html\1',
                rf'href=\1{dest}\1',
                text,
            )
        # absolute per-site link, any subdomain host, with or without .html
        text = re.sub(
            rf'href=(["\'])https?://[a-z0-9-]+\.mes\.fm/{page}(?:\.html)?\1',
            rf'href=\1{dest}\1',
            text,
        )
        # migration left https://mes.fm/<slug>/contact dangling
        text = re.sub(
            rf'href=(["\'])https://mes\.fm/(?:{"|".join(SLUGS)})/{page}(?:\.html)?\1',
            rf'href=\1{target if migrated else dest}\1',
            text,
        )
    return text


def main() -> None:
    changed = 0
    for slug in SLUGS:
        for base, migrated in ((ROOT / f"{slug}.mes.fm", False),
                               (ROOT / "mes.fm" / slug, True)):
            if not base.is_dir():
                continue
            for path in base.rglob("*.html"):
                if any(part in SKIP for part in path.parts):
                    continue
                original = path.read_text(encoding="utf-8", errors="surrogateescape")
                updated = fix(original, migrated)
                if updated != original:
                    path.write_text(updated, encoding="utf-8", errors="surrogateescape")
                    print(f"Fixed  {path.relative_to(ROOT)}")
                    changed += 1
    print(f"\n{changed} files updated.")


if __name__ == "__main__":
    main()
