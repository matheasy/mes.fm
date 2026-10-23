#!/usr/bin/env python3
"""Packages the MES Site Rank browser extension (mes.fm/site-traffic).

Source (plain Manifest V3, no build step) lives in mes.fm/site-traffic/extension/ and is served as-is, so the code is readable on the site. This script:
  1. makes the toolbar icons (icons/icon16|32|48|128.png) from mes.fm/site-traffic/img/logo.png;
  2. zips the folder to mes.fm/site-traffic/mes-site-traffic.zip (one top-level folder `mes-site-rank`, fixed timestamps).
Bump "version" in extension/manifest.json for a release (the page reads it from there). Dry-runs by default; --apply writes.  Tests: node tool_apps_src/site-traffic-ext-tests.js
"""
import io, json, sys, zipfile
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent
ROOT = REPO / "mes.fm" / "site-traffic"
EXT = ROOT / "extension"
ZIP = ROOT / "mes-site-traffic.zip"
FOLDER = "mes-site-rank"
SIZES = (16, 32, 48, 128)

def icons():
    logo = Image.open(ROOT / "img" / "logo.png").convert("RGBA"); out = {}
    for s in SIZES:
        buf = io.BytesIO(); logo.resize((s, s), Image.LANCZOS).save(buf, "PNG", optimize=True); out["icons/icon%d.png" % s] = buf.getvalue()
    return out

def main():
    apply = "--apply" in sys.argv
    files = {}
    for p in sorted(EXT.rglob("*")):
        rel = p.relative_to(EXT)
        if p.is_file() and p.name != ".DS_Store" and "icons" not in rel.parts: files[str(rel)] = p.read_bytes()
    files.update(icons())
    version = json.loads(files["manifest.json"])["version"]
    for rel, data in sorted(files.items()): print("  %-22s %7d bytes" % (rel, len(data)))
    print("version %s, %d files" % (version, len(files)))
    if not apply: print("dry run: pass --apply to write the icons and the zip"); return
    (EXT / "icons").mkdir(exist_ok=True)
    for rel, data in icons().items(): (EXT / rel).write_bytes(data)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in sorted(files.items()):
            zi = zipfile.ZipInfo("%s/%s" % (FOLDER, rel), date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16; z.writestr(zi, data)
    print("wrote %s (%d bytes)" % (ZIP.relative_to(REPO / "mes.fm"), ZIP.stat().st_size))

main()
