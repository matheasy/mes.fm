#!/usr/bin/env python3
"""One-off repo-wide fix: repoint every inbound link from the retired
speedreader.mes.fm subdomain at its new home, mes.fm/speedreader.

Speed Reader was moved from its own subdomain into a subdirectory of the
main site (see the redirect-only speedreader.mes.fm/vercel.json). Old
subdomain URLs still 301 to the new path, but internal links across the
~12 sibling sites should point straight at the canonical location so the
link equity consolidates and visitors skip the redirect hop.

Idempotent: re-running finds nothing once every reference is rewritten.
Skips the moved page itself and the redirect stub (both already hand-tuned)
plus HTTrack's _http_/_https_ capture folders.
"""
import pathlib
import re

ROOT = pathlib.Path("~/Documents/GitHub/mes.fm").expanduser()
SKIP_DIRS = {"_http_", "_https_", ".git"}
SKIP_PREFIXES = (ROOT / "mes.fm" / "speedreader", ROOT / "speedreader.mes.fm")

# HTTrack captured most cross-subdomain nav links as relative filesystem
# paths into a sibling speedreader.mes.fm/ folder (e.g.
# href="../../speedreader.mes.fm/index.html"). Those never resolved on the
# live sites; point them at the real page.
RELATIVE = re.compile(r"(?:\.\./)+speedreader\.mes\.fm/index\.html")

# Ordered, most-specific first. Values already carry the final https scheme.
REPLACEMENTS = [
    ("https://speedreader.mes.fm/img/", "https://mes.fm/speedreader/img/"),
    ("http://speedreader.mes.fm/img/", "https://mes.fm/speedreader/img/"),
    ("https://speedreader.mes.fm/contact", "https://mes.fm/contact"),
    ("http://speedreader.mes.fm/contact", "https://mes.fm/contact"),
    ("https://speedreader.mes.fm/privacy-policy", "https://mes.fm/privacy-policy"),
    ("http://speedreader.mes.fm/privacy-policy", "https://mes.fm/privacy-policy"),
    ("https://speedreader.mes.fm/", "https://mes.fm/speedreader/"),
    ("http://speedreader.mes.fm/", "https://mes.fm/speedreader/"),
    ("https://speedreader.mes.fm", "https://mes.fm/speedreader"),
    ("http://speedreader.mes.fm", "https://mes.fm/speedreader"),
]

# Drop the trailing slash left on bare-domain links (href="...speedreader/")
# so cleanUrls on mes.fm doesn't 308 them. Leaves real sub-paths untouched.
TRAILING = re.compile(r"https://mes\.fm/speedreader/(?=[\"'<)\s])")


def fix(text: str) -> str:
    text = RELATIVE.sub("https://mes.fm/speedreader", text)
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    return TRAILING.sub("https://mes.fm/speedreader", text)


def main() -> None:
    changed = scanned = 0
    for path in ROOT.rglob("*"):
        if path.suffix.lower() not in {".html", ".json", ".xml", ".txt"}:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if any(str(path).startswith(str(p)) for p in SKIP_PREFIXES):
            continue
        scanned += 1
        original = path.read_text(encoding="utf-8", errors="surrogateescape")
        if "speedreader.mes.fm" not in original:
            continue
        updated = fix(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8", errors="surrogateescape")
            n = original.count("speedreader.mes.fm")
            print(f"Fixed  ({n:3d} refs)  {path.relative_to(ROOT)}")
            changed += 1
        else:
            print(f"Left as-is        {path.relative_to(ROOT)}")

    print(f"\nScanned {scanned} files, rewrote {changed}.")
    leftovers = []
    for p in ROOT.rglob("*"):
        if p.suffix.lower() not in {".html", ".json", ".xml", ".txt"}:
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if any(str(p).startswith(str(pre)) for pre in SKIP_PREFIXES):
            continue
        for line in p.read_text(encoding="utf-8", errors="surrogateescape").splitlines():
            if "speedreader.mes.fm" in line and "Mirrored from" not in line:
                leftovers.append((p.relative_to(ROOT), line.strip()[:100]))
    if leftovers:
        print("\nUnexpected remaining 'speedreader.mes.fm' references:")
        for p, line in leftovers:
            print(f"  {p}: {line}")
    else:
        print("No unexpected 'speedreader.mes.fm' references remain.")


if __name__ == "__main__":
    main()
