#!/usr/bin/env python3
"""
Repair broken internal links repo-wide.

Two classes of breakage, both repo-wide and systemic:

1. Section-prefixed shared-nav/footer links.
   Commit 1e22b96c ("Point internal links at clean URLs instead of redirecting
   .html") rewrote bare-relative footer hrefs such as href="calculators.html"
   into root-relative clean URLs resolved against the *page's own directory*
   rather than the site root. Pages under mes.fm/memes/ and mes.fm/puzzles/
   therefore point at /memes/calculators, /puzzles/horse-shoe-puzzle/donate
   and friends, none of which exist. The shared nav/footer targets always live
   at the site root, so any /<anything>/<shared-target> that is missing on disk
   while /<shared-target> exists is rewritten to /<shared-target>.

2. Malformed href values left over from the HTTrack capture and hand edits:
   doubled scheme leader ("hhttps://..."), leading/trailing whitespace inside
   the quotes, and schemeless bare-domain self-links ("mes.fm/hutchison",
   which the browser resolves relative to the current directory).

Both passes are guarded by on-disk existence checks, so the script is
idempotent: once a link is correct it no longer matches, and re-running is a
no-op. Run with --apply to write; the default is a dry run.
"""

import argparse
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

# Directories never walked: HTTrack's external-link captures, VCS/tooling, and
# the Capacitor app's www/ (generated from mes.fm/percentagecalculator by
# build-www.py -- fix the source, then rebuild).
SKIP_DIRS = {
    "_http_", "_https_", ".git", "node_modules", "__pycache__",
    "percentagecalculator-app",
}

# Shared nav/footer destinations that only ever exist at a site's root.
SHARED_TARGETS = (
    "calculators", "tools", "mobile-apps", "links",
    "contact", "privacy-policy", "donate",
)

# HTTrack's mirror landing page at the repo root -- not deployed anywhere.
SKIP_FILES = {os.path.join(ROOT, "index.html")}

HREF_RE = re.compile(r"""(href\s*=\s*)(["'])([^"']*)\2""", re.IGNORECASE)
PREFIXED_RE = re.compile(
    r"^/.+/(" + "|".join(re.escape(t) for t in SHARED_TARGETS) + r")$"
)
DOUBLED_SCHEME_RE = re.compile(r"^h(https?://)", re.IGNORECASE)
BARE_DOMAIN_RE = re.compile(r"^mes\.fm(/.*)?$", re.IGNORECASE)

SKIP_PREFIXES = ("#", "mailto:", "javascript:", "tel:", "data:", "//")


def site_root_of(path):
    """The deployed root for a file: its top-level directory under ROOT."""
    rel = os.path.relpath(path, ROOT)
    return os.path.join(ROOT, rel.split(os.sep)[0])


def resolves(site_root, url_path):
    """Does a root-relative URL resolve on disk, allowing Vercel cleanUrls?"""
    target = os.path.join(site_root, url_path.lstrip("/"))
    return (
        os.path.exists(target)
        or os.path.exists(target + ".html")
        or os.path.exists(os.path.join(target, "index.html"))
    )


def new_value(value, site_root):
    """Return the repaired href value, or None to leave it alone."""
    # -- class 2: malformed values ------------------------------------------
    # Leading whitespace only. Browsers strip both ends when parsing a URL, but
    # a leading space still trips up crawlers and our own link scanners;
    # trailing space is left alone to avoid churning unrelated files.
    lstripped = value.lstrip()
    if lstripped != value and lstripped:
        return lstripped

    if DOUBLED_SCHEME_RE.match(value):
        return DOUBLED_SCHEME_RE.sub(r"\1", value)

    m = BARE_DOMAIN_RE.match(value)
    if m:
        # href="mes.fm/hutchison" has no scheme, so the browser resolves it
        # against the current directory. The intent is the site-root path --
        # but only rewrite when that path really exists, so HTTrack's own
        # mirror bookkeeping (href="mes.fm/index.html") is left alone.
        candidate = m.group(1) or "/"
        if resolves(site_root, candidate):
            return candidate
        return None

    # -- class 1: section-prefixed shared nav/footer links -------------------
    if value.startswith("/") and PREFIXED_RE.match(value):
        canonical = "/" + value.rsplit("/", 1)[1]
        # Only rewrite a link that is actually broken, and only when the
        # canonical root target really exists.
        if not resolves(site_root, value) and resolves(site_root, canonical):
            return canonical

    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write changes (default: dry run)")
    args = ap.parse_args()

    if not os.path.isdir(ROOT):
        sys.exit(f"repo root not found: {ROOT}")

    changed_files = 0
    total_edits = 0
    by_rewrite = Counter()
    by_dir = Counter()
    per_file = defaultdict(list)

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            path = os.path.join(dirpath, fn)
            if path in SKIP_FILES:
                continue
            try:
                html = open(path, encoding="utf-8", errors="ignore").read()
            except OSError as e:
                print(f"  SKIP  {os.path.relpath(path, ROOT)}: {e}")
                continue

            site_root = site_root_of(path)
            edits = []

            def repl(m):
                prefix, quote, value = m.group(1), m.group(2), m.group(3)
                if not value or value.startswith(SKIP_PREFIXES):
                    return m.group(0)
                replacement = new_value(value, site_root)
                if replacement is None or replacement == value:
                    return m.group(0)
                edits.append((value, replacement))
                return f"{prefix}{quote}{replacement}{quote}"

            updated = HREF_RE.sub(repl, html)

            if not edits:
                continue

            rel = os.path.relpath(path, ROOT)
            changed_files += 1
            total_edits += len(edits)
            parts = rel.split(os.sep)
            by_dir[os.sep.join(parts[:2]) if len(parts) > 1 else "(repo root)"] += len(edits)
            for old, new in edits:
                by_rewrite[(old, new)] += 1
            per_file[rel] = edits

            if args.apply:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(updated)

    mode = "Fixed" if args.apply else "Would fix"
    print(f"{mode}: {total_edits} href(s) across {changed_files} file(s)\n")

    print("By location:")
    for d, n in sorted(by_dir.items(), key=lambda kv: -kv[1]):
        print(f"  {n:6d}  {d}")

    print("\nDistinct rewrites (top 30 by occurrences):")
    for (old, new), n in sorted(by_rewrite.items(), key=lambda kv: -kv[1])[:30]:
        print(f"  {n:6d}  {old}  ->  {new}")
    extra = len(by_rewrite) - 30
    if extra > 0:
        print(f"  ... and {extra} more distinct rewrite(s)")

    if not args.apply:
        print("\nDry run only. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
