#!/usr/bin/env python3
"""Give every deployed mes.fm page a self-referencing canonical URL.

Google Search Console was filing pages under "Duplicate without user-selected
canonical" -- e.g. https://mes.fm/links -- because the page shipped no
<link rel="canonical"> at all, so Google had to guess between the /foo, /foo/
and /foo/index.html forms that Vercel `cleanUrls` all answers with 200.

Most pages (~960) already carry a canonical; this backfills the ~50 that
don't. The canonical is the page's own clean URL (no .html, no /index, no
trailing slash), which is also what Vercel serves and what og:url uses.
Paginated gallery pages (memes/2, dream-homes/3, ...) get a self-referencing
canonical on purpose -- Google's current guidance is that page 2..N should
point at themselves, not back at page 1.

Idempotent: a page that already has rel="canonical" is left untouched, so
this is safe to re-run. Only touches HTML under mes.fm/ (the deployed static
site); skips HTTrack _http_/_https_ captures and node_modules.
"""
import pathlib
import re

SITE = pathlib.Path("~/Documents/GitHub/mes.fm/mes.fm").expanduser()
ORIGIN = "https://mes.fm"
SKIP_DIRS = ("_http_", "_https_", "node_modules")


def clean_url(path: pathlib.Path) -> str:
    rel = path.relative_to(SITE).as_posix()
    rel = re.sub(r"\.html$", "", rel)
    rel = re.sub(r"(^|/)index$", "", rel)
    return f"{ORIGIN}/{rel}" if rel else f"{ORIGIN}/"


def main():
    added = skipped = no_head = 0
    for path in sorted(SITE.rglob("*.html")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        html = path.read_text(encoding="utf-8", errors="surrogateescape")
        if 'rel="canonical"' in html:
            skipped += 1
            continue
        if "<head>" not in html:
            print(f"NO <head>  {path.relative_to(SITE)}")
            no_head += 1
            continue
        url = clean_url(path)
        tag = f'<head>\n  <link rel="canonical" href="{url}" />'
        path.write_text(html.replace("<head>", tag, 1),
                        encoding="utf-8", errors="surrogateescape")
        print(f"ADD  {url}")
        added += 1
    print(f"\nadded {added}, already had one {skipped}, no <head> {no_head}")


if __name__ == "__main__":
    main()
