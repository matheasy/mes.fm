#!/usr/bin/env python3
"""Shorten <title> tags over 70 characters (Bing Webmaster Tools "Title too long", 2026-11-07).

The classic calculator / meme / quote / puzzle pages use "Page | Section | Site"
(e.g. "Seven Percent of All People Born Are Living Now | Interesting Facts |
Percentage Calculator", 91 chars). When such a title is over 70 characters the
middle part(s) are dropped ("Page | Site"), but only when that brings it to 70
or less. Two-part titles and mirror-post headlines (the title IS the post's
headline) are left alone, as are tool-shell pages (TOOL-DARK: titles come from
build_tool_apps.py) and generated pages (improve_meta_descriptions.GENERATED).
og:title / twitter:title are not touched (they may be longer).

Idempotent; dry-runs by default (-v lists every change), --apply writes.
"""
import glob, html, os, re, sys

ROOT = os.path.join(os.path.expanduser("~/Documents/GitHub/mes.fm"), "mes.fm")
sys.path.insert(0, os.path.dirname(ROOT))
from improve_meta_descriptions import GENERATED  # noqa: E402

LIMIT = 70
TITLE_RE = re.compile(r"(<title>)(.*?)(</title>)", re.S)


def shorten(raw):
    t = html.unescape(raw.strip())
    if len(t) <= LIMIT:
        return None
    parts = t.split(" | ")
    if len(parts) < 3:
        return None
    new = parts[0] + " | " + parts[-1]
    if len(new) > LIMIT:
        return None
    # keep the page's own entity style for & < > " (escape minimal set)
    return html.escape(new, quote=False)


def main():
    apply = "--apply" in sys.argv
    verbose = "-v" in sys.argv
    changed = 0
    os.chdir(ROOT)
    for p in sorted(glob.glob("**/*.html", recursive=True)):
        if "_http" in p or "/extension/" in p or "node_modules" in p:
            continue
        slug = p.split("/")[0]
        page = p[:-len("/index.html")] if p.endswith("/index.html") else p[:-5]
        if slug in GENERATED or page in GENERATED:
            continue
        s = open(p, encoding="utf-8", errors="surrogateescape").read()
        if "TOOL-DARK" in s:
            continue
        m = TITLE_RE.search(s)
        if not m:
            continue
        new = shorten(m.group(2))
        if not new:
            continue
        changed += 1
        if verbose:
            print(f"{p}\n   {html.unescape(m.group(2).strip())}\n-> {html.unescape(new)}")
        if apply:
            s = s[:m.start(2)] + new + s[m.end(2):]
            open(p, "w", encoding="utf-8", errors="surrogateescape").write(s)
    print(f"{'Updated' if apply else 'Would update'} {changed} titles")
    if not apply:
        print("Dry run. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
